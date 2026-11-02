import os from "node:os";
import {operatingMode,ConwayUnavailableError,type OperatingMode} from './operating-mode.js';
/**
 * Conway API Client
 *
 * Communicates with Conway's control plane for sandbox management,
 * credits, and infrastructure operations.
 * Adapted from @aiws/sdk patterns.
 */


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
import {actionContextDigest} from '../security/action-gate.js';
import {assertNoKnownSecrets,registerLogSecrets} from '../observability/redaction.js';
export const conwayActionScope=(apiUrl:string,method:string,resource:string,body:unknown)=>({activity:'conway-mutation',component:'conway',
 contextDigest:actionContextDigest({apiUrl,method,resource,body})});
import { ulid } from "ulid";
import { keccak256, toHex } from "viem";
import type { Address, PrivateKeyAccount } from "viem";
import { randomUUID } from "crypto";
import type { ChainType, ChainIdentity } from "../identity/chain.js";

interface ConwayClientOptions {
  operatingMode?: OperatingMode;
  apiUrl: string;
  apiKey: string;
  sandboxId: string;
  /** Trusted host capability gateway; absence denies external mutations/signing. */
  authorizeMutation?:(scope:ReturnType<typeof conwayActionScope>)=>void;
}

export function createConwayClient(options: ConwayClientOptions): ConwayClient {
  const { apiUrl, apiKey } = options;
  const mode=operatingMode(options);
  const requireConway=()=>{if(mode==='local')throw new ConwayUnavailableError();};
  registerLogSecrets([apiKey]);
  const authorize=(method:string,resource:string,body:unknown)=>{
    requireConway();
    assertNoKnownSecrets(body??{});
    if(!options.authorizeMutation)throw Error('Conway mutation requires trusted capability authorization');
    options.authorizeMutation(conwayActionScope(apiUrl,method,resource,body));
  };
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
    requireConway();
    // Conway LB has an intermittent routing bug that returns 404 for valid
    // sandbox endpoints. Retry 404s here (outside ResilientHttpClient) to
    // avoid tripping the circuit breaker on transient routing failures.
    const mutating=!['GET','HEAD'].includes(method);
    if(mutating)authorize(method,path,body);
    const max404Retries = mutating?0:requestOptions?.retries404 ?? 3;
    for (let attempt = 0; attempt <= max404Retries; attempt++) {
      const resp = await httpClient.request(`${apiUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        idempotencyKey: requestOptions?.idempotencyKey,
        ...(mutating?{retries:0}:{}),
      });

      if (resp.status === 404 && attempt < max404Retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      if (!resp.ok) {
        await resp.body?.cancel();
        const err: any = new Error(
          `Conway API error: ${method} -> ${resp.status}`,
        );
        err.status = resp.status;
        err.method = method;
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


  // â”€â”€â”€ Sandbox Operations (own sandbox) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Local file access is supported; arbitrary local shell execution is not isolated.

  const isLocal = mode==='local';

  const exec = async (
    command: string,
    timeout?: number,
    cwd?: string,
  ): Promise<ExecResult> => {
    if (isLocal) return {stdout:"",stderr:"Blocked: local shell requires an accepted isolated execution backend.",exitCode:126};
    if(typeof command!=='string'||!command.trim()||command.length>65536||command.includes('\0')||
      timeout!==undefined&&(!Number.isSafeInteger(timeout)||timeout<1||timeout>120000)||
      cwd!==undefined&&(typeof cwd!=='string'||cwd.length>4096||/[\r\n\0]/.test(cwd)))throw Error('Invalid bounded remote execution request');

    // Remote sandboxes default to / as cwd. Wrap commands to run from /root
    // (matching local exec behavior) unless the command already sets a directory.
    const remoteCwd = cwd || "/root";
    const wrappedCommand = `cd '${remoteCwd.replaceAll("'", "'\\''")}' && ${command}`;

    try {
      const result = await request(
        "POST",
        `/v1/sandboxes/${sandboxId}/exec`,
        { command: wrappedCommand, timeout:timeout??60000 },
        { idempotencyKey: ulid() },
      );
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.exit_code ?? result.exitCode ?? -1,
      };
    } catch (err: any) {
      // SECURITY: Never silently fall back to local execution on auth failure.
      // A 403 indicates a credentials mismatch â€” falling back to local exec
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
      ? nodePath.join(process.env.HOME || os.homedir(), filePath.slice(1))
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
    // A port number cannot bind the changing server response to reviewed product
    // bytes/claims. Keep this legacy publication transport unaccepted until an
    // immutable deployment/content adapter can enforce the release contract.
    throw Error('Remote publication requires an accepted content-bound publishing adapter');
  };

  const removePort = async (port: number): Promise<void> => {
    if (isLocal) return;
    await request("DELETE", `/v1/sandboxes/${sandboxId}/ports/${port}`);
  };

  // â”€â”€â”€ Sandbox Management (other sandboxes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const deleteSandbox = async (_targetId: string): Promise<void> => {
    requireConway();
    // Conway API no longer supports sandbox deletion.
    // Sandboxes are prepaid and non-refundable â€” this is a no-op.
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

  // â”€â”€â”€ Credits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const paths = ["/v1/credits/transfer"];

    let lastError = "Unknown transfer error";

    for (const path of paths) {
      authorize('POST',path,payload);
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
        await resp.body?.cancel();
        lastError = `${resp.status}`;
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
    automatonAddress: string;
    creatorAddress: string;
    name: string;
    bio?: string;
    genesisPromptHash?: `0x${string}`;
    account: PrivateKeyAccount;
    nonce?: string;
    chainType?: ChainType;
    chainIdentity?: ChainIdentity;
  }): Promise<{ automaton: Record<string, unknown> }> => {
    const {
      automatonId,
      automatonAddress,
      creatorAddress,
      name,
      bio,
      genesisPromptHash,
      account,
      chainIdentity,
    } = params;
    const nonce = params.nonce ?? randomUUID();
    const isSolana = params.chainType === "solana";

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
    authorize('SIGN','/v1/automatons/register',payload);
    let signature: string;

    if (isSolana && chainIdentity) {
      // Solana path: Ed25519 sign of canonical JSON
      const sigMessage = JSON.stringify({ automatonId, nonce, payloadHash });
      signature = await chainIdentity.signMessage(sigMessage);
    } else if (isSolana && !chainIdentity) {
      throw new Error("Solana registration requires chainIdentity. Pass the ChainIdentity from getWallet().");
    } else {
      // EVM path: EIP-712 typed data (unchanged)
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
      signature = await account.signTypedData({
        domain,
        types,
        primaryType: "Register",
        message,
      });
    }

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
    if (isSolana) {
      body.chain_type = "solana";
    }

    return request("POST", "/v1/automatons/register", body);
  };

  // â”€â”€â”€ Domains â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Model Discovery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const listModels = async (): Promise<ModelInfo[]> => {
    requireConway();
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
    requireConway();
    return createConwayClient({ apiUrl, apiKey, sandboxId: targetSandboxId,operatingMode:mode,authorizeMutation:options.authorizeMutation });
  };

  const client: ConwayClient = {
    isLocal,
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
  // explicitly through a dedicated typed interface â€” never via dynamic getters
  // that any code with a client reference could access.

  return client;
}

function normalizeSandboxId(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed === "undefined" || trimmed === "null") return "";
  return trimmed;
}
