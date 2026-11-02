import Database from 'better-sqlite3';
import {SCHEMA_VERSION} from '../state/schema.js';
import {initializeCapitalBudget,checkCapitalBudget,type CapitalPolicy} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';

export interface SetupProposal {
  capital: CapitalPolicy;
  inference: {dailyCents:number;hourlyCents:number;sessionCents:number;callCents:number};
}

/** A disposable in-memory rehearsal, never a capital receipt or execution grant. */
export function rehearseSetup(file:string,proposal:SetupProposal) {
  const limits=proposal?.inference;
  if(!limits||![limits.dailyCents,limits.hourlyCents,limits.sessionCents,limits.callCents].every(n=>Number.isSafeInteger(n)&&n>0&&n<=100_000_000))
    throw new Error('Explicit positive bounded inference limits are required');
  if(!proposal.capital)throw new Error('Explicit hypothetical capital and FX proposal required');
  // Snapshot only selected numeric inputs. Caller-owned objects cannot change mid-check.
  const capital={...proposal.capital};
  const requested={daily_cents:limits.dailyCents,hourly_cents:limits.hourlyCents,session_cents:limits.sessionCents,call_cents:limits.callCents,halted:0,revision:1};
  let source:Database.Database|undefined,copy:Database.Database|undefined;
  let stage='source';
  try {
    source=new Database(file,{readonly:true,fileMustExist:true,timeout:100});
    const snapshot=source.transaction(()=>{
      const version=(source!.prepare('SELECT MAX(version) n FROM schema_version').get() as {n:number}).n;
      if(version!==SCHEMA_VERSION)throw new Error();
      const pages=source!.pragma('page_count',{simple:true}) as number;
      const pageSize=source!.pragma('page_size',{simple:true}) as number;
      if(!Number.isSafeInteger(pages*pageSize)||pages*pageSize>128*1024*1024)throw new Error();
      return source!.serialize();
    })();
    source.close();source=undefined;
    // SQLite deserialize requires rollback-journal header versions (its API
    // documents bytes 18/19 = 0x01 for a serialized WAL snapshot). Only this
    // disposable buffer is changed; serialize already includes committed WAL data.
    snapshot[18]=1;snapshot[19]=1;
    copy=new Database(snapshot);
    stage='proposal';
    const effective=copy.transaction(()=>{
      initializeCapitalBudget(copy!,capital);
      return registerBudgetPolicy(copy!,requested);
    }).immediate();
    stage='ledger';
    const headroom=checkCapitalBudget(copy,0);
    const callCapital=checkCapitalBudget(copy,effective.call_cents!);
    const pending=(copy.prepare("SELECT COALESCE(SUM(reserved_cents),0) n FROM inference_reservations WHERE status='pending'").get() as {n:number}).n;
    const pendingCount=(copy.prepare("SELECT COUNT(*) n FROM inference_reservations WHERE status='pending'").get() as {n:number}).n;
    const blockers:string[]=[];
    if(effective.halted!==0)blockers.push('inference_halted');
    if(!headroom.allowed||(headroom.remainingChfCents??0)<=0)blockers.push('capital_unavailable');
    if(!callCapital.allowed)blockers.push('call_ceiling_exceeds_available_capital');
    if(['daily_cents','hourly_cents','session_cents','call_cents'].some(key=>{
      const value=effective[key as keyof typeof effective];return value===null||!Number.isSafeInteger(value)||value<=0;
    }))blockers.push('effective_inference_limit_not_positive');
    if(['daily_cents','hourly_cents','session_cents'].some(key=>{
      const value=effective[key as keyof typeof effective];return value!==null&&effective.call_cents!==null&&effective.call_cents>value;
    }))blockers.push('call_ceiling_exceeds_enclosing_limit');
    if(pendingCount>0)blockers.push('unresolved_inference_reservations');
    return {
      product:'Obolus',mode:'isolated-setup-rehearsal',productionChanged:false,startsAgent:false,liveReady:false,
      capitalVerified:false,fxVerified:false,effectiveInference:effective,
      projectedCapital:{allowed:headroom.allowed,remainingChfCents:headroom.remainingChfCents??0},
      callCeilingFitsCapital:callCapital.allowed,unresolvedInferenceCents:pending,unresolvedInferenceCount:pendingCount,
      blocked:blockers.length>0,blockers,
      limitation:'Hypothetical configuration on an in-memory snapshot only. No funds, FX rate, provider access or profit verified. Existing tighter limits, halts and liabilities are preserved. This is not live admission; hourly, daily, session, experiment and adapter checks remain mandatory.',
    };
  } catch {
    // Neither malformed stored JSON nor SQLite details may expose private contents.
    throw new Error(stage==='source'?'Existing compatible database required (maximum 128 MiB); no migration performed':
      stage==='proposal'?'Proposal invalid or conflicts with existing immutable configuration; no production changes':
      'Stored liabilities require reconciliation; no production changes');
  } finally {copy?.close();source?.close();}
}
