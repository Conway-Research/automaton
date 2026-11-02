// Validate saved receipts and publish the dashboard projection. CLI optionally reads a public spot quote while ON; no credentials, RPC, trades or database writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readUSDCQuote} from './founder-order-income-fx.mjs';
const WALLET='0x6cc15b882a463423ea7a400ce6512c30b1a76615';
const TOKEN='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const CONTRACT='0x099b6605c22cc3c617746bf0b33788e52a7ad5c0';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const lower=x=>String(x??'').toLowerCase();
const address=x=>'0x'+lower(x).slice(-40);
const requireEvidence=x=>{if(!x)throw Error('Zahlungsbeleg unvollständig oder widersprüchlich');};
function atomic(value){requireEvidence(/^\d+(\.\d{1,6})?$/.test(value));const [a,b='']=value.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));}
export function collectOrderIncome(bundles){
 const found=new Map(),conflicts=new Set(),issues=[];
 for(const f of bundles)try{
  const c=f.confirmation,hash=lower(c.transactionHash),job=c.baseJob??c.baseJobId,bid=c.bid??c.bidId;
  requireEvidence(c.actualReceiptConfirmed===true&&c.canonicalBlockVerified===true&&c.jobAndRecipientMatched===true);
  requireEvidence(lower(c.wallet)===WALLET&&lower(c.token)===TOKEN&&/^0x[0-9a-f]{64}$/.test(hash)&&Number.isSafeInteger(job)&&job>0&&Number.isSafeInteger(bid)&&bid>0);
  const results=f.rpc.map(x=>x.result),r=results.find(x=>x?.logs&&lower(x.transactionHash)===hash),tx=results.find(x=>x?.input&&lower(x.hash)===hash);
  const chainResult=results.find(x=>typeof x==='string')??f.blocks.map(x=>x.result).find(x=>typeof x==='string');
  requireEvidence(chainResult==='0x2105'&&tx?.chainId==='0x2105'&&r?.status==='0x1'&&lower(tx?.to)===CONTRACT&&BigInt('0x'+tx.input.slice(10,74))===BigInt(job));
  const block=f.blocks.map(x=>x.result).find(x=>x?.hash&&lower(x.hash)===lower(r.blockHash)&&x.number===r.blockNumber);
  requireEvidence(block&&Number.isFinite(Number(BigInt(block.timestamp))));
  const logs=r.logs.filter(l=>lower(l.address)===TOKEN&&lower(l.topics?.[0])===TRANSFER&&address(l.topics?.[1])===CONTRACT&&address(l.topics?.[2])===WALLET);
  requireEvidence(logs.length===1);const l=logs[0],amount=BigInt(l.data);
  requireEvidence(l.removed===false&&lower(l.transactionHash)===hash&&lower(l.blockHash)===lower(r.blockHash)&&amount>0n&&amount===atomic(c.receivedUSDC));
  requireEvidence(r.logs.some(x=>lower(x.address)===CONTRACT&&x.topics?.length>=3&&BigInt(x.topics[1])===BigInt(job)&&address(x.topics[2])===WALLET&&BigInt(x.data)===amount));
  const logIndex=Number(BigInt(l.logIndex)),id=`8453:${TOKEN}:${hash}:${logIndex}`;
  const row={id,chainId:8453,token:TOKEN,wallet:WALLET,transactionHash:hash,logIndex,amountAtomic:amount.toString(),receivedAt:new Date(Number(BigInt(block.timestamp))*1000).toISOString(),platform:'Synmerco',jobId:job,bidId:bid,orderURL:`https://synmerco-escrow.onrender.com/v1/commerce/jobs/base/${job}`,transactionURL:'https://basescan.org/tx/'+hash,finalized:c.finalized===true,source:f.source};
  const prior=found.get(id);
  if(prior&&[prior.amountAtomic,prior.jobId,prior.bidId,prior.receivedAt].join('|')!==[row.amountAtomic,row.jobId,row.bidId,row.receivedAt].join('|')){conflicts.add(id);issues.push({source:f.source,reason:'Widersprüchliche Kopien desselben Zahlungseingangs'});}
  else if(!prior)found.set(id,row);
 }catch{issues.push({source:f.source,reason:'Zahlungsbeleg unvollständig oder widersprüchlich'});}
 const receipts=[...found.values()].filter(x=>!conflicts.has(x.id)).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt));
 return {schema:'numaron-order-income-v1',observedAt:new Date().toISOString(),currency:'USDC',decimals:6,totalAtomic:receipts.reduce((n,x)=>n+BigInt(x.amountAtomic),0n).toString(),receipts,issues,scope:'Gespeicherte, validierte Auftragseingänge auf Base; kein aktueller Walletsaldo, keine CHF-Umrechnung und kein Gesamtgewinn.'};
}
export function readOrderIncome(root){
 const bundles=[],read=p=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>4000000)throw Error('Invalid evidence file');return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));};
 for(const entry of fs.readdirSync(path.join(root,'artifacts'),{withFileTypes:true})){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;const dir=path.join(root,'artifacts',entry.name),source='artifacts/'+entry.name;
  // Evidence filenames are deliberately fixed; report contents never select arbitrary files.
  if(fs.existsSync(path.join(dir,'payment-confirmed.json')))try{bundles.push({source,confirmation:read(path.join(dir,'payment-confirmed.json')),rpc:read(path.join(dir,'receipt-rpc.json')),blocks:read(path.join(dir,'block-rpc.json'))});}catch{bundles.push({source});}
  if(/^synmerco-receipt-check-/.test(entry.name))try{
   const c=read(path.join(dir,'completion.json')),rpc=read(path.join(dir,'transaction-evidence.json')),blocks=read(path.join(dir,'block-verification.json'));
   for(const x of c.receipts??[])bundles.push({source,confirmation:{...x,wallet:c.wallet,token:c.token,actualReceiptConfirmed:x.successful===true,jobAndRecipientMatched:x.jobIdAndRecipientLogMatch===true,finalized:x.belowFinalizedHeight===true},rpc,blocks});
  }catch{bundles.push({source});}
 }
 return collectOrderIncome(bundles);
}
export function publishOrderIncome(root){
 const report=readOrderIncome(root),file=path.join(root,'web/founder/finance-refresh.mjs');
 try{report.fx=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-order-income-usdc-chf.json'),'utf8'));}catch{report.fx=null;}
 const text=fs.readFileSync(file,'utf8'),block='/* ORDER_INCOME_JSON\n'+JSON.stringify(report).replace(/\*\//g,'*\\/')+'\nEND_ORDER_INCOME_JSON */';
 const next=/\/\* ORDER_INCOME_JSON\n[\s\S]*?\nEND_ORDER_INCOME_JSON \*\//.test(text)?text.replace(/\/\* ORDER_INCOME_JSON\n[\s\S]*?\nEND_ORDER_INCOME_JSON \*\//,()=>block):text+'\n'+block+'\n';
 const tmp=file+'.income-tmp';fs.writeFileSync(tmp,next);fs.renameSync(tmp,file);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const isOn=()=>{try{return JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1)).enabled===true;}catch{return false;}};
 if(!isOn()){console.log(JSON.stringify({status:'powered-off'}));process.exit(0);}
 try{const q=await readUSDCQuote({isOn});if(q.status==='current'&&isOn()){const file=path.join(root,'artifacts/founder-order-income-usdc-chf.json');fs.writeFileSync(file+'.tmp',JSON.stringify(q));fs.renameSync(file+'.tmp',file);}}catch{console.error('USDC/CHF-Kursabruf fehlgeschlagen; letzter belegter Kurs bleibt erhalten.');}
 if(!isOn()){console.log(JSON.stringify({status:'powered-off'}));process.exit(0);}
 console.log(JSON.stringify(publishOrderIncome(root)));
}
