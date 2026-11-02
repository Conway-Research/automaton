import { createHash } from "node:crypto";
import { outcomeSensitivity, tradingKnowledge } from "./trading-knowledge.js";
import type { Database } from "better-sqlite3";
import { researchStrategies, type StrategyResearchInput } from "./strategy-research.js";
import { validateBars, type Bar } from "./paper-trading.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function marketDataDigest(bars: readonly Bar[]): string {
  if (!Array.isArray(bars) || bars.length < 1 || bars.length > 5000) throw new Error("Invalid dataset size");
  validateBars(bars);
  if (bars.some(b => b.high > 100_000_000)) throw new Error("Research price bound exceeded");
  return hash(bars.map(b => [b.time, b.open, b.high, b.low, b.close]));
}
export interface SeriesRegistration {
  symbol: string;
  provenance: StrategyResearchInput["provenance"];
  source: string;
  developmentBars: Bar[];
  holdoutDigest: string;
  holdoutBars: number;
  maxTrials: number;
}
export type TrialSettings = Omit<StrategyResearchInput, "bars" | "symbol" | "provenance">;
type SeriesRow = { id: string; registration: string; status: "open" | "locked" | "evaluated"; locked_trial: string | null; final_report: string | null };
type TrialRow = { id: string; settings: string; report: string };

/** Cooperative research protocol, not secrecy from the database/file owner.
 * Holdout prices are not provided until the candidate is locked.
 */
export class StrategySeriesStore {
  constructor(private readonly db: Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS strategy_series(
      id TEXT PRIMARY KEY, dataset_key TEXT UNIQUE NOT NULL, registration TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','locked','evaluated')),locked_trial TEXT,final_report TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')));
      CREATE TABLE IF NOT EXISTS strategy_trials(
      id TEXT PRIMARY KEY,series_id TEXT NOT NULL REFERENCES strategy_series(id),settings TEXT NOT NULL,report TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT(datetime('now')));
      CREATE INDEX IF NOT EXISTS strategy_trials_series ON strategy_trials(series_id);
      CREATE TABLE IF NOT EXISTS strategy_series_audit(
      id INTEGER PRIMARY KEY,series_id TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT(datetime('now')));`);
  }
  private row(id: string): SeriesRow {
    const row = this.db.prepare("SELECT * FROM strategy_series WHERE id=?").get(id) as SeriesRow | undefined;
    if (!row) throw new Error("Unknown research series");
    return row;
  }
  private audit(id: string, action: string, detail: unknown) {
    this.db.prepare("INSERT INTO strategy_series_audit(series_id,action,detail) VALUES(?,?,?)").run(id, action, JSON.stringify(detail));
  }
  register(input: SeriesRegistration): string {
    if (!input || typeof input.symbol !== "string" || !/^[A-Za-z0-9._-]{1,30}$/.test(input.symbol) ||
        !["synthetic", "historical-unverified"].includes(input.provenance) || typeof input.source !== "string" ||
        !input.source.trim() || input.source.length > 1000 || typeof input.holdoutDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.holdoutDigest) ||
        !Number.isSafeInteger(input.holdoutBars) || input.holdoutBars < 1 || input.holdoutBars > 2500 ||
        !Number.isSafeInteger(input.maxTrials) || input.maxTrials < 1 || input.maxTrials > 20) throw new Error("Invalid research registration");
    const developmentDigest = marketDataDigest(input.developmentBars);
    if (input.developmentBars.length + input.holdoutBars > 5000) throw new Error("Combined dataset too large");
    const registration = { symbol: input.symbol.toUpperCase(), provenance: input.provenance, source: input.source.trim(),
      developmentBars: input.developmentBars.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close})),
      holdoutDigest: input.holdoutDigest, holdoutBars: input.holdoutBars, maxTrials: input.maxTrials };
    // Data identity is independent of source label, symbol alias and trial allowance.
    const datasetKey = hash([developmentDigest, input.holdoutDigest]);
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT id,registration FROM strategy_series WHERE dataset_key=?").get(datasetKey) as {id:string;registration:string}|undefined;
      if (existing) {
        if (existing.registration !== JSON.stringify(registration)) throw new Error("Dataset already registered; cannot reset protocol or trial allowance");
        return existing.id;
      }
      if (this.db.prepare("SELECT 1 FROM strategy_series WHERE json_extract(registration,'$.holdoutDigest')=?").get(input.holdoutDigest)) {
        throw new Error("Holdout already committed to another series; different development data cannot reset final validation");
      }
      if ((this.db.prepare("SELECT COUNT(*) n FROM strategy_series").get() as {n:number}).n >= 50) throw new Error("Series capacity reached");
      const id = hash([datasetKey, registration]);
      this.db.prepare("INSERT INTO strategy_series(id,dataset_key,registration,status) VALUES(?,?,?,'open')").run(id,datasetKey,JSON.stringify(registration));
      this.audit(id,"register",{developmentDigest,holdoutDigest:input.holdoutDigest,maxTrials:input.maxTrials});
      return id;
    }).immediate();
  }
  trial(seriesId: string, settings: TrialSettings) {
    return this.db.transaction(() => {
      const row = this.row(seriesId), registration = JSON.parse(row.registration) as SeriesRegistration;
      if (row.status !== "open") throw new Error("Research protocol locked; no more trials");
      // Normalize fields and ignore any attempt to supply different prices/provenance.
      const input: StrategyResearchInput = { provenance: registration.provenance, symbol: registration.symbol, bars: registration.developmentBars,
        variants: settings.variants, trainSize: settings.trainSize, testSize: settings.testSize, equityCents: settings.equityCents,
        friction: settings.friction, minTrainingTrades: settings.minTrainingTrades, maxTrainingClosedDrawdownFraction: settings.maxTrainingClosedDrawdownFraction };
      const id = hash([seriesId,input]);
      const previous = this.db.prepare("SELECT report FROM strategy_trials WHERE id=?").get(id) as {report:string}|undefined;
      if (previous) return {trialId:id,duplicate:true,report:JSON.parse(previous.report)};
      const count = (this.db.prepare("SELECT COUNT(*) n FROM strategy_trials WHERE series_id=?").get(seriesId) as {n:number}).n;
      if (count >= registration.maxTrials) throw new Error("Research trial allowance exhausted");
      const report = researchStrategies(input);
      const {bars: _bars, symbol: _symbol, provenance: _provenance, ...normalized} = input;
      this.db.prepare("INSERT INTO strategy_trials(id,series_id,settings,report) VALUES(?,?,?,?)").run(id,seriesId,JSON.stringify(normalized),JSON.stringify(report));
      this.audit(seriesId,"trial",{trialId:id,number:count+1,decision:report.decision});
      return {trialId:id,duplicate:false,report};
    }).immediate();
  }
  lock(seriesId: string, trialId: string) {
    this.db.transaction(() => {
      const row = this.row(seriesId);
      if (row.status !== "open") {
        if (row.locked_trial === trialId) return;
        throw new Error("Candidate already locked");
      }
      const trial = this.db.prepare("SELECT report FROM strategy_trials WHERE id=? AND series_id=?").get(trialId,seriesId) as {report:string}|undefined;
      if (!trial) throw new Error("Unknown trial for series");
      if (JSON.parse(trial.report).decision !== "further-validation-only") throw new Error("No positive development evidence; retain cash");
      this.db.prepare("UPDATE strategy_series SET status='locked',locked_trial=? WHERE id=?").run(trialId,seriesId);
      this.audit(seriesId,"lock",{trialId});
    }).immediate();
  }
  finalize(seriesId: string, holdout: Bar[]) {
    const digest = marketDataDigest(holdout);
    return this.db.transaction(() => {
      const row = this.row(seriesId), registration = JSON.parse(row.registration) as SeriesRegistration;
      if (row.status === "open") throw new Error("Lock a candidate before revealing holdout prices");
      if (digest !== registration.holdoutDigest || holdout.length !== registration.holdoutBars ||
          holdout[0].time <= registration.developmentBars.at(-1)!.time) throw new Error("Holdout differs from preregistration or overlaps development");
      if (row.final_report) return {duplicate:true,report:JSON.parse(row.final_report)};
      const trial = this.db.prepare("SELECT * FROM strategy_trials WHERE id=? AND series_id=?").get(row.locked_trial,seriesId) as TrialRow;
      const settings = JSON.parse(trial.settings) as TrialSettings;
      // One final window: the precommitted selector fits once on preceding data,
      // never chooses a different protocol after seeing the holdout outcome.
      const report = researchStrategies({...settings, symbol:registration.symbol, provenance:registration.provenance,
        bars:[...registration.developmentBars.slice(-settings.trainSize),...holdout],testSize:holdout.length});
      this.db.prepare("UPDATE strategy_series SET status='evaluated',final_report=? WHERE id=?").run(JSON.stringify(report),seriesId);
      this.audit(seriesId,"finalize",{trialId:row.locked_trial,holdoutDigest:digest,decision:report.decision});
      return {duplicate:false,report};
    }).immediate();
  }
  snapshot(seriesId: string) {
    const row = this.row(seriesId), registration = JSON.parse(row.registration) as SeriesRegistration;
    return {seriesId,status:row.status,symbol:registration.symbol,provenance:registration.provenance,source:registration.source,
      maxTrials:registration.maxTrials,holdoutDigest:registration.holdoutDigest,lockedTrial:row.locked_trial,
      trials:this.db.prepare("SELECT id,created_at FROM strategy_trials WHERE series_id=? ORDER BY rowid").all(seriesId),
      finalReport:row.final_report ? JSON.parse(row.final_report) : null,
      audit:this.db.prepare("SELECT action,detail,created_at FROM strategy_series_audit WHERE series_id=? ORDER BY id").all(seriesId),
      authority:"paper research only; protocol enforcement within this database, not verified unseen data or live trading permission"};
  }

  /** Read-only feedback for a NEW research series. No holdout data from this
   * series or from overlapping/future periods may influence its candidate set.
   * Losses suppress repeat candidates; wins authorize only further research. */
  learning(seriesId: string, settings: TrialSettings) {
    const target = JSON.parse(this.row(seriesId).registration) as SeriesRegistration;
    // Reuse all existing bounds before producing an actionable proposal.
    researchStrategies({...settings, symbol:target.symbol, provenance:target.provenance, bars:target.developmentBars});
    const key = (v: TrialSettings['variants'][number]) => hash([v.family,v.lookback,v.thresholdBps,v.stopBps,v.targetBps]);
    const rows = this.db.prepare(`SELECT s.id,s.registration,s.final_report,t.settings,t.report
      FROM strategy_series s JOIN strategy_trials t ON t.id=s.locked_trial AND t.series_id=s.id
      WHERE s.status='evaluated' AND s.id<>?
      ORDER BY json_extract(s.final_report,'$.evaluation.windows[0].testEnd'),s.id`).all(seriesId) as {
        id:string;registration:string;final_report:string;settings:string;report:string;
      }[];
    const lessons: {seriesId:string;keys:string[];start:number;end:number;netCents:number;trades:number;developmentNetPerBar:number;finalNetPerBar:number;rejectedPlans:number;drawdownFraction:number}[]=[];
    let excluded=0;
    for(const row of rows) {
      const registration=JSON.parse(row.registration) as SeriesRegistration;
      const priorSettings=JSON.parse(row.settings) as TrialSettings;
      const final=JSON.parse(row.final_report) as ReturnType<typeof researchStrategies>;
      const development=JSON.parse(row.report) as ReturnType<typeof researchStrategies>;
      const window=final.evaluation.windows[0];
      if(registration.symbol!==target.symbol||registration.provenance!==target.provenance||!window||
        window.testEnd>=target.developmentBars[0].time||lessons.some(l=>window.testStart<=l.end&&window.testEnd>=l.start)||
        hash(priorSettings.friction)!==hash(settings.friction)||priorSettings.equityCents!==settings.equityCents) {excluded++;continue;}
      const selected=new Set(final.selections.map(s=>s.selectedId));
      lessons.push({seriesId:row.id,keys:priorSettings.variants.filter(v=>selected.has(v.id)).map(key),start:window.testStart,end:window.testEnd,
        netCents:final.evaluation.netPnlCents,trades:final.evaluation.trades.length,rejectedPlans:final.evaluation.rejectedPlans,
        developmentNetPerBar:development.evaluation.netPnlCents/(development.evaluation.windows.length*priorSettings.testSize),
        finalNetPerBar:final.evaluation.netPnlCents/registration.holdoutBars,
        drawdownFraction:final.evaluation.ohlcDrawdownUpperBoundCents/settings.equityCents});
    }
    const candidates=settings.variants.map(variant=>{
      const history=lessons.filter(l=>l.keys.includes(key(variant)));
      const latest=history.at(-1);
      const blocked=!!latest&&(latest.netCents<=0||latest.trades===0||latest.rejectedPlans>0||latest.drawdownFraction>settings.maxTrainingClosedDrawdownFraction);
      return {variantId:variant.id,observations:history.length,
        outcomeSensitivity:outcomeSensitivity(history.map(l=>l.netCents)),
        decision:blocked?'pause-and-revalidate':history.length?'fresh-paper-validation-only':'unproven',
        latest:latest??null,netCents:history.reduce((n,l)=>n+l.netCents,0),
        edgeDecay:latest?latest.finalNetPerBar<latest.developmentNetPerBar:null};
    });
    const allowed=new Set(candidates.filter(c=>c.decision!=='pause-and-revalidate').map(c=>c.variantId));
    const proposedVariants=settings.variants.filter(v=>allowed.has(v.id));
    return {mode:'paper-learning-only',provenance:target.provenance,candidates,excludedSeries:excluded,
      knowledge:tradingKnowledge(),
      evidenceDigest:hash(lessons),nextSettings:proposedVariants.length?{...settings,variants:proposedVariants}:null,
      decision:proposedVariants.length?'bounded-research-proposal':'preserve-capital',liveAuthorized:false,
      limitations:'Descriptive, non-overlapping past-window feedback, not statistical independence or a probability of profit. Synthetic and historical-unverified evidence never mix. No budget, risk or live permission is changed. New testing requires a separate preregistered holdout; no automatic retuning of a revealed holdout.'};
  }

  /** Atomically apply past evidence to a bounded development trial. Never
   * reveals the target holdout or grants execution authority. */
  learnedTrial(seriesId: string, settings: TrialSettings) {
    return this.db.transaction(() => {
      if (this.row(seriesId).status !== 'open') throw new Error('Research protocol locked; no learned trials');
      const feedback = this.learning(seriesId, settings);
      if (!feedback.nextSettings) return { feedback, trial: null, liveAuthorized: false };
      const trial = this.trial(seriesId, feedback.nextSettings);
      if (!trial.duplicate) this.audit(seriesId, 'learned-trial', { trialId: trial.trialId, evidenceDigest: feedback.evidenceDigest });
      return { feedback, trial, liveAuthorized: false };
    }).immediate();
  }
}
