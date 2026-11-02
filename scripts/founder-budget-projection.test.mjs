import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openFounderRuntime} from './founder-runtime.mjs';

test('budget-only runtime projection matches full budget and is a fresh defensive value',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'budget-projection-'));
 const runtime=openFounderRuntime({base,adapters:{},activate:false,isEnabled:()=>false});
 try{
  const expected=runtime.snapshot().budget;
  assert.deepEqual(runtime.budgetSnapshot(),expected);
  const changed=runtime.budgetSnapshot();changed.periodRappen=-1;
  assert.deepEqual(runtime.budgetSnapshot(),expected);
 }finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}
});
