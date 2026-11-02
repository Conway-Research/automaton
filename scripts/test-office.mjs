import {spawnSync} from 'node:child_process';
import path from 'node:path';import {fileURLToPath} from 'node:url';import fs from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
export function preflightOfficeTests(python,run=spawnSync){
 if(typeof python!=='string'||!path.isAbsolute(python))throw Error('Explicit absolute Python path required (--python or NUMARON_OFFICE_TEST_PYTHON)');
 const probe=run(python,['-I','-c',"import json,sys; import docx,openpyxl; from importlib.metadata import version; print(json.dumps({'python':sys.version.split()[0],'docx':version('python-docx'),'openpyxl':version('openpyxl')}))"],{cwd:root,encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:65536});
 if(probe.error||probe.status!==0)throw Error('Office test runtime/packages unavailable; tests not started');
 let result;try{result=JSON.parse(probe.stdout);}catch{throw Error('Invalid runtime probe');}
 if(!['python','docx','openpyxl'].every(k=>typeof result[k]==='string'&&/^\d+\.\d+/.test(result[k])))throw Error('Invalid runtime package probe');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);let python=process.env.NUMARON_OFFICE_TEST_PYTHON,checkOnly=false;
  while(args.length){const arg=args.shift();if(arg==='--python'){python=args.shift();}else if(arg==='--check-only'){checkOnly=true;}else throw Error('Usage: node scripts/test-office.mjs --python ABSOLUTE_PATH [--check-only]');}
  const versions=preflightOfficeTests(python);console.log('Office test preflight: '+JSON.stringify(versions));
  if(!process.env.DOCX_VISUAL_SOFFICE)console.log('Optional real-renderer tests will skip: DOCX_VISUAL_SOFFICE is not configured. No renderer will be installed or selected automatically.');
  if(!checkOnly){
   const tests=fs.readdirSync(path.join(root,'scripts')).filter(n=>/^founder-(?:ugig-office.*|office-.*)\.test\.mjs$/.test(n)).map(n=>'scripts/'+n);
   tests.push('scripts/test-office-launcher.test.mjs','scripts/founder-offer-feasibility.test.mjs','scripts/founder-marketplace-work-source.test.mjs','scripts/founder-order-execution.test.mjs','outputs/office-leistungsplaene-20261023/verify.test.mjs');
   const result=spawnSync(process.execPath,['--import','tsx','--test',...tests],{cwd:root,env:{...process.env,NUMARON_OFFICE_TEST_PYTHON:python},stdio:'inherit',windowsHide:true});
   process.exitCode=result.error?1:result.status??1;
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
