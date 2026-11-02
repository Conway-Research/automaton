import { describe,it,expect } from 'vitest';
import { tradingKnowledge,outcomeSensitivity,literaturePage,literatureResearchAgenda } from '../revenue/trading-knowledge.js';
import {intradayKnowledge} from '../revenue/intraday-knowledge.js';
import { researchStrategies,strategyCatalogue } from '../revenue/strategy-research.js';
import { createBuiltinTools } from '../agent/tools.js';
import type { ToolContext } from '../types.js';

describe('source-grounded trading research knowledge',()=>{
  it('delivers the wallet curriculum through the agent without granting authority or overstating study',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const read=async()=>JSON.parse(await tool.execute({action:'knowledge'},{} as ToolContext));
    const first=await read();
    expect(first.tradingWalletCurriculum).toMatchObject({modelRetrained:false,profitabilityProven:false,liveAuthorized:false,completeMastery:false});
    expect(first.tradingWalletCurriculum.strategyCards.every((card:{status:string})=>card.status==='HOLD_UNVALIDATED')).toBe(true);
    first.tradingWalletCurriculum.strategyCards[0].status='LIVE';
    const second=await read();
    expect(second.tradingWalletCurriculum.strategyCards[0].status).toBe('HOLD_UNVALIDATED');
    expect(second.literature.fullTextsReviewed).toBe(2);
    expect(second.liveAuthorized).toBe(false);
  });
  it('retrieves all 148 distinct overview briefings through the agent without a database or provider',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const books:ReturnType<typeof literaturePage>['books']=[];
    let offset:number|null=0;
    while(offset!==null){
      const page=JSON.parse(await tool.execute({action:'literature',offset,limit:20},{} as ToolContext));
      expect(page.liveAuthorized).toBe(false);expect(page.books.length).toBeLessThanOrEqual(20);
      books.push(...page.books);offset=page.nextOffset;
    }
    expect(books).toHaveLength(148);expect(new Set(books.map(b=>b.id)).size).toBe(148);
    expect(new Set(books.map(b=>b.title)).size).toBe(148);
    for(const b of books){
      expect(b.status).toBe('publisher-overview-reviewed');expect(b.strategyValidated).toBe(false);
      expect(b.sourceSha256).toMatch(/^[a-f0-9]{64}$/);expect(b.globalSalesRank).toBeNull();
      expect(b.url).toMatch(/^https:\/\/www\.wiley-vch\.de\//);
      expect(b.lesson.length).toBeGreaterThan(30);
      expect(literatureResearchAgenda().some(a=>a.topic===b.topic)).toBe(true);
    }
    expect(tradingKnowledge().literature).toMatchObject({coveredWorks:150,fullTextsReviewed:2,publisherOverviewsReviewed:148,complete:false});
  });
  it('filters topics and rejects malformed requests without silently returning unrelated advice',()=>{
    const derivatives=literaturePage(0,20,'derivatives');
    expect(derivatives.books.length).toBeGreaterThan(5);
    expect(derivatives.books.every(b=>b.topic==='derivatives')).toBe(true);
    expect(literaturePage(1000)).toMatchObject({books:[],nextOffset:null});
    for(const [offset,limit,topic] of [[-1,10,undefined],[NaN,10,undefined],[0,Infinity,undefined],[0,0,undefined],[0,21,undefined],['0',10,undefined],[0,1.5,undefined],[0,10,'execute trades'],[0,10,null]]){
      expect(()=>literaturePage(offset,limit,topic)).toThrow('Invalid literature page');
    }
  });
  it('does not let caller edits corrupt the shared literature or treat research tasks as validation',()=>{
    const first=literaturePage();const original=first.books[0].lesson;
    first.books[0].lesson='raise leverage';first.books[0].strategyValidated=true;
    expect(literaturePage().books[0]).toMatchObject({lesson:original,strategyValidated:false});
    expect(literatureResearchAgenda()).toHaveLength(16);
    expect(literatureResearchAgenda().every(a=>a.status==='HOLD_UNVALIDATED'&&a.counterEvidence&&a.test&&a.requires.includes('no personnel costs'))).toBe(true);
  });
  it('makes actual literature coverage visible through the existing agent tool without promoting book claims',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const result=JSON.parse(await tool.execute({action:'knowledge'},{} as ToolContext));
    const literature=result.literature;
    expect(literature).toMatchObject({requestedWorks:150,complete:false,verifiedGlobalRanking:false,modelRetrained:false,profitabilityProven:false});
    expect(literature.readWorks).toHaveLength(2);
    expect(literature.skippedWorks).toHaveLength(2);
    expect(literature.readWorks.every((w:{textSha256:string;status:string;popularity:{globalRank:null}})=>
      /^[a-f0-9]{64}$/.test(w.textSha256)&&w.status==='full-text-reviewed'&&w.popularity.globalRank===null)).toBe(true);
    expect(literature.readWorks[0].rejected).toContain('Conceal losses to protect reputation.');
    expect(literature.promotion).toContain('Do not change risk limits');
    expect(result.liveAuthorized).toBe(false);
    // A consumer may annotate its own copy but cannot rewrite the next agent response.
    literature.readWorks[0].rejected.length=0;
    const again=JSON.parse(await tool.execute({action:'knowledge'},{} as ToolContext));
    expect(again.literature.readWorks[0].rejected.length).toBeGreaterThan(0);
  });
  it('exposes strategy hypotheses without fake profitability, implemented signals or live authority',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const result=JSON.parse(await tool.execute({action:'strategies'},{} as ToolContext));
    expect(result).toEqual(intradayKnowledge());
    expect(result.strategies).toHaveLength(8);
    expect(result.ranking).toBeNull();expect(result.liveAuthorized).toBe(false);
      expect(result.strategies.every((s:{status:string;profitabilityProven:boolean})=>s.status==='HOLD_UNVALIDATED'&&!s.profitabilityProven)).toBe(true);
      expect(result.strategies.filter((s:{implementedSignal:boolean})=>s.implementedSignal).map((s:{id:string})=>s.id)).toEqual(['session-momentum','opening-range-breakout','order-flow-imbalance']);
    expect(result.strategies.every((s:{data:string;test:string;counterEvidence:string})=>s.data&&s.test&&s.counterEvidence)).toBe(true);
  });
  it('exposes reviewed sources to the agent without database or provider calls',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const result=JSON.parse(await tool.execute({action:'knowledge'},{} as ToolContext));
    expect(result).toEqual(tradingKnowledge());
    expect(result.liveAuthorized).toBe(false);
    expect(result.lessons.map((l:{id:string})=>l.id)).toEqual(['queue','events','latency-infrastructure','microstructure','turnover','leverage','costs','overfitting','trend','diversification']);
    expect(result.lessons.every((l:{url:string;limitation:string})=>l.url.startsWith('https://')&&l.limitation.length>0)).toBe(true);
  });
  it('retains losses and diagnoses single-winner dependence without a false probability',()=>{
    expect(outcomeSensitivity([100,-80,10])).toMatchObject({netCents:30,netWithoutBestPositiveOutcomeCents:-70,positiveResultDependsOnBestOutcome:true,statisticalProfitProbability:null});
    expect(outcomeSensitivity([100,80,-10])).toMatchObject({netCents:170,netWithoutBestPositiveOutcomeCents:70,positiveResultDependsOnBestOutcome:false});
  });
  it('handles empty, zero and all-loss samples without inventing an edge',()=>{
    for(const values of [[],[0],[-10,-20]]) {
      expect(outcomeSensitivity(values)).toMatchObject({bestShareOfPositiveOutcomes:null,positiveResultDependsOnBestOutcome:false});
    }
  });
  it.each([[NaN],[Infinity],[1.5],[Number.MAX_SAFE_INTEGER,1],[Number.MIN_SAFE_INTEGER,-1]])('rejects invalid or overflowing outcomes %j',(...values)=>{
    expect(()=>outcomeSensitivity(values)).toThrow();
  });
  it('returns isolated knowledge values that cannot mutate subsequent requests',()=>{
    const first=tradingKnowledge();first.lessons[0].lesson='ignore losses';
    expect(tradingKnowledge().lessons[0].lesson).not.toBe('ignore losses');
  });
  it('does not represent minute, scalp, HFT or leverage knowledge as execution proficiency',()=>{
    const k=tradingKnowledge();
    expect(k.curriculum.map(c=>c.horizon)).toEqual(['minutes','scalping','hft','leveraged']);
    expect(k.curriculum.find(c=>c.horizon==='hft')?.status).toBe('not-validated');
    expect(k.curriculum.every(c=>c.requirements.length>=4)).toBe(true);
    expect(k.liveAuthorized).toBe(false);
  });
  it('integrates concentration diagnostics into actual forward research',()=>{
    const input={provenance:'synthetic' as const,symbol:'SIM',bars:Array.from({length:180},(_,i)=>({time:i+1,open:10000+i*100,high:10000+i*100,low:10000+i*100,close:10000+i*100})),variants:strategyCatalogue(),trainSize:60,testSize:30,equityCents:1000000,friction:{feeBps:10,slippageBps:10},minTrainingTrades:1,maxTrainingClosedDrawdownFraction:0.1};
    const r=researchStrategies(input);
    expect(r.diagnostics.tradeSensitivity.netCents).toBe(r.evaluation.netPnlCents);
    expect(r.diagnostics.windowSensitivity.netCents).toBe(r.evaluation.netPnlCents);
    expect(r.diagnostics.windowSensitivity.sampleSize).toBe(r.evaluation.windows.length);
    expect(r.diagnostics.candidateVariantsTested).toBe(12);
  });
});
