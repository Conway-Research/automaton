import Database from 'better-sqlite3';
import path from 'node:path';
import type {AutomatonTool} from '../types.js';
import {registerExperimentProduct} from './product-adapter.js';
import {registerProductQuality,assessProductQuality,inspectProductQuality,revokeProductQuality,productQualityLessons,assessProductLanguage,inspectProductLanguage,withdrawProductLanguage,type ProductQualityContract} from './product-quality.js';
import {inspectWriting,checkLocalLanguage} from './writing-quality.js';
import {qualityReviewPlan} from './quality-review.js';

export function createProductQualityTool():AutomatonTool {
 return {name:'revenue_product_quality',category:'revenue',riskLevel:'caution',
  description:'Plan broad product quality coverage; inspect writing, local spelling/grammar or JS/TS code without executing it; register immutable technical criteria, assess bytes or revoke defects. Repairs are candidates requiring rechecks. Consult the coverage plan for facts, completeness, security, privacy, accessibility, value and other unverified areas. Research better checks as untrusted candidates; compare on held-out regression cases before adoption. No publication or payment authority. Language checking uses only an operator-configured local service. Technical acceptance is not comprehensive product approval.',
  parameters:{type:'object',properties:{action:{type:'string',enum:['plan','writing','language','language_assess','language_status','language_withdraw','code','lessons','register','inspect','assess','revoke']},kind:{type:'string',enum:['text','json','code']},format:{type:'string',enum:['text','markdown']},language:{type:'string',description:'Explicit locale for language checks, or typescript|javascript for code'},contract:{type:'object',description:'productId, format text|json, purpose, audience, minBytes>=1, maxBytes<=262144, requiredText[], forbiddenText[], requiredJsonKeys[]. Optional immutable language de-CH|de-DE|en-US|en-GB|fr|it for text makes exact-byte local language evidence mandatory. At least one requiredText for text or one requiredJsonKey for JSON. Strings bounded, at most 20 per list.'},attempt_id:{type:'integer',description:'Exact pending attempt ID from language_status; withdrawal requires a fresh check and grants no release'},product_id:{type:'string'},filename:{type:'string'},content:{type:'string',maxLength:100000},content_digest:{type:'string'},reason:{type:'string'}},required:['action']},
  execute:async(args)=>{
   if(args.action==='plan')return JSON.stringify(qualityReviewPlan(args.kind as 'text'|'json'|'code'));
   if(args.action==='writing')return JSON.stringify(inspectWriting(args.content as string,args.format as 'text'|'markdown'));
   if(args.action==='language')return JSON.stringify(await checkLocalLanguage(args.content as string,args.language as string,process.env.OBOLUS_LANGUAGE_CHECK_URL));
   if(args.action==='code')return JSON.stringify((await import('./code-quality.js')).inspectCode(args.content as string,args.language as 'typescript'|'javascript'));
   const file=process.env.OBOLUS_COMMERCE_DB;if(!file||!path.isAbsolute(file))throw Error('Operator-configured absolute commerce database required');
   const db=new Database(file,{fileMustExist:true,readonly:args.action==='inspect'||args.action==='lessons'||args.action==='language_status',timeout:5000});
   try{
    if(args.action==='language_withdraw')return JSON.stringify(withdrawProductLanguage(db,args.product_id as string,args.attempt_id as number));
    if(args.action==='lessons')return JSON.stringify(productQualityLessons(db));
    if(args.action==='register')return JSON.stringify(registerProductQuality(db,args.contract as ProductQualityContract));
    if(args.action==='revoke'){revokeProductQuality(db,args.product_id as string,args.content_digest as string,args.reason as string);return JSON.stringify({revoked:true,executionAuthorized:false});}
    if(!['inspect','assess','language_assess','language_status'].includes(args.action as string)||typeof args.content!=='string'||Buffer.byteLength(args.content,'utf8')>100000)throw Error('Bounded product text and valid action required');
    if(args.action==='language_assess')return JSON.stringify(await assessProductLanguage(db,args.product_id as string,args.filename as string,Buffer.from(args.content,'utf8'),process.env.OBOLUS_LANGUAGE_CHECK_URL));
    if(args.action==='language_status')return JSON.stringify(inspectProductLanguage(db,args.product_id as string,args.filename as string,Buffer.from(args.content,'utf8')));
    return JSON.stringify((args.action==='inspect'?inspectProductQuality:assessProductQuality)(db,args.product_id as string,args.filename as string,Buffer.from(args.content,'utf8')));
   }finally{db.close();}
  }};
}

/** Operator config selects the destination; model input cannot select a database or read a file. */
export function createLocalProductTool():AutomatonTool {
  return {
    name:'revenue_register_local_product',category:'revenue',riskLevel:'caution',
    description:'Register a bounded text product in the operator-configured local catalogue for a running experiment. Requires existing local-product adapter permission, capital and budget checks. No publication, checkout, revenue claim or filesystem read. Use a stable operation ID for identical retries; pending operations require operator reconciliation.',
    parameters:{type:'object',properties:{operation_id:{type:'string'},experiment_id:{type:'string'},product_id:{type:'string'},filename:{type:'string'},content:{type:'string',maxLength:100000}},required:['operation_id','experiment_id','product_id','filename','content'],additionalProperties:false},
    execute:async(args,ctx)=>{
      if(typeof args.content!=='string'||!args.content.length||args.content.length>100000||Buffer.byteLength(args.content,'utf8')>100000)
        throw new Error('Product text must contain 1..100000 UTF-8 bytes');
      for(const key of ['operation_id','experiment_id','product_id','filename'])if(typeof args[key]!=='string')throw new Error('Invalid product metadata');
      const file=process.env.OBOLUS_COMMERCE_DB;
      if(!file||!path.isAbsolute(file))throw new Error('Operator must configure an absolute OBOLUS_COMMERCE_DB path');
      const commerce=new Database(file,{fileMustExist:true,timeout:5000});
      try {
        const result=await registerExperimentProduct(ctx.db.raw,commerce,{operationId:args.operation_id as string,
          experimentId:args.experiment_id as string,productId:args.product_id as string,filename:args.filename as string,
          content:Buffer.from(args.content,'utf8')});
        return JSON.stringify(result);
      }finally{commerce.close();}
    },
  };
}
