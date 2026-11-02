import test from 'node:test';import assert from 'node:assert/strict';
import {selectResearchSource,cleanResearchMarkdown,researchGoalFor} from './founder-source-quality.mjs';
test('specific PR goal targets that PR within the evidenced public repository, not an unrelated issue',()=>{
 const sources=[{url:'https://github.com/Presago-Labs/presago/issues/29',claim:'Unrelated issue'}];
 const r=selectResearchSource(sources,'Presago-Labs/presago: PR #142 Status prüfen',u=>u);
 assert.equal(r.url,'https://github.com/Presago-Labs/presago/pull/142');
 assert.equal(r.claim,undefined); // A derived retrieval target is not evidence about the PR.
 assert.equal(selectResearchSource(sources.map(s=>({...s,privacy:'private'})),'Presago-Labs/presago: PR #142 Status prüfen',u=>u),null);
});
test('older queued tasks recover the goal from their single originating research task',()=>{
 const task={input:{title:'Eine Quelle vertiefen'},dependencies:['parent']},history=[{id:'parent',input:{title:'target-repo: Status prüfen'}}];
 assert.equal(researchGoalFor(task,history),'target-repo: Status prüfen');
 assert.equal(researchGoalFor({...task,input:{researchGoal:'Explicit goal'}},history),'Explicit goal');
});
test('repository-specific research rejects an unrelated first result and selects the matching project',()=>{
 const sources=[{url:'https://github.com/asyncapi/website',claim:'A guide'},{url:'https://github.com/scaffold-studio-hq/scaffold-studio-mcp/pull/120',claim:'PR status'}];
 assert.equal(selectResearchSource(sources,'scaffold-studio-mcp: Nachfolge-PR zu #120 prüfen',u=>u),sources[1]);
 assert.equal(selectResearchSource(sources.slice(0,1),'scaffold-studio-mcp: Nachfolge-PR zu #120 prüfen',u=>u),null);
 assert.equal(selectResearchSource([{...sources[1],privacy:'private'}],'scaffold-studio-mcp: prüfen',u=>u),null);
 assert.equal(selectResearchSource([{url:'https://github.com/other/presago',claim:'Wrong fork'}],'Presago-Labs/presago: Status prüfen',u=>u),null);
});
test('GitHub interface is removed before the content limit, preserving useful content and code',()=>{
 const body='# Contribution rules\n\nWait for approval before work.\n\n```js\nconst label = "Blame";\n```';
 const raw='You signed in with another tab or window.\n'+('Navigation '.repeat(600))+'\nEdit and raw actions\n\n'+body;
 assert.equal(cleanResearchMarkdown(raw,'https://github.com/org/repo/blob/main/readme.md'),body);
 assert.equal(cleanResearchMarkdown('Sign in\nYou must be signed in to make or propose changes','https://github.com/org/repo'),'');
 assert.equal(cleanResearchMarkdown('A normal document\n\nUseful facts','https://docs.python.org/'),'A normal document\n\nUseful facts');
});
