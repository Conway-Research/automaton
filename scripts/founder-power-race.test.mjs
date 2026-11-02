import test from 'node:test';import assert from 'node:assert/strict';import {createOrderFlow} from './founder-order-flow.mjs';
test('switching off during offline preparation prevents the subsequent provider request',async()=>{
 let on=true,finish,reads=0;
 const flow=createOrderFlow({directory:'.',github:{async read(){reads++;return {login:'tricebr'}},snapshot:()=>[],close(){}},sandbox:{available:true,refresh:()=>new Promise(r=>finish=r)},code:{available:true}});
 try{const pending=flow.refresh({isEnabled:()=>on});await new Promise(r=>setImmediate(r));on=false;finish();await pending;assert.equal(reads,0)}finally{flow.close()}
});
