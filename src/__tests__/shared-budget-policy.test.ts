import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceRouter } from "../inference/router.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { readBudgetPolicy,registerBudgetPolicy } from "../inference/budget-policy.js";
import { reserveInferenceCost, pendingInferenceCost } from "../inference/reservations.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import { initializeCapitalBudget, reserveCapitalCommitment, settleCapitalCommitment, checkCapitalBudget } from "../revenue/capital-budget.js";
import type { ModelStrategyConfig } from "../types.js";
import { createBuiltinTools, executeTool } from "../agent/tools.js";
import type { ToolContext } from "../types.js";

let dir: string, file: string;
let a: ReturnType<typeof createDatabase>, b: ReturnType<typeof createDatabase>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-policy-")); file = path.join(dir, "test.db");
  a = createDatabase(file); b = createDatabase(file);
  const registry = new ModelRegistry(a.raw); registry.initialize();
  registry.upsert({ ...registry.get("gpt-5-mini")!, costPer1kInput: 0, costPer1kOutput: 1000 });
});
afterEach(() => { a.close(); b.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const request = { messages: [{ role: "user" as const, content: "mock" }], tier: "low_compute" as const,
  taskType: "agent_turn" as const, sessionId: "shared", maxTokens: 100 };
const provider = () => vi.fn(async () => ({ message: { content: "mock" }, usage: { promptTokens: 1, completionTokens: 1 } }));
function router(db = a, daily?: number, limits: Partial<ModelStrategyConfig> = {}) {
  return new InferenceRouter(db.raw, new ModelRegistry(db.raw), new InferenceBudgetTracker(db.raw, { ...DEFAULT_MODEL_STRATEGY_CONFIG, ...limits }, daily));
}
describe("persistent shared inference policy", () => {
  it.each(['text','fraction','revision'] as const)('blocks malformed stored %s policy across connections without silently removing a ceiling',async corruption=>{
    const active=router(a,100);
    const limits={daily_cents:100,hourly_cents:50,session_cents:20,call_cents:5,halted:0,revision:1};
    registerBudgetPolicy(a.raw,limits);
    a.raw.transaction(()=>reserveInferenceCost(a.raw,'previous',undefined,'mock',7)).immediate();
    if(corruption==='text')b.raw.prepare('UPDATE inference_budget_policy SET call_cents=?').run('private-corrupt-value');
    else if(corruption==='fraction')b.raw.exec('UPDATE inference_budget_policy SET daily_cents=0.5');
    else b.raw.exec('UPDATE inference_budget_policy SET revision=0');
    const before=b.raw.prepare('SELECT * FROM inference_budget_policy').get();
    const audit=b.raw.prepare('SELECT COUNT(*) n FROM inference_budget_audit').get();
    expect(()=>readBudgetPolicy(a.raw)).toThrow('Invalid stored shared budget policy');
    expect(()=>registerBudgetPolicy(b.raw,limits)).toThrow('Invalid stored shared budget policy');
    const mock=provider();
    await expect(active.route(request,mock)).rejects.toThrow('Invalid stored shared budget policy');
    expect(mock).not.toHaveBeenCalled();
    expect(b.raw.prepare('SELECT * FROM inference_budget_policy').get()).toEqual(before);
    expect(b.raw.prepare('SELECT COUNT(*) n FROM inference_budget_audit').get()).toEqual(audit);
    expect(pendingInferenceCost(a.raw)).toBe(7);
    const reopened=createDatabase(file);
    try{expect(()=>readBudgetPolicy(reopened.raw)).toThrow('Invalid stored shared budget policy');expect(pendingInferenceCost(reopened.raw)).toBe(7);}finally{reopened.close();}
  });
  it('honors a requested halt with unchanged limits and cannot clear it through another worker or restart',async()=>{
    const limits={daily_cents:100,hourly_cents:50,session_cents:20,call_cents:5,halted:0,revision:1};
    registerBudgetPolicy(a.raw,limits);
    expect(registerBudgetPolicy(b.raw,{...limits,halted:1})).toMatchObject({halted:1,revision:2});
    expect(registerBudgetPolicy(a.raw,limits)).toMatchObject({halted:1,revision:2});
    const reopened=createDatabase(file);
    try {expect(registerBudgetPolicy(reopened.raw,limits).halted).toBe(1);}finally{reopened.close();}
    const mock=provider();
    expect((await router(b).route(request,mock)).finishReason).toBe('budget_exceeded');
    expect(mock).not.toHaveBeenCalled();
  });
  it('rejects invalid direct policy registration without changing limits or audit',()=>{
    const valid={daily_cents:100,hourly_cents:50,session_cents:20,call_cents:5,halted:0,revision:1};
    registerBudgetPolicy(a.raw,valid);
    const before=readBudgetPolicy(a.raw),audit=a.raw.prepare('SELECT COUNT(*) n FROM inference_budget_audit').get();
    for(const invalid of [{daily_cents:-1},{call_cents:NaN},{session_cents:0.5},{hourly_cents:Infinity},{halted:2},{revision:0}]) {
      expect(()=>registerBudgetPolicy(b.raw,{...valid,...invalid})).toThrow('Invalid shared');
      expect(readBudgetPolicy(a.raw)).toEqual(before);
      expect(a.raw.prepare('SELECT COUNT(*) n FROM inference_budget_audit').get()).toEqual(audit);
    }
  });
  it.each(["topup_credits","transfer_credits","fund_child","create_sandbox","spawn_child","register_domain","x402_fetch","register_erc8004","give_feedback"])("blocks unpriced %s before direct or dispatcher side effects",async name=>{
    initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:1000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    const tools=createBuiltinTools("fixture"),context={db:a} as unknown as ToolContext;
    expect(await tools.find(t=>t.name===name)!.execute({},context)).toMatch(/^Blocked: Shared capital/);
    const dispatched=await executeTool(name,{},tools,context);
    if(['dangerous','forbidden'].includes(tools.find(t=>t.name===name)!.riskLevel))
      expect(dispatched.error).toBe('Blocked: privileged execution requires policy evaluation and audit');
    else expect(dispatched.result).toMatch(/^Blocked: Shared capital/);
  });
  it("replaces commitments with actual costs atomically and never treats revenue claims as funding",()=>{
    initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    reserveCapitalCommitment(a.raw,"order","service validation",60);
    const record=()=>{a.raw.prepare("INSERT INTO economic_events(id,event_type,amount_cents) VALUES('receipt','cost',40)").run();};
    expect(()=>settleCapitalCommitment(a.raw,"order",30,record)).toThrow("matching");
    expect(a.raw.prepare("SELECT 1 FROM economic_events WHERE id='receipt'").get()).toBeUndefined();
    expect(checkCapitalBudget(b.raw,41).allowed).toBe(false);
    settleCapitalCommitment(a.raw,"order",40,record);
    settleCapitalCommitment(b.raw,"order",40,()=>{throw new Error("duplicate callback");});
    expect(checkCapitalBudget(b.raw,60).allowed).toBe(true);
    b.raw.prepare("INSERT INTO economic_events(id,event_type,amount_cents) VALUES('claim','payment',10000)").run();
    expect(checkCapitalBudget(b.raw,61).allowed).toBe(false);
  });
  it("records overruns honestly and blocks subsequent expenditure",()=>{
    initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    reserveCapitalCommitment(a.raw,"order","unexpected invoice",10);
    settleCapitalCommitment(a.raw,"order",101,()=>{a.raw.prepare("INSERT INTO economic_events(id,event_type,amount_cents) VALUES('overrun','cost',101)").run();});
    expect(checkCapitalBudget(b.raw,0).allowed).toBe(false);
  });
  it("shares capital between non-trading commitments and concurrent inference routers",async()=>{
    initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:4998,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    reserveCapitalCommitment(b.raw,"validation","software demand validation",1);
    const first=router(a),second=router(b);
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const mock=vi.fn(async()=>{await gate;return {message:{content:"mock"},usage:{promptTokens:1,completionTokens:1}};});
    const pending=first.route(request,mock);
    try {
      expect(mock).toHaveBeenCalledTimes(1);
      expect((await second.route(request,provider())).finishReason).toBe("budget_exceeded");
      expect(()=>reserveCapitalCommitment(b.raw,"second","another business experiment",1)).toThrow("capital exhausted");
    } finally {release();await pending;}
    expect(checkCapitalBudget(a.raw,1).allowed).toBe(false);
  });
  it("retains commitments and immutable capital on restart without assuming extra deposits",()=>{
    const policy={capitalChfCents:5000,reserveChfCents:1000,chfPerUsdNumerator:9,chfPerUsdDenominator:10,quoteExpiresAt:Date.now()+60000};
    initializeCapitalBudget(a.raw,policy);reserveCapitalCommitment(a.raw,"test","digital product",4444);
    a.close();a=createDatabase(file);
    expect(checkCapitalBudget(a.raw,1).allowed).toBe(false);
    reserveCapitalCommitment(a.raw,"test","digital product",4444);
    expect(()=>initializeCapitalBudget(a.raw,{...policy,capitalChfCents:10000})).toThrow("immutable");
    expect(()=>reserveCapitalCommitment(a.raw,"test","changed",1)).toThrow("Conflicting");
  });
  it("fails closed when the explicit FX quote expires",()=>{
    initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:0,chfPerUsdNumerator:9,chfPerUsdDenominator:10,quoteExpiresAt:Date.now()+60000});
    const now=vi.spyOn(Date,"now").mockReturnValue(Date.now()+120000);
    try {expect(checkCapitalBudget(b.raw,1)).toMatchObject({allowed:false,reason:expect.stringContaining("expired")});}finally{now.mockRestore();}
  });
  it("migrates V14 while preserving unresolved reservations and existing costs", () => {
    new InferenceBudgetTracker(a.raw, DEFAULT_MODEL_STRATEGY_CONFIG).recordCost({ sessionId: "old", turnId: null,
      experimentId: null, model: "gpt-5-mini", provider: "openai", inputTokens: 1, outputTokens: 1, costCents: 7,
      latencyMs: 0, tier: "low_compute", taskType: "agent_turn", cacheHit: false });
    a.raw.transaction(() => reserveInferenceCost(a.raw, "old", undefined, "gpt-5-mini", 3)).immediate();
    a.raw.exec("DROP TRIGGER experiment_baseline_insert; DROP TRIGGER experiment_baseline_start; DROP TRIGGER experiment_baseline_no_update; DROP TRIGGER experiment_baseline_no_delete; DROP TABLE revenue_experiment_baselines;");
    a.raw.exec(`DROP TABLE inference_reservation_context; DROP TABLE inference_reconciliations;
      DROP TABLE inference_budget_audit; DROP TABLE inference_budget_policy;
      DELETE FROM schema_version WHERE version >= 15;`);
    a.close(); a = createDatabase(file);
    expect(pendingInferenceCost(a.raw)).toBe(3);
    expect(new InferenceBudgetTracker(a.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getSessionCost("old")).toBe(7);
    expect(a.raw.prepare("SELECT MAX(version) n FROM schema_version").get()).toEqual({ n: 16 });
    expect(readBudgetPolicy(a.raw)?.halted).toBe(0);
  });
  it("applies a later stricter worker's daily limit to an already constructed permissive router", async () => {
    const permissive = router(a, 100);
    router(b, 1);
    const mock = provider();
    expect((await permissive.route(request, mock)).finishReason).toBe("stop");
    expect((await permissive.route(request, mock)).finishReason).toBe("budget_exceeded");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(readBudgetPolicy(a.raw)?.daily_cents).toBe(1);
  });
  it.each(["hourlyBudgetCents", "sessionBudgetCents", "perCallCeilingCents"] as const)("shares %s even if another worker disables its local limit", async field => {
    const permissive = router();
    router(b, undefined, { [field]: 1 });
    const mock = provider();
    if (field === "perCallCeilingCents") {
      expect((await permissive.route({ ...request, maxTokens: 200 }, mock)).finishReason).toBe("budget_exceeded");
      expect(mock).not.toHaveBeenCalled();
    } else {
      await permissive.route(request, mock);
      expect((await permissive.route(request, mock)).finishReason).toBe("budget_exceeded");
      expect(mock).toHaveBeenCalledTimes(1);
    }
  });
  it("preserves an explicit zero across reopen and conflicting unlimited defaults", async () => {
    router(a, 0); a.close(); a = createDatabase(file);
    const mock = provider();
    expect((await router().route(request, mock)).finishReason).toBe("budget_exceeded");
    expect(mock).not.toHaveBeenCalled();
    expect(readBudgetPolicy(a.raw)?.daily_cents).toBe(0);
  });
  it("halts all subsequent calls after an adapter exceeds its reservation", async () => {
    const r = router();
    const result = await r.route(request, async () => ({ usage: { promptTokens: 1, completionTokens: 200 } }));
    expect(result.costCents).toBe(2);
    expect(readBudgetPolicy(b.raw)?.halted).toBe(1);
    const mock = provider();
    expect((await router(b).route(request, mock)).finishReason).toBe("budget_exceeded");
    expect(mock).not.toHaveBeenCalled();
  });
  it.each([NaN, -1, Infinity, 0.5])("fails closed for invalid limits: %s", async amount => {
    const mock = provider();
    expect((await router(a, amount).route(request, mock)).finishReason).toBe("budget_exceeded");
    expect(mock).not.toHaveBeenCalled();
  });
});
