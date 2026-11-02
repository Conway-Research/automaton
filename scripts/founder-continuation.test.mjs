import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticContinuation} from '../web/founder/model.mjs';
test('scheduled retries and daily capacity waiting need no manual confirmation',()=>{
 assert.match(automaticContinuation({status:'failed',nextRetryAt:Date.now()+60000,automaticRetryScheduled:true}),/automatisch/);
 assert.match(automaticContinuation({status:'blocked',reason:'Budget daily limit'}),/automatisch/);
 assert.match(automaticContinuation({status:'blocked',reason:'Voraussetzung nicht erfolgreich abgeschlossen.'}),/Vorarbeit/);
 assert.equal(automaticContinuation({status:'failed',reason:'Unklare Kosten'}),null);
 assert.equal(automaticContinuation({status:'done',nextRetryAt:1}),null);
});
