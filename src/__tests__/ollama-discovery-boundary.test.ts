import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createDatabase,modelRegistryGet,modelRegistryUpsert} from '../state/database.js';
import {discoverOllamaModels} from '../ollama/discover.js';
let db:ReturnType<typeof createDatabase>;
beforeEach(()=>{db=createDatabase(':memory:');});
afterEach(()=>{vi.unstubAllGlobals();db.close();});
it.each([null,{models:[null]},{models:[{name:42}]},{models:[{name:'../unsafe'}]}])('handles malformed discovery without registering a model: %j',payload=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(payload))));
 return expect(discoverOllamaModels('http://localhost:11434',db.raw)).resolves.toEqual([]);
});
it('does not overwrite a model owned by another provider or duplicate discovery results',async()=>{
 modelRegistryUpsert(db.raw,{modelId:'protected',provider:'openai',displayName:'Protected',tierMinimum:'normal',
  costPer1kInput:1,costPer1kOutput:2,maxTokens:2000,contextWindow:8000,supportsTools:true,supportsVision:false,
  parameterStyle:'max_tokens',enabled:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 const before=modelRegistryGet(db.raw,'protected');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({models:[{name:'protected'},{name:'llama3:latest'},{name:'llama3:latest'}]}))));
 expect(await discoverOllamaModels('http://localhost:11434',db.raw)).toEqual(['llama3:latest']);
 expect(modelRegistryGet(db.raw,'protected')).toEqual(before);
 expect(modelRegistryGet(db.raw,'llama3:latest')?.provider).toBe('ollama');
});
