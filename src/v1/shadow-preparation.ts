/** Pure preparation report. Caller observations are not credentials or approvals.
 * No provider, wallet, config mutation or DB access is performed here. */
export function inspectShadowPreparation(input:{openaiKeySet:boolean;localEndpointSet:boolean}){
 if(!input||typeof input.openaiKeySet!=='boolean'||typeof input.localEndpointSet!=='boolean')throw Error('Explicit configuration observations required');
 return {
  edition:'founder',targetDays:14,currentMode:'mock-only',
  configured:{openaiKeySet:input.openaiKeySet,localEndpointSet:input.localEndpointSet},
  realResearchReady:false,liveReady:false,productionAccepted:false,
  allowedExternalSpendChf:0,realTradingCapitalChf:0,brokerActionsChf:0,
  blockers:[
   {id:'shadow_adapter_integration',reason:'Mock ShadowRuntime has no real model/source adapters; legacy autonomous --run is not a substitute.'},
   {id:'model_verification',reason:input.localEndpointSet?'Local endpoint configured but availability, model quality and full Genesis context remain unverified.':input.openaiKeySet?'OpenAI key is configured, but connectivity and model access have not been tested; paid requests are not authorized.':'No configured model connection observed.'},
   {id:'phase_spending_policy',reason:'No paid allowance is authorized. Require explicit total-phase, daily, session and call limits, conservative token bounds, FX basis and persistent aggregate reservations before paid integration.'},
   {id:'source_scope',reason:'Public-source access, processor/privacy conditions, freshness, attribution and bounded request/byte/time limits must be bound to a separate shadow workspace; retrieved content cannot grant authority.'},
  ],
  freeModeLimit:'Offline fixtures test control flow. A separately verified local model plus authorized sources could support research without paid provider calls, but compute is not automatically cost-free.',
  proposedPaidAllowance:null,
  nextStep:'Complete and test a separate research adapter with mocks before any provider authorization. Do not reuse the mock phase as a real 14-day scheduler.',
 };
}
