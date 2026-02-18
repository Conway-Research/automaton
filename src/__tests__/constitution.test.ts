/**
 * Constitution Self-Audit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runConstitutionAudit,
  hasCriticalViolation,
  formatAuditResult,
} from "../constitution/audit.js";
import {
  MockInferenceClient,
  noToolResponse,
  createTestDb,
  createTestConfig,
} from "./mocks.js";
import type { AutomatonDatabase, ConstitutionAuditResult } from "../types.js";
import { ulid } from "ulid";

describe("Constitution Self-Audit", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("runConstitutionAudit", () => {
    it("returns pass with no turns", async () => {
      const inference = new MockInferenceClient();
      const config = createTestConfig();

      const result = await runConstitutionAudit(db, inference, config);

      expect(result.passed).toBe(true);
      expect(result.turnsAudited).toBe(0);
      expect(result.findings).toEqual([]);
      expect(result.modelUsed).toBe("none");
    });

    it("audits recent turns and parses pass response", async () => {
      // Insert a turn
      db.insertTurn({
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "Checking credits",
        toolCalls: [],
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costCents: 1,
      });

      const inference = new MockInferenceClient([
        {
          id: "resp_1",
          model: "gpt-4o-mini",
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: true,
              findings: [],
              summary: "All actions comply with the Three Laws.",
            }),
          },
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          finishReason: "stop",
        },
      ]);

      const config = createTestConfig();
      const result = await runConstitutionAudit(db, inference, config);

      expect(result.passed).toBe(true);
      expect(result.turnsAudited).toBe(1);
      expect(result.findings).toEqual([]);
      expect(result.summary).toBe("All actions comply with the Three Laws.");
      expect(inference.calls.length).toBe(1);
    });

    it("parses violation response correctly", async () => {
      db.insertTurn({
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "Sending spam emails",
        toolCalls: [
          {
            id: "tc1",
            name: "exec",
            arguments: { command: "send-spam" },
            result: "sent 1000 emails",
            durationMs: 500,
          },
        ],
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costCents: 1,
      });

      const inference = new MockInferenceClient([
        {
          id: "resp_1",
          model: "gpt-4o-mini",
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: false,
              findings: [
                {
                  lawId: "II",
                  lawName: "Earn your existence",
                  severity: "critical",
                  description: "Agent sent spam emails",
                  evidence: "exec(send-spam) → sent 1000 emails",
                },
              ],
              summary: "Critical violation: spamming detected.",
            }),
          },
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          finishReason: "stop",
        },
      ]);

      const config = createTestConfig();
      const result = await runConstitutionAudit(db, inference, config);

      expect(result.passed).toBe(false);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe("critical");
      expect(result.findings[0].lawId).toBe("II");
    });

    it("handles inference failure gracefully", async () => {
      db.insertTurn({
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "test",
        toolCalls: [],
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costCents: 1,
      });

      const inference = new MockInferenceClient();
      // Override chat to throw
      inference.chat = async () => {
        throw new Error("API down");
      };

      const config = createTestConfig();
      const result = await runConstitutionAudit(db, inference, config);

      expect(result.passed).toBe(true); // Assume pass on failure
      expect(result.summary).toContain("Audit failed");
    });

    it("handles malformed JSON response", async () => {
      db.insertTurn({
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "test",
        toolCalls: [],
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costCents: 1,
      });

      const inference = new MockInferenceClient([
        {
          id: "resp_1",
          model: "gpt-4o-mini",
          message: { role: "assistant", content: "not valid json at all" },
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          finishReason: "stop",
        },
      ]);

      const config = createTestConfig();
      const result = await runConstitutionAudit(db, inference, config);

      expect(result.passed).toBe(true);
      expect(result.summary).toContain("Could not parse");
    });

    it("uses constitutionAuditModel from config", async () => {
      db.insertTurn({
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "test",
        toolCalls: [],
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costCents: 1,
      });

      const inference = new MockInferenceClient([
        noToolResponse(JSON.stringify({ passed: true, findings: [], summary: "ok" })),
      ]);

      const config = createTestConfig({ constitutionAuditModel: "claude-haiku" });
      await runConstitutionAudit(db, inference, config);

      expect(inference.calls[0].options?.model).toBe("claude-haiku");
    });
  });

  describe("hasCriticalViolation", () => {
    it("returns false for passed audit", () => {
      const result: ConstitutionAuditResult = {
        id: "test",
        timestamp: new Date().toISOString(),
        turnsAudited: 1,
        turnIds: [],
        passed: true,
        findings: [],
        summary: "ok",
        modelUsed: "test",
        durationMs: 100,
      };
      expect(hasCriticalViolation(result)).toBe(false);
    });

    it("returns true when critical finding exists", () => {
      const result: ConstitutionAuditResult = {
        id: "test",
        timestamp: new Date().toISOString(),
        turnsAudited: 1,
        turnIds: [],
        passed: false,
        findings: [
          {
            lawId: "I",
            lawName: "Never harm",
            severity: "critical",
            description: "test",
            evidence: "test",
          },
        ],
        summary: "violation",
        modelUsed: "test",
        durationMs: 100,
      };
      expect(hasCriticalViolation(result)).toBe(true);
    });

    it("returns false for non-critical findings", () => {
      const result: ConstitutionAuditResult = {
        id: "test",
        timestamp: new Date().toISOString(),
        turnsAudited: 1,
        turnIds: [],
        passed: false,
        findings: [
          {
            lawId: "III",
            lawName: "Never deceive",
            severity: "low",
            description: "minor concern",
            evidence: "test",
          },
        ],
        summary: "minor",
        modelUsed: "test",
        durationMs: 100,
      };
      expect(hasCriticalViolation(result)).toBe(false);
    });
  });

  describe("formatAuditResult", () => {
    it("formats passed audit", () => {
      const result: ConstitutionAuditResult = {
        id: "test",
        timestamp: "2025-01-01T00:00:00Z",
        turnsAudited: 5,
        turnIds: [],
        passed: true,
        findings: [],
        summary: "All clear.",
        modelUsed: "gpt-4o-mini",
        durationMs: 100,
      };

      const output = formatAuditResult(result);
      expect(output).toContain("✓ PASSED");
      expect(output).toContain("5 turn(s)");
      expect(output).toContain("All clear.");
    });

    it("formats failed audit with findings", () => {
      const result: ConstitutionAuditResult = {
        id: "test",
        timestamp: "2025-01-01T00:00:00Z",
        turnsAudited: 3,
        turnIds: [],
        passed: false,
        findings: [
          {
            lawId: "I",
            lawName: "Never harm",
            severity: "high",
            description: "Attempted unauthorized access",
            evidence: "exec(ssh hack-target)",
          },
        ],
        summary: "Violation detected.",
        modelUsed: "gpt-4o-mini",
        durationMs: 200,
      };

      const output = formatAuditResult(result);
      expect(output).toContain("✗ VIOLATION DETECTED");
      expect(output).toContain("[HIGH]");
      expect(output).toContain("Law I");
      expect(output).toContain("Attempted unauthorized access");
    });
  });

  describe("DB persistence", () => {
    it("inserts and retrieves constitution audits", () => {
      const audit: ConstitutionAuditResult = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        turnsAudited: 5,
        turnIds: ["t1", "t2"],
        passed: false,
        findings: [
          {
            lawId: "II",
            lawName: "Earn your existence",
            severity: "medium",
            description: "Questionable value creation",
            evidence: "turn t1",
          },
        ],
        summary: "Needs review.",
        modelUsed: "gpt-4o-mini",
        durationMs: 150,
      };

      db.insertConstitutionAudit(audit);
      const retrieved = db.getRecentConstitutionAudits(10);

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe(audit.id);
      expect(retrieved[0].passed).toBe(false);
      expect(retrieved[0].findings.length).toBe(1);
      expect(retrieved[0].turnIds).toEqual(["t1", "t2"]);
    });
  });
});
