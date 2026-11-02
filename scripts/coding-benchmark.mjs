// Run after pnpm build. Only reviewed pure primitives, synthetic data and a temporary DB.
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {recordCodingBenchmark,codingBenchmarkLessons} from '../dist/agent/coding-benchmark.js';

if(process.argv.length!==2)throw Error('No custom code, database paths or arguments accepted');
const root=fileURLToPath(new URL('../',import.meta.url));
const temporary=mkdtempSync(path.join(tmpdir(),'obolus-coding-evidence-'));
const cpu=process.cpuUsage();
const memory=process.memoryUsage();
const db=new Database(path.join(temporary,'evidence.db'));
try {
  const report=recordCodingBenchmark(db);
  const learning=codingBenchmarkLessons(db);
  const files=['src/agent/coding-delivery.ts','src/agent/coding-benchmark.ts','src/agent/harness-types.ts',
    'src/__tests__/coding-benchmark.test.ts','scripts/coding-benchmark.mjs',
    'dist/agent/coding-delivery.js','dist/agent/coding-benchmark.js'];
  const artifact=path.join(root,'artifacts',`coding-benchmark-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  mkdirSync(artifact,{recursive:true});
  const result={at:new Date().toISOString(),...report,learning,
    resources:{cpuMicroseconds:process.cpuUsage(cpu),heapDeltaBytes:process.memoryUsage().heapUsed-memory.heapUsed,
      processPeakRssKiB:process.resourceUsage().maxRSS},
    accounting:{measuredProviderCalls:0,measuredProviderCostCents:0,hardwareCost:'not measured',employeeCost:'excluded'},
    fileDigests:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')])),
    activeDatabaseAccess:false,liveReady:false,productionAccepted:false};
  writeFileSync(path.join(artifact,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  writeFileSync(path.join(artifact,'REPORT.txt'),[
    'OBOLUS OFFLINE PROGRAMMING BENCHMARK',
    `Control: ${report.before.passed}/${report.before.total}; current: ${report.after.passed}/${report.after.total}.`,
    `Regressions: ${report.regressions.length}. Improvements: ${report.improvements.join(', ')}.`,
    ...learning,
    report.limitation,
    'Three narrow contracts: up to 500 JSON records to explicitly mapped CSV; endpoint/response inventory from a supplied API paths subset; title extraction from supplied mock HTML pages.',
    'Withheld cases are omitted from the brief but visible in repository source. This is not a blind independent audit.',
    'Measurements cover local deterministic code only. No language-model inference, customer delivery, network fetch or shell-generated-code execution.',
    'Persistent evidence is exercised only on this temporary database. Active/Paper databases are not seeded or migrated.',
    'Repeat: pnpm.cmd build ; node scripts/coding-benchmark.mjs (run the second command only after a successful build).',
  ].join('\n')+'\n',{flag:'wx'});
  console.log(JSON.stringify({artifact,before:report.before.passed,after:report.after.passed,total:report.after.total,
    beforeMs:report.before.elapsedMs,afterMs:report.after.elapsedMs,resources:result.resources}));
  if(report.regressions.length||report.after.passed!==report.after.total)process.exitCode=1;
} finally {
  db.close();
  // mkdtemp returns a fresh child; never accept caller-selected cleanup targets.
  if(path.dirname(temporary)===path.resolve(tmpdir())&&path.basename(temporary).startsWith('obolus-coding-evidence-')) {
    rmSync(temporary,{recursive:true,force:true});
  } else {
    console.error('Cleanup refused: unexpected temporary path');
    process.exitCode=1;
  }
}
