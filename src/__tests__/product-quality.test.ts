import {it,expect,vi,afterEach} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerProductQuality,assessProductQuality,inspectProductQuality,assertProductQuality,revokeProductQuality,productQualityLessons,assessProductLanguage,inspectProductLanguage,withdrawProductLanguage} from '../commerce/product-quality.js';
import {StripeCheckout,checkoutActionScope,PRODUCT_RELEASE_EVIDENCE,type CheckoutOffer} from '../commerce/stripe-checkout.js';
import {fixtureSecurityReview,fixturePublicationContext} from './fixtures/security-review.js';
import {DigitalDelivery} from '../commerce/delivery.js';
import {inspectWriting,checkLocalLanguage} from '../commerce/writing-quality.js';
import {inspectCode} from '../commerce/code-quality.js';
import {qualityReviewPlan} from '../commerce/quality-review.js';
import {createProductQualityTool} from '../commerce/product-tool.js';
import {isProtectedFile} from '../self-mod/code.js';
const contract={productId:'guide',format:'text' as const,purpose:'Explain installation',audience:'New users',minBytes:5,maxBytes:1000,requiredText:['Install'],forbiddenText:['guaranteed profit'],requiredJsonKeys:[]};
const dirs:string[]=[];const dbs:Database.Database[]=[];
function db(){const dir=mkdtempSync(join(tmpdir(),'quality-'));dirs.push(dir);const file=join(dir,'commerce.db');const a=new Database(file);dbs.push(a);a.exec("CREATE TABLE commerce_stripe_config(id INTEGER,mode TEXT);INSERT INTO commerce_stripe_config VALUES(1,'live')");return {a,file};}
afterEach(()=>{dbs.splice(0).forEach(d=>{if(d.open)d.close();});dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
it('requires recorded assessment of exact bytes and observes durable revocation across connections/restart',()=>{
 const {a,file}=db();registerProductQuality(a,contract);const asset={filename:'guide.txt',content:Buffer.from('Install locally.')};
 expect(()=>assertProductQuality(a,'guide',asset)).toThrow('quality gate');
 const result=assessProductQuality(a,'guide',asset.filename,asset.content);expect(result.passed).toBe(true);assertProductQuality(a,'guide',asset);
 expect(()=>assertProductQuality(a,'guide',{...asset,content:Buffer.from('Install different bytes.')})).toThrow('quality gate');
 const b=new Database(file);dbs.push(b);revokeProductQuality(b,'guide',result.contentDigest,'Incorrect installation instructions');a.close();
 const reopened=new Database(file);dbs.push(reopened);expect(()=>assertProductQuality(reopened,'guide',asset)).toThrow('quality gate');
 expect(inspectProductQuality(reopened,'guide',asset.filename,asset.content).findings).toContain('revoked_product_version');
});
it('cannot weaken an existing contract or mutate assessment history',()=>{
 const {a}=db();registerProductQuality(a,contract);expect(registerProductQuality(a,contract).duplicate).toBe(true);
 expect(()=>registerProductQuality(a,{...contract,requiredText:['Other']})).toThrow('immutable');
 assessProductQuality(a,'guide','guide.txt',Buffer.from('Install locally.'));
 expect(()=>a.exec('DELETE FROM obolus_product_quality_assessments')).toThrow('immutable');
});
it.each([['Install TODO','unfinished_placeholder'],['Install guaranteed profit','forbidden_text_0'],['Install sk_live_abcdefghijklmnop','possible_secret'],['Nothing here','missing_required_text_0']])('rejects defective content: %s',(content,code)=>{
 const {a}=db();registerProductQuality(a,contract);const result=assessProductQuality(a,'guide','guide.txt',Buffer.from(content));expect(result.passed).toBe(false);expect(result.findings).toContain(code);
});
it('checks JSON structure and does not execute code masquerading as a text asset',()=>{
 const {a}=db();registerProductQuality(a,{...contract,format:'json',requiredText:[],requiredJsonKeys:['instructions']});
 expect(inspectProductQuality(a,'guide','guide.json',Buffer.from('{"instructions":""}')).passed).toBe(false);
 expect(inspectProductQuality(a,'guide','guide.json',Buffer.from('{"instructions":"Install"}')).passed).toBe(true);
 expect(inspectProductQuality(a,'guide','guide.js',Buffer.from('{"instructions":"Install"}')).findings).toContain('unsupported_filename');
});
it('bounds unique repair attempts without charging identical retries against the cap',()=>{
 const {a}=db();registerProductQuality(a,contract);for(let i=0;i<20;i++)assessProductQuality(a,'guide','guide.txt',Buffer.from(`Install ${i}`));
 expect(()=>assessProductQuality(a,'guide','guide.txt',Buffer.from('Install 0'))).not.toThrow();
 expect(()=>assessProductQuality(a,'guide','guide.txt',Buffer.from('Install 21'))).toThrow('iteration limit');
});
it('inspection remains read-only and missing contracts never count as a pass',()=>{
 const {a,file}=db();registerProductQuality(a,contract);const b=new Database(file,{readonly:true});dbs.push(b);
 expect(inspectProductQuality(b,'guide','guide.txt',Buffer.from('Install locally')).passed).toBe(true);
 expect(()=>inspectProductQuality(b,'missing','guide.txt',Buffer.from('Install locally'))).toThrow('contract');
});
it('repairs whitespace while preserving Markdown hard breaks and fenced code',()=>{
 const result=inspectWriting('# Title\nText   \n```js\nconst x = 1;   \n```\nEnd\t','markdown');
 expect(result.corrected).toBe('# Title\nText  \n```js\nconst x = 1;   \n```\nEnd');
 expect(result.languageStatus).toBe('not_checked');expect(inspectWriting(result.corrected,'markdown').changed).toBe(false);
 expect(inspectWriting('word word\n```','markdown').findings.map(f=>f.code)).toContain('unclosed_code_fence');
});
it('does not send text externally or treat an unavailable language checker as a pass',async()=>{
 const request=vi.fn();expect((await checkLocalLanguage('Hello','en-US',undefined,request)).status).toBe('unavailable');
 await expect(checkLocalLanguage('Hello','en-US','https://external.example/v2/check',request)).rejects.toThrow('loopback');expect(request).not.toHaveBeenCalled();
});
it('validates bounded local language findings and rejects incomplete or invalid offsets',async()=>{
 const mock=(value:unknown)=>vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify(value)));
 const result=await checkLocalLanguage('Helo','en-US','http://127.0.0.1:8081/v2/check',mock({matches:[{offset:0,length:4,rule:{id:'SPELL'},replacements:[{value:'Hello'}]}]}));
 expect(result.status).toBe('corrections_required');expect(result.matches[0].replacements).toEqual(['Hello']);
 for(const payload of [{matches:[],warnings:{incompleteResults:true}},{matches:[{offset:90,length:2,rule:{id:'SPELL'},replacements:[]}]}])expect((await checkLocalLanguage('Helo','en-US','http://127.0.0.1:8081/v2/check',mock(payload))).status).toBe('unavailable');
});
it('checks code without executing it and never claims a syntax pass is security approval',()=>{
 const bad=inspectCode('eval("throw new Error()")','javascript');expect(bad.security.map(f=>f.code)).toContain('dynamic_execution_review');expect(bad.executionPerformed).toBe(false);
 expect(inspectCode('const x = ;','typescript').syntax.length).toBeGreaterThan(0);
 const good=inspectCode('const x:number=1','typescript');expect(good.status).toBe('syntax_checked');expect(good.remainingChecks).toContain('security_tests');
});
it('keeps all broad review areas unverified and exposes inspection without a commerce database',async()=>{
 const plan=qualityReviewPlan('code');expect(plan.areas.length).toBeGreaterThan(12);expect(plan.areas.every(a=>a.status==='not_checked')).toBe(true);
 const tool=createProductQualityTool();const output=JSON.parse(await tool.execute({action:'writing',content:'Hello  ',format:'text'},{} as never));expect(output.corrected).toBe('Hello');
 for(const file of ['product-quality','product-tool','writing-quality','code-quality','quality-review'])expect(isProtectedFile(`src/commerce/${file}.ts`)).toBe(true);
});
it('retains measured defect feedback across reopen and deduplicates repeated assessments',()=>{
 const {a,file}=db();registerProductQuality(a,contract);
 for(let i=0;i<3;i++)assessProductQuality(a,'guide','guide.txt',Buffer.from('Install TODO'));
 const before=productQualityLessons(a);expect(before.sampleSize).toBe(1);expect(before.recurringFindings).toEqual([{code:'unfinished_placeholder',count:1}]);
 a.close();const b=new Database(file,{readonly:true});dbs.push(b);expect(productQualityLessons(b)).toEqual(before);
});
it('revocation blocks already-issued download grants and new issuance',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quality-delivery-'));dirs.push(dir);const file=join(dir,'commerce.db');const a=new Database(file),b=new Database(file);dbs.push(a,b);
 new StripeCheckout(a,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'});
 registerProductQuality(a,contract);const content=Buffer.from('Install locally.');const assessment=assessProductQuality(a,'guide','guide.txt',content);
 const delivery=new DigitalDelivery(a);delivery.register('guide','guide.txt',content);
 const offer:CheckoutOffer={orderId:'order',productId:'guide',title:'Fixture',amountCents:100,currency:'chf',successUrl:'https://example.invalid/success',cancelUrl:'https://example.invalid/cancel',publication:fixturePublicationContext};
 fixtureSecurityReview(a,checkoutActionScope('acct_fixture',offer,a),Date.now(),PRODUCT_RELEASE_EVIDENCE);
 a.prepare("INSERT INTO commerce_orders(id,offer,digest,created_ms,status) VALUES('order',?,'fixture',0,'paid')").run(JSON.stringify(offer));
 a.exec("INSERT INTO commerce_delivery_queue(order_id) VALUES('order')");const grant=delivery.issue('order');
 revokeProductQuality(b,'guide',assessment.contentDigest,'Regression discovered');
 expect(()=>delivery.download(grant.token)).toThrow('quality gate');expect(()=>delivery.issue('order')).toThrow('quality gate');
 expect(a.prepare('SELECT attempts FROM commerce_downloads').get()).toEqual({attempts:0});
});

it('requires formatting repairs to be assessed again before delivery',()=>{
 const {a}=db();registerProductQuality(a,contract);
 const asset={filename:'guide.txt',content:Buffer.from('Install locally.  ')};
 expect(assessProductQuality(a,'guide',asset.filename,asset.content).findings).toContain('formatting_normalization_required');
 expect(()=>assertProductQuality(a,'guide',asset)).toThrow('quality gate');
 const corrected={...asset,content:Buffer.from(inspectWriting(asset.content.toString(),'text').corrected)};
 expect(()=>assertProductQuality(a,'guide',corrected)).toThrow('quality gate');
 expect(assessProductQuality(a,'guide',corrected.filename,corrected.content).validator).toBe('technical-product-v4');
 expect(()=>assertProductQuality(a,'guide',corrected)).not.toThrow();
});
it('enforces fixed Markdown structural checks independently of declared required text',()=>{
 const {a}=db();registerProductQuality(a,contract);
 for(const [source,code] of [['# Install\n### Details','formatting_heading_level_jump'],['Install\n~~~js\nconst n = 1','formatting_unclosed_code_fence']]){
  expect(assessProductQuality(a,'guide','guide.md',Buffer.from(source)).findings).toContain(code);
 }
 expect(assessProductQuality(a,'guide','guide.md',Buffer.from('# Install\n## Details\nLine  \nNext\n~~~js\nconst n = 1;   \n~~~')).passed).toBe(true);
});
it('does not pretend a partial formatting scan is sufficient for an oversized text product',()=>{
 const {a}=db();registerProductQuality(a,{...contract,maxBytes:262144});
 const source=Buffer.from('Install '+ 'a'.repeat(100000));
 expect(assessProductQuality(a,'guide','guide.txt',source).findings).toContain('formatting_check_size_limit');
});

it('blocks delivery registration for failed formatting and accepts only reassessed corrected bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quality-format-delivery-'));dirs.push(dir);const a=new Database(join(dir,'commerce.db'));dbs.push(a);
 new StripeCheckout(a,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'});
 registerProductQuality(a,contract);const delivery=new DigitalDelivery(a);
 const bad=Buffer.from('Install locally.  ');assessProductQuality(a,'guide','guide.txt',bad);
 expect(()=>delivery.register('guide','guide.txt',bad)).toThrow('quality gate');
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_assets').get()).toEqual({n:0});
 const repaired=Buffer.from('Install locally.');expect(()=>delivery.register('guide','guide.txt',repaired)).toThrow('quality gate');
 assessProductQuality(a,'guide','guide.txt',repaired);expect(()=>delivery.register('guide','guide.txt',repaired)).not.toThrow();
 expect(a.prepare('SELECT content FROM commerce_assets WHERE product_id=?').get('guide')).toEqual({content:repaired});
});

it('requires exact-byte language receipts and persists them across connections',async()=>{
 const {a,file}=db();registerProductQuality(a,{...contract,language:'en-US'});
 const asset={filename:'guide.txt',content:Buffer.from('Install locally.')};assessProductQuality(a,'guide',asset.filename,asset.content);
 expect(()=>assertProductQuality(a,'guide',asset)).toThrow('language gate');
 const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({matches:[]})));
 await assessProductLanguage(a,'guide',asset.filename,asset.content,'http://127.0.0.1:8081/v2/check',request);
 const b=new Database(file);dbs.push(b);expect(()=>assertProductQuality(b,'guide',asset)).not.toThrow();
 expect(inspectProductLanguage(b,'guide','renamed.txt',asset.content).passed).toBe(false);
 expect(inspectProductLanguage(b,'guide',asset.filename,Buffer.from('Install differently.')).passed).toBe(false);
 expect(()=>registerProductQuality(a,{...contract,language:'de-CH'})).toThrow('immutable');
 expect(()=>a.exec('DELETE FROM obolus_product_language_checks')).toThrow('immutable');
});
it('never turns unavailable language checking into a pass and supersedes earlier success with latest failure',async()=>{
 const {a}=db();registerProductQuality(a,{...contract,language:'en-US'});const bytes=Buffer.from('Install locally.');assessProductQuality(a,'guide','guide.txt',bytes);
 const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({matches:[]})));
 expect((await assessProductLanguage(a,'guide','guide.txt',bytes,undefined,request)).status).toBe('unavailable');expect(request).not.toHaveBeenCalled();
 await assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',request);
 expect(inspectProductLanguage(a,'guide','guide.txt',bytes).passed).toBe(true);
 await assessProductLanguage(a,'guide','guide.txt',bytes,undefined,request);
 expect(()=>assertProductQuality(a,'guide',{filename:'guide.txt',content:bytes})).toThrow('language gate');
});
it('does not persist findings text or release content revoked during asynchronous language checking',async()=>{
 const {a,file}=db();registerProductQuality(a,{...contract,language:'en-US'});const bytes=Buffer.from('Install locally.');const technical=assessProductQuality(a,'guide','guide.txt',bytes);
 await assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',async()=>new Response(JSON.stringify({matches:[{offset:0,length:7,rule:{id:'SPELL'},replacements:[{value:'private suggestion'}]}]})));
 expect(JSON.stringify(a.prepare('SELECT payload FROM obolus_product_language_checks').all())).not.toContain('private suggestion');
 expect(inspectProductLanguage(a,'guide','guide.txt',bytes).passed).toBe(false);
 let release!:(response:Response)=>void;const pending=assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',()=>new Promise(resolve=>{release=resolve;}));
 const b=new Database(file);dbs.push(b);revokeProductQuality(b,'guide',technical.contentDigest,'Defect');release(new Response(JSON.stringify({matches:[]})));
 await expect(pending).rejects.toThrow('revoked');expect(a.prepare('SELECT COUNT(*) n FROM obolus_product_language_checks').get()).toEqual({n:1});
});
it('snapshots language bytes and limits repeated checker attempts before I/O',async()=>{
 const {a}=db();registerProductQuality(a,{...contract,language:'en-US'});const original=Buffer.from('Install locally.'),bytes=Buffer.from(original);
 let release!:(response:Response)=>void;const pending=assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',()=>new Promise(resolve=>{release=resolve;}));
 bytes.fill(65);release(new Response(JSON.stringify({matches:[]})));await pending;
 expect(inspectProductLanguage(a,'guide','guide.txt',original).passed).toBe(true);expect(inspectProductLanguage(a,'guide','guide.txt',bytes).passed).toBe(false);
 const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({matches:[]})));
 for(let i=1;i<20;i++)await assessProductLanguage(a,'guide','guide.txt',original,undefined,request);
 await expect(assessProductLanguage(a,'guide','guide.txt',original,'http://127.0.0.1:8081/v2/check',request)).rejects.toThrow('limit');expect(request).not.toHaveBeenCalled();
});

it('uses operator configuration for the bound language tool rather than model-supplied status or endpoint',async()=>{
 const {a,file}=db();registerProductQuality(a,{...contract,language:'en-US'});
 vi.stubEnv('OBOLUS_COMMERCE_DB',file);vi.stubEnv('OBOLUS_LANGUAGE_CHECK_URL','http://127.0.0.1:8081/v2/check');
 const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({matches:[]})));vi.stubGlobal('fetch',request);
 try{
  const tool=createProductQualityTool();const result=JSON.parse(await tool.execute({action:'language_assess',product_id:'guide',filename:'guide.txt',content:'Install locally.',language:'de-CH',status:'checked_no_findings',endpoint:'https://external.invalid'},{} as never));
  expect(result.language).toBe('en-US');expect(request.mock.calls[0][0]).toBe('http://127.0.0.1:8081/v2/check');
  expect(JSON.parse(await tool.execute({action:'language_status',product_id:'guide',filename:'guide.txt',content:'Install locally.'},{} as never))).toMatchObject({passed:true});
 }finally{vi.unstubAllEnvs();vi.unstubAllGlobals();}
});

it('serializes language reviews across two connections and blocks delivery while a recheck is pending',async()=>{
 const {a,file}=db();registerProductQuality(a,{...contract,language:'en-US'});const bytes=Buffer.from('Install locally.');assessProductQuality(a,'guide','guide.txt',bytes);
 await assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',async()=>new Response(JSON.stringify({matches:[]})));
 const b=new Database(file);dbs.push(b);let release!:(r:Response)=>void;
 const pending=assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',()=>new Promise(resolve=>{release=resolve;}));
 expect(inspectProductLanguage(b,'guide','guide.txt',bytes)).toMatchObject({status:'pending_reconciliation',passed:false});
 expect(()=>assertProductQuality(b,'guide',{filename:'guide.txt',content:bytes})).toThrow('language gate');
 const other=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({matches:[]})));
 await expect(assessProductLanguage(b,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',other)).rejects.toThrow('pending');expect(other).not.toHaveBeenCalled();
 release(new Response(JSON.stringify({matches:[]})));await pending;
 expect(()=>assertProductQuality(b,'guide',{filename:'guide.txt',content:bytes})).not.toThrow();
});
it('keeps an interrupted language claim after reopen and never revives an earlier pass',async()=>{
 const {a,file}=db();registerProductQuality(a,{...contract,language:'en-US'});const bytes=Buffer.from('Install locally.');
 await assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',async()=>new Response(JSON.stringify({matches:[]})));
 // Simulates the durable state after a process dies between claiming and receiving a response.
 a.prepare("INSERT INTO obolus_product_language_attempts(product_id,status) VALUES('guide','pending')").run();a.close();
 const b=new Database(file);dbs.push(b);expect(inspectProductLanguage(b,'guide','guide.txt',bytes).passed).toBe(false);
 const provider=vi.fn();await expect(assessProductLanguage(b,'guide','guide.txt',bytes,undefined,provider)).rejects.toThrow('pending');expect(provider).not.toHaveBeenCalled();
 expect(()=>b.exec('DELETE FROM obolus_product_language_attempts')).toThrow('immutable');
});

it('withdraws an exact pending claim without reviving old passes or accepting late success',async()=>{
 const {a,file}=db();registerProductQuality(a,{...contract,language:'en-US'});const bytes=Buffer.from('Install locally.');assessProductQuality(a,'guide','guide.txt',bytes);
 const good=async()=>new Response(JSON.stringify({matches:[]}));await assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',good);
 let release!:(r:Response)=>void;const delayed=assessProductLanguage(a,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',()=>new Promise(resolve=>{release=resolve;}));
 const b=new Database(file);dbs.push(b);const attempt=inspectProductLanguage(b,'guide','guide.txt',bytes).attemptId!;
 expect(withdrawProductLanguage(b,'guide',attempt)).toMatchObject({releaseAuthorized:false,providerStarted:false});
 expect(inspectProductLanguage(a,'guide','guide.txt',bytes)).toMatchObject({status:'fresh_check_required',passed:false});
 expect(()=>assertProductQuality(a,'guide',{filename:'guide.txt',content:bytes})).toThrow('language gate');
 await assessProductLanguage(b,'guide','guide.txt',bytes,'http://127.0.0.1:8081/v2/check',good);
 const count=a.prepare('SELECT COUNT(*) n FROM obolus_product_language_checks').get();
 release(new Response(JSON.stringify({matches:[]})));await expect(delayed).rejects.toThrow('claim lost');
 expect(a.prepare('SELECT COUNT(*) n FROM obolus_product_language_checks').get()).toEqual(count);expect(inspectProductLanguage(a,'guide','guide.txt',bytes).passed).toBe(true);
 expect(()=>withdrawProductLanguage(a,'guide',attempt)).toThrow('changed');
});
it('rejects stale withdrawal IDs and preserves the bounded review budget',async()=>{
 const {a}=db();registerProductQuality(a,{...contract,language:'en-US'});const bytes=Buffer.from('Install locally.');
 for(let i=0;i<19;i++)await assessProductLanguage(a,'guide','guide.txt',bytes,undefined);
 const attempt=Number(a.prepare("INSERT INTO obolus_product_language_attempts(product_id,status) VALUES('guide','pending')").run().lastInsertRowid);
 expect(()=>withdrawProductLanguage(a,'guide',attempt+1)).toThrow('changed');
 withdrawProductLanguage(a,'guide',attempt);
 const provider=vi.fn();await expect(assessProductLanguage(a,'guide','guide.txt',bytes,undefined,provider)).rejects.toThrow('limit');expect(provider).not.toHaveBeenCalled();
 expect(inspectProductLanguage(a,'guide','guide.txt',bytes).passed).toBe(false);
});

it('does not mistake code fence suffixes, wrong markers or excessive indentation for a closing fence',()=>{
 const tick=String.fromCharCode(96);
 for(const closing of ['~~~suffix','~~~ ~','    ~~~',tick.repeat(3),'~~']){
  const source='Install\n~~~js\nvalue   \n'+closing;
  const report=inspectWriting(source,'markdown');expect(report.findings.map(f=>f.code)).toContain('unclosed_code_fence');expect(report.corrected).toBe(source);
  const {a}=db();registerProductQuality(a,contract);expect(assessProductQuality(a,'guide','guide.md',Buffer.from(source)).passed).toBe(false);
 }
});
it('preserves fenced and indented code while accepting valid longer closing markers',()=>{
 const source='Install\n  ~~~js\nvalue   \n  ~~~~ \n    code   \n\tother   ';
 const result=inspectWriting(source,'markdown');expect(result.corrected).toBe(source);expect(result.findings).toEqual([]);
 const tick=String.fromCharCode(96);const invalidOpening=tick.repeat(3)+'js'+tick+'name';
 expect(inspectWriting(invalidOpening,'markdown').findings).toEqual([]);
});

it('blocks synthetic credential shapes without persisting their matched values',()=>{
 const {a}=db();registerProductQuality(a,contract);
 const values=['sk-proj-'+ 'x'.repeat(24),'sk-svcacct-'+ 'y'.repeat(24),'ghp_'+ 'z'.repeat(36),'github_pat_'+ 'a'.repeat(45),'AKIA'+ 'B'.repeat(16)];
 for(const value of values){const bytes=Buffer.from('Install '+value);const result=assessProductQuality(a,'guide','guide.txt',bytes);
  expect(result.findings).toContain('possible_secret');expect(JSON.stringify(result)).not.toContain(value);
  expect(()=>assertProductQuality(a,'guide',{filename:'guide.txt',content:bytes})).toThrow('quality gate');
 }
 const history=JSON.stringify(a.prepare('SELECT payload FROM obolus_product_quality_assessments').all());for(const value of values)expect(history).not.toContain(value);
});
it('flags labelled private keys but does not confuse public wallet addresses or plain digests with secrets',()=>{
 const {a}=db();registerProductQuality(a,contract);const value='1'.repeat(64);
 for(const label of ['private_key = 0x','privateKey: ','"secret-key": "']){
  expect(inspectProductQuality(a,'guide','guide.txt',Buffer.from('Install '+label+value)).findings).toContain('possible_private_key');
 }
 for(const value of ['0x'+'1'.repeat(40),'SHA256: '+'2'.repeat(64),'sk-proj-documentation'])expect(inspectProductQuality(a,'guide','guide.txt',Buffer.from('Install '+value)).passed).toBe(true);
});
it('blocks credential-bearing JSON values through the same product guard',()=>{
 const {a}=db();registerProductQuality(a,{...contract,format:'json',requiredText:[],requiredJsonKeys:['instructions']});
 const bytes=Buffer.from(JSON.stringify({instructions:'Install locally',private_key:'0x'+'3'.repeat(64)}));
 expect(assessProductQuality(a,'guide','guide.json',bytes).findings).toContain('possible_private_key');
 expect(()=>assertProductQuality(a,'guide',{filename:'guide.json',content:bytes})).toThrow('quality gate');
});
