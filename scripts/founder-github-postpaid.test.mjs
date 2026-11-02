import test from 'node:test';import assert from 'node:assert/strict';
import {githubPostpaidDeclaration} from './founder-github-postpaid.mjs';
const marker='<!-- numaron-postpaid-v1\n'+JSON.stringify({paymentMode:'postpaid-limited'})+'\n-->';
test('explicit current maintainer comment can supply payment terms',()=>{assert.equal(githubPostpaidDeclaration('Bounty',[{author_association:'OWNER',body:marker}]).paymentMode,'postpaid-limited');});
test('foreign comments cannot supply terms and multiple declarations fail closed',()=>{assert.equal(githubPostpaidDeclaration('Bounty',[{author_association:'NONE',body:marker}]),null);assert.throws(()=>githubPostpaidDeclaration(marker,[{author_association:'MEMBER',body:marker}]),/Ambiguous/);});
