import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {PaperPortfolio,type PaperPortfolioLimits} from "../revenue/paper-portfolio.js";
import {openStrategySeries} from "../v1/strategy-series.js";
import {type PaperPlan,type Bar} from "../revenue/paper-trading.js";
import {main} from "../v1/cli.js";
import {createBuiltinTools} from "../agent/tools.js";
import type {ToolContext} from "../types.js";
let directory:string,one:ReturnType<typeof openStrategySeries>,two:ReturnType<typeof openStrategySeries>,a:PaperPortfolio,b:PaperPortfolio;
const limits:PaperPortfolioLimits={initialCapitalCents:1000000,liquidityFloorCents:100000,maxOpenRiskCents:15000,maxDailyLossCents:50000,maxDrawdownCents:100000,maxPositions:3,friction:{feeBps:0,slippageBps:0}};
const plan:PaperPlan={symbol:"SIM",thesis:"synthetic only",entryCents:10000,stopCents:9600,targetsCents:[10800],exitRule:"stop or target or window end"};
const bar=(time:number,changes:Partial<Bar>={}):Bar=>({time,open:10000,high:10100,low:9900,close:10000,...changes});
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-portfolio-"));const file=path.join(directory,"paper.db");one=openStrategySeries(file,true);two=openStrategySeries(file);a=new PaperPortfolio(one.db);b=new PaperPortfolio(two.db);});
afterEach(()=>{one.db.close();two.db.close();fs.rmSync(directory,{recursive:true,force:true});});
describe("persistent aggregate paper risk",()=>{
  it("funds only the trading share of an explicit CHF budget and retains it after restart",()=>{
    const configured={...limits,currency:"CHF" as const,initialCapitalCents:3000,liquidityFloorCents:0,maxOpenRiskCents:60,maxDailyLossCents:100,maxDrawdownCents:200,
      capitalAllocation:{totalCents:5000,operatingCents:1000,reserveCents:1000,tradingCents:3000}};
    a.initialize(configured);
    expect(b.snapshot()).toMatchObject({currency:"CHF",cash_cents:3000});
    expect(()=>b.open("wrong",plan,1000)).toThrow("currency mismatch");
    const order={...plan,currency:"CHF" as const,entryCents:100,stopCents:96,targetsCents:[108]};
    expect(a.open("chf",order,1000).position.plannedLossCents).toBeLessThanOrEqual(30);
    const reopened=openStrategySeries(path.join(directory,"paper.db"));
    try {
      const restored=new PaperPortfolio(reopened.db);
      expect(restored.snapshot().limits.capitalAllocation).toEqual(configured.capitalAllocation);
      expect(()=>restored.initialize({...configured,currency:"USD"})).toThrow("immutable");
    } finally {reopened.db.close();}
  });
  it("rejects oversubscribed allocations and unsupported currencies without funding an account",()=>{
    expect(()=>a.initialize({...limits,currency:"CHF",capitalAllocation:{totalCents:1000000,operatingCents:1,reserveCents:0,tradingCents:1000000}})).toThrow("allocation");
    expect(()=>a.initialize({...limits,currency:"BTC" as "CHF"})).toThrow("currency");
    expect(()=>a.snapshot()).toThrow("Initialize");
  });
  it("preserves legacy USD accounts and rejects explicitly foreign orders",()=>{
    a.initialize(limits);b.initialize(limits);
    expect(a.snapshot().currency).toBe("USD");
    expect(()=>a.open("foreign",{...plan,currency:"EUR"},1000)).toThrow("currency mismatch");
    expect(()=>a.open("legacy",plan,1000)).not.toThrow();
  });
  it("retains per-order minimum fees after reopening and prevents changing them",()=>{
    const configured={...limits,friction:{feeBps:0,slippageBps:0,minimumFeeCents:35}};
    a.initialize(configured);
    const reopened=openStrategySeries(path.join(directory,"paper.db"));
    try {
      const restored=new PaperPortfolio(reopened.db);
      restored.initialize(configured);
      expect(()=>restored.initialize(limits)).toThrow("immutable");
      const opened=restored.open("minimum-fee",plan,1000);
      expect(opened.position.entryFeeCents).toBe(35);
      const result=restored.settle("minimum-fee",[bar(2000,{low:9500})]);
      expect(result.trade.netPnlCents).toBe(-400*opened.position.units-70);
    } finally {reopened.db.close();}
  });
  it("requires explicit immutable limits and cannot reset capital on another connection",()=>{
    expect(()=>a.open("a",plan,1000)).toThrow("Initialize");a.initialize(limits);b.initialize(limits);
    expect(()=>b.initialize({...limits,initialCapitalCents:2000000})).toThrow("immutable");
  });
  it("blocks collectively excessive orders across separate connections",()=>{
    a.initialize(limits);a.open("a",plan,1000);
    expect(()=>b.open("b",{...plan,symbol:"OTHER"},1000)).toThrow("Aggregate");
    expect(a.snapshot().positions).toHaveLength(1);expect(a.snapshot().cash_cents).toBe(750000);
  });
  it("keeps liquidity and simultaneous position limits",()=>{
    a.initialize({...limits,liquidityFloorCents:900000,maxPositions:1});
    const result=a.open("a",plan,1000);expect(result.position.committedCents).toBeLessThanOrEqual(100000);
    expect(()=>b.open("b",{...plan,symbol:"OTHER"},1000)).toThrow("simultaneous");
    expect(a.snapshot().cash_cents).toBeGreaterThanOrEqual(900000);
  });
  it("retains open exposure after reopening and does not double-debit replayed orders",()=>{
    a.initialize(limits);const result=a.open("a",plan,1000);
    const reopened=openStrategySeries(path.join(directory,"paper.db"));
    try {const r=new PaperPortfolio(reopened.db);expect(r.open("a",plan,1000)).toEqual({...result,duplicate:true});expect(r.snapshot().cash_cents).toBe(750000);}finally{reopened.db.close();}
    expect(()=>b.open("a",{...plan,symbol:"OTHER"},1000)).toThrow("Conflicting");
  });
  it("blocks duplicate-symbol exposure, backdating and more than 2% planned risk",()=>{
    a.initialize({...limits,maxOpenRiskCents:50000});a.open("a",plan,1000);
    expect(()=>a.open("b",{...plan,symbol:"sim"},1000)).toThrow("averaging");
    expect(()=>a.open("b",{...plan,symbol:"OTHER"},999)).toThrow("backwards");
    expect(()=>a.open("b",{...plan,symbol:"OTHER",riskFraction:.03},1000)).toThrow("risk");
  });
  it("settles cash and profit once without granting a real economic event",()=>{
    a.initialize(limits);const opened=a.open("a",plan,1000),bars=[bar(2000,{high:11000})];
    const result=a.settle("a",bars);
    expect(b.settle("a",bars)).toEqual({...result,duplicate:true});
    expect(a.snapshot().cash_cents).toBe(1000000+result.trade.netPnlCents);
    expect(result.trade.netPnlCents).toBe(800*opened.position.units);
    expect(()=>b.settle("a",[bar(3000)])).toThrow("Conflicting");
    expect(one.db.prepare("SELECT 1 FROM sqlite_master WHERE name='economic_events'").get()).toBeUndefined();
  });
  it("counts gross daily losses even if another trade was profitable",()=>{
    a.initialize({...limits,maxDailyLossCents:15000});a.open("a",plan,1000);a.settle("a",[bar(2000,{low:9500})]);
    b.open("win",{...plan,riskFraction:.004},3000);b.settle("win",[bar(4000,{high:11000})]);
    expect(()=>b.open("b",plan,5000)).toThrow("Daily");
    expect(()=>b.open("b",plan,86400000+3000)).not.toThrow();
  });
  it("enforces the remaining drawdown allowance independently of the daily limit",()=>{
    a.initialize({...limits,maxDailyLossCents:100000,maxDrawdownCents:15000});
    a.open("a",plan,1000);a.settle("a",[bar(2000,{low:9500})]);
    expect(()=>b.open("b",plan,86400000)).toThrow("drawdown allowance");
  });
  it("records gap losses honestly and latches the halt across connections",()=>{
    a.initialize({...limits,maxDailyLossCents:15000});const opened=a.open("a",plan,1000);
    const result=a.settle("a",[bar(2000,{open:8000,high:8100,low:7900,close:8000})]);
    expect(-result.trade.netPnlCents).toBeGreaterThan(opened.position.plannedLossCents);
    expect(b.snapshot().halted).toBe(1);
    expect(()=>b.open("b",plan,86400000)).toThrow("halted");
  });
  it("allows closing remaining positions after a manual halt",()=>{
    a.initialize(limits);a.open("a",plan,1000);b.halt("operator fixture");
    expect(()=>a.open("b",{...plan,symbol:"OTHER"},2000)).toThrow("halted");
    expect(()=>a.settle("a",[bar(2000)])).not.toThrow();expect(b.snapshot().halted).toBe(1);
  });
  it("rolls back cash and position changes when audit persistence fails",()=>{
    a.initialize(limits);one.db.exec("CREATE TRIGGER fail_paper BEFORE INSERT ON paper_portfolio_audit WHEN NEW.action='open' BEGIN SELECT RAISE(ABORT,'fixture'); END");
    expect(()=>a.open("a",plan,1000)).toThrow("fixture");expect(b.snapshot().cash_cents).toBe(1000000);expect(b.snapshot().positions).toHaveLength(0);
  });
  it("rolls back a failed settlement as well as its cash credit",()=>{
    a.initialize(limits);a.open("a",plan,1000);
    one.db.exec("CREATE TRIGGER fail_settlement BEFORE INSERT ON paper_portfolio_audit WHEN NEW.action='settle' BEGIN SELECT RAISE(ABORT,'fixture'); END");
    expect(()=>a.settle("a",[bar(2000,{high:11000})])).toThrow("fixture");
    expect(b.snapshot()).toMatchObject({cash_cents:750000,closed_equity_cents:1000000,openPositions:1});
  });
  it("exposes the paper lifecycle through agent tools without a broker context",async()=>{
    const tool=createBuiltinTools("test").find(t=>t.name==="paper_portfolio")!,ctx={db:{raw:one.db}} as ToolContext;
    await tool.execute({action:"initialize",limits},ctx);
    await tool.execute({action:"open",id:"a",plan,at:1000},ctx);
    expect(JSON.parse(await tool.execute({action:"status"},ctx))).toMatchObject({mode:"paper-portfolio",openPositions:1,plannedOpenRiskCents:10000});
    expect(JSON.parse(await tool.execute({action:"settle",id:"a",bars:[bar(2000)]},ctx))).toMatchObject({duplicate:false,trade:{mode:"paper"}});
  });
  it("records synchronized marks and requires them before later exposure",()=>{
    a.initialize(limits);a.open("a",plan,1000);
    const observed=a.observe(2000,[{id:"a",bar:bar(2000,{high:10200,close:10200})}]);
    expect(observed).toMatchObject({report:{at:2000,closedIds:[],markedEquityCents:1005000}});
    expect(a.snapshot()).toMatchObject({marksCurrent:true,markedEquityCents:1005000});
    expect(()=>b.open("b",{...plan,symbol:"OTHER"},3000)).toThrow("Fresh synchronized");
    expect(()=>b.open("b",{...plan,symbol:"OTHER",riskFraction:.004},2000)).not.toThrow();
  });
  it("closes at an observed target and rejects conflicting frame replay",()=>{
    a.initialize(limits);const opened=a.open("a",plan,1000);
    const observed=a.observe(2000,[{id:"a",bar:bar(2000,{high:11000})}]);
    expect(observed).toMatchObject({report:{closedIds:["a"]}});
    expect(a.snapshot()).toMatchObject({openPositions:0,cash_cents:1000000+800*opened.position.units});
    expect(a.observe(2000,[{id:"a",bar:bar(2000,{high:11000})}])).toMatchObject({duplicate:true});
    expect(()=>a.observe(2000,[{id:"a",bar:bar(2000,{high:11100})}])).toThrow("Conflicting");
  });
  it("halts on drawdown from a marked peak across connections",()=>{
    a.initialize({...limits,maxDrawdownCents:10000});a.open("a",plan,1000);
    a.observe(2000,[{id:"a",bar:bar(2000,{high:10700,close:10700})}]);
    const result=b.observe(3000,[{id:"a",bar:bar(3000)}]);
    expect(result).toMatchObject({report:{closedIds:[],halted:1}});
    expect(a.snapshot()).toMatchObject({halted:1,halt_reason:"Marked paper drawdown limit reached"});
    expect(()=>b.open("b",{...plan,symbol:"OTHER"},3000)).toThrow("halted");
  });
  it("exposes observation through the agent tool",async()=>{
    const tool=createBuiltinTools("test").find(t=>t.name==="paper_portfolio")!,ctx={db:{raw:one.db}} as ToolContext;
    await tool.execute({action:"initialize",limits},ctx);await tool.execute({action:"open",id:"a",plan,at:1000},ctx);
    expect(JSON.parse(await tool.execute({action:"observe",at:2000,quotes:[{id:"a",bar:bar(2000,{close:10100})}]},ctx))).toMatchObject({report:{closedIds:[],at:2000}});
  });
  it("retains the marked peak when explicitly settling",()=>{
    a.initialize({...limits,maxDrawdownCents:10000});a.open("a",plan,1000);
    a.observe(2000,[{id:"a",bar:bar(2000,{high:10700,close:10700})}]);
    b.settle("a",[bar(3000)]);
    expect(a.snapshot()).toMatchObject({halted:1,halt_reason:"Paper drawdown limit reached"});
  });
  it("rejects partial frames and stale marks after another position settles",()=>{
    a.initialize({...limits,maxOpenRiskCents:50000});a.open("a",plan,1000);
    b.open("b",{...plan,symbol:"OTHER"},1000);
    expect(()=>a.observe(2000,[{id:"a",bar:bar(2000)}])).toThrow("every open position");
    a.observe(2000,[{id:"a",bar:bar(2000)},{id:"b",bar:bar(2000)}]);
    b.settle("b",[bar(3000)]);
    expect(()=>a.open("c",{...plan,symbol:"THIRD"},3000)).toThrow("Fresh synchronized");
  });
  it("rolls back an entire observation when audit persistence fails",()=>{
    a.initialize(limits);a.open("a",plan,1000);
    one.db.exec("CREATE TRIGGER fail_observation BEFORE INSERT ON paper_portfolio_audit WHEN NEW.action='observe' BEGIN SELECT RAISE(ABORT,'fixture'); END");
    expect(()=>b.observe(2000,[{id:"a",bar:bar(2000,{high:11000})}])).toThrow("fixture");
    expect(a.snapshot()).toMatchObject({clock:1000,cash_cents:750000,openPositions:1});
    expect(one.db.prepare("SELECT COUNT(*) n FROM paper_portfolio_frames").get()).toEqual({n:0});
  });
  it("supports standalone CLI initialization, order, settlement and status",async()=>{
    const file=path.join(directory,"cli.db"),input=path.join(directory,"input.json");
    const stdout=vi.spyOn(process.stdout,"write").mockReturnValue(true);
    try {
      fs.writeFileSync(input,JSON.stringify(limits));
      await main(["paper-portfolio","--database",file,"--new","--action","initialize","--input",input]);
      fs.writeFileSync(input,JSON.stringify({id:"a",plan,at:1000}));
      await main(["paper-portfolio","--database",file,"--action","open","--input",input]);
      fs.writeFileSync(input,JSON.stringify({id:"a",bars:[bar(2000)]}));
      await main(["paper-portfolio","--database",file,"--action","settle","--input",input]);
      await main(["paper-portfolio","--database",file,"--action","status"]);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)![0]))).toMatchObject({mode:"paper-portfolio",cash_cents:1000000,openPositions:0});
    } finally {stdout.mockRestore();}
  });
});
