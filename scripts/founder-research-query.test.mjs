import test from 'node:test';import assert from 'node:assert/strict';import {publicResearchQuery} from './founder-research-query.mjs';
test('repair query is scoped to a publicly evidenced repository and excludes the private goal text',()=>{
 const target='https://github.com/owner/project/pull/1';const task={input:{title:'SECRET_CUSTOMER',repairTargetUrl:target}};
 const query=publicResearchQuery({task,dependencies:[{sources:[{url:target}]}]},'fallback');assert.equal(query,'site:github.com/owner/project issues pull requests status');
 assert.equal(publicResearchQuery({task,dependencies:[{privacy:'private',sources:[{url:target}]}]},'fallback'),'fallback');
});
test('targeted research uses only title terms present in public evidence and never private text',()=>{
 const ctx={task:{input:{title:'Investigate Python regression testing SECRET_TOKEN privatecustomer'}},dependencies:[{sources:[{claim:'Python regression testing documentation',privacy:'public'}]},{privacy:'private',sources:[{claim:'SECRET_TOKEN privatecustomer'}]}]};
 assert.equal(publicResearchQuery(ctx,'fallback'),'python regression testing');assert.equal(publicResearchQuery({task:{input:{title:'SECRET_TOKEN'}},dependencies:[]},'fallback'),'fallback');
});
