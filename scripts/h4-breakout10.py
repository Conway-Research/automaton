"""Two fixed research-only cohorts. No broker, execution or promotion interface."""
import json,math,importlib.util
from pathlib import Path
VERSION='h4-breakout10-spread-v1'
SYMBOLS=['BCHUSD','LTCUSD']
s=importlib.util.spec_from_file_location('ten_fixed_engine',Path(__file__).with_name('h4-experiments.py'))
engine=importlib.util.module_from_spec(s);s.loader.exec_module(engine)

def overlay(db,policy,evaluate,costs,now,allowed):
 if not allowed():return {'status':'off','executionEnabled':False}
 db.execute('CREATE TABLE IF NOT EXISTS h4_breakout10_meta(k TEXT PRIMARY KEY,v TEXT)')
 row=db.execute("SELECT v FROM h4_breakout10_meta WHERE k='manifest'").fetchone()
 binding={'account':policy['account'],'server':policy['server']}
 manifest=json.loads(row[0]) if row else {'version':VERSION,'binding':binding,'symbols':SYMBOLS,'lookback':10,'profile':'spread','maxHoldingBars':24,'startedAtUtc':now,'forwardStartServerTime':None}
 if manifest['version']!=VERSION or manifest['binding']!=binding or manifest['symbols']!=SYMBOLS or manifest['lookback']!=10 or manifest['profile']!='spread' or manifest['maxHoldingBars']!=24:raise ValueError('Breakout10 manifest changed')
 if manifest['forwardStartServerTime'] is None and db.execute("SELECT 1 FROM sqlite_master WHERE name='research_bar_coverage'").fetchone():
  # Require a new, independently validated H4 clock sample after this cohort was created.
  for symbol,payload in db.execute("SELECT symbol,payload FROM research_bar_coverage WHERE tf='H4' AND symbol IN ('BCHUSD','LTCUSD') ORDER BY symbol"):
   coverage=json.loads(payload);proof=coverage.get('clockProof',{})
   if proof.get('source') not in ['fresh_product_tick','two_fresh_other_symbols']:continue
   accepted=[]
   names=[symbol] if proof['source']=='fresh_product_tick' else proof.get('witnesses',[])
   for sample in proof.get('samples',[]):
    raw,observed,offset=sample.get('rawTime'),sample.get('observedAtUtc'),sample.get('matchedOffsetSeconds')
    if sample.get('symbol') in names and offset==proof.get('offsetSeconds') and sample.get('status')=='fresh' and all(isinstance(v,(int,float)) and math.isfinite(v) for v in [raw,observed]) and offset in [0,10800] and manifest['startedAtUtc']<=observed<=now and 0<=now-observed<=15 and -1<=now+offset-raw<=15:accepted.append((sample['symbol'],int(raw)))
   if len(set(name for name,_ in accepted))>=(1 if proof['source']=='fresh_product_tick' else 2):manifest['forwardStartServerTime']=min(raw for _,raw in accepted)
   if manifest['forwardStartServerTime'] is not None:break
 if not allowed():return {'status':'off','executionEnabled':False}
 db.execute("INSERT OR REPLACE INTO h4_breakout10_meta VALUES('manifest',?)",(json.dumps(manifest),));db.commit()
 studies=[]
 for symbol in SYMBOLS:
  e=costs.get('products',{}).get(symbol,{}).get('evidence')
  for source,table in [('historical','bars'),('prospective','prospective_bars')]:
   item={'symbol':symbol,'timeframe':'H4','lookback':10,'profile':'spread','source':source,'netProfitVerified':False}
   start=manifest['forwardStartServerTime'];split=policy['splitAt'] if source=='historical' else start+14400 if start is not None else None
   if split is None:item['status']='prospective_clock_pending';studies.append(item);continue
   b=[json.loads(x[0]) for x in db.execute('SELECT payload FROM '+table+" WHERE symbol=? AND tf='H4' ORDER BY t",(symbol,))]
   item.update(bars=len(b),oldest=b[0]['time'] if b else None,newest=b[-1]['time'] if b else None)
   if not b or not e or not 0<=now-e['observedAt']<=7200:item['status']='data_or_costs_pending';studies.append(item);continue
   counts,ledger=engine.variant(evaluate,b,e['symbol']['point'],split,'reference',admit_after=split if source=='prospective' else None,lookback=10)
   segments={}
   for segment in ['development','validation'] if source=='historical' else ['validation']:
    selected=[t for t in ledger if t['profile']=='spread' and t['segment']==segment];complete=[t for t in selected if t['kind']=='complete'];scenarios=[]
    for bps in [0,5,10]:
     values=[engine.costs_module.trade_cost(t,e,bps) for t in complete];known=[v for v in values if v is not None]
     scenarios.append({'assumedCommissionBpsPerSide':bps,'R':sum(v['R'] for v in known) if known and len(known)==len(values) else None,'stressR':sum(v['stressR'] for v in known) if known and len(known)==len(values) else None,'unknownCostCases':len(values)-len(known)})
    segments[segment]={'counts':counts['profiles']['spread'][segment],'unknownPaths':len(selected)-len(complete),'scenarios':scenarios}
   item.update(status='research_only',segments=segments);studies.append(item)
 return {'status':'collecting','manifest':manifest,'studies':studies,'executionEnabled':False,'automaticPromotion':False,'profitabilityProven':False,'limitations':['Historical diagnostics were used to select these variants; they are not independent validation.','New entries require a full H4 interval beyond the separately frozen start and a closed entry bar.','Existing spread filter, 24-bar holding limit and 0/5/10bps cost/stress assumptions retained.','Overlapping signals are not independent portfolio returns; missing outcomes and unverified costs remain unknown.']}
