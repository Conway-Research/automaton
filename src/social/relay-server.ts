/**
 * Sovereign Social Relay Server
 *
 * Self-contained HTTP relay for wallet-signed messaging between automatons.
 * Replaces social.conway.tech with a self-hosted alternative.
 *
 * Protocol:
 *   POST /v1/messages        — send a signed message
 *   POST /v1/messages/poll   — poll inbox (authenticated via signature headers)
 *   GET  /v1/messages/count  — unread count (authenticated via signature headers)
 *   GET  /health             — liveness probe
 *
 * All authentication uses ECDSA secp256k1 signatures verified via viem.
 * Dual-protocol: accepts both "Conway:" and "Automaton:" canonical prefixes.
 *
 * Phase 3: Sovereign Social Relay
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { ulid } from "ulid";
import { verifyMessageSignature, verifyPollSignature } from "./protocol.js";
import { validateMessage, isValidAddress } from "./validation.js";
import { MESSAGE_LIMITS } from "./signing.js";

export interface RelayServerOptions {
  port: number;
  dbPath: string;      // SQLite file path (":memory:" for tests)
  maxBodyBytes?: number;
}

export interface RelayServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
}

/**
 * Create and return a sovereign social relay server.
 */
export function createRelayServer(opts: RelayServerOptions): RelayServer {
  const maxBody = opts.maxBodyBytes ?? MESSAGE_LIMITS.maxTotalSize;
  const db = new Database(opts.dbPath);

  // WAL mode for concurrent reads
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      content TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      signature TEXT NOT NULL,
      reply_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient, read, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `);

  // Prepared statements
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, sender, recipient, content, signed_at, signature, reply_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  // Cursor uses ULID id (lexicographically monotonic) to avoid dropping
  // messages that arrive within the same second (created_at has 1s granularity).
  const pollMessages = db.prepare(`
    SELECT id, sender, recipient, content, signed_at, signature, reply_to, created_at
    FROM messages
    WHERE recipient = ? AND id > ?
    ORDER BY id ASC
    LIMIT ?
  `);

  const pollAllMessages = db.prepare(`
    SELECT id, sender, recipient, content, signed_at, signature, reply_to, created_at
    FROM messages
    WHERE recipient = ?
    ORDER BY id ASC
    LIMIT ?
  `);

  const countUnread = db.prepare(`
    SELECT COUNT(*) AS cnt FROM messages WHERE recipient = ? AND read = 0
  `);

  // Mark only specific message IDs as read (not all unread for a recipient)
  const markReadById = db.prepare(`
    UPDATE messages SET read = 1 WHERE id = ?
  `);

  const markReadBatch = db.transaction((ids: string[]) => {
    for (const id of ids) {
      markReadById.run(id);
    }
  });

  // --- HTTP handlers ---

  async function handleSend(body: string): Promise<{ status: number; body: unknown }> {
    let payload: {
      from: string; to: string; content: string;
      signed_at: string; signature: string; reply_to?: string;
    };
    try {
      payload = JSON.parse(body);
    } catch {
      return { status: 400, body: { error: "Invalid JSON" } };
    }

    if (!payload.from || !payload.to || !payload.content || !payload.signed_at || !payload.signature) {
      return { status: 400, body: { error: "Missing required fields" } };
    }

    // Validate message structure
    const validation = validateMessage({
      from: payload.from,
      to: payload.to,
      content: payload.content,
      signed_at: payload.signed_at,
    });
    if (!validation.valid) {
      return { status: 400, body: { error: validation.errors.join("; ") } };
    }

    // Verify ECDSA signature (dual-protocol)
    const verified = await verifyMessageSignature(
      { to: payload.to, content: payload.content, signed_at: payload.signed_at, signature: payload.signature },
      payload.from,
    );
    if (!verified) {
      return { status: 401, body: { error: "Invalid signature" } };
    }

    const id = ulid();
    insertMsg.run(
      id,
      payload.from.toLowerCase(),
      payload.to.toLowerCase(),
      payload.content,
      payload.signed_at,
      payload.signature,
      payload.reply_to ?? null,
    );

    return { status: 201, body: { id } };
  }

  async function handlePoll(
    body: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const address = headers["x-wallet-address"];
    const signature = headers["x-signature"];
    const timestamp = headers["x-timestamp"];

    if (!address || !signature || !timestamp) {
      return { status: 401, body: { error: "Missing auth headers" } };
    }

    if (!isValidAddress(address)) {
      return { status: 400, body: { error: "Invalid address format" } };
    }

    // Verify poll signature (dual-protocol)
    const verified = await verifyPollSignature(address, timestamp, signature);
    if (!verified) {
      return { status: 401, body: { error: "Invalid poll signature" } };
    }

    // Replay window check — only accept past timestamps (not future)
    const tsAge = Date.now() - new Date(timestamp).getTime();
    if (tsAge < 0 || tsAge > MESSAGE_LIMITS.replayWindowMs) {
      return { status: 401, body: { error: "Poll timestamp expired" } };
    }

    let parsed: { cursor?: string; limit?: number } = {};
    try {
      if (body.trim()) parsed = JSON.parse(body);
    } catch {
      return { status: 400, body: { error: "Invalid JSON body" } };
    }

    const limit = Math.min(parsed.limit ?? 50, 100);
    const addr = address.toLowerCase();

    const rows = parsed.cursor
      ? (pollMessages.all(addr, parsed.cursor, limit) as MessageRow[])
      : (pollAllMessages.all(addr, limit) as MessageRow[]);

    // Mark only the fetched messages as read
    if (rows.length > 0) {
      markReadBatch(rows.map((r) => r.id));
    }

    const messages = rows.map((r) => ({
      id: r.id,
      from: r.sender,
      to: r.recipient,
      content: r.content,
      signedAt: r.signed_at,
      createdAt: r.created_at,
      replyTo: r.reply_to ?? undefined,
    }));

    // Cursor is the last ULID id (not created_at) for precise pagination
    const nextCursor = rows.length === limit ? rows[rows.length - 1]!.id : undefined;

    return {
      status: 200,
      body: { messages, next_cursor: nextCursor },
    };
  }

  async function handleCount(
    headers: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const address = headers["x-wallet-address"];
    const signature = headers["x-signature"];
    const timestamp = headers["x-timestamp"];

    if (!address || !signature || !timestamp) {
      return { status: 401, body: { error: "Missing auth headers" } };
    }

    if (!isValidAddress(address)) {
      return { status: 400, body: { error: "Invalid address format" } };
    }

    const verified = await verifyPollSignature(address, timestamp, signature);
    if (!verified) {
      return { status: 401, body: { error: "Invalid signature" } };
    }

    // Only accept past timestamps (not future)
    const tsAge = Date.now() - new Date(timestamp).getTime();
    if (tsAge < 0 || tsAge > MESSAGE_LIMITS.replayWindowMs) {
      return { status: 401, body: { error: "Timestamp expired" } };
    }

    const row = countUnread.get(address.toLowerCase()) as { cnt: number };
    return { status: 200, body: { unread: row.cnt } };
  }

  // --- Server ---

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);
    const path = url.pathname;
    const method = req.method?.toUpperCase() ?? "GET";

    // Health check
    if (path === "/health" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Collect body for POST endpoints
    if (method === "POST" || (path === "/v1/messages/count" && method === "GET")) {
      let body = "";
      let size = 0;
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBody) {
          aborted = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload too large" }));
          req.destroy();
          return;
        }
        body += chunk.toString();
      });

      req.on("end", () => {
        if (aborted) return;

        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(req.headers)) {
          if (typeof val === "string") headers[key.toLowerCase()] = val;
        }

        let handler: Promise<{ status: number; body: unknown }>;

        if (path === "/v1/messages" && method === "POST") {
          handler = handleSend(body);
        } else if (path === "/v1/messages/poll" && method === "POST") {
          handler = handlePoll(body, headers);
        } else if (path === "/v1/messages/count" && method === "GET") {
          handler = handleCount(headers);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        handler
          .then((result) => {
            res.writeHead(result.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result.body));
          })
          .catch((err) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err?.message ?? "Internal error" }));
          });
      });

      return;
    }

    // Fallback
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return {
    port: opts.port,
    start() {
      return new Promise<void>((resolve, reject) => {
        server.on("error", reject);
        server.listen(opts.port, () => resolve());
      });
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          try {
            db.close();
          } catch (dbErr) {
            reject(dbErr);
            return;
          }
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

interface MessageRow {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  signed_at: string;
  signature: string;
  reply_to: string | null;
  created_at: string;
}
