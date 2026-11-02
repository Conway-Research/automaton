import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeLearningAdapters} from './founder-learning-adapters.mjs';
import {createGeneralWebDiscovery} from './founder-general-web.mjs';
import {probeSource} from '../src/research/sources.ts';
const ctx=()=>({task:{input:{}},grant:{reservationId:'fake',maxCostRappen:0},assertActive(){},signal:new AbortController().signal});
for(const [gap,want] of [[{kind:'quality',topicId:'failure-firecrawl-research'},'quality'],[{kind:'quality',topicId:'reliable-delivery'},'reliable-delivery'],[{kind:'quality',title:'Consulting und Problemlösung verbessern'},'consulting']])test('registered learning topic resolves '+want,async()=>{
 let actual;const a=createFreeLearningAdapters({getContext:()=>({now:1000}),research:{maxCostRappen:0,execute:async c=>{actual=c.task.input.learningTopic;return {sources:[]};},verify:()=>true}});
 await a.discover(gap,ctx());assert.equal(actual,want);
});
test('search requests supported licences but still rejects unlicensed results without reading content',async()=>{
 let query,claims=0,reads=0;const search=createGeneralWebDiscovery({configuration:{schemaVersion:1,enabled:true,activationApproved:true},claim:()=>{claims++;},finish(){},ready:()=>0,request:async url=>{query=new URL(url).searchParams.get('q');return Response.json({results:[{url:'https://public.example/article',title:'CC0 claimed in search title'}]});},readBody:r=>r.text()});
 const a=createFreeLearningAdapters({getContext:()=>({now:1000}),research:search,readMetadata:async()=>Buffer.from('No original licensing statement'),readData:async()=>{reads++;throw Error('Forbidden');}});
 const c=await a.discover({kind:'quality',topicId:'quality'},ctx());assert.match(query,/CC0/);assert.match(query,/CC BY 4\.0/);assert.equal(claims,1);
 const probe=await probeSource(c[0],{...a.sourceProbe,clock:()=>1000},ctx().signal);assert.notEqual(probe.status,'usable');assert.equal(reads,0);
});
for(const licence of ['https://creativecommons.org/publicdomain/zero/1.0/','https://creativecommons.org/licenses/by/4.0/'])test('original scoped permission admits '+licence+' with attribution',async()=>{
 const document=Buffer.from(JSON.stringify({'@type':'Article',name:'Original test method',url:'https://public.example/method',license:licence,isAccessibleForFree:true,publisher:{name:'Test publisher'}}));
 const a=createFreeLearningAdapters({getContext:()=>({now:1000}),research:{maxCostRappen:0,execute:async()=>({provider:'searxng-local',sources:[{url:'https://public.example/method'}]}),verify:()=>true},readMetadata:async()=>document,readData:async()=>Buffer.from('A bounded reproducible test method. This is a fixture, not research evidence.')});
 const [candidate]=await a.discover({kind:'quality'},ctx());const p=await probeSource(candidate,{...a.sourceProbe,clock:()=>1000},ctx().signal);assert.equal(p.status,'usable');assert.equal(p.permission.attribution,'Test publisher');assert.ok(p.sha256);assert.equal(a.researchEvidence([p])[0].independentFactualVerification,false);
});
test('a noncommercial metadata statement cannot become reusable because the search asks for CC0',async()=>{
 let reads=0;const document=Buffer.from(JSON.stringify({'@type':'Article',name:'Restricted',url:'https://public.example/method',license:'https://creativecommons.org/licenses/by-nc/4.0/',isAccessibleForFree:true,publisher:{name:'Test publisher'}}));
 const a=createFreeLearningAdapters({getContext:()=>({now:1000}),research:{maxCostRappen:0,execute:async()=>({provider:'searxng-local',sources:[{url:'https://public.example/method'}]}),verify:()=>true},readMetadata:async()=>document,readData:async()=>{reads++;throw Error('Not permitted');}});
 const [candidate]=await a.discover({kind:'quality'},ctx());const p=await probeSource(candidate,{...a.sourceProbe,clock:()=>1000},ctx().signal);assert.equal(p.status,'rejected');assert.equal(reads,0);
});
