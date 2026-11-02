import {describe,it,expect} from 'vitest';
import {prepareServiceData,prepareSourceReport,createServiceDeliveryTool,type DataContract} from '../commerce/service-delivery.js';

const contract:DataContract={columns:['sku','name','price'],required:['sku','name'],deduplicateBy:['sku'],trim:['name'],lowercase:[]};
describe('bounded service delivery',()=>{
 it('preserves identifiers and real zeroes, normalizes only selected fields and exports spreadsheet-safe CSV',()=>{
  const r=prepareServiceData([{sku:'0007',name:' =formula ',price:0}],contract);
  expect(r.status).toBe('prepared');expect(r.rows[0]).toEqual({sku:'0007',name:'=formula',price:0});
  expect(r.csv).toBe("sku,name,price\r\n0007,'=formula,0");expect(r.productionAccepted).toBe(false);
 });
 it('deduplicates identical rows, holds conflicts and never releases a partial CSV',()=>{
  const row={sku:'1',name:'A',price:1};
  const r=prepareServiceData([row,{...row},{...row,price:2}],contract);
  expect(r.duplicates).toBe(1);expect(r.issues).toEqual([{row:3,code:'CONFLICTING_IDENTITY'}]);expect(r.csv).toBeNull();
 });
 it('reports missing values and unmapped fields without inventing or silently dropping deliverable data',()=>{
  const r=prepareServiceData([{sku:'1',name:' '},{sku:'2',name:'A',extra:'lost'}],contract);
  expect(r.issues.map(i=>i.code)).toEqual(['REQUIRED_VALUE','UNMAPPED_RECORD']);expect(r.csv).toBeNull();
 });
 it('keeps typed identities distinct and rejects identities absent from otherwise optional fields',()=>{
  const c={...contract,required:['name']};
  const r=prepareServiceData([{sku:1,name:'A'},{sku:'1',name:'A'},{name:'B'}],c);
  expect(r.outputRows).toBe(2);expect(r.issues[0].code).toBe('MISSING_IDENTITY');
 });
 it('is repeatable, preserves caller input and changes digests when rules or content change',()=>{
  const rows=[{sku:'A',name:' X ',price:3}],before=JSON.stringify(rows);
  const a=prepareServiceData(rows,contract),b=prepareServiceData(rows,contract);
  expect(a).toEqual(b);expect(JSON.stringify(rows)).toBe(before);
  expect(prepareServiceData(rows,{...contract,trim:[]}).outputDigest).not.toBe(a.outputDigest);
 });
 it('rejects ambiguous cells, invalid contracts and oversized input',()=>{
  expect(prepareServiceData([{sku:'x',name:'A',price:NaN}],contract).csv).toBeNull();
  expect(()=>prepareServiceData([],{...contract,required:['unknown']})).toThrow();
  expect(()=>prepareServiceData([],{...contract,columns:['sku','sku']})).toThrow();
  expect(()=>prepareServiceData(Array.from({length:501},()=>({})),contract)).toThrow();
  expect(()=>prepareServiceData([{sku:'x',name:'x'.repeat(100001)}],contract)).toThrow();
 });
 const source={id:'s',url:'https://example.com/report',observedAt:1000,excerpt:'Orders increased from 10 to 12.'};
 const claim={text:'Reported orders increased.',sourceId:'s',quote:'from 10 to 12'};
 it('binds report claims to exact current source passages without certifying their truth',()=>{
  const r=prepareSourceReport([source],[claim],2000,1000);
  expect(r.status).toBe('citation_matched');expect(r.verifiedTruth).toBe(false);expect(r.verifiedReuseRights).toBe(false);
 });
 it('holds stale, absent and mismatched citations',()=>{
  expect(prepareSourceReport([source],[claim],2001,1000).issues[0].code).toBe('STALE_SOURCE');
  expect(prepareSourceReport([],[claim],2000,1000).issues[0].code).toBe('MISSING_SOURCE');
  expect(prepareSourceReport([source],[{...claim,quote:'invented'}],2000,1000).issues[0].code).toBe('QUOTE_MISMATCH');
 });
 it('rejects duplicate source identities, future observations and non-HTTPS sources',()=>{
  expect(()=>prepareSourceReport([source,source],[claim],2000,1000)).toThrow();
  expect(()=>prepareSourceReport([{...source,observedAt:2001}],[claim],2000,1000)).toThrow();
  expect(()=>prepareSourceReport([{...source,url:'file:///secret'}],[claim],2000,1000)).toThrow();
 });
 it('agent-facing maintenance uses existing parse checks and does not execute code',async()=>{
  const result=JSON.parse(await createServiceDeliveryTool().execute({action:'maintenance',content:'throw Error("never executed");',language:'typescript'},{} as never) as string);
  expect(result.executionPerformed).toBe(false);
 });
 it('agent-facing automation runs the same transformation and rejects unknown actions',async()=>{
  const tool=createServiceDeliveryTool();
  const result=JSON.parse(await tool.execute({action:'automation',rows:[{sku:'1',name:'A'}],contract},{} as never) as string);
  expect(result.status).toBe('prepared');expect(result.executionAuthorized).toBe(false);
  await expect(tool.execute({action:'shell'},{} as never)).rejects.toThrow('Unknown service action');
 });
 it('blocks a repeatable workflow when independently expected output differs',async()=>{
  const args={action:'automation',rows:[{sku:'1',name:'A'}],contract};
  const tool=createServiceDeliveryTool();
  const r=JSON.parse(await tool.execute({...args,expected_output_digest:'0'.repeat(64)},{} as never) as string);
  expect(r.csv).toBeNull();expect(r.issues[0].code).toBe('OUTPUT_CONTRACT_MISMATCH');
  const expected=prepareServiceData(args.rows,contract).outputDigest;
  expect(JSON.parse(await tool.execute({...args,expected_output_digest:expected},{} as never) as string).status).toBe('prepared');
 });
 it('compares maintenance candidates but does not certify a functional repair',async()=>{
  const r=JSON.parse(await createServiceDeliveryTool().execute({action:'maintenance',before_content:'const x = ;',content:'const x = 1;',language:'typescript'},{} as never) as string);
  expect(r.changed).toBe(true);expect(r.syntaxErrorsRemoved).toBeGreaterThan(0);expect(r.functionalRepairVerified).toBe(false);
 });
});
