import {expect,it} from 'vitest';
import {inspectShadowPreparation} from '../v1/shadow-preparation.js';
it.each([[false,false],[true,false],[false,true],[true,true]])('configuration observations never grant spending or research admission (%s/%s)',(openaiKeySet,localEndpointSet)=>{
 const report=inspectShadowPreparation({openaiKeySet,localEndpointSet});
 expect(report).toMatchObject({realResearchReady:false,liveReady:false,productionAccepted:false,allowedExternalSpendChf:0,brokerActionsChf:0,proposedPaidAllowance:null});
 expect(report.blockers.map(b=>b.id)).toEqual(['shadow_adapter_integration','model_verification','phase_spending_policy','source_scope']);
});
it('rejects unknown configuration observations',()=>{
 expect(()=>inspectShadowPreparation({openaiKeySet:'yes',localEndpointSet:false} as never)).toThrow();
});
