import test from 'node:test';import assert from 'node:assert/strict';import {validateMonitorHandoff} from './numaron-monitor-setup.mjs';
test('handoff requires paused scheduler and affirmative completed-thread proof',()=>{
 const proof={threadId:'abc',status:'completed',noActiveOrderRuns:true,completion:'artifacts/order-monitor-20261017-1914/completion.json'};assert.equal(validateMonitorHandoff('status = "PAUSED"\ntarget_thread_id = "abc"',proof),true);
 for(const [text,p] of [['status = "ACTIVE"\ntarget_thread_id = "abc"',proof],['status = "PAUSED"\ntarget_thread_id = "wrong"',proof],['status = "PAUSED"\ntarget_thread_id = "abc"',{...proof,status:'inProgress'}],['status = "PAUSED"\ntarget_thread_id = "abc"',{...proof,noActiveOrderRuns:false}]])assert.throws(()=>validateMonitorHandoff(text,p));
});
