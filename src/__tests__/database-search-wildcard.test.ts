/**
 * SQL LIKE Wildcard Escaping Tests
 *
 * Verifies that search functions properly escape SQL LIKE wildcards (% and _)
 * so that literal percent signs and underscores in content are matched exactly,
 * rather than being treated as wildcard operators.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  episodicSearch,
  episodicInsert,
  semanticSearch,
  semanticUpsert,
  proceduralSearch,
  proceduralUpsert,
} from "../state/database.js";
import { SemanticMemoryManager } from "../memory/semantic.js";
import { createTestDb } from "./mocks.js";
import type { AutomatonDatabase } from "../types.js";

describe("SQL LIKE wildcard escaping", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  // ─── episodicSearch ────────────────────────────────────────────

  describe("episodicSearch", () => {
    it("escapes % — matches literal percent in summary", () => {
      episodicInsert(db.raw, {
        sessionId: "s1",
        eventType: "observation",
        summary: "CPU usage reached 100%",
        detail: null,
        outcome: "neutral",
        importance: 0.5,
        embeddingKey: null,
        tokenCount: 10,
        classification: "maintenance",
      });

      episodicInsert(db.raw, {
        sessionId: "s1",
        eventType: "observation",
        summary: "Memory usage is normal",
        detail: null,
        outcome: "neutral",
        importance: 0.5,
        embeddingKey: null,
        tokenCount: 10,
        classification: "maintenance",
      });

      // Searching for "%" should only match the entry containing a literal "%"
      const results = episodicSearch(db.raw, "%");
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe("CPU usage reached 100%");
    });

    it("escapes _ — matches literal underscore in summary", () => {
      episodicInsert(db.raw, {
        sessionId: "s1",
        eventType: "action",
        summary: "Renamed file to my_document.txt",
        detail: null,
        outcome: "success",
        importance: 0.5,
        embeddingKey: null,
        tokenCount: 10,
        classification: "productive",
      });

      episodicInsert(db.raw, {
        sessionId: "s1",
        eventType: "action",
        summary: "Renamed file to report.txt",
        detail: null,
        outcome: "success",
        importance: 0.5,
        embeddingKey: null,
        tokenCount: 10,
        classification: "productive",
      });

      // Searching for "_" should only match the entry containing a literal "_"
      const results = episodicSearch(db.raw, "_");
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe("Renamed file to my_document.txt");
    });

    it("normal search still works without wildcards", () => {
      episodicInsert(db.raw, {
        sessionId: "s1",
        eventType: "action",
        summary: "Deployed the application successfully",
        detail: "All tests passed",
        outcome: "success",
        importance: 0.8,
        embeddingKey: null,
        tokenCount: 15,
        classification: "productive",
      });

      const results = episodicSearch(db.raw, "deployed");
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe("Deployed the application successfully");
    });
  });

  // ─── semanticSearch ────────────────────────────────────────────

  describe("semanticSearch", () => {
    it("escapes % — matches literal percent in value (no category filter)", () => {
      semanticUpsert(db.raw, {
        category: "environment",
        key: "disk_threshold",
        value: "Alert when disk usage exceeds 90%",
        confidence: 0.9,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      semanticUpsert(db.raw, {
        category: "environment",
        key: "disk_location",
        value: "Primary disk is mounted at /dev/sda1",
        confidence: 0.9,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      const results = semanticSearch(db.raw, "%");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("disk_threshold");
    });

    it("escapes _ — matches literal underscore in key (with category filter)", () => {
      semanticUpsert(db.raw, {
        category: "self",
        key: "max_retries",
        value: "Maximum number of retries is 3",
        confidence: 0.9,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      semanticUpsert(db.raw, {
        category: "self",
        key: "timeout",
        value: "Request timeout is 30 seconds",
        confidence: 0.9,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      // With category filter, searching for "_" should only match the entry with "_" in key
      const results = semanticSearch(db.raw, "_", "self");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("max_retries");
    });

    it("escapes % — matches literal percent in value (with category filter)", () => {
      semanticUpsert(db.raw, {
        category: "financial",
        key: "fee_rate",
        value: "Transaction fee is 2.5%",
        confidence: 0.8,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      semanticUpsert(db.raw, {
        category: "financial",
        key: "balance",
        value: "Current balance is 500 credits",
        confidence: 0.9,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      const results = semanticSearch(db.raw, "%", "financial");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("fee_rate");
    });

    it("normal search still works without wildcards", () => {
      semanticUpsert(db.raw, {
        category: "domain",
        key: "api_endpoint",
        value: "The main API endpoint is https://api.example.com",
        confidence: 1.0,
        source: "s1",
        embeddingKey: null,
        lastVerifiedAt: null,
      });

      const results = semanticSearch(db.raw, "endpoint");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("api_endpoint");
    });
  });

  // ─── proceduralSearch ──────────────────────────────────────────

  describe("proceduralSearch", () => {
    it("escapes % — matches literal percent in description", () => {
      proceduralUpsert(db.raw, {
        name: "scale-up",
        description: "Scale when CPU > 80%",
        steps: [{ order: 1, description: "Check CPU usage" }],
      });

      proceduralUpsert(db.raw, {
        name: "restart-service",
        description: "Restart the web service gracefully",
        steps: [{ order: 1, description: "Send SIGTERM" }],
      });

      const results = proceduralSearch(db.raw, "%");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("scale-up");
    });

    it("escapes _ — matches literal underscore in name", () => {
      proceduralUpsert(db.raw, {
        name: "deploy_app",
        description: "Deploy the application to production",
        steps: [{ order: 1, description: "Build the project" }],
      });

      proceduralUpsert(db.raw, {
        name: "rollback",
        description: "Roll back to the previous version",
        steps: [{ order: 1, description: "Revert deployment" }],
      });

      const results = proceduralSearch(db.raw, "_");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("deploy_app");
    });

    it("normal search still works without wildcards", () => {
      proceduralUpsert(db.raw, {
        name: "backup-database",
        description: "Create a full database backup",
        steps: [{ order: 1, description: "Dump all tables" }],
      });

      const results = proceduralSearch(db.raw, "backup");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("backup-database");
    });
  });

  // ─── SemanticMemoryManager.search() ────────────────────────────

  describe("SemanticMemoryManager.search()", () => {
    let manager: SemanticMemoryManager;

    beforeEach(() => {
      manager = new SemanticMemoryManager(db.raw);
    });

    it("escapes % — matches literal percent in value", () => {
      manager.store({
        category: "environment",
        key: "cpu_alert",
        value: "Alert fires at 95% utilization",
        confidence: 0.9,
        source: "s1",
      });

      manager.store({
        category: "environment",
        key: "cpu_cores",
        value: "Server has 8 CPU cores",
        confidence: 0.9,
        source: "s1",
      });

      const results = manager.search("%");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("cpu_alert");
    });

    it("escapes _ — matches literal underscore in key", () => {
      manager.store({
        category: "self",
        key: "retry_limit",
        value: "Max retries before giving up",
        confidence: 0.9,
        source: "s1",
      });

      manager.store({
        category: "self",
        key: "timeout",
        value: "Default timeout value",
        confidence: 0.9,
        source: "s1",
      });

      const results = manager.search("_");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("retry_limit");
    });

    it("escapes wildcards with category filter", () => {
      manager.store({
        category: "financial",
        key: "interest_rate",
        value: "Annual rate is 5%",
        confidence: 0.8,
        source: "s1",
      });

      manager.store({
        category: "financial",
        key: "currency",
        value: "All amounts in USD",
        confidence: 0.9,
        source: "s1",
      });

      manager.store({
        category: "domain",
        key: "progress",
        value: "Project is 50% complete",
        confidence: 0.7,
        source: "s1",
      });

      // With category filter, should only match the financial entry with %
      const results = manager.search("%", "financial");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("interest_rate");
    });

    it("normal search still works without wildcards", () => {
      manager.store({
        category: "agent",
        key: "collaborator",
        value: "Agent-X is a trusted collaborator",
        confidence: 1.0,
        source: "s1",
      });

      const results = manager.search("collaborator");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("collaborator");
    });
  });
});
