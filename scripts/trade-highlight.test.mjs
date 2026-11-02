import test from 'node:test';import assert from 'node:assert/strict';
import {tradeHighlight,renderTradeHighlight} from '../web/founder/trading.mjs';
const now=Date.parse('2026-10-14T00:00:00Z');
const setup={symbol:'EURUSD',side:'BUY',entry:1.1,stop:1.09,target:1.12,expiresAt:new Date(now+30000).toISOString(),costsVerified:true,riskChecked:true,lots:.01,plannedLoss:20,newsChecked:true,costEvaluation:{verified:true,netRewardRisk:1.8,stressNetTarget:30,stressStopLoss:20},assessment:{status:'validated',reasons:[]}};
const radar=()=>({status:'setups',observedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString(),setups:[structuredClone(setup)],evaluation:{stale:false,history:{reports:[{symbol:'EURUSD',profitabilityProven:true}]},news:{feeds:[{status:'read'}]}}});
test('fully checked current suggestion is highlighted',()=>{assert.equal(tradeHighlight(radar(),now).status,'recommendation');});
test('research signal is never presented as a verified recommendation',()=>{const r=radar();r.setups[0].assessment.status='not-validated';assert.equal(tradeHighlight(r,now).status,'research');});
test('expiry, pause, future observation or missing data clear highlight',()=>{for(const status of ['paused','stale','data-missing'])assert.equal(tradeHighlight({...radar(),status},now).candidate,null);assert.equal(tradeHighlight(radar(),now+30001).candidate,null);assert.equal(tradeHighlight({...radar(),observedAt:new Date(now+5000).toISOString()},now).candidate,null);});
test('every cost risk news and history gate is required',()=>{for(const key of ['costsVerified','riskChecked','newsChecked']){const r=radar();r.setups[0][key]=false;assert.equal(tradeHighlight(r,now).status,'research');}const r=radar();r.evaluation.stale=true;assert.equal(tradeHighlight(r,now).status,'research');r.evaluation.stale=false;r.evaluation.history.reports[0].profitabilityProven=false;assert.equal(tradeHighlight(r,now).status,'research');});

test('invalid price geometry and negative stressed payoff cannot become recommendation',()=>{const r=radar();r.setups[0].stop=1.2;assert.equal(tradeHighlight(r,now).candidate,null);const q=radar();q.setups[0].costEvaluation.stressNetTarget=-1;assert.equal(tradeHighlight(q,now).status,'research');});

test('visible banner and tab title clear on expiry without repeating unchanged announcements',()=>{
 const previous=globalThis.document;const node=()=>({dataset:{},children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});globalThis.document={title:'',createElement:node};
 try{const box=node();renderTradeHighlight(box,radar(),now);assert.equal(box.dataset.state,'recommendation');assert.match(document.title,/Tradeempfehlung/);const first=box.children;renderTradeHighlight(box,radar(),now);assert.equal(box.children,first);renderTradeHighlight(box,radar(),now+30001);assert.equal(box.dataset.state,'none');assert.equal(document.title,'numaron · Founder Studio');assert.doesNotMatch(JSON.stringify(box.children),/EURUSD/);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
