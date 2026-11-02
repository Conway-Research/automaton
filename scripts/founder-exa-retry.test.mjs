import test from 'node:test';import assert from 'node:assert/strict';import {nextExaAttempt,transientExaFailure} from './founder-exa-retry.mjs';
test('transient errors retry after five then ten minutes, with three attempts per window',()=>{
 const now=21600000+1000,last={at:now,status:'failed:service_dns_failed'},windowEnd=43200000;
 assert.equal(nextExaAttempt({now,last,count:1,windowEnd}),now+300000);
 assert.equal(nextExaAttempt({now,last,count:2,windowEnd}),now+600000);
 assert.equal(nextExaAttempt({now,last,count:3,windowEnd}),windowEnd);
 for(const status of ['succeeded','attempted','failed:service_no_results','failed:service_tool_error','failed:service_unauthorized','failed:service_read_failed:404'])assert.equal(nextExaAttempt({now,last:{...last,status},count:1,windowEnd}),windowEnd);
 assert.equal(transientExaFailure('service_read_failed',503),true);
});
test('provider retry-after survives window rollover',()=>{
 assert.equal(nextExaAttempt({now:43201000,last:{at:43199000,status:'failed:service_rate_limited',retry_after_ms:3600000},count:0,windowEnd:64800000}),46799000);
});
test('window rollover does not allow immediate retry of a just failed or in-flight request',()=>{
 for(const status of ['attempted','failed:service_network_failed'])assert.equal(nextExaAttempt({now:43201000,last:{at:43199000,status},count:0,windowEnd:64800000}),43499000);
});
