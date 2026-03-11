/**
 * Inbox Processing Tests (Sub-phase 1.2)
 *
 * Tests the inbox message state machine:
 *   received → in_progress → processed (success)
 *   received → in_progress → received (retry on failure)
 *   received → in_progress → failed (max retries exceeded)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createDatabase } from "../state/database.js";
import {
  claimInboxMessages,
  markInboxProcessed,
  markInboxFailed,
  resetInboxToReceived,
  getUnprocessedInboxCount,
} from "../state/database.js";
import type { AutomatonDatabase } from "../types.js";

function makeTmpDbPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-inbox-test-"));
  return path.join(tmpDir, "test.db");
}

function insertTestMessage(db: AutomatonDatabase, id: string, from = "3nWpEUTi9ZMx6K4YhVfRqJb7cDsLg8aP"): void {
  db.insertInboxMessage({
    id,
    from,
    to: "9mFkR2xH5tN8vB3wG7jQ4cY1pZ6dA0eS",
    content: `Message ${id}`,
    signedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}

describe("Inbox Processing State Machine (Phase 1.2)", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  // ─── Schema: inbox_messages has new columns ────────────────────

  describe("schema", () => {
    it("inbox_messages has status, retry_count, max_retries columns", () => {
      const columns = db.raw
        .prepare("PRAGMA table_info(inbox_messages)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("status");
      expect(names).toContain("retry_count");
      expect(names).toContain("max_retries");
    });

    it("new messages default to status=received, retry_count=0, max_retries=3", () => {
      insertTestMessage(db, "msg-defaults");
      const row = db.raw
        .prepare("SELECT status, retry_count, max_retries FROM inbox_messages WHERE id = ?")
        .get("msg-defaults") as { status: string; retry_count: number; max_retries: number };
      expect(row.status).toBe("received");
      expect(row.retry_count).toBe(0);
      expect(row.max_retries).toBe(3);
    });
  });

  // ─── claimInboxMessages ────────────────────────────────────────

  describe("claimInboxMessages", () => {
    it("claims received messages and transitions to in_progress", () => {
      insertTestMessage(db, "msg-1");
      insertTestMessage(db, "msg-2");

      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(2);
      expect(claimed[0].status).toBe("in_progress");
      expect(claimed[1].status).toBe("in_progress");

      // Verify in the database
      const row = db.raw
        .prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-1") as { status: string };
      expect(row.status).toBe("in_progress");
    });

    it("increments retry_count on each claim", () => {
      insertTestMessage(db, "msg-retry");

      const claimed1 = claimInboxMessages(db.raw, 10);
      expect(claimed1).toHaveLength(1);
      expect(claimed1[0].retryCount).toBe(1);

      // Reset to received for another claim
      resetInboxToReceived(db.raw, ["msg-retry"]);

      const claimed2 = claimInboxMessages(db.raw, 10);
      expect(claimed2).toHaveLength(1);
      expect(claimed2[0].retryCount).toBe(2);
    });

    it("respects the limit parameter", () => {
      insertTestMessage(db, "msg-a");
      insertTestMessage(db, "msg-b");
      insertTestMessage(db, "msg-c");

      const claimed = claimInboxMessages(db.raw, 2);
      expect(claimed).toHaveLength(2);
    });

    it("does not claim messages already in_progress", () => {
      insertTestMessage(db, "msg-ip");

      // First claim
      claimInboxMessages(db.raw, 10);

      // Second claim should return nothing (msg-ip is in_progress)
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(0);
    });

    it("does not claim messages that have exhausted retries", () => {
      insertTestMessage(db, "msg-exhausted");

      // Simulate exhausting retries (3 claims + resets)
      for (let i = 0; i < 3; i++) {
        claimInboxMessages(db.raw, 10);
        resetInboxToReceived(db.raw, ["msg-exhausted"]);
      }

      // Now retry_count is 3 (equal to max_retries), should not be claimed
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(0);
    });

    it("returns empty array when no messages available", () => {
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(0);
    });
  });

  // ─── markInboxProcessed ────────────────────────────────────────

  describe("markInboxProcessed", () => {
    it("transitions messages to processed status", () => {
      insertTestMessage(db, "msg-p1");
      claimInboxMessages(db.raw, 10);

      markInboxProcessed(db.raw, ["msg-p1"]);

      const row = db.raw
        .prepare("SELECT status, processed_at FROM inbox_messages WHERE id = ?")
        .get("msg-p1") as { status: string; processed_at: string | null };
      expect(row.status).toBe("processed");
      expect(row.processed_at).not.toBeNull();
    });

    it("handles empty ids array gracefully", () => {
      expect(() => markInboxProcessed(db.raw, [])).not.toThrow();
    });

    it("processes multiple messages at once", () => {
      insertTestMessage(db, "msg-batch-1");
      insertTestMessage(db, "msg-batch-2");
      claimInboxMessages(db.raw, 10);

      markInboxProcessed(db.raw, ["msg-batch-1", "msg-batch-2"]);

      const count = db.raw
        .prepare("SELECT COUNT(*) as c FROM inbox_messages WHERE status = 'processed'")
        .get() as { c: number };
      expect(count.c).toBe(2);
    });
  });

  // ─── markInboxFailed ──────────────────────────────────────────

  describe("markInboxFailed", () => {
    it("transitions messages to failed status", () => {
      insertTestMessage(db, "msg-f1");
      claimInboxMessages(db.raw, 10);

      markInboxFailed(db.raw, ["msg-f1"]);

      const row = db.raw
        .prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-f1") as { status: string };
      expect(row.status).toBe("failed");
    });

    it("failed messages are not claimable", () => {
      insertTestMessage(db, "msg-f2");
      claimInboxMessages(db.raw, 10);
      markInboxFailed(db.raw, ["msg-f2"]);

      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(0);
    });
  });

  // ─── resetInboxToReceived ─────────────────────────────────────

  describe("resetInboxToReceived", () => {
    it("transitions messages back to received for retry", () => {
      insertTestMessage(db, "msg-r1");
      claimInboxMessages(db.raw, 10);

      resetInboxToReceived(db.raw, ["msg-r1"]);

      const row = db.raw
        .prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-r1") as { status: string };
      expect(row.status).toBe("received");
    });

    it("reset messages can be claimed again", () => {
      insertTestMessage(db, "msg-r2");
      claimInboxMessages(db.raw, 10);
      resetInboxToReceived(db.raw, ["msg-r2"]);

      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].id).toBe("msg-r2");
    });
  });

  // ─── getUnprocessedInboxCount ─────────────────────────────────

  describe("getUnprocessedInboxCount", () => {
    it("counts received and in_progress messages", () => {
      insertTestMessage(db, "msg-c1");
      insertTestMessage(db, "msg-c2");
      insertTestMessage(db, "msg-c3");

      // One claimed (in_progress), two received
      claimInboxMessages(db.raw, 1);

      const count = getUnprocessedInboxCount(db.raw);
      expect(count).toBe(3);
    });

    it("does not count processed messages", () => {
      insertTestMessage(db, "msg-c4");
      claimInboxMessages(db.raw, 10);
      markInboxProcessed(db.raw, ["msg-c4"]);

      const count = getUnprocessedInboxCount(db.raw);
      expect(count).toBe(0);
    });

    it("does not count failed messages", () => {
      insertTestMessage(db, "msg-c5");
      claimInboxMessages(db.raw, 10);
      markInboxFailed(db.raw, ["msg-c5"]);

      const count = getUnprocessedInboxCount(db.raw);
      expect(count).toBe(0);
    });

    it("returns 0 when no messages exist", () => {
      const count = getUnprocessedInboxCount(db.raw);
      expect(count).toBe(0);
    });
  });

  // ─── Full state machine flow ──────────────────────────────────

  describe("full state machine flow", () => {
    it("success path: received → in_progress → processed", () => {
      insertTestMessage(db, "msg-flow-1");

      // Verify initial state
      let row = db.raw.prepare("SELECT status, retry_count FROM inbox_messages WHERE id = ?")
        .get("msg-flow-1") as { status: string; retry_count: number };
      expect(row.status).toBe("received");
      expect(row.retry_count).toBe(0);

      // Claim
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(1);
      row = db.raw.prepare("SELECT status, retry_count FROM inbox_messages WHERE id = ?")
        .get("msg-flow-1") as { status: string; retry_count: number };
      expect(row.status).toBe("in_progress");
      expect(row.retry_count).toBe(1);

      // Process
      markInboxProcessed(db.raw, ["msg-flow-1"]);
      row = db.raw.prepare("SELECT status, retry_count FROM inbox_messages WHERE id = ?")
        .get("msg-flow-1") as { status: string; retry_count: number };
      expect(row.status).toBe("processed");
      expect(row.retry_count).toBe(1);
    });

    it("retry path: received → in_progress → received (×N) → in_progress → processed", () => {
      insertTestMessage(db, "msg-flow-2");

      // First attempt: claim then fail
      claimInboxMessages(db.raw, 10);
      resetInboxToReceived(db.raw, ["msg-flow-2"]);

      // Second attempt: claim then fail
      claimInboxMessages(db.raw, 10);
      resetInboxToReceived(db.raw, ["msg-flow-2"]);

      // Third attempt: claim then succeed
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].retryCount).toBe(3);

      markInboxProcessed(db.raw, ["msg-flow-2"]);
      const row = db.raw.prepare("SELECT status, retry_count FROM inbox_messages WHERE id = ?")
        .get("msg-flow-2") as { status: string; retry_count: number };
      expect(row.status).toBe("processed");
      expect(row.retry_count).toBe(3);
    });

    it("exhaustion path: received → in_progress → received (×3) → failed", () => {
      insertTestMessage(db, "msg-flow-3");

      // Exhaust all 3 retries
      for (let i = 0; i < 3; i++) {
        const claimed = claimInboxMessages(db.raw, 10);
        expect(claimed).toHaveLength(1);
        resetInboxToReceived(db.raw, ["msg-flow-3"]);
      }

      // Should not be claimable anymore (retry_count = 3 = max_retries)
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(0);

      // Manually mark as failed (as the loop would do)
      markInboxFailed(db.raw, ["msg-flow-3"]);
      const row = db.raw.prepare("SELECT status, retry_count FROM inbox_messages WHERE id = ?")
        .get("msg-flow-3") as { status: string; retry_count: number };
      expect(row.status).toBe("failed");
      expect(row.retry_count).toBe(3);
    });

    it("atomic ack: markInboxProcessed inside transaction", () => {
      insertTestMessage(db, "msg-txn-1");
      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(1);

      // Simulate what the loop does: atomic turn + inbox ack
      const turn = {
        id: "turn-inbox-test",
        timestamp: new Date().toISOString(),
        state: "running" as const,
        thinking: "Processing inbox message",
        toolCalls: [],
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        costCents: 1,
      };

      db.runTransaction(() => {
        db.insertTurn(turn);
        markInboxProcessed(db.raw, ["msg-txn-1"]);
      });

      // Both should have succeeded
      const savedTurn = db.getTurnById("turn-inbox-test");
      expect(savedTurn).toBeDefined();

      const row = db.raw.prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-txn-1") as { status: string };
      expect(row.status).toBe("processed");
    });

    it("atomic ack rollback: turn failure leaves messages in_progress", () => {
      insertTestMessage(db, "msg-txn-2");

      // First insert a turn to create a duplicate
      db.insertTurn({
        id: "turn-dup",
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "setup",
        toolCalls: [],
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costCents: 0,
      });

      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(1);

      // Transaction that fails (duplicate turn ID)
      expect(() => {
        db.runTransaction(() => {
          db.insertTurn({
            id: "turn-dup", // duplicate!
            timestamp: new Date().toISOString(),
            state: "running",
            thinking: "Should fail",
            toolCalls: [],
            tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            costCents: 0,
          });
          markInboxProcessed(db.raw, ["msg-txn-2"]);
        });
      }).toThrow();

      // Message should still be in_progress (markInboxProcessed was rolled back)
      const row = db.raw.prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-txn-2") as { status: string };
      expect(row.status).toBe("in_progress");
    });

    it("duplicate message insertion is ignored via INSERT OR IGNORE", () => {
      insertTestMessage(db, "msg-dup-1");

      // Try to insert same message again
      expect(() => {
        insertTestMessage(db, "msg-dup-1");
      }).not.toThrow();

      // Should still only have one message
      const count = db.raw
        .prepare("SELECT COUNT(*) as c FROM inbox_messages WHERE id = 'msg-dup-1'")
        .get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("mixed success/failure: some messages processed, others retried", () => {
      insertTestMessage(db, "msg-mix-1");
      insertTestMessage(db, "msg-mix-2");
      insertTestMessage(db, "msg-mix-3");

      const claimed = claimInboxMessages(db.raw, 10);
      expect(claimed).toHaveLength(3);

      // Simulate: msg-mix-1 succeeds, msg-mix-2 retries, msg-mix-3 fails (already at max)
      markInboxProcessed(db.raw, ["msg-mix-1"]);
      resetInboxToReceived(db.raw, ["msg-mix-2"]);
      markInboxFailed(db.raw, ["msg-mix-3"]);

      const s1 = db.raw.prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-mix-1") as { status: string };
      const s2 = db.raw.prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-mix-2") as { status: string };
      const s3 = db.raw.prepare("SELECT status FROM inbox_messages WHERE id = ?")
        .get("msg-mix-3") as { status: string };

      expect(s1.status).toBe("processed");
      expect(s2.status).toBe("received");
      expect(s3.status).toBe("failed");

      // Only msg-mix-2 should be unprocessed
      const unprocessed = getUnprocessedInboxCount(db.raw);
      expect(unprocessed).toBe(1);
    });
  });
});
