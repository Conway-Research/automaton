/**
 * Social & Registry Hardening Tests (Phase 3.2)
 *
 * Tests for signing, validation, social client, agent card,
 * registry fixes, discovery caching, and schema migration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { MIGRATION_V7 } from "../state/schema.js";

// ─── Test helpers ───────────────────────────────────────────────

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function createTestDb(): import("better-sqlite3").Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS heartbeat_dedup (
      dedup_key TEXT PRIMARY KEY,
      task_name TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_dedup_expires ON heartbeat_dedup(expires_at);
  `);

  db.exec(MIGRATION_V7);
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(7);

  return db;
}

// Well-known Solana addresses for tests
const TEST_ADDRESS_A = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TEST_ADDRESS_B = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// ─── 1. Signing Tests ───────────────────────────────────────────

describe("Signing", () => {
  it("signSendPayload produces valid payload with signature", async () => {
    const { signSendPayload } = await import("../social/signing.js");
    const keypair = Keypair.generate();
    const toAddress = Keypair.generate().publicKey.toBase58();

    const payload = await signSendPayload(keypair, toAddress, "Hello, world!");

    expect(payload.from).toBe(keypair.publicKey.toBase58());
    expect(payload.to).toBe(toAddress);
    expect(payload.content).toBe("Hello, world!");
    expect(payload.signature).toBeTruthy();
    expect(payload.signed_at).toBeTruthy();
  });

  it("signSendPayload enforces content size limit", async () => {
    const { signSendPayload } = await import("../social/signing.js");
    const keypair = Keypair.generate();
    const toAddress = Keypair.generate().publicKey.toBase58();

    const longContent = "x".repeat(65_000);
    await expect(
      signSendPayload(keypair, toAddress, longContent),
    ).rejects.toThrow("Message content too long");
  });

  it("signPollPayload produces valid payload", async () => {
    const { signPollPayload } = await import("../social/signing.js");
    const keypair = Keypair.generate();

    const result = await signPollPayload(keypair);

    expect(result.address).toBe(keypair.publicKey.toBase58());
    expect(result.signature).toBeTruthy();
    expect(result.timestamp).toBeTruthy();
  });

  it("signSendPayload canonical format matches runtime and CLI expectation", async () => {
    const { signSendPayload } = await import("../social/signing.js");
    const keypair = Keypair.generate();
    const toAddress = Keypair.generate().publicKey.toBase58();
    const content = "Test message";
    const payload = await signSendPayload(keypair, toAddress, content);

    const contentHash = sha256Hex(content);
    const canonical = `Conway:send:${toAddress}:${contentHash}:${payload.signed_at}`;

    const messageBytes = new TextEncoder().encode(canonical);
    const signatureBytes = bs58.decode(payload.signature);
    const publicKeyBytes = keypair.publicKey.toBytes();

    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    expect(valid).toBe(true);
  });
});

// ─── 2. Message Validation Tests ────────────────────────────────

describe("Message Validation", () => {
  it("valid message passes validation", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: TEST_ADDRESS_B,
      content: "Hello!",
      signed_at: new Date().toISOString(),
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("message exceeding total size limit fails", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: TEST_ADDRESS_B,
      content: "x".repeat(129_000),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("total size limit"))).toBe(true);
  });

  it("content exceeding content size limit fails", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: TEST_ADDRESS_B,
      content: "x".repeat(65_000),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Content exceeds size limit"))).toBe(true);
  });

  it("message too old (>5 min) fails replay check", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const oldTimestamp = new Date(Date.now() - 6 * 60_000).toISOString();
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: TEST_ADDRESS_B,
      content: "Hello!",
      signed_at: oldTimestamp,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("too old"))).toBe(true);
  });

  it("message from future fails", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const futureTimestamp = new Date(Date.now() + 2 * 60_000).toISOString();
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: TEST_ADDRESS_B,
      content: "Hello!",
      signed_at: futureTimestamp,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("future"))).toBe(true);
  });

  it("invalid timestamp string is rejected", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: TEST_ADDRESS_B,
      content: "Hello!",
      signed_at: "not-a-valid-date",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid timestamp"))).toBe(true);
  });

  it("invalid from address fails", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const result = validateMessage({
      from: "not-an-address",
      to: TEST_ADDRESS_B,
      content: "Hello!",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid sender address"))).toBe(true);
  });

  it("invalid to address fails", async () => {
    const { validateMessage } = await import("../social/validation.js");
    const result = validateMessage({
      from: TEST_ADDRESS_A,
      to: "bad",
      content: "Hello!",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid recipient address"))).toBe(true);
  });
});

// ─── 3. Relay URL Validation Tests ──────────────────────────────

describe("Relay URL Validation", () => {
  it("HTTPS URL accepted", async () => {
    const { validateRelayUrl } = await import("../social/validation.js");
    expect(() => validateRelayUrl("https://social.conway.tech")).not.toThrow();
  });

  it("HTTP URL rejected", async () => {
    const { validateRelayUrl } = await import("../social/validation.js");
    expect(() => validateRelayUrl("http://social.conway.tech")).toThrow(
      "Relay URL must use HTTPS",
    );
  });

  it("Non-URL rejected", async () => {
    const { validateRelayUrl } = await import("../social/validation.js");
    expect(() => validateRelayUrl("not a url")).toThrow("Invalid relay URL");
  });
});

// ─── 4. Social Client Tests ────────────────────────────────────

describe("Social Client", () => {
  it("createSocialClient throws on HTTP relay URL", async () => {
    const { createSocialClient } = await import("../social/client.js");
    const keypair = Keypair.generate();

    expect(() => createSocialClient("http://relay.example.com", keypair)).toThrow(
      "Relay URL must use HTTPS",
    );
  });

  it("send() calls signing module and validates message", async () => {
    const { createSocialClient } = await import("../social/client.js");
    const keypair = Keypair.generate();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "msg-123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = createSocialClient("https://relay.example.com", keypair);
    const toAddress = Keypair.generate().publicKey.toBase58();
    const result = await client.send(toAddress, "Test message");

    expect(result.id).toBe("msg-123");
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs?.[1]?.body as string);
    expect(body.signature).toBeTruthy();
    expect(body.signed_at).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("unreadCount() throws on HTTP error (not returns 0)", async () => {
    const { createSocialClient } = await import("../social/client.js");
    const keypair = Keypair.generate();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ error: "server error" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = createSocialClient("https://relay.example.com", keypair);
    await expect(client.unreadCount()).rejects.toThrow("Unread count failed");

    vi.unstubAllGlobals();
  });

  it("rate limiting: 101st message in hour is rejected", async () => {
    const { createSocialClient } = await import("../social/client.js");
    const keypair = Keypair.generate();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "msg-xxx" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = createSocialClient("https://relay.example.com", keypair);
    const toAddress = Keypair.generate().publicKey.toBase58();

    for (let i = 0; i < 100; i++) {
      await client.send(toAddress, `message ${i}`);
    }

    await expect(
      client.send(toAddress, "message 100"),
    ).rejects.toThrow("Rate limit exceeded");

    vi.unstubAllGlobals();
  });

  it("rate limiting: failed sends count toward the hourly limit", async () => {
    const { createSocialClient } = await import("../social/client.js");
    const keypair = Keypair.generate();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ error: "server error" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = createSocialClient("https://relay.example.com", keypair);
    const toAddress = Keypair.generate().publicKey.toBase58();

    for (let i = 0; i < 100; i++) {
      await client.send(toAddress, `msg ${i}`).catch(() => {});
    }

    await expect(
      client.send(toAddress, "msg 100"),
    ).rejects.toThrow("Rate limit exceeded");

    vi.unstubAllGlobals();
  });
});

// ─── 5. Agent Card Tests ────────────────────────────────────────

describe("Agent Card", () => {
  it("generateAgentCard does NOT include sandbox ID", async () => {
    const { generateAgentCard } = await import("../registry/agent-card.js");
    const keypair = Keypair.generate();
    const creatorAddress = Keypair.generate().publicKey.toBase58();

    const identity = {
      name: "test-agent",
      address: keypair.publicKey.toBase58(),
      keypair,
      creatorAddress,
      sandboxId: "sandbox-123",
      apiKey: "key-123",
      createdAt: new Date().toISOString(),
    };

    const config = { name: "TestBot", conwayApiUrl: "https://api.conway.tech", creatorAddress } as any;
    const db = { getChildren: () => [], getSkills: () => [] } as any;

    const card = generateAgentCard(identity, config, db);
    const cardStr = JSON.stringify(card);
    expect(cardStr).not.toContain("sandbox-123");
  });

  it("generateAgentCard does NOT include Conway API URL", async () => {
    const { generateAgentCard } = await import("../registry/agent-card.js");
    const keypair = Keypair.generate();
    const creatorAddress = Keypair.generate().publicKey.toBase58();

    const identity = {
      name: "test-agent",
      address: keypair.publicKey.toBase58(),
      keypair,
      creatorAddress,
      sandboxId: "sandbox-123",
      apiKey: "key-123",
      createdAt: new Date().toISOString(),
    };

    const config = { name: "TestBot", conwayApiUrl: "https://api.conway.tech", creatorAddress } as any;
    const db = { getChildren: () => [], getSkills: () => [] } as any;

    const card = generateAgentCard(identity, config, db);
    const cardStr = JSON.stringify(card);
    expect(cardStr).not.toContain("api.conway.tech");
  });

  it("generateAgentCard does NOT include creator address", async () => {
    const { generateAgentCard } = await import("../registry/agent-card.js");
    const keypair = Keypair.generate();
    const creatorAddress = Keypair.generate().publicKey.toBase58();

    const identity = {
      name: "test-agent",
      address: keypair.publicKey.toBase58(),
      keypair,
      creatorAddress,
      sandboxId: "sandbox-123",
      apiKey: "key-123",
      createdAt: new Date().toISOString(),
    };

    const config = { name: "TestBot", conwayApiUrl: "https://api.conway.tech", creatorAddress } as any;
    const db = { getChildren: () => [], getSkills: () => [] } as any;

    const card = generateAgentCard(identity, config, db);
    const cardStr = JSON.stringify(card);
    expect(cardStr).not.toContain(creatorAddress);
  });

  it("hostAgentCard writes card as separate JSON file", async () => {
    const { hostAgentCard } = await import("../registry/agent-card.js");

    const writtenFiles: Record<string, string> = {};
    const mockConway = {
      writeFile: vi.fn(async (path: string, content: string) => { writtenFiles[path] = content; }),
      exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
      exposePort: vi.fn(async () => ({ port: 8004, publicUrl: "https://test.example.com", sandboxId: "sb-1" })),
    } as any;

    const card = { type: "test", name: "TestBot", description: "Test", services: [], x402Support: true, active: true };
    await hostAgentCard(card, mockConway);

    expect(writtenFiles["/tmp/agent-card.json"]).toBeTruthy();
    const writtenCard = JSON.parse(writtenFiles["/tmp/agent-card.json"]!);
    expect(writtenCard.name).toBe("TestBot");

    const serverScript = writtenFiles["/tmp/agent-card-server.js"]!;
    expect(serverScript).not.toContain('"TestBot"');
    expect(serverScript).toContain("fs.readFileSync");
  });
});

// ─── 6. Registry Tests ──────────────────────────────────────────

describe("Registry", () => {
  it("leaveFeedback rejects score 0", async () => {
    const { leaveFeedback } = await import("../registry/erc8004.js");
    const keypair = Keypair.generate();
    const mockDb = { raw: createTestDb() } as any;

    await expect(
      leaveFeedback(keypair, "1", 0, "bad", "testnet", mockDb),
    ).rejects.toThrow("Invalid score: 0");
  });

  it("leaveFeedback rejects score 6", async () => {
    const { leaveFeedback } = await import("../registry/erc8004.js");
    const keypair = Keypair.generate();
    const mockDb = { raw: createTestDb() } as any;

    await expect(
      leaveFeedback(keypair, "1", 6, "too high", "testnet", mockDb),
    ).rejects.toThrow("Invalid score: 6");
  });

  it("leaveFeedback rejects comment over 500 chars", async () => {
    const { leaveFeedback } = await import("../registry/erc8004.js");
    const keypair = Keypair.generate();
    const mockDb = { raw: createTestDb() } as any;
    const longComment = "x".repeat(501);

    await expect(
      leaveFeedback(keypair, "1", 3, longComment, "testnet", mockDb),
    ).rejects.toThrow("Comment too long");
  });
});

// ─── 7. Discovery Tests ────────────────────────────────────────

describe("Discovery", () => {
  it("validateAgentCard rejects cards with missing name", async () => {
    const { validateAgentCard } = await import("../registry/discovery.js");
    const result = validateAgentCard({ type: "test" });
    expect(result).toBeNull();
  });

  it("validateAgentCard rejects cards with oversized name", async () => {
    const { validateAgentCard } = await import("../registry/discovery.js");
    const result = validateAgentCard({ name: "x".repeat(200), type: "test" });
    expect(result).toBeNull();
  });

  it("validateAgentCard rejects cards with oversized description", async () => {
    const { validateAgentCard } = await import("../registry/discovery.js");
    const result = validateAgentCard({ name: "TestAgent", type: "test", description: "x".repeat(2100) });
    expect(result).toBeNull();
  });

  it("validateAgentCard accepts valid card", async () => {
    const { validateAgentCard } = await import("../registry/discovery.js");
    const result = validateAgentCard({
      name: "TestAgent",
      type: "test",
      description: "A test agent",
      services: [{ name: "wallet", endpoint: `solana:mainnet-beta:${TEST_ADDRESS_A}` }],
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("TestAgent");
  });

  it("isAllowedUri blocks HTTP", async () => {
    const { isAllowedUri } = await import("../registry/discovery.js");
    expect(isAllowedUri("http://example.com/card.json")).toBe(false);
  });

  it("isAllowedUri allows HTTPS", async () => {
    const { isAllowedUri } = await import("../registry/discovery.js");
    expect(isAllowedUri("https://example.com/card.json")).toBe(true);
  });

  it("isAllowedUri blocks localhost", async () => {
    const { isAllowedUri } = await import("../registry/discovery.js");
    expect(isAllowedUri("https://localhost/card.json")).toBe(false);
  });
});

// ─── 8. Schema Tests ───────────────────────────────────────────

describe("Schema", () => {
  it("MIGRATION_V7 creates discovered_agents_cache table", () => {
    const db = createTestDb();
    const stmt = db.prepare(
      `INSERT INTO discovered_agents_cache
       (agent_address, agent_card, fetched_from, card_hash, valid_until, fetch_count, last_fetched_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(() =>
      stmt.run("test-agent", '{"name":"test"}', "https://example.com", "testhash", null, 1, new Date().toISOString(), new Date().toISOString()),
    ).not.toThrow();

    const row = db.prepare("SELECT * FROM discovered_agents_cache WHERE agent_address = ?").get("test-agent") as any;
    expect(row).toBeTruthy();
    expect(row.agent_card).toBe('{"name":"test"}');
    db.close();
  });

  it("MIGRATION_V7 creates onchain_transactions table", () => {
    const db = createTestDb();
    const stmt = db.prepare(
      `INSERT INTO onchain_transactions (id, tx_hash, chain, operation, status, gas_used, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(() => stmt.run("id1", "txsig123", "solana:mainnet-beta", "register", "pending", null, "{}")).not.toThrow();

    const row = db.prepare("SELECT * FROM onchain_transactions WHERE tx_hash = ?").get("txsig123") as any;
    expect(row).toBeTruthy();
    expect(row.operation).toBe("register");
    expect(row.status).toBe("pending");
    db.close();
  });

  it("MIGRATION_V7 creates child_lifecycle_events table", () => {
    const db = createTestDb();
    const stmt = db.prepare(
      `INSERT INTO child_lifecycle_events (id, child_id, from_state, to_state, reason, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    expect(() => stmt.run("ev1", "child1", "requested", "sandbox_created", "test", "{}")).not.toThrow();
    db.close();
  });

  it("onchain_transactions status CHECK constraint works", () => {
    const db = createTestDb();
    const stmt = db.prepare(
      `INSERT INTO onchain_transactions (id, tx_hash, chain, operation, status) VALUES (?, ?, ?, ?, ?)`,
    );
    expect(() => stmt.run("id2", "txsig456", "solana:mainnet-beta", "register", "invalid_status")).toThrow();
    db.close();
  });
});

// ─── 9. DB Helpers Tests ────────────────────────────────────────

describe("DB Helpers", () => {
  it("agentCacheUpsert and agentCacheGet work", async () => {
    const db = createTestDb();
    const { agentCacheUpsert, agentCacheGet } = await import("../state/database.js");

    agentCacheUpsert(db, {
      agentAddress: "test-agent",
      agentCard: '{"name":"TestAgent"}',
      fetchedFrom: "https://example.com/card",
      cardHash: "testhash",
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      fetchCount: 1,
      lastFetchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const row = agentCacheGet(db, "test-agent");
    expect(row).toBeTruthy();
    expect(row!.agentCard).toBe('{"name":"TestAgent"}');
    expect(row!.fetchCount).toBe(1);
    db.close();
  });

  it("agentCacheGetValid returns only valid entries", async () => {
    const db = createTestDb();
    const { agentCacheUpsert, agentCacheGetValid } = await import("../state/database.js");

    agentCacheUpsert(db, {
      agentAddress: "valid-agent",
      agentCard: '{"name":"Valid"}',
      fetchedFrom: "https://example.com",
      cardHash: "hash1",
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      fetchCount: 1,
      lastFetchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    agentCacheUpsert(db, {
      agentAddress: "expired-agent",
      agentCard: '{"name":"Expired"}',
      fetchedFrom: "https://example.com",
      cardHash: "hash2",
      validUntil: "2020-01-01T00:00:00Z",
      fetchCount: 1,
      lastFetchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const valid = agentCacheGetValid(db);
    expect(valid.length).toBe(1);
    expect(valid[0]!.agentAddress).toBe("valid-agent");
    db.close();
  });

  it("agentCachePrune removes expired entries", async () => {
    const db = createTestDb();
    const { agentCacheUpsert, agentCachePrune, agentCacheGet } = await import("../state/database.js");

    agentCacheUpsert(db, {
      agentAddress: "expired-agent",
      agentCard: '{"name":"Expired"}',
      fetchedFrom: "https://example.com",
      cardHash: "hash1",
      validUntil: "2020-01-01T00:00:00Z",
      fetchCount: 1,
      lastFetchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const pruned = agentCachePrune(db);
    expect(pruned).toBe(1);
    expect(agentCacheGet(db, "expired-agent")).toBeUndefined();
    db.close();
  });

  it("onchainTxInsert and onchainTxGetByHash work", async () => {
    const db = createTestDb();
    const { onchainTxInsert, onchainTxGetByHash } = await import("../state/database.js");

    onchainTxInsert(db, {
      id: "tx1",
      txHash: "txsig_abc",
      chain: "solana:mainnet-beta",
      operation: "register",
      status: "pending",
      gasUsed: null,
      metadata: "{}",
      createdAt: new Date().toISOString(),
    });

    const row = onchainTxGetByHash(db, "txsig_abc");
    expect(row).toBeTruthy();
    expect(row!.operation).toBe("register");
    expect(row!.status).toBe("pending");
    db.close();
  });

  it("onchainTxGetAll with status filter works", async () => {
    const db = createTestDb();
    const { onchainTxInsert, onchainTxGetAll } = await import("../state/database.js");

    onchainTxInsert(db, {
      id: "tx1", txHash: "txsig_1", chain: "solana:mainnet-beta", operation: "register",
      status: "pending", gasUsed: null, metadata: "{}", createdAt: new Date().toISOString(),
    });

    onchainTxInsert(db, {
      id: "tx2", txHash: "txsig_2", chain: "solana:mainnet-beta", operation: "feedback",
      status: "confirmed", gasUsed: 50000, metadata: "{}", createdAt: new Date().toISOString(),
    });

    const pending = onchainTxGetAll(db, { status: "pending" });
    expect(pending.length).toBe(1);

    const all = onchainTxGetAll(db);
    expect(all.length).toBe(2);
    db.close();
  });

  it("onchainTxUpdateStatus works", async () => {
    const db = createTestDb();
    const { onchainTxInsert, onchainTxUpdateStatus, onchainTxGetByHash } = await import("../state/database.js");

    onchainTxInsert(db, {
      id: "tx1", txHash: "txsig_update", chain: "solana:mainnet-beta", operation: "register",
      status: "pending", gasUsed: null, metadata: "{}", createdAt: new Date().toISOString(),
    });

    onchainTxUpdateStatus(db, "txsig_update", "confirmed", 75000);

    const row = onchainTxGetByHash(db, "txsig_update");
    expect(row!.status).toBe("confirmed");
    expect(row!.gasUsed).toBe(75000);
    db.close();
  });
});

// ─── 10. Protocol Tests ─────────────────────────────────────────

describe("Protocol", () => {
  it("createMessageId returns ULID", async () => {
    const { createMessageId } = await import("../social/protocol.js");
    const id = createMessageId();
    expect(id).toBeTruthy();
    expect(id.length).toBe(26);
  });

  it("createNonce returns hex string", async () => {
    const { createNonce } = await import("../social/protocol.js");
    const nonce = createNonce();
    expect(nonce).toBeTruthy();
    expect(nonce).toMatch(/^[0-9a-f]+$/);
    expect(nonce.length).toBe(32);
  });

  it("verifyMessageSignature validates correct signature", async () => {
    const { signSendPayload } = await import("../social/signing.js");
    const { verifyMessageSignature } = await import("../social/protocol.js");

    const keypair = Keypair.generate();
    const toAddress = Keypair.generate().publicKey.toBase58();
    const payload = await signSendPayload(keypair, toAddress, "Test content");

    const valid = await verifyMessageSignature(payload, keypair.publicKey.toBase58());
    expect(valid).toBe(true);
  });

  it("verifyMessageSignature rejects wrong signer", async () => {
    const { signSendPayload } = await import("../social/signing.js");
    const { verifyMessageSignature } = await import("../social/protocol.js");

    const keypair = Keypair.generate();
    const toAddress = Keypair.generate().publicKey.toBase58();
    const payload = await signSendPayload(keypair, toAddress, "Test content");

    const wrongKeypair = Keypair.generate();
    const valid = await verifyMessageSignature(payload, wrongKeypair.publicKey.toBase58());
    expect(valid).toBe(false);
  });
});

// ─── 11. Address Validation Tests ───────────────────────────────

describe("Address Validation", () => {
  it("isValidAddress accepts valid Solana address", async () => {
    const { isValidAddress } = await import("../social/validation.js");
    expect(isValidAddress(TEST_ADDRESS_A)).toBe(true);
  });

  it("isValidAddress rejects short address", async () => {
    const { isValidAddress } = await import("../social/validation.js");
    expect(isValidAddress("abc")).toBe(false);
  });

  it("isValidAddress rejects invalid base58", async () => {
    const { isValidAddress } = await import("../social/validation.js");
    expect(isValidAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
  });

  it("isValidAddress rejects random string", async () => {
    const { isValidAddress } = await import("../social/validation.js");
    expect(isValidAddress("not-a-valid-address-at-all")).toBe(false);
  });
});
