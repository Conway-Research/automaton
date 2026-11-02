import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const must=(ok,message)=>{if(!ok)throw Error('Office technical report: '+message);};
/** Structural byte binding only. Never constitutes independent specialist review. */
export function validateOfficeTechnicalReport(candidate,workKind){
 const files=candidate?.files,binary=candidate?.binaryArtifacts;
 must(Array.isArray(files)&&files.length<=50&&Array.isArray(binary)&&binary.length===1,'package shape');
 const reports=files.filter(f=>f.path==='technical-report.json');must(reports.length===1,'single report required');
 const report=JSON.parse(reports[0].content);
 must(report?.schema==='numaron-office-technical-v1'&&report.technicalPassed===true&&report.independentlyVerified===false&&report.workKind===workKind&&report.validationMode==='fixed-reference','fixed reference report required');
 const expected=[...binary.map(b=>({name:b.name,size:b.size,sha256:b.sha256})),...files.filter(f=>f.path!=='technical-report.json').map(f=>({name:f.path,size:Buffer.byteLength(f.content,'utf8'),sha256:hash(Buffer.from(f.content,'utf8'))}))];
 must(new Set(expected.map(f=>f.name.toLowerCase())).size===expected.length,'duplicate package file');
 must(Array.isArray(report.files)&&report.files.length===expected.length,'complete file manifest');
 const remaining=new Map(expected.map(f=>[f.name,f]));
 for(const entry of report.files){
  must(entry&&Object.keys(entry).sort().join(',')==='name,sha256,size','manifest fields');
  const wanted=remaining.get(entry.name);
  must(wanted&&entry.sha256===wanted.sha256&&entry.size===wanted.size,'file bytes differ');remaining.delete(entry.name);
 }
 must(remaining.size===0,'missing manifest entries');return report;
}
