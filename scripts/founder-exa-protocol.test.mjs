import test from 'node:test';import assert from 'node:assert/strict';import {exaResult,exaSources} from './founder-exa-protocol.mjs';
test('Exa accepts structured JSON, legacy text and multiline SSE while distinguishing tool errors',()=>{
 const result={structuredContent:{results:[{url:'https://github.com/org/repo/issues/1',title:'New task',text:'Public details'}]}};
 assert.equal(exaSources(exaResult(JSON.stringify({id:1,result})))[0].url,'https://github.com/org/repo/issues/1');
 assert.equal(exaSources(exaResult('event: message\ndata: {"id":1,\ndata: "result":'+JSON.stringify(result)+'}\n\n')).length,1);
 assert.equal(exaSources({content:[{type:'text',text:'Title: Test\nURL: https://github.com/org/repo\nText: Useful facts'}]}).length,1);
 assert.throws(()=>exaResult(JSON.stringify({id:1,result:{isError:true,content:[{text:'SECRET'}]}})),e=>e.diagnostic.code==='service_tool_error'&&!e.message.includes('SECRET'));
 assert.throws(()=>exaResult('invalid'),e=>e.diagnostic.code==='service_invalid_response');
 assert.equal(exaSources({content:[{type:'text',text:'No results found'}]}).length,0);
});
