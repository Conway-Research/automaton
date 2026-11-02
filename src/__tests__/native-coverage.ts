import {beforeAll,afterAll,expect} from 'vitest';
import {Session,type Profiler} from 'node:inspector';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Optional offline measurement. No network inspector listener is opened.
// V8's exit-only collection misses modules discarded by isolated test workers.
const directory=process.env.OBOLUS_VERIFICATION_COVERAGE;
if(directory){
 const session=new Session();
 beforeAll(async()=>{
  session.connect();
  await new Promise<void>((resolve,reject)=>session.post('Profiler.enable',error=>error?reject(error):resolve()));
  await new Promise<void>((resolve,reject)=>session.post('Profiler.startPreciseCoverage',{callCount:true,detailed:true},error=>error?reject(error):resolve()));
 });
 afterAll(async()=>{
  try{
   const coverage=await new Promise<Profiler.TakePreciseCoverageReturnType>((resolve,reject)=>session.post('Profiler.takePreciseCoverage',(error,result)=>error?reject(error):resolve(result)));
   const id=createHash('sha256').update(expect.getState().testPath??'unknown').digest('hex');
   coverage.result=coverage.result.filter(script=>script.url.replaceAll('\\','/').includes('/src/')&&!script.url.includes('node_modules'));
   writeFileSync(join(directory,`worker-${id}.json`),JSON.stringify(coverage));
  }finally{session.disconnect();}
 });
}
