import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewState} from './trade-review.mjs';
test('review rejects absent, expired, malformed and unverified tickets',()=>{
 const now=Date.now();const p={decision:'PROPOSAL',symbol:'EURUSD',side:'BUY',entry:1.1,stop:1.09,target:1.12,lots:.01,plannedLoss:1,margin:30,estimatedCosts:.1,observedAt:new Date(now).toISOString(),expiresAt:new Date(now+15000).toISOString(),rationale:'test fixture',invalidation:'test fixture',riskChecked:true,costsVerified:true};
 assert.equal(reviewState(p,now).canAcknowledge,true);
 for(const v of [null,{...p,stop:1.2},{...p,lots:NaN},{...p,costsVerified:false},{...p,decision:'NO_TRADE'}])assert.equal(reviewState(v,now).canAcknowledge,false);
 assert.equal(reviewState(p,now+15000).canAcknowledge,false);
 assert.equal(reviewState(p,now).executionEnabled,false);
});
