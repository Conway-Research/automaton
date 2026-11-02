import test from 'node:test';import assert from 'node:assert/strict';import {sourceExcerpt} from './founder-source-excerpt.mjs';
test('late merge event preserves commit, date and explicit partial coverage within existing cap',()=>{
 const text='## Conversation\n'+'intro '.repeat(390)+'\nkaizercodes\nmerged commit [`b3645e0`](https://github.com/o/r/commit/b3645e0)\ninto\nmain [Oct 10, 2026](https://github.com/o/r/pull/142#event-1)\n'+'footer '.repeat(200);
 const r=sourceExcerpt({url:'https://github.com/o/r/pull/142',claim:text});assert.match(r.claim,/merged commit/);assert.match(r.claim,/b3645e0/);assert.match(r.claim,/Oct 10, 2026/);assert.ok(r.claim.length<=450);assert.equal(r.excerpt.truncated,true);assert.equal(r.excerpt.complete,false);
});
test('literal escaped newlines and JSON status evidence survive; generic and short sources preserve text',()=>{
 const r=sourceExcerpt({url:'https://github.com/o/r/pull/142',claim:'x'.repeat(1000)+'\\nmerged commit abc\\nmain Oct 10, 2026'});assert.match(r.claim,/merged commit abc/);
 const j=sourceExcerpt({url:'https://github.com/o/r/pull/142',claim:'x'.repeat(900)+' {"state":"closed","merged":false,"merged_at":null}'});assert.match(j.claim,/"merged":false/);
 assert.equal(sourceExcerpt({url:'https://example.com',claim:'normal'}).claim,'normal');assert.equal(sourceExcerpt({url:'https://github.com/o/r',claim:'No merge evidence'}).claim,'No merge evidence');
});
