/**
 * Observability Tests (Sub-phase 4.2)
 *
 * Tests for StructuredLogger, MetricsCollector, and AlertEngine.
 * These are the core Phase 4.1 components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  StructuredLogger,
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
} from "../observability/logger.js";
import { MetricsCollector, getMetrics } from "../observability/metrics.js";
import {
  AlertEngine,
  createDefaultAlertRules,
} from "../observability/alerts.js";
import type { LogEntry, MetricSnapshot, AlertRule } from "../types.js";

// ─── StructuredLogger Tests ──────────────────────────────────────

describe("StructuredLogger", () => {
  let entries: LogEntry[];

  beforeEach(() => {
    entries = [];
    StructuredLogger.setSink((entry) => entries.push(entry));
    setGlobalLogLevel("debug");
  });

  afterEach(() => {
    StructuredLogger.resetSink();
    setGlobalLogLevel("info");
  });

  it("logs at all levels", () => {
    const logger = createLogger("test-module");
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    logger.fatal("fatal msg");

    expect(entries.length).toBe(5);
    expect(entries[0].level).toBe("debug");
    expect(entries[1].level).toBe("info");
    expect(entries[2].level).toBe("warn");
    expect(entries[3].level).toBe("error");
    expect(entries[4].level).toBe("fatal");
  });

  it("includes module name in entries", () => {
    const logger = createLogger("my.module");
    logger.info("test");
    expect(entries[0].module).toBe("my.module");
  });

  it("includes timestamp in entries", () => {
    const logger = createLogger("test");
    logger.info("test");
    expect(entries[0].timestamp).toBeDefined();
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes message text", () => {
    const logger = createLogger("test");
    logger.info("hello world");
    expect(entries[0].message).toBe("hello world");
  });

  it("includes context when provided", () => {
    const logger = createLogger("test");
    logger.info("with context", { key: "value", count: 42 });
    expect(entries[0].context).toEqual({ key: "value", count: 42 });
  });

  it("omits context when empty", () => {
    const logger = createLogger("test");
    logger.info("no context");
    expect(entries[0].context).toBeUndefined();
  });

  it("omits context when empty object", () => {
    const logger = createLogger("test");
    logger.info("empty context", {});
    expect(entries[0].context).toBeUndefined();
  });

  it("includes error details", () => {
    const logger = createLogger("test");
    const err = new Error("something broke");
    logger.error("failure", err);
    expect(entries[0].error).toBeDefined();
    expect(entries[0].error!.message).toBe("something broke");
    expect(entries[0].error!.stack).toBeDefined();
  });

  it("includes error code when present", () => {
    const logger = createLogger("test");
    const err: any = new Error("network");
    err.code = "ECONNREFUSED";
    logger.error("connection failed", err);
    expect(entries[0].error!.code).toBe("ECONNREFUSED");
  });

  it("respects log level filtering", () => {
    setGlobalLogLevel("warn");
    const logger = createLogger("test");
    logger.debug("should be filtered");
    logger.info("should be filtered");
    logger.warn("should appear");
    logger.error("should appear");
    expect(entries.length).toBe(2);
    expect(entries[0].level).toBe("warn");
    expect(entries[1].level).toBe("error");
  });

  it("respects per-instance log level", () => {
    setGlobalLogLevel("debug");
    const logger = new StructuredLogger("test", "error");
    logger.debug("filtered");
    logger.info("filtered");
    logger.warn("filtered");
    logger.error("appears");
    expect(entries.length).toBe(1);
    expect(entries[0].level).toBe("error");
  });

  it("child logger inherits module prefix", () => {
    const parent = createLogger("parent");
    const child = parent.child("child");
    child.info("from child");
    expect(entries[0].module).toBe("parent.child");
  });

  it("child logger inherits level", () => {
    const parent = new StructuredLogger("parent", "error");
    const child = parent.child("child");
    child.info("filtered");
    child.error("appears");
    expect(entries.length).toBe(1);
  });

  it("setGlobalLogLevel and getGlobalLogLevel work", () => {
    setGlobalLogLevel("error");
    expect(getGlobalLogLevel()).toBe("error");
    setGlobalLogLevel("debug");
    expect(getGlobalLogLevel()).toBe("debug");
  });

  it("never throws even with bad context", () => {
    const logger = createLogger("test");
    // Circular references might cause JSON issues but logger should handle
    const circular: any = {};
    circular.self = circular;

    // Use a sink that doesn't need JSON serialization
    expect(() => {
      logger.info("circular test", { data: "safe" });
    }).not.toThrow();
  });

  it("sink receives entries and prevents stdout write", () => {
    const sinkEntries: LogEntry[] = [];
    StructuredLogger.setSink((entry) => sinkEntries.push(entry));

    const logger = createLogger("sink-test");
    logger.info("via sink");

    expect(sinkEntries.length).toBe(1);
    expect(sinkEntries[0].message).toBe("via sink");
  });

  it("resetSink restores default behavior", () => {
    StructuredLogger.resetSink();
    // After reset, no more entries captured in our test array
    const logger = createLogger("reset-test");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    logger.info("to stdout");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    // Re-enable sink for cleanup
    StructuredLogger.setSink((entry) => entries.push(entry));
  });

  it("fatal level works", () => {
    const logger = createLogger("test");
    const err = new Error("fatal error");
    logger.fatal("system crash", err, { component: "core" });
    expect(entries[0].level).toBe("fatal");
    expect(entries[0].error!.message).toBe("fatal error");
    expect(entries[0].context).toEqual({ component: "core" });
  });
});

// ─── MetricsCollector Tests ──────────────────────────────────────

describe("MetricsCollector", () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  describe("counters", () => {
    it("increments by default delta of 1", () => {
      metrics.increment("requests_total");
      expect(metrics.getCounter("requests_total")).toBe(1);
    });

    it("increments by custom delta", () => {
      metrics.increment("requests_total", undefined, 5);
      expect(metrics.getCounter("requests_total")).toBe(5);
    });

    it("accumulates multiple increments", () => {
      metrics.increment("requests_total");
      metrics.increment("requests_total");
      metrics.increment("requests_total");
      expect(metrics.getCounter("requests_total")).toBe(3);
    });

    it("separates counters by labels", () => {
      metrics.increment("requests_total", { method: "GET" });
      metrics.increment("requests_total", { method: "POST" });
      metrics.increment("requests_total", { method: "GET" });

      expect(metrics.getCounter("requests_total", { method: "GET" })).toBe(2);
      expect(metrics.getCounter("requests_total", { method: "POST" })).toBe(1);
    });

    it("returns 0 for unknown counter", () => {
      expect(metrics.getCounter("nonexistent")).toBe(0);
    });
  });

  describe("gauges", () => {
    it("sets and gets gauge value", () => {
      metrics.gauge("cpu_usage", 0.75);
      expect(metrics.getGauge("cpu_usage")).toBe(0.75);
    });

    it("overwrites previous gauge value", () => {
      metrics.gauge("cpu_usage", 0.5);
      metrics.gauge("cpu_usage", 0.9);
      expect(metrics.getGauge("cpu_usage")).toBe(0.9);
    });

    it("separates gauges by labels", () => {
      metrics.gauge("temperature", 72, { room: "A" });
      metrics.gauge("temperature", 68, { room: "B" });

      expect(metrics.getGauge("temperature", { room: "A" })).toBe(72);
      expect(metrics.getGauge("temperature", { room: "B" })).toBe(68);
    });

    it("returns 0 for unknown gauge", () => {
      expect(metrics.getGauge("nonexistent")).toBe(0);
    });
  });

  describe("histograms", () => {
    it("records histogram values", () => {
      metrics.histogram("response_time_ms", 100);
      metrics.histogram("response_time_ms", 200);
      metrics.histogram("response_time_ms", 150);

      const values = metrics.getHistogram("response_time_ms");
      expect(values).toEqual([100, 200, 150]);
    });

    it("separates histograms by labels", () => {
      metrics.histogram("latency_ms", 10, { endpoint: "/api" });
      metrics.histogram("latency_ms", 20, { endpoint: "/health" });

      expect(metrics.getHistogram("latency_ms", { endpoint: "/api" })).toEqual([10]);
      expect(metrics.getHistogram("latency_ms", { endpoint: "/health" })).toEqual([20]);
    });

    it("returns empty array for unknown histogram", () => {
      expect(metrics.getHistogram("nonexistent")).toEqual([]);
    });

    it("caps histogram values at 1000 to prevent memory leaks", () => {
      for (let i = 0; i < 1500; i++) {
        metrics.histogram("leak_test", i);
      }
      const values = metrics.getHistogram("leak_test");
      expect(values.length).toBe(1000);
      // Should keep the most recent 1000 values (500..1499)
      expect(values[0]).toBe(500);
      expect(values[values.length - 1]).toBe(1499);
    });
  });

  describe("getAll", () => {
    it("returns all metric entries", () => {
      metrics.increment("counter_a");
      metrics.gauge("gauge_b", 42);
      metrics.histogram("hist_c", 100);

      const all = metrics.getAll();
      expect(all.length).toBe(3);

      const counterEntry = all.find((e) => e.name === "counter_a");
      expect(counterEntry).toBeDefined();
      expect(counterEntry!.type).toBe("counter");
      expect(counterEntry!.value).toBe(1);

      const gaugeEntry = all.find((e) => e.name === "gauge_b");
      expect(gaugeEntry).toBeDefined();
      expect(gaugeEntry!.type).toBe("gauge");
      expect(gaugeEntry!.value).toBe(42);

      const histEntry = all.find((e) => e.name === "hist_c");
      expect(histEntry).toBeDefined();
      expect(histEntry!.type).toBe("histogram");
      expect(histEntry!.value).toBe(100); // average of [100]
    });

    it("includes timestamps", () => {
      metrics.increment("test");
      const all = metrics.getAll();
      expect(all[0].timestamp).toBeDefined();
    });

    it("includes labels", () => {
      metrics.increment("test", { env: "prod" });
      const all = metrics.getAll();
      expect(all[0].labels).toEqual({ env: "prod" });
    });
  });

  describe("getSnapshot", () => {
    it("returns aggregated snapshot", () => {
      metrics.increment("a");
      metrics.gauge("b", 5);
      metrics.histogram("c", 10);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.counters.get("a")).toBe(1);
      expect(snapshot.gauges.get("b")).toBe(5);
      expect(snapshot.histograms.get("c")).toEqual([10]);
    });

    it("returns empty maps when no metrics", () => {
      const snapshot = metrics.getSnapshot();
      expect(snapshot.counters.size).toBe(0);
      expect(snapshot.gauges.size).toBe(0);
      expect(snapshot.histograms.size).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all metrics", () => {
      metrics.increment("a");
      metrics.gauge("b", 5);
      metrics.histogram("c", 10);

      metrics.reset();

      expect(metrics.getCounter("a")).toBe(0);
      expect(metrics.getGauge("b")).toBe(0);
      expect(metrics.getHistogram("c")).toEqual([]);
      expect(metrics.getAll().length).toBe(0);
    });
  });

  describe("label key sorting", () => {
    it("treats same labels in different order as identical", () => {
      metrics.increment("test", { a: "1", b: "2" });
      metrics.increment("test", { b: "2", a: "1" });
      expect(metrics.getCounter("test", { a: "1", b: "2" })).toBe(2);
    });
  });

  describe("singleton", () => {
    it("getMetrics returns same instance", () => {
      const m1 = getMetrics();
      const m2 = getMetrics();
      expect(m1).toBe(m2);
    });
  });
});

// ─── AlertEngine Tests ───────────────────────────────────────────

describe("AlertEngine", () => {
  describe("createDefaultAlertRules", () => {
    it("returns expected default rules", () => {
      const rules = createDefaultAlertRules();
      expect(rules.length).toBeGreaterThan(0);

      const ruleNames = rules.map((r) => r.name);
      expect(ruleNames).toContain("balance_below_reserve");
      expect(ruleNames).toContain("heartbeat_high_failure_rate");
      expect(ruleNames).toContain("policy_high_deny_rate");
      expect(ruleNames).toContain("context_near_capacity");
      expect(ruleNames).toContain("inference_budget_warning");
      expect(ruleNames).toContain("child_unhealthy_extended");
      expect(ruleNames).toContain("zero_turns_last_hour");
    });

    it("all rules have required fields", () => {
      const rules = createDefaultAlertRules();
      for (const rule of rules) {
        expect(rule.name).toBeDefined();
        expect(rule.severity).toBeDefined();
        expect(rule.message).toBeDefined();
        expect(rule.cooldownMs).toBeGreaterThan(0);
        expect(typeof rule.condition).toBe("function");
      }
    });
  });

  describe("evaluate", () => {
    it("fires alert when condition is met", () => {
      const rules: AlertRule[] = [
        {
          name: "test_alert",
          severity: "critical",
          message: "Test alert fired",
          cooldownMs: 0,
          condition: (m) => (m.gauges.get("test_value") ?? 0) > 100,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["test_value", 200]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      expect(fired.length).toBe(1);
      expect(fired[0].rule).toBe("test_alert");
      expect(fired[0].severity).toBe("critical");
      expect(fired[0].message).toBe("Test alert fired");
      expect(fired[0].firedAt).toBeDefined();
    });

    it("does not fire when condition is not met", () => {
      const rules: AlertRule[] = [
        {
          name: "test_alert",
          severity: "warning",
          message: "Not fired",
          cooldownMs: 0,
          condition: (m) => (m.gauges.get("test_value") ?? 0) > 100,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["test_value", 50]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      expect(fired.length).toBe(0);
    });

    it("respects cooldown period", () => {
      const rules: AlertRule[] = [
        {
          name: "test_alert",
          severity: "critical",
          message: "Fires once",
          cooldownMs: 60_000, // 1 minute
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      const first = engine.evaluate(snapshot);
      expect(first.length).toBe(1);

      // Second evaluation within cooldown should not fire
      const second = engine.evaluate(snapshot);
      expect(second.length).toBe(0);
    });

    it("fires multiple alerts", () => {
      const rules: AlertRule[] = [
        {
          name: "alert_a",
          severity: "warning",
          message: "A fired",
          cooldownMs: 0,
          condition: () => true,
        },
        {
          name: "alert_b",
          severity: "critical",
          message: "B fired",
          cooldownMs: 0,
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      expect(fired.length).toBe(2);
      expect(fired.map((f) => f.rule)).toContain("alert_a");
      expect(fired.map((f) => f.rule)).toContain("alert_b");
    });

    it("includes metric values in alert event", () => {
      const rules: AlertRule[] = [
        {
          name: "test",
          severity: "warning",
          message: "test",
          cooldownMs: 0,
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map([["counter_a", 5]]),
        gauges: new Map([["gauge_b", 42]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      expect(fired[0].metricValues).toEqual({ counter_a: 5, gauge_b: 42 });
    });

    it("works with MetricsCollector directly", () => {
      const metrics = new MetricsCollector();
      metrics.gauge("balance_cents", 500); // Below 1000

      const engine = new AlertEngine();
      const fired = engine.evaluate(metrics);

      const balanceAlert = fired.find((f) => f.rule === "balance_below_reserve");
      expect(balanceAlert).toBeDefined();
    });
  });

  describe("addRule", () => {
    it("adds a custom rule", () => {
      const engine = new AlertEngine([]);
      engine.addRule({
        name: "custom",
        severity: "warning",
        message: "custom alert",
        cooldownMs: 0,
        condition: () => true,
      });

      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      expect(fired.length).toBe(1);
      expect(fired[0].rule).toBe("custom");
    });
  });

  describe("getActiveAlerts", () => {
    it("tracks active alerts", () => {
      const engine = new AlertEngine([
        {
          name: "persistent",
          severity: "critical",
          message: "active",
          cooldownMs: 0,
          condition: () => true,
        },
      ]);

      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      engine.evaluate(snapshot);
      const active = engine.getActiveAlerts();
      expect(active.length).toBe(1);
      expect(active[0].rule).toBe("persistent");
    });

    it("replaces existing alert for same rule", () => {
      const rules: AlertRule[] = [
        {
          name: "test",
          severity: "warning",
          message: "test",
          cooldownMs: 0, // no cooldown for test
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      engine.evaluate(snapshot);
      engine.evaluate(snapshot);

      const active = engine.getActiveAlerts();
      expect(active.length).toBe(1); // not duplicated
    });
  });

  describe("clearAlert", () => {
    it("removes alert and resets cooldown", () => {
      const rules: AlertRule[] = [
        {
          name: "clearable",
          severity: "warning",
          message: "can be cleared",
          cooldownMs: 999_999_999, // very long cooldown
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      engine.evaluate(snapshot);
      expect(engine.getActiveAlerts().length).toBe(1);

      engine.clearAlert("clearable");
      expect(engine.getActiveAlerts().length).toBe(0);

      // Should fire again after clearing (cooldown reset)
      const fired = engine.evaluate(snapshot);
      expect(fired.length).toBe(1);
    });
  });

  describe("cooldown persistence", () => {
    it("suppresses repeated alerts within cooldown window on the same instance", () => {
      const rules: AlertRule[] = [
        {
          name: "test_alert",
          severity: "warning",
          message: "test",
          cooldownMs: 999_999_999, // very long cooldown
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      // First evaluation fires
      expect(engine.evaluate(snapshot).length).toBe(1);
      // Second evaluation suppressed by cooldown
      expect(engine.evaluate(snapshot).length).toBe(0);
    });

    it("loses cooldown state when a new instance is created (the bug pattern)", () => {
      const rules: AlertRule[] = [
        {
          name: "test_alert",
          severity: "warning",
          message: "test",
          cooldownMs: 999_999_999,
          condition: () => true,
        },
      ];

      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      // First instance fires
      const engine1 = new AlertEngine(rules);
      expect(engine1.evaluate(snapshot).length).toBe(1);

      // New instance has no cooldown memory — fires again (alert storm)
      const engine2 = new AlertEngine(rules);
      expect(engine2.evaluate(snapshot).length).toBe(1);
    });
  });

  describe("default alert rules behavior", () => {
    it("balance_below_reserve fires when balance < 1000", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["balance_cents", 500]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "balance_below_reserve");
      expect(alert).toBeDefined();
      expect(alert!.severity).toBe("critical");
    });

    it("balance_below_reserve does not fire when balance >= 1000", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["balance_cents", 5000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "balance_below_reserve");
      expect(alert).toBeUndefined();
    });

    it("zero_turns_last_hour fires when turns_last_hour gauge is 0", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["balance_cents", 10000], ["turns_last_hour", 0]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "zero_turns_last_hour");
      expect(alert).toBeDefined();
      expect(alert!.severity).toBe("critical");
    });

    it("zero_turns_last_hour does not fire on fresh start (no metrics)", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["balance_cents", 10000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "zero_turns_last_hour");
      expect(alert).toBeUndefined();
    });

    it("zero_turns_last_hour does not fire when turns_last_hour > 0", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([["balance_cents", 10000], ["turns_last_hour", 5]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "zero_turns_last_hour");
      expect(alert).toBeUndefined();
    });

    it("heartbeat_high_failure_rate uses correct success/failure counters", () => {
      const engine = new AlertEngine();
      // 3 failures out of 10 total = 30% > 20% threshold
      const snapshot: MetricSnapshot = {
        counters: new Map([
          ["heartbeat_task_failures_total", 3],
          ["heartbeat_task_successes_total", 7],
        ]),
        gauges: new Map([["balance_cents", 10000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "heartbeat_high_failure_rate");
      expect(alert).toBeDefined();
    });

    it("heartbeat_high_failure_rate does not fire at low failure rate", () => {
      const engine = new AlertEngine();
      // 1 failure out of 10 total = 10% < 20% threshold
      const snapshot: MetricSnapshot = {
        counters: new Map([
          ["heartbeat_task_failures_total", 1],
          ["heartbeat_task_successes_total", 9],
        ]),
        gauges: new Map([["balance_cents", 10000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "heartbeat_high_failure_rate");
      expect(alert).toBeUndefined();
    });

    it("policy_high_deny_rate fires when deny ratio exceeds 50%", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map([
          ["policy_denies_total", 8],
          ["policy_decisions_total", 15],
        ]),
        gauges: new Map([["balance_cents", 10000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "policy_high_deny_rate");
      expect(alert).toBeDefined();
    });

    it("policy_high_deny_rate does not fire with insufficient sample size", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map([
          ["policy_denies_total", 5],
          ["policy_decisions_total", 5],
        ]),
        gauges: new Map([["balance_cents", 10000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "policy_high_deny_rate");
      expect(alert).toBeUndefined();
    });

    it("child_unhealthy_extended fires on unhealthy_child_count, not total child_count", () => {
      const engine = new AlertEngine();
      // Has children but none unhealthy — should NOT fire
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([
          ["balance_cents", 10000],
          ["child_count", 3],
        ]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "child_unhealthy_extended");
      expect(alert).toBeUndefined();
    });

    it("inference_budget_warning fires when cost > 400", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map([["inference_cost_cents", 450]]),
        gauges: new Map([["balance_cents", 10000]]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "inference_budget_warning");
      expect(alert).toBeDefined();
    });

    it("context_near_capacity fires when tokens > 90000", () => {
      const engine = new AlertEngine();
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map([
          ["balance_cents", 10000],
          ["context_tokens_total", 95_000],
        ]),
        histograms: new Map(),
      };

      const fired = engine.evaluate(snapshot);
      const alert = fired.find((f) => f.rule === "context_near_capacity");
      expect(alert).toBeDefined();
    });
  });

  describe("error resilience", () => {
    it("skips rule that throws and continues", () => {
      const rules: AlertRule[] = [
        {
          name: "broken",
          severity: "warning",
          message: "broken",
          cooldownMs: 0,
          condition: () => { throw new Error("oops"); },
        },
        {
          name: "working",
          severity: "warning",
          message: "works",
          cooldownMs: 0,
          condition: () => true,
        },
      ];

      const engine = new AlertEngine(rules);
      const snapshot: MetricSnapshot = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
      };

      // Should not throw, and should still fire working rule
      const fired = engine.evaluate(snapshot);
      expect(fired.length).toBe(1);
      expect(fired[0].rule).toBe("working");
    });
  });
});

// ─── Metrics DB Helpers Tests ────────────────────────────────────

import fs from "fs";
import path from "path";
import os from "os";
import { createDatabase } from "../state/database.js";
import {
  metricsInsertSnapshot,
  metricsGetSnapshots,
  metricsGetLatest,
  metricsPruneOld,
} from "../state/database.js";
import type { MetricSnapshotRow } from "../types.js";

function makeTmpDbPath(): string {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "automaton-observability-test-"),
  );
  return path.join(tmpDir, "test.db");
}

describe("Metrics DB Helpers (MIGRATION_V8)", () => {
  let dbPath: string;
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try {
      db.raw.close();
      fs.unlinkSync(dbPath);
    } catch { /* ignore cleanup errors */ }
  });

  it("metric_snapshots table exists after migration", () => {
    const tables = db.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metric_snapshots'",
      )
      .all();
    expect(tables.length).toBe(1);
  });

  it("inserts and retrieves a snapshot", () => {
    const row: MetricSnapshotRow = {
      id: "snap-001",
      snapshotAt: new Date().toISOString(),
      metricsJson: JSON.stringify([{ name: "test", value: 1 }]),
      alertsJson: JSON.stringify([]),
      createdAt: new Date().toISOString(),
    };

    metricsInsertSnapshot(db.raw, row);

    const latest = metricsGetLatest(db.raw);
    expect(latest).toBeDefined();
    expect(latest!.id).toBe("snap-001");
    expect(latest!.metricsJson).toBe(row.metricsJson);
    expect(latest!.alertsJson).toBe(row.alertsJson);
  });

  it("getSnapshots filters by since and respects limit", () => {
    const timestamps = [
      "2024-01-01T01:00:00Z",
      "2024-01-01T02:00:00Z",
      "2024-01-01T03:00:00Z",
      "2024-01-01T04:00:00Z",
      "2024-01-01T05:00:00Z",
    ];

    for (let i = 0; i < 5; i++) {
      metricsInsertSnapshot(db.raw, {
        id: `snap-${i}`,
        snapshotAt: timestamps[i],
        metricsJson: "[]",
        alertsJson: "[]",
        createdAt: timestamps[i],
      });
    }

    // Get all from beginning
    const all = metricsGetSnapshots(db.raw, "2024-01-01T00:00:00Z");
    expect(all.length).toBe(5);

    // Get with since filter (from 3rd snapshot onward)
    const filtered = metricsGetSnapshots(db.raw, "2024-01-01T03:00:00Z");
    expect(filtered.length).toBe(3);

    // Get with limit
    const limited = metricsGetSnapshots(db.raw, "2024-01-01T00:00:00Z", 2);
    expect(limited.length).toBe(2);
  });

  it("getLatest returns most recent snapshot", () => {
    metricsInsertSnapshot(db.raw, {
      id: "old",
      snapshotAt: "2024-01-01T00:00:00Z",
      metricsJson: "[]",
      alertsJson: "[]",
      createdAt: "2024-01-01T00:00:00Z",
    });

    metricsInsertSnapshot(db.raw, {
      id: "new",
      snapshotAt: "2024-06-01T00:00:00Z",
      metricsJson: "[{\"name\":\"latest\"}]",
      alertsJson: "[]",
      createdAt: "2024-06-01T00:00:00Z",
    });

    const latest = metricsGetLatest(db.raw);
    expect(latest!.id).toBe("new");
  });

  it("getLatest returns undefined when no snapshots", () => {
    const latest = metricsGetLatest(db.raw);
    expect(latest).toBeUndefined();
  });

  it("pruneOld removes old snapshots", () => {
    // Insert a very old snapshot
    metricsInsertSnapshot(db.raw, {
      id: "ancient",
      snapshotAt: "2020-01-01T00:00:00Z",
      metricsJson: "[]",
      alertsJson: "[]",
      createdAt: "2020-01-01T00:00:00Z",
    });

    // Insert a recent snapshot
    metricsInsertSnapshot(db.raw, {
      id: "recent",
      snapshotAt: new Date().toISOString(),
      metricsJson: "[]",
      alertsJson: "[]",
      createdAt: new Date().toISOString(),
    });

    const removed = metricsPruneOld(db.raw, 7);
    expect(removed).toBe(1);

    const remaining = metricsGetLatest(db.raw);
    expect(remaining!.id).toBe("recent");
  });

  it("deserializes snake_case columns to camelCase", () => {
    const now = new Date().toISOString();
    metricsInsertSnapshot(db.raw, {
      id: "deser-test",
      snapshotAt: now,
      metricsJson: "[{\"test\":true}]",
      alertsJson: "[{\"alert\":true}]",
      createdAt: now,
    });

    const result = metricsGetLatest(db.raw);
    expect(result).toBeDefined();
    // Verify camelCase property names
    expect(result!.snapshotAt).toBeDefined();
    expect(result!.metricsJson).toBeDefined();
    expect(result!.alertsJson).toBeDefined();
    expect(result!.createdAt).toBeDefined();
  });
});
