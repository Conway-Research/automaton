import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { InferenceRouter } from "../inference/router.js";
import { pendingInferenceCost, reserveInferenceCost, settleInferenceCost } from "../inference/reservations.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import type { InferenceRequest, ModelStrategyConfig } from "../types.js";
import { ExperimentBudgetGovernor } from "../revenue/budget-governor.js";
import { inferencePruneCosts } from "../state/database.js";
import { initializeCapitalBudget, checkCapitalBudget } from "../revenue/capital-budget.js";

let directory: string;
let first: ReturnType<typeof createDatabase>;
let second: ReturnType<typeof createDatabase>;
const request: InferenceRequest = { messages: [{ role: "user", content: "validate" }],
  tier: "low_compute", taskType: "agent_turn", sessionId: "session", maxTokens: 100 };
const response = { message: { content: "ok" }, usage: { promptTokens: 1, completionTokens: 1 } };

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-reservations-"));
  first = createDatabase(path.join(directory, "test.db"));
  second = createDatabase(path.join(directory, "test.db"));
});
afterEach(() => {
  vi.useRealTimers();
  first.close(); second.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
function makeRouter(db = first, config: Partial<ModelStrategyConfig> = {}, dailyLimit?: number) {
  const registry = new ModelRegistry(db.raw); registry.initialize();
  // Synthetic pricing makes exact one-cent boundary assertions independent
  // of production catalog prices. Only mocked providers are invoked.
  registry.upsert({ ...registry.get("gpt-5-mini")!, costPer1kInput: 0, costPer1kOutput: 1000 });
  return new InferenceRouter(db.raw, registry,
    new InferenceBudgetTracker(db.raw, { ...DEFAULT_MODEL_STRATEGY_CONFIG, ...config }, dailyLimit));
}
function linkedExperiment(inferenceLimit: number, totalLimit: number) {
  first.raw.prepare("INSERT INTO revenue_opportunities (id, name, status) VALUES ('o', 'test', 'validating')").run();
  first.raw.prepare(`INSERT INTO revenue_experiments (id, opportunity_id, status, hypothesis, max_budget_cents, max_inference_cost_cents)
    VALUES ('e', 'o', 'running', 'test', ?, ?)`).run(totalLimit, inferenceLimit);
  return "e";
}

describe("persistent inference reservations", () => {
  it("survives 1000 competing simulated requests, provider failures and repeated restarts within a shared budget", async () => {
    let r1 = makeRouter(first, { hourlyBudgetCents: 1000, sessionBudgetCents: 1000 }, 250);
    let r2 = makeRouter(second, { hourlyBudgetCents: 1000, sessionBudgetCents: 1000 }, 250);
    let attempts = 0;
    let rejected = 0;
    const provider = vi.fn(async () => {
      attempts++;
      if (attempts % 17 === 0) throw new Error("simulated lost response");
      return response;
    });
    for (let round = 0; round < 250; round++) {
      const results = await Promise.allSettled(Array.from({ length: 4 }, (_, worker) =>
        (worker % 2 ? r1 : r2).route({ ...request, sessionId: `worker-${worker}` }, provider)));
      rejected += results.filter(r => r.status === "fulfilled" && r.value.finishReason === "budget_exceeded").length;
      const spent = new InferenceBudgetTracker(second.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getDailyCost();
      expect(spent + pendingInferenceCost(second.raw)).toBeLessThanOrEqual(250);
      if (round % 50 === 49) {
        first.close(); second.close();
        first = createDatabase(path.join(directory, "test.db"));
        second = createDatabase(path.join(directory, "test.db"));
        r1 = makeRouter(first, { hourlyBudgetCents: 1000, sessionBudgetCents: 1000 }, 250);
        r2 = makeRouter(second, { hourlyBudgetCents: 1000, sessionBudgetCents: 1000 }, 250);
      }
    }
    expect(attempts).toBe(250);
    expect(rejected).toBe(750);
    expect(pendingInferenceCost(second.raw)).toBe(14);
    expect(new InferenceBudgetTracker(second.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getDailyCost()).toBe(236);
  }, 30000);
  it("uses durable WAL commits on both database connections", () => {
    for (const connection of [first, second]) {
      expect(connection.raw.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(connection.raw.pragma("synchronous", { simple: true })).toBe(2);
    }
  });
  it("books actual costs and reports an adapter that exceeds its output contract", async () => {
    const result = await makeRouter().route(request, async () => ({ ...response,
      usage: { promptTokens: 1, completionTokens: 200 } }));
    expect(result.finishReason).toBe("error");
    expect(result.costCents).toBe(2);
    expect(new InferenceBudgetTracker(second.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getDailyCost()).toBe(2);
    expect(pendingInferenceCost(second.raw)).toBe(0);
  });
  it("covers worst-case input usage and caps output before admitting another router", async () => {
    const registry = new ModelRegistry(first.raw); registry.initialize();
    registry.upsert({ ...registry.get("gpt-5-mini")!, contextWindow: 1000,
      maxTokens: 100, costPer1kInput: 100, costPer1kOutput: 1000 });
    const budget = () => new InferenceBudgetTracker(second.raw, DEFAULT_MODEL_STRATEGY_CONFIG, 2);
    const r1 = new InferenceRouter(first.raw, registry, new InferenceBudgetTracker(first.raw, DEFAULT_MODEL_STRATEGY_CONFIG, 2));
    const r2 = new InferenceRouter(second.raw, new ModelRegistry(second.raw), budget());
    let finish!: (value: typeof response) => void;
    const provider = vi.fn((_messages, options) => {
      expect(options.maxTokens).toBe(100);
      return new Promise<typeof response>(resolve => { finish = resolve; });
    });
    const pending = r1.route({ ...request, maxTokens: 10000 }, provider);
    expect(pendingInferenceCost(second.raw)).toBe(2);
    const deniedProvider = vi.fn();
    expect((await r2.route({ ...request, sessionId: "other" }, deniedProvider)).finishReason).toBe("budget_exceeded");
    expect(deniedProvider).not.toHaveBeenCalled();
    finish({ ...response, usage: { promptTokens: 1000, completionTokens: 100 } });
    expect((await pending).costCents).toBe(2);
    expect(budget().getDailyCost()).toBe(2);
    expect(pendingInferenceCost(second.raw)).toBe(0);
  });
  it("upgrades a V13 database without losing existing inference costs", () => {
    new InferenceBudgetTracker(first.raw, DEFAULT_MODEL_STRATEGY_CONFIG).recordCost({
      sessionId: "old", turnId: null, experimentId: null, model: "test", provider: "test",
      inputTokens: 1, outputTokens: 1, costCents: 7, latencyMs: 0, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });
    first.raw.exec("DROP TRIGGER experiment_baseline_insert; DROP TRIGGER experiment_baseline_start; DROP TRIGGER experiment_baseline_no_update; DROP TRIGGER experiment_baseline_no_delete; DROP TABLE revenue_experiment_baselines;");
    first.raw.exec("DROP TABLE inference_reservations; DELETE FROM schema_version WHERE version >= 14;");
    first.close();
    first = createDatabase(path.join(directory, "test.db"));
    expect(pendingInferenceCost(first.raw)).toBe(0);
    expect(new InferenceBudgetTracker(first.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getSessionCost("old")).toBe(7);
    expect((first.raw.prepare("SELECT MAX(version) AS version FROM schema_version").get() as { version: number }).version).toBe(16);
  });
  it.each(["daily", "hourly", "session", "experiment-inference", "experiment-total"])(
    "blocks a concurrent request on another connection at the %s limit", async scope => {
      const config = scope === "hourly" ? { hourlyBudgetCents: 1 } : scope === "session" ? { sessionBudgetCents: 1 } : {};
      const daily = scope === "daily" ? 1 : undefined;
      const r1 = makeRouter(first, config, daily);
      const r2 = makeRouter(second, config, daily);
      const req = { ...request };
      if (scope.startsWith("experiment")) req.experimentId = linkedExperiment(scope === "experiment-inference" ? 1 : 100, scope === "experiment-total" ? 1 : 100);
      let finish!: (value: typeof response) => void;
      const pending = r1.route(req, () => new Promise(resolve => { finish = resolve; }));
      expect(pendingInferenceCost(second.raw)).toBe(1);
      const provider = vi.fn();
      expect((await r2.route(req, provider)).finishReason).toBe("budget_exceeded");
      expect(provider).not.toHaveBeenCalled();
      finish(response); await pending;
      expect(pendingInferenceCost(second.raw)).toBe(0);
      expect(new InferenceBudgetTracker(second.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getSessionCost("session")).toBe(1);
    });

  it("releases unused estimated cost only after successful settlement", async () => {
    let finish!: (value: typeof response) => void;
    const pending = makeRouter().route({ ...request, maxTokens: 20000 }, () => new Promise(resolve => { finish = resolve; }));
    const held = pendingInferenceCost(second.raw);
    expect(held).toBeGreaterThan(1);
    finish(response); await pending;
    expect(pendingInferenceCost(second.raw)).toBe(0);
    expect(new InferenceBudgetTracker(second.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getDailyCost()).toBe(1);
  });

  it("keeps holds across provider errors, restart and calendar boundaries", async () => {
    await expect(makeRouter(first, {}, 1).route(request, async () => { throw new Error("connection lost"); })).rejects.toThrow("connection lost");
    first.close();
    first = createDatabase(path.join(directory, "test.db"));
    first.raw.prepare("UPDATE inference_reservations SET created_at = '2000-01-01 00:00:00'").run();
    expect(pendingInferenceCost(first.raw)).toBe(1);
    const provider = vi.fn();
    expect((await makeRouter(first, {}, 1).route(request, provider)).finishReason).toBe("budget_exceeded");
    expect(provider).not.toHaveBeenCalled();
  });

  it("retains a reservation after a real router timeout", async () => {
    vi.useFakeTimers();
    const pending = makeRouter().route(request, (_messages, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    await vi.advanceTimersByTimeAsync(120000);
    expect((await pending).finishReason).toBe("timeout");
    expect(pendingInferenceCost(second.raw)).toBe(1);
  });

  it("keeps a hold on missing usage instead of booking zero", async () => {
    expect((await makeRouter().route(request, async () => ({ message: { content: "no usage" } }))).finishReason).toBe("error");
    expect(pendingInferenceCost(second.raw)).toBe(1);
  });

  it("keeps the reservation if recording a successful response fails", async () => {
    first.raw.exec("CREATE TRIGGER reject_cost BEFORE INSERT ON inference_costs BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END;");
    await expect(makeRouter().route(request, async () => response)).rejects.toThrow("ledger unavailable");
    expect(pendingInferenceCost(second.raw)).toBe(1);
    expect((second.raw.prepare("SELECT COUNT(*) AS count FROM inference_costs").get() as { count: number }).count).toBe(0);
  });

  it("rolls back settlement if the cost ledger write fails and prevents double settlement", () => {
    const id = first.raw.transaction(() => reserveInferenceCost(first.raw, "session", undefined, "test", 10)).immediate();
    expect(() => settleInferenceCost(first.raw, id, () => { throw new Error("disk failure"); })).toThrow("disk failure");
    expect(pendingInferenceCost(second.raw)).toBe(10);
    const record = vi.fn();
    settleInferenceCost(first.raw, id, record);
    expect(() => settleInferenceCost(first.raw, id, record)).toThrow("already settled");
    expect(record).toHaveBeenCalledOnce();
  });

  it("does not reserve rejected or locally invalid requests", async () => {
    const provider = vi.fn();
    await makeRouter(first, {}, 0).route(request, provider);
    await expect(makeRouter().route({ ...request, messages: [] }, provider)).rejects.toThrow();
    expect(pendingInferenceCost(first.raw)).toBe(0);
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not stop an experiment merely because another request holds its budget", async () => {
    linkedExperiment(1, 1);
    const id = first.raw.transaction(() => reserveInferenceCost(first.raw, "session", "e", "test", 1)).immediate();
    expect(new ExperimentBudgetGovernor(second.raw).checkInferenceBudget("e", 1).allowed).toBe(false);
    await makeRouter(second).route({ ...request, experimentId: "e" }, vi.fn());
    expect((first.raw.prepare("SELECT status FROM revenue_experiments WHERE id = 'e'").get() as { status: string }).status).toBe("running");
    settleInferenceCost(first.raw, id, () => {});
  });
});

it.each([0.5,'private-malformed-amount',9007199254740992])('rejects invalid stored reservation amounts without disclosing or altering them: %s',value=>{
 first.raw.prepare("INSERT INTO inference_reservations(id,session_id,model,reserved_cents) VALUES('bad','private-session','mock',?)").run(value);
 const before=first.raw.prepare('SELECT * FROM inference_reservations').all();
 expect(()=>pendingInferenceCost(second.raw)).toThrow('Invalid pending inference accounting');
 expect(()=>pendingInferenceCost(second.raw,{sessionId:'private-session'})).toThrow('reconciliation required');
 expect(pendingInferenceCost(second.raw,{sessionId:'other'})).toBe(0);expect(first.raw.prepare('SELECT * FROM inference_reservations').all()).toEqual(before);
});
it('rejects an unsafe aggregate even when each individual reservation is a safe integer',()=>{
 first.raw.transaction(()=>{reserveInferenceCost(first.raw,'a',undefined,'mock',Number.MAX_SAFE_INTEGER);reserveInferenceCost(first.raw,'b',undefined,'mock',1);}).immediate();
 expect(pendingInferenceCost(second.raw,{sessionId:'a'})).toBe(Number.MAX_SAFE_INTEGER);expect(()=>pendingInferenceCost(second.raw)).toThrow('reconciliation required');
});
it('never invokes a provider when shared pending amounts are malformed',async()=>{
 const router=makeRouter(first,{},100);first.raw.prepare("INSERT INTO inference_reservations(id,session_id,model,reserved_cents) VALUES('bad','private-session','mock',?)").run('private-malformed-amount');
 const provider=vi.fn();try{await router.route(request,provider);}catch(error){expect(String(error)).not.toContain('private-malformed');}
 expect(provider).not.toHaveBeenCalled();expect(first.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:1});
});

import {inferenceGetSessionCost,inferenceGetDailyCost,inferenceGetHourlyCost,inferenceGetModelCosts,inferenceGetExperimentCost} from '../state/database.js';
function insertTimedCost(id: string, timestamp: string, cost = 1) {
  first.raw.prepare(`INSERT INTO inference_costs
    (id,session_id,model,provider,cost_cents,latency_ms,tier,task_type,created_at)
    VALUES(?,'session','mock','other',?,1,'low_compute','agent_turn',?)`).run(id,cost,timestamp);
}
it('cannot reopen lifetime capital, session or experiment budgets through retention cleanup',async()=>{
  linkedExperiment(10,10);
  initializeCapitalBudget(first.raw,{capitalChfCents:10,reserveChfCents:0,
    chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  const router=makeRouter(second,{sessionBudgetCents:10},100),provider=vi.fn();
  insertTimedCost('historical','2020-01-01T00:00:00+02:00',10);
  first.raw.prepare("UPDATE inference_costs SET experiment_id='e' WHERE id='historical'").run();
  const before=first.raw.prepare('SELECT * FROM inference_costs').all();
  expect(checkCapitalBudget(second.raw,1).allowed).toBe(false);
  expect(inferencePruneCosts(first.raw,1)).toBe(0);
  expect(inferencePruneCosts(second.raw,30)).toBe(0);
  expect(inferenceGetSessionCost(second.raw,'session')).toBe(10);
  expect(inferenceGetExperimentCost(second.raw,'e')).toBe(10);
  expect(checkCapitalBudget(second.raw,1).allowed).toBe(false);
  expect(new ExperimentBudgetGovernor(second.raw).checkInferenceBudget('e',1).allowed).toBe(false);
  expect((await router.route({...request,experimentId:'e'},provider)).finishReason).toBe('budget_exceeded');
  expect(provider).not.toHaveBeenCalled();
  expect(first.raw.prepare('SELECT * FROM inference_costs').all()).toEqual(before);
});
it.each([0,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects invalid retention without changing stored evidence: %s',days=>{
  insertTimedCost('malformed','private-invalid-timestamp');
  const before=second.raw.prepare('SELECT * FROM inference_costs').all();
  expect(()=>inferencePruneCosts(first.raw,days)).toThrow('Invalid inference cost retention period');
  expect(second.raw.prepare('SELECT * FROM inference_costs').all()).toEqual(before);
});
it('preserves malformed accounting evidence even when retention is requested',()=>{
  insertTimedCost('malformed','private-invalid-timestamp');
  const before=second.raw.prepare('SELECT * FROM inference_costs').all();
  expect(inferencePruneCosts(first.raw,1)).toBe(0);
  expect(()=>inferenceGetDailyCost(second.raw)).toThrow('reconciliation required');
  expect(second.raw.prepare('SELECT * FROM inference_costs').all()).toEqual(before);
});
it('uses UTC instants across mixed SQL, ISO and offset timestamps at daily boundaries',()=>{
  insertTimedCost('sql','2026-09-29 00:00:00',1);
  insertTimedCost('iso','2026-09-29T23:59:59.999Z',2);
  insertTimedCost('next','2026-09-30T00:00:00Z',4);
  insertTimedCost('offset-in','2026-09-30T01:00:00+02:00',8);
  insertTimedCost('offset-out','2026-09-29T01:00:00+02:00',16);
  expect(inferenceGetDailyCost(second.raw,'2026-09-29')).toBe(11);
  expect(inferenceGetDailyCost(second.raw,'2026-09-30')).toBe(4);
  expect(inferenceGetDailyCost(second.raw,'2026-09-28')).toBe(16);
});
it('applies hour and model lookback boundaries to instants instead of timestamp spelling',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  insertTimedCost('old-iso','2026-09-29T11:59:59.999Z',1);
  insertTimedCost('boundary-sql','2026-09-29 12:00:00',2);
  insertTimedCost('offset-in','2026-09-29T11:00:00-01:00',4);
  insertTimedCost('old-model','2026-09-28T11:59:59.999Z',8);
  insertTimedCost('boundary-model','2026-09-28T14:00:00+02:00',16);
  expect(inferenceGetHourlyCost(second.raw)).toBe(6);
  expect(inferenceGetModelCosts(second.raw,'mock',1)).toEqual({totalCents:23,callCount:4});
});
it.each(['private-invalid-time','now','12:00:00','2461313.5','2026-99-29T12:00:00Z','2026-02-30T12:00:00Z'])(
  'fails closed on unassignable settled timestamps without changing data: %s',async timestamp=>{
    const router=makeRouter(first,{},100),provider=vi.fn();
    insertTimedCost('bad-time',timestamp);
    const before=first.raw.prepare('SELECT * FROM inference_costs').all();
    for(const read of [()=>inferenceGetDailyCost(second.raw),()=>inferenceGetHourlyCost(second.raw),()=>inferenceGetModelCosts(second.raw,'mock',1),()=>inferenceGetSessionCost(second.raw,'session')]){
      expect(read).toThrow('Invalid settled inference accounting');
    }
    expect(inferenceGetModelCosts(second.raw,'unrelated',1)).toEqual({totalCents:0,callCount:0});
    try { await router.route(request,provider); } catch(error) { expect(String(error)).not.toContain(timestamp); }
    expect(provider).not.toHaveBeenCalled();
    expect(first.raw.prepare('SELECT * FROM inference_costs').all()).toEqual(before);
    expect(first.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
  });
it.each([0.5,'private-malformed-cost',9007199254740992])('rejects malformed settled costs across budget scopes: %s',value=>{
 linkedExperiment(100,100);first.raw.prepare("INSERT INTO inference_costs(id,session_id,experiment_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES('bad','session','e','mock','other',?,1,'low_compute','agent_turn')").run(value);
 const before=first.raw.prepare('SELECT * FROM inference_costs').all();
 for(const read of [()=>inferenceGetSessionCost(second.raw,'session'),()=>inferenceGetDailyCost(second.raw),()=>inferenceGetHourlyCost(second.raw),()=>inferenceGetModelCosts(second.raw,'mock'),()=>inferenceGetExperimentCost(second.raw,'e')])expect(read).toThrow('Invalid settled inference accounting');
 expect(inferenceGetSessionCost(second.raw,'unrelated')).toBe(0);expect(first.raw.prepare('SELECT * FROM inference_costs').all()).toEqual(before);
});
it('blocks provider access for malformed settled costs and detects aggregate overflow',async()=>{
 const router=makeRouter(first,{},100),provider=vi.fn();
 const insert=first.raw.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES(?,'session','mock','other',?,1,'low_compute','agent_turn')");insert.run('a',Number.MAX_SAFE_INTEGER);insert.run('b',1);
 expect(()=>inferenceGetSessionCost(second.raw,'session')).toThrow('reconciliation');expect(()=>inferenceGetDailyCost(second.raw)).toThrow('reconciliation');
 try{await router.route(request,provider);}catch(error){expect(String(error)).not.toContain('private-');}expect(provider).not.toHaveBeenCalled();
 expect(first.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
