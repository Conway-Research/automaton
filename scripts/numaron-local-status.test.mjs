import test from 'node:test';import assert from 'node:assert/strict';import {evaluateLocalStatus} from './numaron-local-status.mjs';
test('only consistent same-process ON evidence is admitted',()=>{
 const now=1000000,input={power:{enabled:true,revision:4,changedAt:new Date(950000).toISOString()},samePower:true,runtime:{pid:101,startedAt:new Date(900000).toISOString()},processInfo:{pid:101,createdAt:new Date(899000).toISOString(),expectedCommand:true,ownsPort:true},controller:{status:'running'},latestAt:999000,now};assert.equal(evaluateLocalStatus(input).confirmedOn,true);
 for(const change of [{power:{...input.power,enabled:false}},{samePower:false},{processInfo:{...input.processInfo,createdAt:new Date(999999).toISOString()}},{controller:{status:'stopped'}}])assert.equal(evaluateLocalStatus({...input,...change}).confirmedOn,false);
});

test('order status is independent of broker observation availability',()=>{
 const now=1000000,input={power:{enabled:true,revision:4,changedAt:new Date(950000).toISOString()},samePower:true,runtime:{pid:101,startedAt:new Date(900000).toISOString()},processInfo:{pid:101,createdAt:new Date(899000).toISOString(),expectedCommand:true,ownsPort:true},controller:{status:'running'},latestAt:1,now};
 for(const latestAt of [1,null]){const result=evaluateLocalStatus({...input,latestAt});assert.equal(result.confirmedOn,true);assert.equal(result.fresh,false);}
 for(const change of [{samePower:false},{power:{...input.power,enabled:false}},{controller:{status:'stopped'}},{processInfo:{...input.processInfo,ownsPort:false}},{processInfo:{...input.processInfo,expectedCommand:false}},{processInfo:{...input.processInfo,pid:102}}])assert.equal(evaluateLocalStatus({...input,...change}).confirmedOn,false);
});
