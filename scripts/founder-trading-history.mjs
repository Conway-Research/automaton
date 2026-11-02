import fs from 'node:fs';import path from 'node:path';import Database from 'better-sqlite3';
// Existing local demo journal only. No provider, power or execution capability.
export function readTradingHistory(root){
 const value={checkedAt:new Date().toISOString(),demo:{status:'unavailable',trades:null},live:{status:'not-connected',trades:null},learning:null};
 try{
  const dir=path.join(root,'artifacts/founder-integration-20261012'),profile=JSON.parse(fs.readFileSync(path.join(dir,'mt5-demo-profile.json'),'utf8'));
  const file=path.join(dir,'demo-execution-20261017.db.orders.db');const db=new Database(file,{readonly:true,fileMustExist:true});let rows;
  try{rows=db.prepare("SELECT payload,status,result FROM intents WHERE json_extract(payload,'$.account')=? AND json_extract(payload,'$.server')=? ORDER BY rowid DESC").all(String(profile.login),profile.server);}finally{db.close();}
  value.demo={status:'available',source:'Lokales Numaron-Demojournal',trades:rows.map(row=>{const i=JSON.parse(row.payload),r=row.result?JSON.parse(row.result):null;return {id:i.signalId,symbol:i.symbol,side:i.side,status:row.status,observedAt:i.observedAt,entry:i.entry,stop:i.stop,target:i.target,lots:i.lots,profit:row.status==='closed'&&r?.finalityVerified===true&&Number.isFinite(r.realizedDemoProfit)?r.realizedDemoProfit:null,currency:r?.currency??null,finalityVerified:r?.finalityVerified===true};})};
  try{const report=JSON.parse(fs.readFileSync(path.join(root,'artifacts/demo-execution-20261017/multiframe-research.json'),'utf8'));const binding=report.fixedH4Research?.manifest?.binding;if(binding?.account===String(profile.login)&&binding.server===profile.server){value.learning=report.bchTradeLearning??null;value.researchObservedAt=report.updatedAt*1000;}}catch{}
 }catch{}
 return value;
}
