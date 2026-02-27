/**
 * Conway API Client
 *
 * Communicates with Conway's control plane for sandbox management,
 * credits, and infrastructure operations.
 * Adapted from @aiws/sdk patterns.
 */

import { execSync } from "child_process";
import fs from "fs";
import nodePath from "path";
import type {
  ConwayClient,
  ExecResult,
  PortInfo,
  CreateSandboxOptions,
  SandboxInfo,
  PricingTier,
  CreditTransferResult,
  DomainSearchResult,
  DomainRegistration,
  DnsRecord,
  ModelInfo,
} from "../types.js";
import { ResilientHttpClient } from "./http-client.js";
import { ulid } from "ulid";
import { keccak256, toHex } from "viem";
import type { Address, PrivateKeyAccount } from "viem";
import { randomUUID } from "crypto";

interface ConwayClientOptions {
  apiUrl: string;
  apiKey: string;
  sandboxId: string;
}

export function createConwayClient(options: ConwayClientOptions): ConwayClient {
  const { apiUrl, apiKey } = options;
  // Normalize sandbox ID defensively so values like whitespace/"undefined"/"null"
  // never produce malformed API paths such as /v1/sandboxes//exec.
  const sandboxId = normalizeSandboxId(options.sandboxId);
  const httpClient = new ResilientHttpClient();

  async function request(
    method: string,
    path: string,
    body?: unknown,
    requestOptions?: { idempotencyKey?: string; retries404?: number },
  ): Promise<any> {
    // Conway LB has an intermittent routing bug that returns 404 for valid
    // sandbox endpoints. Retry 404s here (outside ResilientHttpClient) to
    // avoid tripping the circuit breaker on transient routing failures.
    const max404Retries = requestOptions?.retries404 ?? 3;
    for (let attempt = 0; attempt <= max404Retries; attempt++) {
      const resp = await httpClient.request(`${apiUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        idempotencyKey: requestOptions?.idempotencyKey,
      });

      if (resp.status === 404 && attempt < max404Retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      if (!resp.ok) {
        const text = await resp.text();
        const err: any = new Error(
          `Conway API error: ${method} ${path} -> ${resp.status}: ${text}`,
        );
        err.status = resp.status;
        err.responseText = text;
        err.method = method;
        err.path = path;
        throw err;
      }

      return resp.headers.get("content-type")?.includes("application/json")
        ? resp.json()
        : resp.text();
    }

    throw new Error("Unreachable");
  }

  const canonicalizePayload = (payload: Record<string, string>): string => {
    const sortedKeys = Object.keys(payload).sort();
    const sorted: Record<string, string> = {};
    for (const key of sortedKeys) {
      sorted[key] = payload[key];
    }
    return JSON.stringify(sorted);
  };

  const hashIdentityPayload = (payload: Record<string, string>): `0x${string}` => {
    const canonical = canonicalizePayload(payload);
    return keccak256(toHex(canonical));
  };


  // ─── Sandbox Operations (own sandbox) ────────────────────────
  // When sandboxId is empty, automatically fall back to local execution.

  const isLocal = !sandboxId;

  const execLocal = (command: string, timeout?: number): ExecResult => {
    try {
      const stdout = execSync(command, {
        timeout: timeout || 30_000,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.env.HOME || "/root",
      });
      return { stdout: stdout || "", stderr: "", exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        exitCode: err.status ?? 1,
      };
    }
  };

  const exec = async (
    command: string,
    timeout?: number,
  ): Promise<ExecResult> => {
    if (isLocal) return execLocal(command, timeout);

    // Remote sandboxes default to / as cwd. Wrap commands to run from /root
    // (matching local exec behavior) unless the command already sets a directory.
    const wrappedCommand = `cd /root && ${command}`;

    try {
      const result = await request(
        "POST",
        `/v1/sandboxes/${sandboxId}/exec`,
        { command: wrappedCommand, timeout },
        { idempotencyKey: ulid() },
      );
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.exit_code ?? result.exitCode ?? -1,
      };
    } catch (err: any) {
      // SECURITY: Never silently fall back to local execution on auth failure.
      // A 403 indicates a credentials mismatch — falling back to local exec
      // would bypass the sandbox security boundary entirely.
      if (err?.status === 403) {
        throw new Error(
          `Conway API authentication failed (403). Sandbox exec refused. ` +
            `This may indicate a misconfigured or revoked API key. ` +
            `Command will NOT be executed locally for security reasons.`,
        );
      }
      throw err;
    }
  };

  const resolveLocalPath = (filePath: string): string =>
    filePath.startsWith("~")
      ? nodePath.join(process.env.HOME || "/root", filePath.slice(1))
      : filePath;

  const writeFile = async (
    filePath: string,
    content: string,
  ): Promise<void> => {
    if (isLocal) {
      const resolved = resolveLocalPath(filePath);
      const dir = nodePath.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolved, content, "utf-8");
      return;
    }
    try {
      await request("POST", `/v1/sandboxes/${sandboxId}/files/upload/json`, {
        path: filePath,
        content,
      });
    } catch (err: any) {
      // SECURITY: Never silently fall back to local FS on auth failure.
      if (err?.status === 403) {
        throw new Error(
          `Conway API authentication failed (403). File write refused. ` +
            `File will NOT be written locally for security reasons.`,
        );
      }
      throw err;
    }
  };

  const readFile = async (filePath: string): Promise<string> => {
    if (isLocal) {
      return fs.readFileSync(resolveLocalPath(filePath), "utf-8");
    }
    try {
      const result = await request(
        "GET",
        `/v1/sandboxes/${sandboxId}/files/read?path=${encodeURIComponent(filePath)}`,
        undefined,
        { retries404: 0 },
      );
      return typeof result === "string" ? result : result.content || "";
    } catch (err: any) {
      // SECURITY: Never silently fall back to local FS on auth failure.
      if (err?.status === 403) {
        throw new Error(
          `Conway API authentication failed (403). File read refused. ` +
            `File will NOT be read locally for security reasons.`,
        );
      }
      throw err;
    }
  };

  const exposePort = async (port: number): Promise<PortInfo> => {
    if (isLocal) {
      return {
        port,
        publicUrl: `http://localhost:${port}`,
        sandboxId: "local",
      };
    }
    const result = await request(
      "POST",
      `/v1/sandboxes/${sandboxId}/ports/expose`,
      { port },
    );
    return {
      port: result.port,
      publicUrl: result.public_url || result.publicUrl || result.url,
      sandboxId,
    };
  };

  const removePort = async (port: number): Promise<void> => {
    if (isLocal) return;
    await request("DELETE", `/v1/sandboxes/${sandboxId}/ports/${port}`);
  };

  // ─── Sandbox Management (other sandboxes) ────────────────────

  const createSandbox = async (
    options: CreateSandboxOptions,
  ): Promise<SandboxInfo> => {
    const result = await request("POST", "/v1/sandboxes", {
      name: options.name,
      vcpu: options.vcpu || 1,
      memory_mb: options.memoryMb || 512,
      disk_gb: options.diskGb || 5,
      region: options.region,
    });
    return {
      id: result.id || result.sandbox_id,
      status: result.status || "running",
      region: result.region || "",
      vcpu: result.vcpu || options.vcpu || 1,
      memoryMb: result.memory_mb || options.memoryMb || 512,
      diskGb: result.disk_gb || options.diskGb || 5,
      terminalUrl: result.terminal_url,
      createdAt: result.created_at || new Date().toISOString(),
    };
  };

  const deleteSandbox = async (targetId: string): Promise<void> => {
    await request("DELETE", `/v1/sandboxes/${targetId}`);
  };

  const listSandboxes = async (): Promise<SandboxInfo[]> => {
    const result = await request("GET", "/v1/sandboxes");
    const sandboxes = Array.isArray(result) ? result : result.sandboxes || [];
    return sandboxes.map((s: any) => ({
      id: s.id || s.sandbox_id,
      status: s.status || "unknown",
      region: s.region || "",
      vcpu: s.vcpu || 0,
      memoryMb: s.memory_mb || 0,
      diskGb: s.disk_gb || 0,
      terminalUrl: s.terminal_url,
      createdAt: s.created_at || "",
    }));
  };

  // ─── Credits ─────────────────────────────────────────────────

  const getCreditsBalance = async (): Promise<number> => {
    const result = await request("GET", "/v1/credits/balance");
    return result.balance_cents ?? result.credits_cents ?? 0;
  };

  const getCreditsPricing = async (): Promise<PricingTier[]> => {
    const result = await request("GET", "/v1/credits/pricing");
    const tiers = result.tiers || result.pricing || [];
    return tiers.map((t: any) => ({
      name: t.name || "",
      vcpu: t.vcpu || 0,
      memoryMb: t.memory_mb || 0,
      diskGb: t.disk_gb || 0,
      monthlyCents: t.monthly_cents || 0,
    }));
  };

  const transferCredits = async (
    toAddress: string,
    amountCents: number,
    note?: string,
  ): Promise<CreditTransferResult> => {
    const payload = {
      to_address: toAddress,
      amount_cents: amountCents,
      note,
    };

    const idempotencyKey = ulid();
    const paths = ["/v1/credits/transfer", "/v1/credits/transfers"];

    let lastError = "Unknown transfer error";

    for (const path of paths) {
      const resp = await httpClient.request(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify(payload),
        idempotencyKey,
        retries: 0, // Mutating: do not auto-retry transfers
      });

      if (!resp.ok) {
        const text = await resp.text();
        lastError = `${resp.status}: ${text}`;
        // Try next known endpoint shape before failing.
        if (resp.status === 404) continue;
        throw new Error(`Conway API error: POST ${path} -> ${lastError}`);
      }

      const data = await resp.json().catch(() => ({}) as any);
      return {
        transferId: data.transfer_id || data.id || "",
        status: data.status || "submitted",
        toAddress: data.to_address || toAddress,
        amountCents: data.amount_cents ?? amountCents,
        balanceAfterCents:
          data.balance_after_cents ?? data.new_balance_cents ?? undefined,
      };
    }

    throw new Error(
      `Conway API error: POST /v1/credits/transfer -> ${lastError}`,
    );
  };

  const registerAutomaton = async (params: {
    automatonId: string;
    automatonAddress: Address;
    creatorAddress: Address;
    name: string;
    bio?: string;
    genesisPromptHash?: `0x${string}`;
    account: PrivateKeyAccount;
    nonce?: string;
  }): Promise<{ automaton: Record<string, unknown> }> => {
    const {
      automatonId,
      automatonAddress,
      creatorAddress,
      name,
      bio,
      genesisPromptHash,
      account,
    } = params;
    const nonce = params.nonce ?? randomUUID();

    const payload: Record<string, string> = {
      automaton_id: automatonId,
      automaton_address: automatonAddress,
      creator_address: creatorAddress,
      name,
      bio: bio || "",
    };
    if (genesisPromptHash) {
      payload.genesis_prompt_hash = genesisPromptHash;
    }

    const payloadHash = hashIdentityPayload(payload);
    const domain = {
      name: "AIWS Automaton",
      version: "1",
      chainId: 8453,
    };
    const types = {
      Register: [
        { name: "automatonId", type: "string" },
        { name: "nonce", type: "string" },
        { name: "payloadHash", type: "bytes32" },
      ],
    };
    const message = {
      automatonId,
      nonce,
      payloadHash,
    };
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "Register",
      message,
    });

    const body: Record<string, unknown> = {
      automaton_id: automatonId,
      automaton_address: automatonAddress,
      creator_address: creatorAddress,
      name,
      bio: bio || "",
      nonce,
      signature,
      payload_hash: payloadHash,
    };
    if (genesisPromptHash) {
      body.genesis_prompt_hash = genesisPromptHash;
    }

    return request("POST", "/v1/automatons/register", body);
  };

  // ─── Domains ──────────────────────────────────────────────────

  const searchDomains = async (
    query: string,
    tlds?: string,
  ): Promise<DomainSearchResult[]> => {
    const params = new URLSearchParams({ query });
    if (tlds) params.set("tlds", tlds);
    const result = await request("GET", `/v1/domains/search?${params}`);
    const results = result.results || result.domains || [];
    return results.map((d: any) => ({
      domain: d.domain,
      available: d.available ?? d.purchasable ?? false,
      registrationPrice: d.registration_price ?? d.purchase_price,
      renewalPrice: d.renewal_price,
      currency: d.currency || "USD",
    }));
  };

  const registerDomain = async (
    domain: string,
    years: number = 1,
  ): Promise<DomainRegistration> => {
    const result = await request("POST", "/v1/domains/register", {
      domain,
      years,
    });
    return {
      domain: result.domain || domain,
      status: result.status || "registered",
      expiresAt: result.expires_at || result.expiry,
      transactionId: result.transaction_id || result.id,
    };
  };

  const listDnsRecords = async (domain: string): Promise<DnsRecord[]> => {
    const result = await request(
      "GET",
      `/v1/domains/${encodeURIComponent(domain)}/dns`,
    );
    const records = result.records || result || [];
    return (Array.isArray(records) ? records : []).map((r: any) => ({
      id: r.id || r.record_id || "",
      type: r.type || "",
      host: r.host || r.name || "",
      value: r.value || r.answer || "",
      ttl: r.ttl,
      distance: r.distance ?? r.priority,
    }));
  };

  const addDnsRecord = async (
    domain: string,
    type: string,
    host: string,
    value: string,
    ttl?: number,
  ): Promise<DnsRecord> => {
    const result = await request(
      "POST",
      `/v1/domains/${encodeURIComponent(domain)}/dns`,
      { type, host, value, ttl: ttl || 3600 },
    );
    return {
      id: result.id || result.record_id || "",
      type: result.type || type,
      host: result.host || host,
      value: result.value || value,
      ttl: result.ttl || ttl || 3600,
    };
  };

  const deleteDnsRecord = async (
    domain: string,
    recordId: string,
  ): Promise<void> => {
    await request(
      "DELETE",
      `/v1/domains/${encodeURIComponent(domain)}/dns/${encodeURIComponent(recordId)}`,
    );
  };

  // ─── Model Discovery ───────────────────────────────────────────

  const listModels = async (): Promise<ModelInfo[]> => {
    // Try inference.conway.tech first (has availability info), fall back to control plane
    const urls = [
      "https://inference.conway.tech/v1/models",
      `${apiUrl}/v1/models`,
    ];
    for (const url of urls) {
      try {
        const resp = await httpClient.request(url, {
          headers: { Authorization: apiKey },
        });
        if (!resp.ok) continue;
        const result = (await resp.json()) as any;
        const raw = result.data || result.models || [];
        return raw
          .filter((m: any) => m.available !== false)
          .map((m: any) => ({
            id: m.id,
            provider: m.provider || m.owned_by || "unknown",
            pricing: {
              inputPerMillion:
                m.pricing?.input_per_million ??
                m.pricing?.input_per_1m_tokens_usd ??
                0,
              outputPerMillion:
                m.pricing?.output_per_million ??
                m.pricing?.output_per_1m_tokens_usd ??
                0,
            },
          }));
      } catch {
        continue;
      }
    }
    return [];
  };

  const createScopedClient = (targetSandboxId: string): ConwayClient => {
    return createConwayClient({ apiUrl, apiKey, sandboxId: targetSandboxId });
  };

  const client: ConwayClient = {
    exec,
    writeFile,
    readFile,
    exposePort,
    removePort,
    createSandbox,
    deleteSandbox,
    listSandboxes,
    getCreditsBalance,
    getCreditsPricing,
    transferCredits,
    registerAutomaton,
    searchDomains,
    registerDomain,
    listDnsRecords,
    addDnsRecord,
    deleteDnsRecord,
    listModels,
    createScopedClient,
  };

  // SECURITY: API credentials are NOT exposed on the client object.
  // If child spawning or other modules need API configuration, pass it
  // explicitly through a dedicated typed interface — never via dynamic getters
  // that any code with a client reference could access.

  return client;
}

function normalizeSandboxId(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed === "undefined" || trimmed === "null") return "";
  return trimmed;
}
