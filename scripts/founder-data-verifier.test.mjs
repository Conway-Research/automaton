// Offline acceptance D03 with synthetic CSV only. The verifier judges a delivery; it does not produce one.
import test from 'node:test';import assert from 'node:assert/strict';
import {parseCsvStrict,verifyDataDelivery} from './founder-data-verifier.mjs';
const contract=()=>({key:'id',fields:{id:{type:'string',required:true},kunde:{type:'string'},betrag:{type:'decimal',scale:2,required:true,sum:true},datum:{type:'date',required:true}},sources:{'de.csv':{decimal:'de',date:'DMY'},'en.csv':{decimal:'en',date:'MDY'}}});
const inputs=()=>[{file:'de.csv',delimiter:';',text:'﻿id;kunde;betrag;datum\nA1;Müller;1.234,50;03.04.2026\nA2;;10,00;31.12.2026\n'},{file:'en.csv',text:'id,kunde,betrag,datum\nB1,"Smith, J",2.50,04/03/2026\n'}];
const delivery=()=>({rows:[
 {from:['de.csv:2'],values:{id:'A1',kunde:'Müller',betrag:'1234.50',datum:'2026-04-03'}},
 {from:['de.csv:3'],values:{id:'A2',kunde:null,betrag:'10.00',datum:'2026-12-31'}},
 {from:['en.csv:2'],values:{id:'B1',kunde:'Smith, J',betrag:'2.50',datum:'2026-04-03'}}],
 rejected:[],ambiguous:[],report:{counts:{input:3,output:3,rejected:0,ambiguous:0,merged:0},totals:{betrag:'1247.00'}}});
const check=(d=delivery(),i=inputs(),c=contract())=>verifyDataDelivery({contract:c,inputs:i,delivery:d});
const codes=r=>r.issues.map(x=>x.code);
const single=(text,source={})=>({i:[{file:'x.csv',text:'id,kunde,betrag,datum\n'+text}],c:{...contract(),sources:{'x.csv':source}}});
const held=(rowId,field)=>({rejected:[],ambiguous:[{rowId,field,reason:'needs a human decision'}],rows:[],report:{counts:{input:1,output:0,rejected:0,ambiguous:1,merged:0},totals:{betrag:'0.00'}}});

test('D03 a complete delivery reconciles rows and sums independently',()=>{
 const r=check();assert.deepEqual(r.issues,[]);assert.equal(r.accepted,true);
 assert.deepEqual(r.reconciliation.counts,{input:3,output:3,rejected:0,ambiguous:0,merged:0});assert.equal(r.reconciliation.totals.betrag,'1247.00');
});
test('D03 a silently dropped row is data loss even when the report hides it',()=>{
 const d=delivery();d.rows.pop();d.report.counts={input:2,output:2,rejected:0,ambiguous:0,merged:0};d.report.totals.betrag='1244.50';
 const r=check(d);assert.equal(r.accepted,false);assert.ok(r.issues.some(x=>x.code==='row-lost'&&x.rowId==='en.csv:2'));assert.ok(codes(r).includes('count-mismatch'));
});
test('D03 a wrong reported total is caught although each row is right',()=>{
 const d=delivery();d.report.totals.betrag='1247.01';const r=check(d);assert.deepEqual(codes(r),['sum-mismatch']);assert.equal(r.reconciliation.totals.betrag,'1247.00');
});
test('D03 an altered amount is caught at the row, not only in the sum',()=>{
 const d=delivery();d.rows[0].values.betrag='1234.05';d.report.totals.betrag='1246.55';assert.ok(check(d).issues.some(x=>x.code==='value-altered'&&x.field==='betrag'));
});
test('D03 sums use exact decimals, not floating point',()=>{
 const {i,c}=single('a,,0.10,2026-01-01\nb,,0.20,2026-01-02\n');
 const d={rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'0.10',datum:'2026-01-01'}},{from:['x.csv:3'],values:{id:'b',kunde:null,betrag:'0.20',datum:'2026-01-02'}}],rejected:[],ambiguous:[],report:{counts:{input:2,output:2,rejected:0,ambiguous:0,merged:0},totals:{betrag:'0.30'}}};
 assert.deepEqual(check(d,i,c).issues,[]);
});
test('D03 an ambiguous date without a declared format must be held, not resolved',()=>{
 const {i,c}=single('a,,1.00,03/04/2026\n');
 const resolved={rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'1.00',datum:'2026-04-03'}}],rejected:[],ambiguous:[],report:{counts:{input:1,output:1,rejected:0,ambiguous:0,merged:0},totals:{betrag:'1.00'}}};
 assert.ok(codes(check(resolved,i,c)).includes('ambiguous-date-resolved'));
 assert.deepEqual(check(held('x.csv:2','datum'),i,c).issues,[]);
});
test('D03 a date is not ambiguous when only one reading exists, and an impossible date is not accepted',()=>{
 const one=single('a,,1.00,13/04/2026\n'),same=single('a,,1.00,04/04/2026\n');
 const out=datum=>({rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'1.00',datum}}],rejected:[],ambiguous:[],report:{counts:{input:1,output:1,rejected:0,ambiguous:0,merged:0},totals:{betrag:'1.00'}}});
 assert.deepEqual(check(out('2026-04-13'),one.i,one.c).issues,[]);assert.deepEqual(check(out('2026-04-04'),same.i,same.c).issues,[]);
 const bad=single('a,,1.00,2026-02-30\n',{date:'DMY'});assert.ok(codes(check(out('2026-03-02'),bad.i,bad.c)).includes('invalid-value-accepted'));
});
test('D03 an ambiguous decimal without a declared format must be held',()=>{
 const {i,c}=single('a,,"1,234",2026-01-01\n');
 const out={rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'1234.00',datum:'2026-01-01'}}],rejected:[],ambiguous:[],report:{counts:{input:1,output:1,rejected:0,ambiguous:0,merged:0},totals:{betrag:'1234.00'}}};
 assert.ok(codes(check(out,i,c)).includes('ambiguous-decimal-resolved'));assert.deepEqual(check(held('x.csv:2','betrag'),i,c).issues,[]);
});
test('D03 a null value is not invented and a required missing value is not filled',()=>{
 const d=delivery();d.rows[1].values.kunde='Unbekannt';assert.ok(check(d).issues.some(x=>x.code==='value-invented'&&x.field==='kunde'));
 const {i,c}=single('a,,,2026-01-01\n');const out={rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'0.00',datum:'2026-01-01'}}],rejected:[],ambiguous:[],report:{counts:{input:1,output:1,rejected:0,ambiguous:0,merged:0},totals:{betrag:'0.00'}}};
 assert.ok(codes(check(out,i,c)).includes('value-invented'));
});
test('D03 a value turned into null is reported as dropped',()=>{
 const d=delivery();d.rows[0].values.kunde=null;assert.ok(check(d).issues.some(x=>x.code==='value-dropped'&&x.field==='kunde'));
});
test('D03 an output row without provenance or with a foreign source is invented',()=>{
 const d=delivery();d.rows.push({from:[],values:{id:'Z',kunde:null,betrag:'0.00',datum:'2026-01-01'}});d.rows.push({from:['de.csv:99'],values:{id:'Y',kunde:null,betrag:'0.00',datum:'2026-01-01'}});
 assert.equal(check(d).issues.filter(x=>x.code==='invented-row').length,2);
});
test('D03 one row counted twice is caught',()=>{
 const d=delivery();d.rejected.push({rowId:'en.csv:2',reason:'x'});assert.ok(check(d).issues.some(x=>x.code==='row-double-counted'&&x.rowId==='en.csv:2'));
});
test('D03 identical duplicates may merge and count once; conflicting duplicates may not hide',()=>{
 const {i,c}=single('a,,1.00,2026-01-01\na,,1.00,2026-01-01\n');
 const merged={rows:[{from:['x.csv:2','x.csv:3'],values:{id:'a',kunde:null,betrag:'1.00',datum:'2026-01-01'}}],rejected:[],ambiguous:[],report:{counts:{input:2,output:1,rejected:0,ambiguous:0,merged:1},totals:{betrag:'1.00'}}};
 assert.deepEqual(check(merged,i,c).issues,[]);
 const both={rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'1.00',datum:'2026-01-01'}},{from:['x.csv:3'],values:{id:'a',kunde:null,betrag:'1.00',datum:'2026-01-01'}}],rejected:[],ambiguous:[],report:{counts:{input:2,output:2,rejected:0,ambiguous:0,merged:0},totals:{betrag:'2.00'}}};
 assert.ok(codes(check(both,i,c)).includes('duplicate-undetected'));
 const conflict=single('a,,1.00,2026-01-01\na,,9.00,2026-01-01\n');const hidden={...merged,report:{...merged.report}};assert.ok(codes(check(hidden,conflict.i,conflict.c)).includes('conflict-hidden'));
});
test('D03 damaged encoding may not pass as clean output',()=>{
 for(const bad of ['M�ller','MÃ¼ller']){
  const {i,c}=single(`a,${bad},1.00,2026-01-01\n`);
  const out={rows:[{from:['x.csv:2'],values:{id:'a',kunde:bad,betrag:'1.00',datum:'2026-01-01'}}],rejected:[],ambiguous:[],report:{counts:{input:1,output:1,rejected:0,ambiguous:0,merged:0},totals:{betrag:'1.00'}}};
  assert.ok(codes(check(out,i,c)).includes('encoding-damaged'),bad);
 }
});
test('D03 a column missing from the contract is silent loss; a changed output schema is rejected',()=>{
 const i=[{file:'x.csv',text:'id,kunde,betrag,datum,iban\na,,1.00,2026-01-01,CH00\n'}];const c={...contract(),sources:{'x.csv':{}}};
 const out={rows:[{from:['x.csv:2'],values:{id:'a',kunde:null,betrag:'1.00',datum:'2026-01-01'}}],rejected:[],ambiguous:[],report:{counts:{input:1,output:1,rejected:0,ambiguous:0,merged:0},totals:{betrag:'1.00'}}};
 assert.ok(codes(check(out,i,c)).includes('input-schema-mismatch'));
 const d=delivery();d.rows[0].values.extra='1';assert.ok(codes(check(d)).includes('schema-mismatch'));
});
test('D03 a malformed row must be accounted for, and a __proto__ column changes nothing',()=>{
 const {i,c}=single('a,,1.00\n');const lost={rows:[],rejected:[],ambiguous:[],report:{counts:{input:1,output:0,rejected:0,ambiguous:0,merged:0},totals:{betrag:'0.00'}}};
 assert.ok(codes(check(lost,i,c)).includes('row-lost'));
 const ok={rows:[],rejected:[{rowId:'x.csv:2',reason:'too few columns'}],ambiguous:[],report:{counts:{input:1,output:0,rejected:1,ambiguous:0,merged:0},totals:{betrag:'0.00'}}};assert.deepEqual(check(ok,i,c).issues,[]);
 const r=check(ok,[{file:'x.csv',text:'id,kunde,betrag,datum,__proto__\na,,1.00,2026-01-01,x\n'}],c);assert.ok(codes(r).includes('input-schema-mismatch'));assert.equal({}.x,undefined);
});
test('D03 withholding clean rows cannot buy acceptance, and a withheld row needs a reason',()=>{
 const {i,c}=single('a,,1.00,2026-01-01\n');
 const all={rows:[],rejected:[{rowId:'x.csv:2',reason:'unsure'}],ambiguous:[],report:{counts:{input:1,output:0,rejected:1,ambiguous:0,merged:0},totals:{betrag:'0.00'}}};
 assert.ok(codes(check(all,i,c)).includes('clean-row-withheld'));
 assert.ok(codes(check({...all,ambiguous:all.rejected,rejected:[],report:{...all.report,counts:{input:1,output:0,rejected:0,ambiguous:1,merged:0}}},i,c)).includes('clean-row-withheld'));
 const conflict=single('a,,1.00,2026-01-01\na,,9.00,2026-01-01\n');
 const both={rows:[],rejected:[{rowId:'x.csv:2',reason:'conflict'},{rowId:'x.csv:3',reason:'conflict'}],ambiguous:[],report:{counts:{input:2,output:0,rejected:2,ambiguous:0,merged:0},totals:{betrag:'0.00'}}};
 assert.deepEqual(check(both,conflict.i,conflict.c).issues,[]);
 const bad=single('a,,x,2026-01-01\n');assert.ok(codes(check({...all,rejected:[{rowId:'x.csv:2',reason:' '}]},bad.i,bad.c)).includes('withheld-without-reason'));
});
test('D03 the strict CSV reader keeps quotes, line breaks, BOM and reports unterminated quotes',()=>{
 const p=parseCsvStrict('﻿a,b\r\n"x,1","y\nz"\r\n3,4',{file:'f'});assert.deepEqual(p.header,['a','b']);
 assert.deepEqual(p.rows.map(r=>[r.rowId,r.cells]),[['f:2',['x,1','y\nz']],['f:4',['3','4']]]);
 assert.throws(()=>parseCsvStrict('a\n"x',{file:'f'}),/Unterminated/);
 assert.throws(()=>parseCsvStrict('a,a\n1,2',{file:'f'}),/Duplicate column/);
});
test('D03 a delivery with unknown decimal text or a bad contract fails closed',()=>{
 assert.throws(()=>verifyDataDelivery({contract:{},inputs:inputs(),delivery:delivery()}),/Invalid data contract/);
 assert.throws(()=>verifyDataDelivery({contract:contract(),inputs:[],delivery:delivery()}),/Invalid data contract/);
 const d=delivery();d.rows[0].values.betrag='1234,50';assert.ok(check(d).issues.some(x=>x.code==='value-altered'));
});
