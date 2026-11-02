import {bounded,checkedJSON} from '../founder-restoration-integrity.mjs';
export const coreOrderSources=Object.freeze(['github','ugig','dealwork','synmerco','guru','gmail','arcbounty','bidpostloop']);
const requirements={github:'Authenticated own assignment and source-specific funding reader required',ugig:'Reviewed application/delivery contract and current own assignment required',dealwork:'Exact own native contract, deliverable channel and escrow proof required',synmerco:'Exact own intent assignment, escrow and platform submission contract required',guru:'Authenticated account and official restricted notification/action contract required',gmail:'Existing account/label, customer/order identity and recipient-specific communication grant required',arcbounty:'Official application/delivery contract required; pool labels are not funding',bidpostloop:'Official application/delivery contract required; credit labels are not payment'};
/** This catalog connects every core source to the same execution interface.
 * Descriptions are blockers, never grants. Implementations are application code,
 * not JSON executable declarations or generated candidate modules. */
export function createOrderSources({registry,implementations=[]}){
 const sources=registry.snapshot().sources,result=[];const ids=new Set();
 for(const implementation of implementations){if(!bounded(implementation.sourceId)||ids.has(implementation.sourceId)||!sources.some(s=>s.id===implementation.sourceId)||typeof implementation.verify!=='function'||!bounded(implementation.evidenceRef,2000))throw Error('Unique known reviewed source implementation required');ids.add(implementation.sourceId);result.push(implementation);}
 for(const name of coreOrderSources){const matches=sources.filter(s=>s.aliases.some(a=>a.toLowerCase()===name));if(matches.length>1)throw Error('Ambiguous core source alias');const source=matches[0];if(!source||ids.has(source.id))continue;ids.add(source.id);result.push({sourceId:source.id,name,profiles:[],evidenceRef:'core-catalog:'+name,methods:{},verify:()=>false,blocker:requirements[name]});}
 return result;
}
/** Historical ownership is retained without scheduling any new work or deriving
 * a fresh assignment, scope, funding or family allowance from an old receipt. */
export function importHistoricalOwnOrders({store,registry,registrations}){
 let inserted=0;for(const raw of registrations){const r=checkedJSON(raw);if(r.owner!=='tricebr'||r.provider!=='github'||!bounded(r.id)||!/^artifacts\/[\w.-]+\/completion\.json$/.test(r.provenance??''))throw Error('Reviewed historical ownership required');const source=registry.snapshot().sources.find(s=>s.aliases.some(a=>a.toLowerCase()==='github'));if(!source)continue;
  if(store.register({sourceId:source.id,externalId:r.externalId,ownerId:r.owner,rootTaskId:r.id,sourceRevision:'historical-ownership',state:'historical',termsVerified:false,provenance:{type:'reviewed-local-registration',evidenceRef:r.provenance,ownerId:r.owner}}))inserted++;
 }return inserted;
}
