/**
 * Mock infrastructure for deterministic automaton tests.
 */

import { createDatabase } from "../state/database.js";
import type {
  InferenceClient,
  InferenceResponse,
  InferenceOptions,
  ChatMessage,
  ConwayClient,
  ExecResult,
  PortInfo,
  SandboxInfo,
  PricingTier,
  CreditTransferResult,
  CreateSandboxOptions,
  DomainSearchResult,
  DomainRegistration,
  DnsRecord,
  ModelInfo,
  AutomatonDatabase,
  AutomatonIdentity,
  AutomatonConfig,
  SocialClientInterface,
  InboxMessage,
} from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import path from "path";
import os from "os";
import fs from "fs";

// ─── Mock Inference Client ──────────────────────────────────────

export class MockInferenceClient implements InferenceClient {
  private responses: InferenceResponse[];
  private callIndex = 0;
  lowComputeMode = false;

  calls: { messages: ChatMessage[]; options?: InferenceOptions }[] = [];

  constructor(responses: InferenceResponse[] = []) {
    this.responses = responses;
  }

  async chat(
    messages: ChatMessage[],
    options?: InferenceOptions,
  ): Promise<InferenceResponse> {
    this.calls.push({ messages, options });
    const response = this.responses[this.callIndex];
    this.callIndex++;

    if (response) return response;

    // Default: no tool calls, just text
    return noToolResponse("I have nothing to do.");
  }

  setLowComputeMode(enabled: boolean): void {
    this.lowComputeMode = enabled;
  }

  getDefaultModel(): string {
    return "mock-model";
  }
}

export function noToolResponse(text = ""): InferenceResponse {
  return {
    id: `resp_${Date.now()}`,
    model: "mock-model",
    message: { role: "assistant", content: text },
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    finishReason: "stop",
  };
}

export function toolCallResponse(
  toolCalls: { name: string; arguments: Record<string, unknown> }[],
  text = "",
): InferenceResponse {
  const now = Date.now();
  const mapped = toolCalls.map((tc, i) => ({
    id: `call_${i}_${now}`,
    type: "function" as const,
    function: {
      name: tc.name,
      arguments: JSON.stringify(tc.arguments),
    },
  }));

  return {
    id: `resp_${now}`,
    model: "mock-model",
    message: {
      role: "assistant",
      content: text,
      tool_calls: mapped,
    },
    toolCalls: mapped,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    finishReason: "tool_calls",
  };
}

// ─── Mock Conway Client ─────────────────────────────────────────

export class MockConwayClient implements ConwayClient {
  execCalls: { command: string; timeout?: number }[] = [];
  creditsCents = 10_000; // $100 default
  files: Record<string, string> = {};

  async exec(command: string, timeout?: number): Promise<ExecResult> {
    this.execCalls.push({ command, timeout });
    return { stdout: "ok", stderr: "", exitCode: 0 };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files[path] = content;
  }

  async readFile(path: string): Promise<string> {
    return this.files[path] ?? "";
  }

  async exposePort(port: number): Promise<PortInfo> {
    return {
      port,
      publicUrl: `https://test-${port}.conway.tech`,
      sandboxId: "test-sandbox",
    };
  }

  async removePort(_port: number): Promise<void> {}

  async createSandbox(_options: CreateSandboxOptions): Promise<SandboxInfo> {
    return {
      id: "new-sandbox-id",
      status: "running",
      region: "us-east",
      vcpu: 1,
      memoryMb: 512,
      diskGb: 1,
      createdAt: new Date().toISOString(),
    };
  }

  async deleteSandbox(_id: string): Promise<void> {}

  async listSandboxes(): Promise<SandboxInfo[]> {
    return [];
  }

  async getCreditsBalance(): Promise<number> {
    return this.creditsCents;
  }

  async getCreditsPricing(): Promise<PricingTier[]> {
    return [];
  }

  async transferCredits(
    toAddress: string,
    amountCents: number,
    note?: string,
  ): Promise<CreditTransferResult> {
    this.creditsCents -= amountCents;
    return {
      transferId: "txn_test",
      status: "completed",
      toAddress,
      amountCents,
      balanceAfterCents: this.creditsCents,
    };
  }

  async searchDomains(_query: string, _tlds?: string): Promise<DomainSearchResult[]> {
    return [{ domain: "test.com", available: true, registrationPrice: 1200, currency: "USD" }];
  }

  async registerDomain(domain: string, _years?: number): Promise<DomainRegistration> {
    return { domain, status: "registered", transactionId: "txn_test" };
  }

  async listDnsRecords(_domain: string): Promise<DnsRecord[]> {
    return [];
  }

  async addDnsRecord(
    _domain: string,
    type: string,
    host: string,
    value: string,
    ttl?: number,
  ): Promise<DnsRecord> {
    return { id: "rec_test", type, host, value, ttl: ttl || 3600 };
  }

  async deleteDnsRecord(_domain: string, _recordId: string): Promise<void> {}

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "gpt-4.1-nano", provider: "openai", pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40 } },
      { id: "gpt-4.1", provider: "openai", pricing: { inputPerMillion: 2.00, outputPerMillion: 8.00 } },
    ];
  }
}

// ─── Mock Social Client ─────────────────────────────────────────

export class MockSocialClient implements SocialClientInterface {
  sentMessages: { to: string; content: string; replyTo?: string }[] = [];
  pollResponses: { messages: InboxMessage[]; nextCursor?: string }[] = [];
  private pollIndex = 0;
  unread = 0;

  async send(to: string, content: string, replyTo?: string): Promise<{ id: string }> {
    this.sentMessages.push({ to, content, replyTo });
    return { id: `msg_${Date.now()}` };
  }

  async poll(
    cursor?: string,
    limit?: number,
  ): Promise<{ messages: InboxMessage[]; nextCursor?: string }> {
    const response = this.pollResponses[this.pollIndex];
    this.pollIndex++;
    return response ?? { messages: [] };
  }

  async unreadCount(): Promise<number> {
    return this.unread;
  }
}

// ─── Mock Metrics Collector ──────────────────────────────────────

export class MockMetricsCollector {
  recorded: { name: string; value: number; labels?: Record<string, string> }[] = [];
  snapshots: any[] = [];

  increment(name: string, labels?: Record<string, string>): void {
    this.recorded.push({ name, value: 1, labels });
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.recorded.push({ name, value, labels });
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.recorded.push({ name, value, labels });
  }

  snapshot(): any[] {
    return [...this.recorded];
  }

  reset(): void {
    this.recorded = [];
  }
}

// ─── Mock Logger ─────────────────────────────────────────────────

export class MockLogger {
  logs: { level: string; message: string; context?: Record<string, unknown> }[] = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "debug", message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "warn", message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "error", message, context });
  }

  getLogsOfLevel(level: string): typeof this.logs {
    return this.logs.filter((l) => l.level === level);
  }

  reset(): void {
    this.logs = [];
  }
}

// ─── Test Helpers ───────────────────────────────────────────────

export function createTestDb(): AutomatonDatabase {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  return createDatabase(dbPath);
}

export function createTestIdentity(): AutomatonIdentity {
  return {
    name: "test-automaton",
    address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
    account: {} as any, // Placeholder — not used in most tests
    creatorAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    sandboxId: "test-sandbox-id",
    apiKey: "test-api-key",
    createdAt: new Date().toISOString(),
  };
}

export function createTestConfig(
  overrides?: Partial<AutomatonConfig>,
): AutomatonConfig {
  return {
    name: "test-automaton",
    genesisPrompt: "You are a test automaton.",
    creatorAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    registeredWithConway: true,
    sandboxId: "test-sandbox-id",
    conwayApiUrl: "https://api.conway.tech",
    conwayApiKey: "test-api-key",
    inferenceModel: "mock-model",
    maxTokensPerTurn: 4096,
    heartbeatConfigPath: "/tmp/test-heartbeat.yml",
    dbPath: "/tmp/test-state.db",
    logLevel: "error",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
    version: "0.2.0",
    skillsDir: "/tmp/test-skills",
    maxChildren: 3,
    socialRelayUrl: "https://social.conway.tech",
    ...overrides,
  };
}
