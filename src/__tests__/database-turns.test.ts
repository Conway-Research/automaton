/**
 * Database turns query tests
 *
 * Validates cursor pagination and filter behavior for queryTurns().
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./mocks.js";
import type { AutomatonDatabase, AgentState } from "../types.js";

describe("Database queryTurns", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  function insertTurn(
    id: string,
    timestamp: string,
    state: AgentState,
    thinking: string,
    toolResult?: string,
  ): void {
    db.insertTurn({
      id,
      timestamp,
      state,
      input: `input-${id}`,
      inputSource: "system",
      thinking,
      toolCalls: toolResult
        ? [
            {
              id: `${id}-tool`,
              name: "exec",
              arguments: { cmd: "echo ok" },
              result: toolResult,
              durationMs: 42,
            },
          ]
        : [],
      tokenUsage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
      costCents: 0,
    });
  }

  it("paginates deterministically with timestamp+id cursor", () => {
    insertTurn("a", "2026-01-01T00:00:00.000Z", "running", "oldest");
    insertTurn("b", "2026-01-01T00:00:01.000Z", "running", "middle");
    insertTurn("c", "2026-01-01T00:00:01.000Z", "running", "middle-same-ts");
    insertTurn("d", "2026-01-01T00:00:02.000Z", "running", "newest");

    const page1 = db.queryTurns({ limit: 2 });
    expect(page1.totalMatched).toBe(4);
    expect(page1.hasMore).toBe(true);
    expect(page1.turns.map((t) => t.id)).toEqual(["d", "c"]);

    const cursor = {
      timestamp: page1.turns[1].timestamp,
      id: page1.turns[1].id,
    };
    const page2 = db.queryTurns({ limit: 2, cursor });
    expect(page2.totalMatched).toBe(4);
    expect(page2.hasMore).toBe(false);
    expect(page2.turns.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("filters by date, state, and text query", () => {
    insertTurn("x1", "2026-01-01T00:00:00.000Z", "sleeping", "idle");
    insertTurn("x2", "2026-01-01T00:01:00.000Z", "running", "deploying app", "built website");
    insertTurn("x3", "2026-01-01T00:02:00.000Z", "running", "writing tests");
    insertTurn("x4", "2026-01-01T00:03:00.000Z", "critical", "retrying");

    const result = db.queryTurns({
      limit: 10,
      from: "2026-01-01T00:00:30.000Z",
      to: "2026-01-01T00:02:30.000Z",
      state: "running",
      q: "website",
    });

    expect(result.totalMatched).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].id).toBe("x2");
  });
});
