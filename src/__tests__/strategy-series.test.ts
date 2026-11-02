import { afterEach,beforeEach,describe,it,expect,vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { StrategySeriesStore,marketDataDigest,type TrialSettings,type SeriesRegistration } from "../revenue/strategy-series.js";
import { openStrategySeries } from "../v1/strategy-series.js";
import { main } from "../v1/cli.js";
import { createBuiltinTools } from "../agent/tools.js";
import type { ToolContext } from "../types.js";

let directory:string, file:string, first:ReturnType<typeof openStrategySeries>, second:ReturnType<typeof openStrategySeries>;
const bars=Array.from({length:40},(_,i)=>({time:i+1,open:10000+i*100,high:10200+i*100,low:9990+i*100,close:10100+i*100}));
const holdout=bars.slice(30);
const registration=():SeriesRegistration=>({symbol:"SIM",provenance:"synthetic",source:"local synthetic fixture",developmentBars:bars.slice(0,30),holdoutDigest:marketDataDigest(holdout),holdoutBars:10,maxTrials:2});
const settings=():TrialSettings=>({variants:[{id:"momentum",family:"momentum",lookback:3,thresholdBps:0,stopBps:400,targetBps:100}],trainSize:10,testSize:5,equityCents:1000000,friction:{feeBps:10,slippageBps:10},minTrainingTrades:2,maxTrainingClosedDrawdownFraction:0.1});
beforeEach(()=>{
  directory=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-series-"));file=path.join(directory,"research.db");
  first=openStrategySeries(file,true);second=openStrategySeries(file);
});
afterEach(()=>{first.db.close();second.db.close();fs.rmSync(directory,{recursive:true,force:true});});

describe("persistent preregistered paper research",()=>{
  function later(provenance:SeriesRegistration['provenance']='synthetic',shift=100){
    const shifted=bars.map(b=>({...b,time:b.time+shift}));
    return first.store.register({...registration(),provenance,developmentBars:shifted.slice(0,30),holdoutDigest:marketDataDigest(shifted.slice(30))});
  }
  function finish(losing=false){
    const data=losing?holdout.map(b=>({time:b.time,open:6000,high:6010,low:5000,close:5100})):holdout;
    const id=first.store.register({...registration(),holdoutDigest:marketDataDigest(data)});
    const trial=first.store.trial(id,settings());first.store.lock(id,trial.trialId);first.store.finalize(id,data);return id;
  }
  it('learns from retained final losses and proposes no repeat trade research without changing limits',()=>{
    finish(true);const id=later(),input=settings();const before=JSON.stringify(input);
    const advice=second.store.learning(id,input);
    expect(advice).toMatchObject({decision:'preserve-capital',nextSettings:null,liveAuthorized:false});
    expect(advice.candidates[0]).toMatchObject({observations:1,decision:'pause-and-revalidate',edgeDecay:true});
    // A large literature catalogue must not become positive outcome evidence.
    expect(advice.knowledge.literature.coveredWorks).toBe(150);
    expect(advice.knowledge.literature.researchAgenda.every(a=>a.status==='HOLD_UNVALIDATED')).toBe(true);
    expect(JSON.stringify(input)).toBe(before);expect(first.store.snapshot(id).status).toBe('open');
    const reopened=openStrategySeries(file);try{expect(reopened.store.learning(id,input)).toEqual(advice);}finally{reopened.db.close();}
  });
  it('does not treat a synthetic winner as live approval or allow duplicate finals to inflate learning',()=>{
    const completed=finish();first.store.finalize(completed,holdout);const id=later();
    const advice=first.store.learning(id,settings());
    expect(advice.candidates[0].observations).toBe(1);expect(advice.liveAuthorized).toBe(false);
    expect(advice.nextSettings).toEqual(settings());
  });
  it('autonomously applies loss feedback without spending a trial allowance',()=>{
    finish(true);const id=later();
    expect(first.store.learnedTrial(id,settings())).toMatchObject({trial:null,liveAuthorized:false});
    expect(second.store.snapshot(id).trials).toHaveLength(0);
  });
  it('executes a bounded learned trial idempotently and rolls back on audit failure',()=>{
    finish();const id=later();
    first.db.exec("CREATE TRIGGER fail_learning BEFORE INSERT ON strategy_series_audit WHEN NEW.action='learned-trial' BEGIN SELECT RAISE(ABORT,'learning audit failure'); END");
    expect(()=>first.store.learnedTrial(id,settings())).toThrow('learning audit failure');
    expect(second.store.snapshot(id).trials).toHaveLength(0);
    first.db.exec('DROP TRIGGER fail_learning');
    const result=first.store.learnedTrial(id,settings());
    expect(result.trial?.duplicate).toBe(false);
    expect(second.store.learnedTrial(id,settings()).trial?.duplicate).toBe(true);
    expect(second.store.snapshot(id).audit.filter((a:any)=>a.action==='learned-trial')).toHaveLength(1);
    first.store.lock(id,result.trial!.trialId);
    expect(()=>second.store.learnedTrial(id,settings())).toThrow('locked');
  });
  it('excludes future or overlapping evidence and separates synthetic from historical data',()=>{
    finish();const early=later('synthetic',-100),historical=later('historical-unverified',200);
    for(const id of [early,historical])expect(first.store.learning(id,settings())).toMatchObject({excludedSeries:1,candidates:[{observations:0,decision:'unproven'}]});
  });
  it('orders learning by market time rather than registration order',()=>{
    const shifted=bars.map(b=>({...b,time:b.time+100}));
    const bad=shifted.slice(30).map(b=>({...b,open:6000,high:6010,low:5000,close:5100}));
    const recent=first.store.register({...registration(),developmentBars:shifted.slice(0,30),holdoutDigest:marketDataDigest(bad)});
    const trial=first.store.trial(recent,settings());first.store.lock(recent,trial.trialId);first.store.finalize(recent,bad);
    finish(); // Older winner registered after the newer loss.
    const advice=first.store.learning(later('synthetic',300),settings());
    expect(advice.candidates[0]).toMatchObject({observations:2,decision:'pause-and-revalidate',latest:{seriesId:recent}});
    expect(advice.nextSettings).toBeNull();
  });
  it('does not transfer conclusions across different friction assumptions or hide failure by renaming variants',()=>{
    finish(true);const id=later(),renamed=settings();renamed.variants[0].id='new-label';
    expect(first.store.learning(id,renamed).nextSettings).toBeNull();
    expect(first.store.learning(id,{...settings(),friction:{feeBps:20,slippageBps:20}}).candidates[0].observations).toBe(0);
  });
  it('exposes learning through the agent tool and offline CLI without altering the series',async()=>{
    finish(true);const id=later();
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const result=JSON.parse(await tool.execute({action:'learning',series_id:id,settings:settings()},{db:{raw:first.db}} as unknown as ToolContext));
    expect(result.nextSettings).toBeNull();
    const input=path.join(directory,'settings.json'),output=path.join(directory,'learning.json');fs.writeFileSync(input,JSON.stringify(settings()));
    const stdout=vi.spyOn(process.stdout,'write').mockReturnValue(true);
    try{await main(['strategy-series','--database',file,'--action','learning','--series',id,'--input',input,'--output',output]);expect(JSON.parse(fs.readFileSync(output,'utf8'))).toEqual(result);}finally{stdout.mockRestore();}
  });
  it("survives reopening with shared trial allowance and idempotent trial results",()=>{
    const input={...registration(),maxTrials:1};
    const id=first.store.register(input),a=first.store.trial(id,settings());
    expect(second.store.register(input)).toBe(id);
    expect(second.store.trial(id,settings())).toMatchObject({trialId:a.trialId,duplicate:true});
    expect(()=>second.store.trial(id,{...settings(),minTrainingTrades:3})).toThrow("allowance exhausted");
    const reopened=openStrategySeries(file);
    try {expect(reopened.store.snapshot(id).trials).toHaveLength(1);} finally {reopened.db.close();}
  });
  it("cannot reset the trial allowance with a different label or symbol alias",()=>{
    first.store.register(registration());
    expect(()=>second.store.register({...registration(),maxTrials:20})).toThrow("already registered");
    expect(()=>second.store.register({...registration(),symbol:"ALIAS",source:"different label"})).toThrow("already registered");
  });
  it("does not reuse the same holdout as a fresh final test with revised development data",()=>{
    first.store.register(registration());
    const revised=registration();revised.developmentBars=revised.developmentBars.slice(5);
    expect(()=>second.store.register(revised)).toThrow("Holdout already committed");
    expect(first.db.prepare("SELECT COUNT(*) n FROM strategy_series").get()).toEqual({n:1});
  });
  it("requires a positive trial and lock before accessing final results",()=>{
    const id=first.store.register(registration());
    expect(()=>first.store.finalize(id,holdout)).toThrow("Lock a candidate");
    const failed=first.store.trial(id,{...settings(),minTrainingTrades:100});
    expect(()=>first.store.lock(id,failed.trialId)).toThrow("retain cash");
    const valid=first.store.trial(id,settings());
    second.store.lock(id,valid.trialId);
    expect(()=>first.store.trial(id,settings())).toThrow("locked");
    expect(()=>first.store.lock(id,failed.trialId)).toThrow("already locked");
    expect(first.store.snapshot(id).finalReport).toBeNull();
  });
  it("rejects substituted holdout prices and atomically records a final evaluation exactly once",()=>{
    const id=first.store.register(registration()),trial=first.store.trial(id,settings());
    first.store.lock(id,trial.trialId);
    const substituted=structuredClone(holdout);substituted[0].high++;
    expect(()=>second.store.finalize(id,substituted)).toThrow("differs");
    expect(first.store.snapshot(id).status).toBe("locked");
    const result=first.store.finalize(id,holdout),duplicate=second.store.finalize(id,holdout);
    expect(result.duplicate).toBe(false);expect(duplicate).toEqual({...result,duplicate:true});
    expect(result.report.evaluation.windows).toHaveLength(1);
    expect(result.report.evaluation.windows[0].trainEnd).toBe(30);
    expect(result.report.evaluation.windows[0].testStart).toBe(31);
    expect(first.store.snapshot(id).audit.filter((a:any)=>a.action==="finalize")).toHaveLength(1);
  });
  it("retains a failed final result and forbids post-result optimization",()=>{
    const bad=holdout.map(b=>({time:b.time,open:6000,high:6010,low:5000,close:5100}));
    const id=first.store.register({...registration(),holdoutDigest:marketDataDigest(bad)}),trial=first.store.trial(id,settings());
    first.store.lock(id,trial.trialId);
    const result=first.store.finalize(id,bad);
    expect(result.report.decision).toBe("insufficient-forward-evidence");
    expect(()=>second.store.trial(id,{...settings(),minTrainingTrades:1})).toThrow("locked");
    expect(second.store.snapshot(id).status).toBe("evaluated");
  });
  it("rolls back a final write failure without unlocking or losing the candidate",()=>{
    const id=first.store.register(registration()),trial=first.store.trial(id,settings());
    first.store.lock(id,trial.trialId);
    first.db.exec("CREATE TRIGGER fail_final_audit BEFORE INSERT ON strategy_series_audit WHEN NEW.action='finalize' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    expect(()=>first.store.finalize(id,holdout)).toThrow("fixture failure");
    expect(second.store.snapshot(id)).toMatchObject({status:"locked",lockedTrial:trial.trialId,finalReport:null});
    first.db.exec("DROP TRIGGER fail_final_audit");
    expect(second.store.finalize(id,holdout).duplicate).toBe(false);
  });
  it("refuses a correctly hashed but temporally overlapping holdout",()=>{
    const overlapping=bars.slice(0,10),id=first.store.register({...registration(),holdoutDigest:marketDataDigest(overlapping)});
    const trial=first.store.trial(id,settings());first.store.lock(id,trial.trialId);
    expect(()=>first.store.finalize(id,overlapping)).toThrow("overlaps");
  });
  it("uses only preregistered development data despite extra input fields",()=>{
    const id=first.store.register(registration());
    const result=first.store.trial(id,{...settings(),bars:holdout} as TrialSettings);
    expect(result.report.evaluation.windows.at(-1).testEnd).toBe(30);
    expect(first.store.snapshot(id).finalReport).toBeNull();
  });
  it("keeps prior databases untouched and rejects existing new targets",()=>{
    const arbitrary=path.join(directory,"unmarked.db"),db=new Database(arbitrary);
    db.exec("CREATE TABLE keep(value TEXT); INSERT INTO keep VALUES('preserve')");db.close();
    expect(()=>openStrategySeries(arbitrary)).toThrow("Not a marked");
    expect(()=>openStrategySeries(file,true)).toThrow();
    const check=new Database(arbitrary,{readonly:true});
    try {expect(check.prepare("SELECT value FROM keep").get()).toEqual({value:"preserve"});expect(check.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='strategy_series'").get()).toEqual({n:0});} finally {check.close();}
  });
  it("supports the agent lifecycle without giving live authority",async()=>{
    const tool=createBuiltinTools("test").find(t=>t.name==="paper_research_series")!,ctx={db:{raw:first.db}} as ToolContext;
    const id=JSON.parse(await tool.execute({action:"register",registration:registration()},ctx)).seriesId;
    const trial=JSON.parse(await tool.execute({action:"trial",series_id:id,settings:settings()},ctx));
    await tool.execute({action:"lock",series_id:id,trial_id:trial.trialId},ctx);
    const result=JSON.parse(await tool.execute({action:"finalize",series_id:id,holdout},ctx));
    expect(result.report.provenance).toBe("synthetic");
    const state=JSON.parse(await tool.execute({action:"status",series_id:id},ctx));
    expect(state.status).toBe("evaluated");expect(state.authority).toContain("not verified unseen data or live trading permission");
  });
  it("runs the persistent CLI lifecycle in a temporary workspace",async()=>{
    const series=path.join(directory,"cli.db"),input=path.join(directory,"input.json");
    const stdout=vi.spyOn(process.stdout,"write").mockReturnValue(true);
    try {
      fs.writeFileSync(input,JSON.stringify(registration()));
      await main(["strategy-series","--database",series,"--new","--action","register","--input",input]);
      const id=JSON.parse(String(stdout.mock.calls.at(-1)![0])).seriesId;
      fs.writeFileSync(input,JSON.stringify(settings()));
      await main(["strategy-series","--database",series,"--action","trial","--series",id,"--input",input]);
      const trialId=JSON.parse(String(stdout.mock.calls.at(-1)![0])).trialId;
      await main(["strategy-series","--database",series,"--action","lock","--series",id,"--trial",trialId]);
      fs.writeFileSync(input,JSON.stringify(holdout));
      await main(["strategy-series","--database",series,"--action","finalize","--series",id,"--input",input]);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)![0])).report.mode).toBe("paper-strategy-research");
    } finally {stdout.mockRestore();}
  });
});
