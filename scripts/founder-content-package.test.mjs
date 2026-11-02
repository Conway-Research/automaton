import test from 'node:test';import assert from 'node:assert/strict';
import {validateContentBrief,checkContentPackage,contentPackageFiles} from './founder-content-package.mjs';
import {digest} from './founder-restoration-integrity.mjs';
import {checkOrderQuality} from './founder-order-quality.mjs';
export const brief=()=>{const text='A small team saves two hours by reusing approved content.';return {source:{id:'source',text,digest:digest(text),privacy:'public',reuseAllowed:true},language:'en',audience:'small teams',tone:'plain',formats:[{id:'social',kind:'social-post',count:1,maxCharacters:200}],requiredPoints:['two hours'],allowedLinks:[]};};
export const pack=b=>({briefDigest:digest(b),items:[{id:'p1',formatId:'social',kind:'social-post',text:b.source.text,evidence:[{sourceId:'source',quote:'two hours'}]}]});

test('HTTP link detection covers mixed case schemes in body and email subject',()=>{
 for(const scheme of ['HTTPS','hTtPs','HTTP'])for(const where of ['body','subject']){
  const b=brief();if(where==='subject')b.formats[0].kind='email';const p=pack(b);p.items[0].kind=b.formats[0].kind;
  if(where==='body')p.items[0].text+=' '+scheme+'://foreign.example/';else p.items[0].subject=scheme+'://foreign.example/';
  const r=checkContentPackage({brief:b,package:p});assert.equal(r.passed,false);assert.ok(r.issues.includes('foreign-link'));
 }
});

test('unreviewed fields cannot accompany formally approved content',()=>{
 for(const location of ['package','item','evidence','non-email-subject']){
  const b=brief(),p=pack(b);
  if(location==='package')p.hiddenContent='Unreviewed delivery';
  if(location==='item')p.items[0].html='<a href="https://foreign.example/">hidden</a>';
  if(location==='evidence')p.items[0].evidence[0].unverifiedClaim='Unreviewed claim';
  if(location==='non-email-subject')p.items[0].subject={hidden:'Unreviewed content'};
  assert.equal(checkContentPackage({brief:b,package:p}).passed,false,location);
 }
});

test('exact approved links and complete email schema remain supported',()=>{
 const b=brief();b.formats[0].kind='email';b.allowedLinks=['https://approved.example/'];const p=pack(b);p.items[0].kind='email';p.items[0].subject='Approved update';p.items[0].text+=' https://approved.example/';
 assert.equal(checkContentPackage({brief:b,package:p}).passed,true);
});

test('order quality gate rejects bypasses even when delivered bytes match the package',()=>{
 for(const mode of ['hidden','link']){
  const b=brief(),p=pack(b);if(mode==='hidden')p.items[0].extra='Unreviewed';else p.items[0].text+=' HTTPS://foreign.example/';
  const product={binding:{profileId:'content-repurpose',contentBrief:b},package:p,files:contentPackageFiles(p)};
  assert.throws(()=>checkOrderQuality(product,{}),/Content quality/);
 }
});
test('exact bounded package passes formal checks without claiming semantic truth',()=>{const b=brief();assert.equal(validateContentBrief(b).passed,true);const r=checkContentPackage({brief:b,package:pack(b)});assert.equal(r.passed,true);assert.equal(r.semanticVerified,false);assert.equal(contentPackageFiles(pack(b))[0].path,'content-package.json');});
for(const mode of ['count','quote','link','placeholder','private','digest','point'])test('rejects '+mode,()=>{const b=brief(),p=pack(b);if(mode==='count')p.items=[];if(mode==='quote')p.items[0].evidence[0].quote='not in source';if(mode==='link')p.items[0].text+=' https://foreign.example/';if(mode==='placeholder')p.items[0].text+=' TODO';if(mode==='private')b.source.privacy='private';if(mode==='digest')p.briefDigest='wrong';if(mode==='point')p.items[0].text='A generic output';assert.equal(checkContentPackage({brief:b,package:p}).passed,false);});
