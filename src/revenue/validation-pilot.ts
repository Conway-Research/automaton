import type {Database} from 'better-sqlite3';
import {ResearchStore} from './research.js';
import {planResearchExperiment} from './research-handoff.js';
import {registerOutcomeContract,type OutcomeContract} from './outcome.js';

/** Operator entrypoint: bind a fully cited proposal to demand criteria atomically, without funding. */
export function prepareValidationPilot(db:Database,input:{researchId:string;mode:'live'|'test';reviewedBy:string;revisionReason?:string},apply=false){
  if(!input||typeof input.researchId!=='string'||!input.researchId.trim()||input.researchId.length>100||
    // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
    !['live','test'].includes(input.mode)||typeof input.reviewedBy!=='string'||!input.reviewedBy.trim()||input.reviewedBy.trim()!==input.reviewedBy||input.reviewedBy.length>200||/[\u0000-\u001f\u007f]/.test(input.reviewedBy))
    throw Error('Explicit research ID, test/live evidence mode and bounded reviewer required');
  const operation=()=>{
    const brief=new ResearchStore(db).economicBrief(input.researchId),validation=brief.validation;
    if(validation.stage!=='pilot-design'||!validation.outcomeContractProposal)throw Error('Current complete economic citations and eligible pilot design required');
    const proposal=validation.outcomeContractProposal;
    const contract:OutcomeContract={minimumQualifiedCustomers:proposal.minimumQualifiedCustomers,minimumPaidOrders:proposal.minimumPaidOrders,
      evidenceMaxAgeMs:proposal.evidenceMaxAgeMs,mode:input.mode,reviewedBy:input.reviewedBy};
    if(!apply)return {applied:false,researchId:input.researchId,contract,executionAuthorized:false,capitalCreditedCents:0,
      limitation:'Demand criteria only. Individual success criteria, net profit, delivery and reinvestment require separate evidence.'};
    const planned=planResearchExperiment(db,input.researchId,input.revisionReason);
    const registered=registerOutcomeContract(db,planned.experimentId,contract);
    return {applied:true,researchId:input.researchId,experimentId:planned.experimentId,duplicate:planned.duplicate&&registered.duplicate,
      contract,executionAuthorized:false,capitalCreditedCents:0,
      limitation:'Planning and demand preregistration do not start tasks or fund execution. Test mode never proves live demand or profit.'};
  };
  return apply?db.transaction(operation).immediate():db.transaction(operation)();
}
