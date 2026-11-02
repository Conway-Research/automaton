import {parentPort,workerData} from 'node:worker_threads';
import {evaluateCashTrial,completeFamilyReports} from '../src/revenue/long-history/evaluate.ts';
import {evaluateReferenceTrial} from '../src/revenue/long-history/reference.ts';
try {
 if(workerData.kind==='cash')parentPort.postMessage({ok:true,value:evaluateCashTrial(workerData.series,workerData.registration,workerData.variantId)});
 else if(workerData.kind==='reference')parentPort.postMessage({ok:true,value:evaluateReferenceTrial(workerData.series,workerData.registration,workerData.variantId)});
 else if(workerData.kind==='family')parentPort.postMessage({ok:true,value:completeFamilyReports(workerData.reports,workerData.seed,workerData.expectedVariants)});
 else throw Error('Unsupported research worker job');
} catch(error){parentPort.postMessage({ok:false,error:error.message});}
