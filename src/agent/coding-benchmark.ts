import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import type {Database} from 'better-sqlite3';
import {recordsToCsv, documentApi, processMockPages} from './coding-delivery.js';

type Domain = 'csv' | 'api' | 'web';
type Variant = 'baseline' | 'current';
interface Case {id: string; domain: Domain; split: 'practice' | 'withheld'; input: unknown; expected?: unknown; error?: string}
/** Withheld from the task brief, NOT secret from developers with repository access. */
const cases: Case[] = [
  {id:'csv-simple',domain:'csv',split:'practice',input:[[{sku:'001',price:2}],['sku','price']],expected:'sku,price\r\n001,2'},
  {id:'csv-quotes',domain:'csv',split:'withheld',input:[[{sku:'a,"b\nc'}],['sku']],expected:'sku\r\n"a,""b\nc"'},
  {id:'csv-formula',domain:'csv',split:'withheld',input:[[{sku:' =1+1'}],['sku']],expected:"sku\r\n' =1+1"},
  {id:'csv-null-duplicate',domain:'csv',split:'withheld',input:[[{sku:null},{sku:null}],['sku']],expected:'sku\r\n\r\n'},
  {id:'csv-nested',domain:'csv',split:'withheld',input:[[{sku:{value:1}}],['sku']],error:'CSV_AMBIGUOUS_VALUE'},
  {id:'csv-unmapped',domain:'csv',split:'withheld',input:[[{sku:'1',stock:9}],['sku']],error:'CSV_UNMAPPED_FIELD'},
  {id:'api-basic',domain:'api',split:'practice',input:{paths:{'/items':{get:{responses:{'200':{}}}}}},expected:'GET /items | responses: 200'},
  {id:'api-methods',domain:'api',split:'withheld',input:{paths:{'/z':{post:{responses:{'201':{},'400':{}}}},'/a':{delete:{}}}},expected:'DELETE /a | responses: unknown\nPOST /z | responses: 201, 400'},
  {id:'api-metadata',domain:'api',split:'withheld',input:{paths:{'/a':{parameters:{},get:{}}}},expected:'GET /a | responses: unknown'},
  {id:'api-invented-response',domain:'api',split:'withheld',input:{paths:{'/a':{get:{responses:{success:{}}}}}},error:'API_RESPONSE'},
  {id:'web-basic',domain:'web',split:'practice',input:[{url:'https://fixture.invalid/a',status:200,contentType:'text/html',body:'<title>Hello</title>'}],expected:['https://fixture.invalid/a\tHello']},
  {id:'web-entity',domain:'web',split:'withheld',input:[{url:'https://fixture.invalid/a',status:200,contentType:'text/html',body:'<title>A &amp; B</title><script>ignored</script>'}],expected:['https://fixture.invalid/a\tA & B']},
  {id:'web-denied',domain:'web',split:'withheld',input:[{url:'https://fixture.invalid/a',status:403,contentType:'text/html',body:'<title>Denied</title>'}],error:'WEB_INPUT'},
  {id:'web-out-of-scope',domain:'web',split:'withheld',input:[{url:'http://127.0.0.1/a',status:200,contentType:'text/html',body:'<title>Secret</title>'}],error:'WEB_INPUT'},
  {id:'web-malformed',domain:'web',split:'withheld',input:[{url:'https://fixture.invalid/a',status:200,contentType:'text/html',body:'<title>One</title><title>Two</title>'}],error:'WEB_TITLE'},
];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const lessons: Record<Domain,string> = {
  csv:'Verify escaping, spreadsheet formulas, duplicate preservation and unmapped/nested values against the agreed schema.',
  api:'Derive methods and response codes only from the supplied specification; mark omissions unknown.',
  web:'Verify scope, status, content type and conflicting inputs before extracting data. Mock parsing grants no network permission.',
};
// Deliberately naive, frozen control implementations: not the historical Obolus model.
function baseline(c: Case): unknown {
  if(c.domain==='csv') { const [rows,columns]=c.input as [Record<string,unknown>[],string[]];return [columns.join(','),...rows.map(row=>columns.map(k=>String(row[k]??'')).join(','))].join('\r\n'); }
  if(c.domain==='api') { const spec=c.input as Parameters<typeof documentApi>[0];return Object.keys(spec.paths).map(p=>`GET ${p} | responses: 200`).join('\n'); }
  return (c.input as Parameters<typeof processMockPages>[0]).map(p=>`${p.url}\t${p.body.match(/<title>(.*?)<\/title>/)?.[1]??''}`);
}
function current(c: Case): unknown {
  if(c.domain==='csv') return recordsToCsv(...c.input as Parameters<typeof recordsToCsv>);
  if(c.domain==='api') return documentApi(c.input as Parameters<typeof documentApi>[0]);
  return processMockPages(c.input as Parameters<typeof processMockPages>[0], 'https://fixture.invalid');
}
export const CODING_SUITE_DIGEST = hash(cases);
export const CODING_CANDIDATE_DIGEST = hash([recordsToCsv.toString(),documentApi.toString(),processMockPages.toString(),current.toString()]);
export function runCodingBenchmark(variant: Variant) {
  if(variant!=='baseline'&&variant!=='current') throw Error('Unknown reviewed candidate');
  const started=performance.now();
  const results=cases.map(c=>{
    let passed=false;
    try { const output=(variant==='current'?current:baseline)(structuredClone(c));passed=c.error===undefined&&hash(output)===hash(c.expected); }
    catch(error){ passed=c.error!==undefined&&error instanceof Error&&error.message===c.error; }
    return {id:c.id,domain:c.domain,split:c.split,passed};
  });
  return {version:1 as const,suiteDigest:CODING_SUITE_DIGEST,candidateDigest:variant==='current'?CODING_CANDIDATE_DIGEST:hash(baseline.toString()),
    variant,results,passed:results.filter(r=>r.passed).length,total:results.length,elapsedMs:performance.now()-started,
    providerCalls:0,providerCostCents:0,scope:'synthetic-reviewed-primitives-only' as const};
}
export function compareCodingBenchmarks() {
  const before=runCodingBenchmark('baseline'),after=runCodingBenchmark('current');
  return {before,after,regressions:after.results.filter((r,i)=>!r.passed&&before.results[i].passed).map(r=>r.id),
    improvements:after.results.filter((r,i)=>r.passed&&!before.results[i].passed).map(r=>r.id),
    limitation:'Frozen naive control versus reviewed code. Not a model benchmark, customer acceptance, secret holdout or production approval.'};
}
/** Trusted offline host entrypoint only; intentionally not exposed as an agent tool. */
export function recordCodingBenchmark(db: Database) {
  const report=compareCodingBenchmarks();
  const payload=JSON.stringify(report),digest=hash(report);
  db.exec('CREATE TABLE IF NOT EXISTS coding_benchmark_evidence (digest TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO coding_benchmark_evidence VALUES (?,?)').run(digest,payload);
  return report;
}
/** Read-only, bounded, no raw persisted text enters model context. Hash is integrity, not authentication. */
export function codingBenchmarkLessons(db: Database): string[] {
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='coding_benchmark_evidence'").get())return [];
  try {
    const rows=db.prepare('SELECT digest,payload FROM coding_benchmark_evidence ORDER BY rowid DESC LIMIT 1').all() as {digest:string;payload:string}[];
    if(!rows.length)return [];
    const row=rows[0];if(row.payload.length>20000)return ['Programming evidence invalid: revalidate before making capability claims.'];
    const report=JSON.parse(row.payload) as ReturnType<typeof compareCodingBenchmarks>;
    // Recompute deterministic results rather than trusting persisted success flags or lesson text.
    const expected=compareCodingBenchmarks();
    const stable=(r:typeof expected)=>JSON.stringify([r.before.results,r.after.results,r.before.candidateDigest,r.after.candidateDigest,r.after.suiteDigest,r.regressions,r.improvements]);
    if(hash(report)!==row.digest||stable(report)!==stable(expected))return ['Programming evidence stale or invalid: revalidate before making capability claims.'];
    return (['csv','api','web'] as const).map(domain=>{
      const prior=report.before.results.filter(r=>r.domain===domain&&r.passed).length;
      const matched=report.after.results.filter(r=>r.domain===domain);
      const passed=matched.filter(r=>r.passed).length;
      const state=passed===matched.length?'bounded checks passed; retain regression coverage':'incomplete: repair failed checks before capability claims';
      return `Synthetic ${domain} checks: control ${prior}/${matched.length}, current ${passed}/${matched.length}; ${state}. ${lessons[domain]} This is not independent customer acceptance or model skill certification.`;
    });
  } catch { return ['Programming evidence unreadable: revalidate before making capability claims.']; }
}
