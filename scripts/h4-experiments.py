"""Research-only fixed experiments and passive execution measurement. No order API."""
import ast,inspect,json,math,statistics,hashlib,sqlite3
from contextlib import closing
from datetime import datetime,timezone,timedelta
VERSION='h4-fixed-fifteen-v1'
CANDIDATES=[('LTCUSD','spread'),('BCHUSD','spread'),('BCHUSD','trend')]
VARIANTS=['reference','spread05','activity','hold12','hold18']
def setup(db):
 db.executescript('CREATE TABLE IF NOT EXISTS h4_experiment_meta(k TEXT PRIMARY KEY,v TEXT);CREATE TABLE IF NOT EXISTS h4_experiment_cache(k TEXT PRIMARY KEY,v TEXT);')
def volume_ok(b,i):
 values=[x.get('tick_volume') for x in b[i-20:i]];current=b[i].get('tick_volume')
 if not all(isinstance(x,(int,float)) and math.isfinite(x) and x>=0 for x in values+[current]):return None
 median=statistics.median(values)
 if median<=0:return None
 return current>=.5*median
def variant(evaluate,b,point,split,name,admit_after=None,lookback=40):
 if lookback not in [10,40]:raise ValueError('Unknown fixed breakout window')
 if name not in VARIANTS:raise ValueError('Unknown fixed variant')
 tree=ast.parse(inspect.getsource(evaluate));fn=tree.body[0];fn.name='experiment';fn.body.insert(0,ast.parse('ledger=[]').body[0])
 class Transform(ast.NodeTransformer):
  def visit_Constant(self,node):
   if isinstance(node.value,int) and not isinstance(node.value,bool) and node.value==24 and name in ['hold12','hold18']:return ast.copy_location(ast.Constant(12 if name=='hold12' else 18),node)
   return node
  def visit_If(self,node):
   self.generic_visit(node);test=ast.unparse(node.test)
   if test=='not side' and admit_after is not None:return [node,ast.parse('if b[i+1]["time"]<admit_after:continue').body[0]]
   if "profile == 'spread'" in test and 'distance' in test and 'trend' in test:
    extra='spread/distance>.05' if name=='spread05' else 'spread/distance>.1 or not volume_ok(b,i)' if name=='activity' else 'False'
    node.test=ast.BoolOp(ast.Or(),[node.test,ast.parse(extra,mode='eval').body])
    if name=='activity':return [ast.parse("if volume_ok(b,i) is None:\n r['missingVolume']=r.get('missingVolume',0)+1\n continue").body[0],node]
   if test=='outcome is not None':return [ast.parse("ledger.append(dict(profile=profile,segment=segment,signalTime=b[i]['time'],entryTime=entrybar['time'],exitTime=b[end]['time']+seconds,side=side,entry=entry,risk=distance,spread=spread,kind=kind,grossR=outcome))").body[0],node]
   return node
 tree=Transform().visit(tree)
 for node in ast.walk(tree):
  if isinstance(node,ast.Return):node.value.keys.append(ast.Constant('ledger'));node.value.values.append(ast.Name('ledger',ast.Load()))
 ns={'math':math,'volume_ok':volume_ok,'admit_after':admit_after};exec(compile(ast.fix_missing_locations(tree),'<fixed-h4-experiments>','exec'),ns)
 result=ns['experiment'](b,14400,lookback,point,split);ledger=result.pop('ledger')
 if name=='reference' and admit_after is None and result!=evaluate(b,14400,lookback,point,split):raise ValueError('Reference differs from existing research')
 return result,ledger
def measure(intents,deals,binding):
 owned={i['signalId'][:24]:i for i in intents if i.get('account')==binding['account'] and i.get('server')==binding['server']};positions={};fills=[]
 for d in deals:
  i=owned.get(d.get('comment'))
  if i and d.get('magic')==170102601 and d.get('symbol')==i['symbol'] and d.get('entry')==0 and d.get('type')==(0 if i['side']=='BUY' else 1):positions[d['position_id']]=i
 for d in {d['ticket']:d for d in deals}.values():
  i=positions.get(d.get('position_id'))
  if not i or d.get('magic')!=170102601 or d.get('symbol')!=i['symbol'] or d.get('entry') not in [0,1]:continue
  entry=d.get('entry')==0;side=1 if i['side']=='BUY' else -1
  if d.get('type')!=(0 if (side==1)==entry else 1):continue
  benchmark=i['entry'] if entry else i.get('stop') if d.get('reason')==4 else i.get('target') if d.get('reason')==5 else None
  deviation=(d['price']-benchmark)*side*(1 if entry else -1) if benchmark is not None else None
  fills.append({'dealId':d['ticket'],'position':d['position_id'],'symbol':d['symbol'],'strategyVersion':i.get('strategyVersion'),'kind':'entry' if entry else 'exit','benchmarkType':'submitted_entry_price' if entry else 'stop_reference' if d.get('reason')==4 else 'target_reference' if d.get('reason')==5 else 'unavailable','benchmarkPrice':benchmark,'fillPrice':d['price'],'volume':d['volume'],'adverseDeviationPrice':deviation,'capturedSignalQuote':i.get('capturedQuote') if entry else None,'commission':d.get('commission'),'swap':d.get('swap'),'fee':d.get('fee'),'dealTimeRawMs':d.get('time_msc'),'signalObservedAtUtcMs':i.get('observedAt'),'latencyMs':None})
 return {'status':'measured','measurementVersion':'passive-fills-v2','fills':fills,'limitations':['Entry deviation is relative to persisted submitted price, not necessarily the immediately pre-send bid/ask.','Stop/target deviations include gaps and reference-price effects; not pure broker slippage.','Broker and UTC timestamps are retained separately; latency is unknown without validated clock mapping.','Observed M5 execution does not prove hypothetical H4 fills. Commission/swap/fee are account-currency bookings, not price deviations.']}
def capture(db,broker,policy,root,allowed,now):
 if not allowed():return 'off'
 account=broker.account_info()
 if str(account.login)!=policy['account'] or account.server!=policy['server'] or account.trade_mode!=0:raise ValueError('Experiment account mismatch')
 setup(db)
 manifest=db.execute("SELECT v FROM h4_experiment_meta WHERE k='manifest'").fetchone()
 payload=json.loads(manifest[0]) if manifest else {'version':VERSION,'binding':{'account':policy['account'],'server':policy['server']},'startedAtUtc':now,'forwardStartServerTime':None,'candidates':CANDIDATES,'variants':VARIANTS}
 if payload['forwardStartServerTime'] is None:
  for symbol in ['BCHUSD','LTCUSD','BTCUSD','ETHUSD','XRPUSD']:
   if not allowed():return 'off'
   raw=getattr(broker.symbol_info_tick(symbol),'time',None)
   if isinstance(raw,(int,float)) and min(abs(raw-now-offset) for offset in [0,10800])<=15:payload['forwardStartServerTime']=int(raw);break
  if not allowed():return 'off'
  db.execute("INSERT OR REPLACE INTO h4_experiment_meta VALUES('manifest',?)",(json.dumps(payload),));db.commit()
 # Backfill only volume, and only where immutable OHLC exactly matches the archive.
 for symbol in ['LTCUSD','BCHUSD']:
  key='volume:'+symbol
  prior=db.execute('SELECT v FROM h4_experiment_meta WHERE k=?',(key,)).fetchone()
  if prior and json.loads(prior[0]).get('format')==2:continue
  tables=[t for t in ['bars','prospective_bars'] if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(t,)).fetchone()]
  latest=max([policy['startedAt']]+[db.execute('SELECT COALESCE(MAX(t),0)+14400 FROM '+t+" WHERE symbol=? AND tf='H4'",(symbol,)).fetchone()[0] for t in tables])
  if not allowed():return 'off'
  rates=broker.copy_rates_from(symbol,broker.TIMEFRAME_H4,datetime.fromtimestamp(latest,timezone.utc),5000)
  if rates is None:return 'volume_pending'
  matches={t:0 for t in tables};conflicts=0
  for table in tables:
   for x in rates:
    row=db.execute('SELECT payload FROM '+table+" WHERE symbol=? AND tf='H4' AND t=?",(symbol,int(x['time']))).fetchone()
    if not row:continue
    b=json.loads(row[0]);volume=float(x['tick_volume'])
    if not all(b[k]==float(x[k]) for k in ['open','high','low','close']) or not math.isfinite(volume) or volume<0:conflicts+=1;continue
    b['tick_volume']=int(volume)
    if not allowed():return 'off'
    db.execute('UPDATE '+table+" SET payload=? WHERE symbol=? AND tf='H4' AND t=?",(json.dumps(b),symbol,b['time']));matches[table]+=1
  db.execute('INSERT OR REPLACE INTO h4_experiment_meta VALUES(?,?)',(key,json.dumps({'format':2,'matchedByTable':matches,'conflicts':conflicts,'at':now})));db.commit();return 'volume_backfilled'
 previous=db.execute("SELECT v FROM h4_experiment_meta WHERE k='execution'").fetchone()
 if previous and json.loads(previous[0]).get('measurementVersion')=='passive-fills-v2' and 0<=now-json.loads(previous[0])['observedAt']<3600:return 'cached'
 if not allowed():return 'off'
 a=broker.account_info()
 if str(a.login)!=policy['account'] or a.server!=policy['server'] or a.trade_mode!=0:raise ValueError('Wrong execution measurement account')
 path=root/'artifacts/founder-integration-20261012/demo-execution-20261017.db.orders.db'
 with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=.2)) as journal:
  intents=[json.loads(row[0]) for row in journal.execute('SELECT payload FROM intents ORDER BY rowid DESC LIMIT 100')]
  for intent in intents:
   for row in journal.execute('SELECT payload FROM signal_checks WHERE at BETWEEN ? AND ? ORDER BY id LIMIT 20',(intent['observedAt']-60000,intent['observedAt']+60000)):
    check=json.loads(row[0])
    product=next((p for p in check.get('products',[]) if p.get('symbol')==intent['symbol'] and any(s.get('signalId')==intent['signalId'] for s in p.get('forwardedSignals',[]))),None)
    if product:
     bid,ask=product.get('bid'),product.get('ask')
     if isinstance(bid,(int,float)) and isinstance(ask,(int,float)) and math.isfinite(bid) and math.isfinite(ask) and ask>=bid>0:intent['capturedQuote']={'bid':bid,'ask':ask,'spread':ask-bid,'quoteAtUtcMs':product.get('quoteAt'),'source':'signal_checks captured signal quote; not immediately pre-send'}
     break
 if not allowed():return 'off'
 deals=broker.history_deals_get(datetime.fromtimestamp(now,timezone.utc)-timedelta(days=30),datetime.fromtimestamp(now,timezone.utc)+timedelta(days=1))
 if deals is None or len(deals)>10000:return 'execution_history_pending'
 measured=measure(intents,[d._asdict() for d in deals],{'account':policy['account'],'server':policy['server']});measured.update(observedAt=now,accountCurrency=a.currency)
 if not allowed():return 'off'
 db.execute("INSERT OR REPLACE INTO h4_experiment_meta VALUES('execution',?)",(json.dumps(measured,allow_nan=False),));db.commit();return 'execution_measured'
def overlay(db,policy,evaluate,costs,now):
 setup(db);row=db.execute("SELECT v FROM h4_experiment_meta WHERE k='manifest'").fetchone()
 if not row:return {'status':'manifest_pending','executionEnabled':False}
 manifest=json.loads(row[0])
 if manifest['binding']!={'account':policy['account'],'server':policy['server']} or manifest['version']!=VERSION or manifest['variants']!=VARIANTS or manifest['candidates']!=[list(c) for c in CANDIDATES]:raise ValueError('Experiment manifest changed')
 inputs=[]
 for symbol,profile in CANDIDATES:
  product=costs.get('products',{}).get(symbol,{})
  start=manifest['forwardStartServerTime']
  for source,table,split in [('historical','bars',policy['splitAt']),('prospective','prospective_bars',start+14400 if start is not None else None)]:
   b=[json.loads(x[0]) for x in db.execute('SELECT payload FROM '+table+" WHERE symbol=? AND tf='H4' ORDER BY t",(symbol,))]
   e=product.get('evidence')
   if e and not 0<=now-e['observedAt']<=7200:e=None
   inputs.append((symbol,profile,source,split,b,e))
 key=hashlib.sha256((VERSION+inspect.getsource(variant)+inspect.getsource(evaluate)+json.dumps(inputs,sort_keys=True)+json.dumps(manifest,sort_keys=True)).encode()).hexdigest()
 cached=db.execute('SELECT v FROM h4_experiment_cache WHERE k=?',(key,)).fetchone()
 if cached:result=json.loads(cached[0])
 else:
  studies=[]
  for symbol,profile,source,split,b,e in inputs:
   for name in VARIANTS:
    item={'symbol':symbol,'profile':profile,'variant':name,'source':source,'lookback':40,'bars':len(b),'oldest':b[0]['time'] if b else None,'newest':b[-1]['time'] if b else None,'netProfitVerified':False}
    if split is None:item['status']='prospective_clock_pending';studies.append(item);continue
    if not b or not e or not 0<=now-e['observedAt']<=7200:item['status']='data_or_costs_pending';studies.append(item);continue
    counts,ledger=variant(evaluate,b,e['symbol']['point'],split,name,admit_after=split if source=='prospective' else None);segments={}
    for segment in (['development','validation'] if source=='historical' else ['validation']):
     selected=[t for t in ledger if t['profile']==profile and t['segment']==segment];complete=[t for t in selected if t['kind']=='complete'];scenarios=[]
     for bps in [0,5,10]:
      values=[costs_module.trade_cost(t,e,bps) for t in complete];known=[v for v in values if v is not None]
      scenarios.append({'assumedCommissionBpsPerSide':bps,'R':sum(v['R'] for v in known) if known and len(known)==len(values) else None,'stressR':sum(v['stressR'] for v in known) if known and len(known)==len(values) else None,'unknownCostCases':len(values)-len(known)})
     segments[segment]={'counts':counts['profiles'][profile][segment],'unknownPaths':len(selected)-len(complete),'scenarios':scenarios}
    item.update(status='research_only',segments=segments);studies.append(item)
  result={'status':'collecting','manifest':manifest,'studies':studies,'executionEnabled':False,'automaticPromotion':False,'profitabilityProven':False,'limitations':['Historical variants are post-selection diagnostics, not a new independent validation.','Prospective entries begin after a full H4 bar beyond the frozen experiment start; no old signals enrolled.','Tick volume is an activity proxy, not guaranteed liquidity; missing/zero median volume remains unknown.','Same funding/commission/slippage scenarios as existing cost research; fills remain hypothetical.']}
  db.execute('DELETE FROM h4_experiment_cache');db.execute('INSERT INTO h4_experiment_cache VALUES(?,?)',(key,json.dumps(result,allow_nan=False)));db.commit()
 row=db.execute("SELECT v FROM h4_experiment_meta WHERE k='execution'").fetchone();result['executionMeasurement']=json.loads(row[0]) if row else {'status':'pending'}
 return result
# Loaded locally; no broker access or side effects.
import importlib.util
_spec=importlib.util.spec_from_file_location('experiment_costs',__file__.replace('h4-experiments.py','research-costs.py'));costs_module=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(costs_module)
