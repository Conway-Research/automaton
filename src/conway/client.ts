/**
 * Conway Client — Local Stub
 *
 * Implements the ConwayClient interface using local equivalents.
 * No dependency on Conway Cloud or Conway API keys.
 *
 * - exec()          → child_process.exec (runs locally)
 * - writeFile()     → fs.writeFile
 * - readFile()      → fs.readFile
 * - exposePort()    → returns http://localhost:<port>
 * - credits         → always 999999 (never die from credits)
 * - sandboxes       → stub objects, no-ops
 * - domains         → unsupported in local mode
 * - listModels()    → Anthropic claude-sonnet-4-6-20251101
 */

import { exec as _exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
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

const execAsync = promisify(_exec);

export function createConwayClient(
  options: { apiUrl?: string; apiKey?: string; sandboxId?: string } = {},
): ConwayClient {
  const apiUrl = options.apiUrl || process.env.CONWAY_API_URL || "https://api.conway.tech";
  const apiKey = options.apiKey || process.env.CONWAY_API_KEY || "";
  const sandboxId = options.sandboxId || process.env.CONWAY_SANDBOX_ID || "local";

  // ─── Sandbox Operations (own sandbox) ─────────────────────────

  const exec = async (command: string, timeout?: number): Promise<ExecResult> => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeout ?? 30000,
      });
      return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message ?? "",
        exitCode: err.code ?? 1,
      };
    }
  };

  const writeFile = async (filePath: string, content: string): Promise<void> => {
    const resolved = filePath.replace(/^~/, process.env.HOME ?? "/root");
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
  };

  const readFile = async (filePath: string): Promise<string> => {
    const resolved = filePath.replace(/^~/, process.env.HOME ?? "/root");
    return fs.readFile(resolved, "utf-8");
  };

  const exposePort = async (port: number): Promise<PortInfo> => ({
    port,
    publicUrl: `http://localhost:${port}`,
    sandboxId,
  });

  const removePort = async (_port: number): Promise<void> => {};

  // ─── Sandbox Management ────────────────────────────────────────

  const createSandbox = async (_opts: CreateSandboxOptions): Promise<SandboxInfo> => ({
    id: `local-sandbox-${Date.now()}`,
    status: "running",
    region: "local",
    vcpu: 1,
    memoryMb: 512,
    diskGb: 5,
    createdAt: new Date().toISOString(),
  });

  const deleteSandbox = async (_targetId: string): Promise<void> => {};

  const listSandboxes = async (): Promise<SandboxInfo[]> => [];

  // ─── Credits ──────────────────────────────────────────────────

  const getCreditsBalance = async (): Promise<number> => 999999;

  const getCreditsPricing = async (): Promise<PricingTier[]> => [];

  const transferCredits = async (
    toAddress: string,
    amountCents: number,
    _note?: string,
  ): Promise<CreditTransferResult> => {
    console.log(`[conway-local] transferCredits no-op: ${amountCents} cents → ${toAddress}`);
    return {
      transferId: "local-noop",
      status: "submitted",
      toAddress,
      amountCents,
    };
  };

  // ─── Domains ──────────────────────────────────────────────────

  const searchDomains = async (_query: string, _tlds?: string): Promise<DomainSearchResult[]> => [];

  const registerDomain = async (_domain: string, _years?: number): Promise<DomainRegistration> => {
    throw new Error("Not supported in local mode");
  };

  const listDnsRecords = async (_domain: string): Promise<DnsRecord[]> => [];

  const addDnsRecord = async (
    _domain: string,
    _type: string,
    _host: string,
    _value: string,
    _ttl?: number,
  ): Promise<DnsRecord> => {
    throw new Error("Not supported in local mode");
  };

  const deleteDnsRecord = async (_domain: string, _recordId: string): Promise<void> => {};

  // ─── Model Discovery ───────────────────────────────────────────

  const listModels = async (): Promise<ModelInfo[]> => [
    {
      id: "claude-sonnet-4-6-20251101",
      provider: "anthropic",
      pricing: { inputPerMillion: 3, outputPerMillion: 15 },
    },
  ];

  const client = {
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
    searchDomains,
    registerDomain,
    listDnsRecords,
    addDnsRecord,
    deleteDnsRecord,
    listModels,
    // Internal metadata used by replication helpers.
    __apiUrl: apiUrl,
    __apiKey: apiKey,
    __sandboxId: sandboxId,
    __mode: "local",
  };

  return client as ConwayClient;
}
