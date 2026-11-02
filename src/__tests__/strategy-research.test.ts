import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../v1/cli.js";
import { createBuiltinTools } from "../agent/tools.js";
import type { ToolContext } from "../types.js";
import { researchStrategies, type StrategyResearchInput } from "../revenue/strategy-research.js";

function fixture(): StrategyResearchInput {
  return { provenance:"synthetic", symbol:"SIM", bars:Array.from({length:40},(_,i)=>{
    const price=10000+i*100;
    return {time:i+1,open:price,high:price+200,low:price-10,close:price+100};
  }), variants:[
    {id:"momentum",family:"momentum",lookback:3,thresholdBps:0,stopBps:400,targetBps:100},
    {id:"reversion",family:"mean-reversion",lookback:3,thresholdBps:0,stopBps:400,targetBps:100},
  ],trainSize:20,testSize:10,equityCents:1000000,friction:{feeBps:10,slippageBps:10},minTrainingTrades:3,maxTrainingClosedDrawdownFraction:0.1 };
}
describe("bounded offline strategy selection",()=>{
  it('reports honest sample metrics and stress costs without reselecting or claiming profit probability',()=>{
    const input=fixture(),r=researchStrategies(input);
    expect(r.diagnostics.feesCents).toBe(r.evaluation.trades.reduce((n,t)=>n+t.entryFeeCents+t.exitFeeCents,0));
    expect(r.diagnostics.statisticalProfitProbability).toBeNull();
    expect(r.frictionStress.map(s=>s.multiplier)).toEqual([2,3]);
    expect(r.frictionStress.every(s=>s.status==='evaluated')).toBe(true);
    const noTrades=researchStrategies({...input,minTrainingTrades:100});
    expect(noTrades.diagnostics).toMatchObject({observedWinFraction:null,netProfitFactor:null,averageNetCents:null});
    expect(noTrades.frictionStress.every(s=>s.status==='evaluated'&&s.trades===0)).toBe(true);
  });
  it("exposes a bounded report through the existing agent tool",async()=>{
    const tool=createBuiltinTools("test").find(t=>t.name==="paper_research_strategies")!;
    const output=await tool.execute({input:fixture()},{} as ToolContext);
    expect(JSON.parse(output)).toMatchObject({mode:"paper-strategy-research",provenance:"synthetic",decision:"further-validation-only"});
    expect(output.length).toBeLessThan(10000);
  });
  it("writes a reproducible CLI report without overwriting an existing report",async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-strategy-"));
    const input=path.join(directory,"input.json"),output=path.join(directory,"report.json");
    const stdout=vi.spyOn(process.stdout,"write").mockReturnValue(true);
    try {
      fs.writeFileSync(input,JSON.stringify(fixture()));
      await main(["strategy-research","--input",input,"--output",output]);
      const report=fs.readFileSync(output,"utf8");
      expect(JSON.parse(report)).toEqual(researchStrategies(fixture()));
      await expect(main(["strategy-research","--input",input,"--output",output])).rejects.toThrow();
      expect(fs.readFileSync(output,"utf8")).toBe(report);
    } finally {stdout.mockRestore();fs.rmSync(directory,{recursive:true,force:true});}
  });
  it("selects on training and accounts for forward trades without live authority",()=>{
    const report=researchStrategies(fixture());
    expect(report.selections.map(s=>s.selectedId)).toEqual(["momentum","momentum"]);
    expect(report.evaluation.netPnlCents).toBeGreaterThan(0);
    expect(report.evaluation.netPnlCents).toBe(report.evaluation.trades.reduce((s,t)=>s+t.netPnlCents,0));
    expect(report.evaluation.trades.every(t=>t.mode==="paper" && t.entryFeeCents>0 && t.exitFeeCents>0)).toBe(true);
    expect(report.decision).toBe("further-validation-only");
    expect(report.inputDigest).toHaveLength(64);
  });
  it("does not let later prices change the earlier selected strategy",()=>{
    const original=fixture(),changed=structuredClone(original);
    for(let i=20;i<40;i++) changed.bars[i]={time:i+1,open:6000,high:6010,low:5000,close:5100};
    const a=researchStrategies(original),b=researchStrategies(changed);
    expect(b.selections[0]).toEqual(a.selections[0]);
    expect(b.evaluation.netPnlCents).toBeLessThan(a.evaluation.netPnlCents);
    expect(b.inputDigest).not.toBe(a.inputDigest);
  });
  it("abstains rather than selecting a gross winner whose friction removes the edge",()=>{
    const input=fixture();input.friction={feeBps:200,slippageBps:200};
    const report=researchStrategies(input);
    expect(report.selections.every(s=>s.selectedId===null)).toBe(true);
    expect(report.evaluation.trades).toEqual([]);
    expect(report.decision).toBe("insufficient-forward-evidence");
  });
  it("keeps cash when no trades or insufficient training observations support a choice",()=>{
    const input=fixture();input.minTrainingTrades=100;
    expect(researchStrategies(input).evaluation.netPnlCents).toBe(0);
  });
  it("is reproducible and does not mutate input",()=>{
    const input=fixture(),before=structuredClone(input);
    expect(researchStrategies(input)).toEqual(researchStrategies(input));
    expect(input).toEqual(before);
  });
  it.each(["duplicate","risk","future","budget","nan"])("rejects invalid %s inputs before research",kind=>{
    const input=fixture();
    if(kind==="duplicate") input.variants.push({...input.variants[0]});
    if(kind==="risk") input.variants[0].stopBps=501;
    if(kind==="future") input.bars[5].time=1000;
    if(kind==="budget") input.testSize=0;
    if(kind==="nan") input.friction.feeBps=NaN;
    expect(()=>researchStrategies(input)).toThrow();
  });
});
