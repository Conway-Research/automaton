import { describe, it, expect, beforeEach } from "vitest";
import {
  AgentContextAggregator,
  type AgentStatusUpdate,
} from "../../memory/agent-context-aggregator.js";

function makeUpdate(overrides: Partial<AgentStatusUpdate> = {}): AgentStatusUpdate {
  return {
    agentAddress: "0xagent1",
    department: "engineering",
    role: "generalist",
    status: "running",
    kind: "progress",
    message: "Working on task",
    ...overrides,
  };
}

describe("AgentContextAggregator", () => {
  let aggregator: AgentContextAggregator;

  beforeEach(() => {
    aggregator = new AgentContextAggregator();
  });

  // ---------------------------------------------------------------------------
  // triageUpdate
  // ---------------------------------------------------------------------------

  describe("triageUpdate", () => {
    it("returns full for update with error field", () => {
      const update = makeUpdate({ error: "something went wrong" });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for status containing 'error'", () => {
      const update = makeUpdate({ status: "error", kind: "progress" });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for status containing 'failed'", () => {
      const update = makeUpdate({ status: "failed", kind: "progress" });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for kind 'exception'", () => {
      const update = makeUpdate({ status: "running", kind: "exception" });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for large financial event (budgetImpactPercent > 10)", () => {
      const update = makeUpdate({ budgetImpactPercent: 15 });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full when financialAmount exceeds 10% of dailyBudget", () => {
      const update = makeUpdate({ financialAmount: 200, dailyBudget: 1000 });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for blocked update (blocked: true)", () => {
      const update = makeUpdate({ blocked: true });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for status 'blocked'", () => {
      const update = makeUpdate({ status: "blocked", kind: "progress" });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns full for status 'stalled'", () => {
      const update = makeUpdate({ status: "stalled", kind: "progress" });
      expect(aggregator.triageUpdate(update)).toBe("full");
    });

    it("returns summary for completed tasks", () => {
      const update = makeUpdate({ status: "completed", kind: "done" });
      expect(aggregator.triageUpdate(update)).toBe("summary");
    });

    it("returns summary for progress/running status", () => {
      const update = makeUpdate({ status: "running", kind: "progress" });
      expect(aggregator.triageUpdate(update)).toBe("summary");
    });

    it("returns count for heartbeat status", () => {
      const update = makeUpdate({ status: "heartbeat", kind: "heartbeat" });
      expect(aggregator.triageUpdate(update)).toBe("count");
    });

    it("returns count for alive status", () => {
      const update = makeUpdate({ status: "alive", kind: "alive" });
      expect(aggregator.triageUpdate(update)).toBe("count");
    });

    it("returns count for ping kind", () => {
      const update = makeUpdate({ status: "ping", kind: "ping" });
      expect(aggregator.triageUpdate(update)).toBe("count");
    });
  });

  // ---------------------------------------------------------------------------
  // aggregateChildUpdates
  // ---------------------------------------------------------------------------

  describe("aggregateChildUpdates", () => {
    it("handles empty updates array", () => {
      const result = aggregator.aggregateChildUpdates([], 1000);
      expect(result.fullUpdates).toHaveLength(0);
      expect(result.summaryEntries).toHaveLength(0);
      expect(result.heartbeatCount).toBe(0);
      expect(result.triageCounts).toEqual({ full: 0, summary: 0, count: 0 });
    });

    it("puts error updates in fullUpdates", () => {
      const updates = [
        makeUpdate({ error: "disk full" }),
        makeUpdate({ status: "running" }),
      ];
      const result = aggregator.aggregateChildUpdates(updates, 1000);
      expect(result.fullUpdates).toHaveLength(1);
      expect(result.fullUpdates[0].error).toBe("disk full");
    });

    it("counts heartbeats separately", () => {
      const updates = [
        makeUpdate({ status: "heartbeat", kind: "heartbeat" }),
        makeUpdate({ status: "alive", kind: "alive" }),
        makeUpdate({ status: "running" }),
      ];
      const result = aggregator.aggregateChildUpdates(updates, 1000);
      expect(result.heartbeatCount).toBe(2);
    });

    it("groups summary updates by department", () => {
      const updates = [
        makeUpdate({ department: "engineering", status: "running" }),
        makeUpdate({ department: "engineering", status: "running" }),
        makeUpdate({ department: "design", status: "running" }),
      ];
      const result = aggregator.aggregateChildUpdates(updates, 1000);
      const groups = result.summaryEntries.map((e) => e.group);
      expect(groups).toContain("engineering");
      expect(groups).toContain("design");
      const engEntry = result.summaryEntries.find((e) => e.group === "engineering");
      expect(engEntry?.count).toBe(2);
      const designEntry = result.summaryEntries.find((e) => e.group === "design");
      expect(designEntry?.count).toBe(1);
    });

    it("groups by role when department is missing", () => {
      const updates = [
        makeUpdate({ department: undefined, role: "analyst", status: "running" }),
        makeUpdate({ department: undefined, role: "analyst", status: "running" }),
      ];
      const result = aggregator.aggregateChildUpdates(updates, 1000);
      const entry = result.summaryEntries.find((e) => e.group === "analyst");
      expect(entry).toBeDefined();
      expect(entry?.count).toBe(2);
    });

    it("returns correct triageCounts", () => {
      const updates = [
        makeUpdate({ error: "oh no" }),
        makeUpdate({ status: "running" }),
        makeUpdate({ status: "heartbeat", kind: "heartbeat" }),
      ];
      const result = aggregator.aggregateChildUpdates(updates, 1000);
      expect(result.triageCounts.full).toBe(1);
      expect(result.triageCounts.summary).toBe(1);
      expect(result.triageCounts.count).toBe(1);
    });

    it("preserves highlight messages in summary entries", () => {
      const updates = [
        makeUpdate({ department: "engineering", message: "Task X is in progress" }),
      ];
      const result = aggregator.aggregateChildUpdates(updates, 1000);
      const entry = result.summaryEntries.find((e) => e.group === "engineering");
      expect(entry?.highlight).toBe("Task X is in progress");
    });

    it("respects token budget and truncates when exceeded", () => {
      const updates = Array.from({ length: 50 }, (_, i) =>
        makeUpdate({
          agentAddress: `0xagent${i}`,
          department: `dept-${i % 5}`,
          message: `Long message about progress on task number ${i} with details`,
        }),
      );
      const result = aggregator.aggregateChildUpdates(updates, 10); // very small budget
      // rough check: summary should be <= 10 tokens * 4 chars/token + some overhead
      expect(result.summary.length).toBeLessThanOrEqual(10 * 4 + 50);
    });
  });
});
