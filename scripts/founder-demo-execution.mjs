import {resolve} from 'node:path';
import {readDemoProfile} from './founder-mt5-demo.mjs';
import {mt5Command} from './trading-mt5.mjs';
import {TRADING_LIMITS,zurichDay} from './trading-risk.mjs';
import {openTradingDay} from './trading-day.mjs';
import {evaluateStrategy} from './trading-strategies.mjs';

export function withDemoExecution(research,demo){
 return {...research,snapshot:()=>({...research.snapshot(),demoExecution:demo.snapshot()}),start(){research.start();demo.start();},suspend(){demo.suspend();research.suspend();},control(input){if(input?.action==='stop')demo.suspend();return research.control(input);},async close(){await demo.close();await research.close();}};
}

// Experimental demo execution is deliberately separate from live validation.
export function openDemoExecution({file,profileFile,python,isEnabled,read,run,signals,clock=Date.now}){
 const profile=readDemoProfile(profileFile),pinned=JSON.stringify(profile);
 const transport=run??mt5Command({python,terminal:profile.terminal,login:profile.login,server:profile.server,script:resolve(import.meta.dirname,'mt5-demo-execution.py')});
 const days=openTradingDay(file);
 const strategy={id:'numaron-demo-breakout20-v1',rules:{kind:'breakout20'},source:{verified:true,reference:'local experimental demo rules; no profitability claim'}};
 let busy=null,timer=null,closed=false,start=0,abort=null;
 let state={mode:'demo-only',status:'off',executionEnabled:false,liveAuthorized:false,profitabilityProven:false,events:[]};
 const cycle=()=>{
  if(closed||busy||!isEnabled())return busy;
  abort=new AbortController();const signal=abort.signal;
  let phase='profile';
  busy=(async()=>{try{
   if(JSON.stringify(readDemoProfile(profileFile))!==pinned)throw Error('Demo profile changed; maintenance required');
   phase='market-read';let market=await read({start,watch:[],dayWindow:zurichDay(clock())});
   if(!closed&&isEnabled()&&Number.isFinite(market?.account?.observedAt)&&clock()-market.account.observedAt>1000)market=await read({start,watch:[],dayWindow:zurichDay(clock())});
   if(closed||signal.aborted||!isEnabled())return;
   phase='market-validation';
   if(market?.readOnly!==true||market.executionEnabled!==false||market.accountBinding?.demo!==true||market.accountBinding.tradeMode!==0||market.account?.mode!==0||market.account.identity!==String(profile.login)||market.account.server!==profile.server||!Number.isFinite(market.account.observedAt)||clock()-market.account.observedAt>15000||market.account.observedAt>clock()+1000)throw Error('Fresh bound demo observation required');
   phase='profile-recheck';
   if(JSON.stringify(readDemoProfile(profileFile))!==pinned)throw Error('Demo profile changed during read');
   start=market.nextStart??0;
   phase='day-reconciliation';const day=days.observe(market,clock());
   phase='signal-evaluation';
   const payload={binding:profile,journal:resolve(file+'.orders.db'),limits:TRADING_LIMITS,market,day,signals:(signals??((m)=>evaluateStrategy(strategy,m,clock())))(market).slice(0,1),liveAuthorized:false};
   if(!isEnabled()||closed||signal.aborted)return;
   phase='execution-transport';const result=await transport('cycle',payload,signal);
   phase='response-validation';
   if(result?.mode!=='demo-only'||result.liveAuthorized===true)throw Error('Invalid demo execution response');
   if(signal.aborted||closed||!isEnabled())return;
   state={...result,observedAt:clock(),mode:'demo-only',liveAuthorized:false,profitabilityProven:false};
  }catch{if(!signal.aborted)state={...state,status:'blocked',executionEnabled:false,diagnostic:{phase,at:clock(),code:'DEMO_CYCLE_FAILED'},reason:'Demo-Ausführung gesperrt: Verbindung, Kontobindung oder Abgleich nicht bestätigt.'};}})().finally(()=>busy=null);
  return busy;
 };
 return {cycle,snapshot:()=>({...state,executionEnabled:isEnabled()&&state.executionEnabled===true&&Number.isFinite(state.observedAt)&&clock()-state.observedAt<=15000}),start(){if(!closed&&!timer){void cycle();timer=setInterval(()=>void cycle(),10000);timer.unref?.();}},suspend(){abort?.abort();clearInterval(timer);timer=null;state={...state,status:'off',executionEnabled:false};},async close(){closed=true;abort?.abort();clearInterval(timer);await busy;days.close();}};
}
