import test from 'node:test';import assert from 'node:assert/strict';
import {officeLayoutRequirements} from './founder-ugig-office-layout.mjs';
import {sha256} from './founder-binary-artifacts.mjs';
const parse=spec=>{const bytes=Buffer.from(JSON.stringify(spec));return officeLayoutRequirements({workKind:'document-cleanup',specRef:{sha256:sha256(bytes),size:bytes.length}},bytes);};
test('layout requirements preserve bounded exact page expectations',()=>{assert.deepEqual(parse({layout:{expectedPages:[{heading:'Titel',page:2}]}}),{Titel:2});assert.deepEqual(parse({}),{});});
for(const layout of [null,{}, {expectedPages:'Titel'}, {expectedPages:[{heading:'Titel',page:0}]},{expectedPages:[{heading:'Titel',page:1.5}]},{expectedPages:[{heading:'Titel',page:31}]},{expectedPages:[{heading:' ',page:1}]},{expectedPages:[{heading:'Titel',page:1},{heading:'Titel',page:2}]},{expectedPages:[{heading:'Titel',page:1,approved:true}]},{expectedPages:[],approved:true}])test('reject invalid layout '+JSON.stringify(layout),()=>assert.throws(()=>parse({layout})));
test('layout requires exact contract bytes and supported profile',()=>{const b=Buffer.from('{}');assert.throws(()=>officeLayoutRequirements({workKind:'document-cleanup',specRef:{sha256:'0'.repeat(64),size:2}},b));assert.throws(()=>officeLayoutRequirements({workKind:'research-summary',specRef:{sha256:sha256(b),size:2}},b));});
