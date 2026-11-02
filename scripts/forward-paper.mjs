import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {strategySignal} from '../src/revenue/strategy-research.ts';
import {sizeFractionalPaper} from '../src/revenue/fractional-paper-sizing.ts';
import {fractionalPaperQuote} from '../src/revenue/paper-trading.ts';

export function paperStep(state,variant,bars,q,protocol,now){
 const s=structuredClone(state);let action='abstain',reason='no signal';
 if(s.position){
  const p=s.position;
  if(q.bid<=p.stop||q.bid>=p.target||Math.floor(now/86400000)>Math.floor(p.entered/86400000)||now>=protocol.endsAt){
   const result=fractionalPaperQuote(p.entry,q.bid,p.atoms,protocol.rules,protocol.friction);
   s.equity+=result.netPnlCents;s.closed++;s.position=null;s.lastBar=bars.at(-1).time;
   action='paper-exit';reason=q.bid<=p.stop?'observed-stop':q.bid>=p.target?'observed-target':'time-exit';
  }else{action='hold';reason='waiting';}
 }else if(now>=protocol.endsAt){reason='phase ended';}
 else if(s.equity<100){reason='insufficient virtual capital';}
 else if(s.lastBar!==bars.at(-1).time){
  s.lastBar=bars.at(-1).time;
  const plan=strategySignal(variant,'paper')(bars,q.ask);
  if(plan){const size=sizeFractionalPaper(q.ask,plan.stopCents,s.equity,Math.floor(s.equity*.01),protocol.rules,protocol.friction);
   if(size&&size.atoms<=q.askQty*protocol.rules.scale){s.position={entry:q.ask,stop:plan.stopCents,target:plan.targetsCents[0],atoms:size.atoms,entered:now};action='paper-entry';reason='fixed signal';}
   else reason='size or displayed liquidity insufficient';
  }
 }else reason='no new completed bar';
 return {state:s,action,reason};
}
export async function forwardPaper(dir,once=false){
 fs.mkdirSync(dir,{recursive:true});
 const db=new Database(path.join(dir,'paper.db'));db.pragma('journal_mode=WAL');db.pragma('busy_timeout=5000');
 db.exec('CREATE TABLE IF NOT EXISTS protocol(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS state(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY,owner TEXT,expires INTEGER)');
 const owner=String(process.pid)+':'+Date.now();let running=true;
 const acquire=db.transaction(()=>{const old=db.prepare('SELECT * FROM lease WHERE id=1').get();if(old&&old.expires>Date.now()&&old.owner!==owner)throw Error('Another paper observer holds the lease');db.prepare('INSERT OR REPLACE INTO lease VALUES(1,?,?)').run(owner,Date.now()+120000);});
 const log=value=>db.prepare('INSERT INTO journal(at,payload) VALUES(?,?)').run(Date.now(),JSON.stringify(value));
 const stop=()=>{running=false;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  acquire.immediate();
  let row=db.prepare('SELECT payload FROM protocol WHERE id=1').get();
  if(!row){const previous=JSON.parse(fs.readFileSync('artifacts/trading-three-stage-20261011/protocol.json','utf8'));const protocol={startedAt:Date.now(),endsAt:Date.now()+7*86400000,symbols:['BTCUSDT','ETHUSDT','SOLUSDT'],variants:previous.variants,rules:previous.rules,friction:previous.friction,capitalCents:10000,pollMs:15000,source:'Binance public REST; no account',liveAuthorized:false,selection:'All fixed variants reported; no winner promotion',limits:'Seven days is an initial prospective sample, not guaranteed statistical sufficiency. Quotes sampled every 15 seconds; missed intrainterval excursions, partial fills and queue priority are not modelled. Fee and lot rules are hypothetical. No HFT validation. Separate 100 USDT virtual account for every symbol/variant.'};db.prepare('INSERT INTO protocol VALUES(1,?)').run(JSON.stringify(protocol));row={payload:JSON.stringify(protocol)};fs.writeFileSync(path.join(dir,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});}
  const protocol=JSON.parse(row.payload),protocolHash=createHash('sha256').update(row.payload).digest('hex');
  const get=async suffix=>{const r=await fetch('https://api.binance.com/api/v3/'+suffix,{signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('Public feed HTTP '+r.status);return r.json();};
  do{
   acquire.immediate();
   for(const symbol of protocol.symbols){
    try{
     const before=Date.now();const raw=await get(`klines?symbol=${symbol}&interval=15m&limit=25`);const quote=await get(`ticker/bookTicker?symbol=${symbol}`);const now=Date.now();
     const completed=raw.filter(b=>b[6]<now),bars=completed.map(b=>({time:b[0],open:Math.round(Number(b[1])*100),high:Math.ceil(Number(b[2])*100),low:Math.floor(Number(b[3])*100),close:Math.round(Number(b[4])*100)}));
     const q={bid:Math.floor(Number(quote.bidPrice)*100),ask:Math.ceil(Number(quote.askPrice)*100),askQty:Number(quote.askQty)};
     if(now-before>5000||bars.length<21||now-completed.at(-1)[6]>930000||![q.bid,q.ask,q.askQty,...bars.flatMap(b=>[b.time,b.open,b.high,b.low,b.close])].every(Number.isFinite)||q.bid<=0||q.ask<q.bid||q.askQty<0)throw Error('Invalid or delayed market data');
     db.transaction(()=>{
      const decisions=[];
      for(const v of protocol.variants){const id=symbol+':'+v.id;const existing=db.prepare('SELECT payload FROM state WHERE id=?').get(id);const old=existing?JSON.parse(existing.payload):{equity:protocol.capitalCents,closed:0,position:null,lastBar:null};
       const step=paperStep(old,v,bars,q,protocol,now);db.prepare('INSERT OR REPLACE INTO state VALUES(?,?)').run(id,JSON.stringify(step.state));decisions.push({id,...step});}
      log({kind:'observation',symbol,receivedAt:now,requestStarted:before,quote,bars,decisions,protocolHash,exchangeQuoteTimestampAvailable:false});
     }).immediate();
    }catch(e){log({kind:'data-error',symbol,message:String(e).slice(0,200)});}
   }
   const states=db.prepare('SELECT id,payload FROM state').all().map(r=>({id:r.id,...JSON.parse(r.payload)}));
   const recent=db.prepare('SELECT at,payload FROM journal ORDER BY id DESC LIMIT ?').all(protocol.symbols.length).map(r=>({at:r.at,...JSON.parse(r.payload)}));
   const healthy=recent.length===protocol.symbols.length&&recent.every(r=>r.kind==='observation'&&Date.now()-r.at<120000);
   const summary={observedAt:new Date().toISOString(),endsAt:new Date(protocol.endsAt).toISOString(),protocolHash,liveAuthorized:false,profitabilityProven:false,status:Date.now()>=protocol.endsAt?'initial-window-ended':healthy?'observing':'feed-degraded',feedHealthy:healthy,openVirtualPositions:states.filter(s=>s.position).length,accounts:states,limits:protocol.limits};
   fs.writeFileSync(path.join(dir,'summary.tmp'),JSON.stringify(summary,null,2));fs.renameSync(path.join(dir,'summary.tmp'),path.join(dir,'summary.json'));
   if(once||Date.now()>=protocol.endsAt)break;
   await new Promise(resolve=>setTimeout(resolve,protocol.pollMs));
  }while(running);
 }finally{db.prepare('DELETE FROM lease WHERE owner=?').run(owner);db.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))forwardPaper(path.resolve('artifacts/forward-paper-20261012'),process.argv.includes('--once')).catch(()=>{console.error('Paper observer stopped; inspect local journal.');process.exitCode=1;});
