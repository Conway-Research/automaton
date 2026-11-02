"""Bounded, demo-bound historical research. No execution or promotion interface.



Historical next-bar entries are proxies, not replicas of live bid/ask confirmation.

All R values exclude unverified commission, funding and execution slippage.

"""

import json,math,sqlite3,time,importlib.util,html,os

from contextlib import closing

from pathlib import Path

from datetime import datetime,timezone,timedelta

TIMEFRAMES={**{'M'+str(n):n*60 for n in [1,2,3,4,5,6,10,12,15,20,30]},**{'H'+str(n):n*3600 for n in [1,2,3,4,6,8,12]},'D1':86400,'W1':604800,'MN1':None}

VARIANTS=[(tf,n) for tf in ['M1','M5','H1','H4'] for n in [20,40]]

ENGINE_VERSION='eight-fixed-1'

ROOT=Path(__file__).resolve().parents[1]

DIRECTORY='artifacts/demo-execution-20261017'

def load(name,file):

 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def allowed(root):

 try:

  power=json.loads((root/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])

  if power.get('enabled') is not True:return False

  with closing(sqlite3.connect((root/'artifacts/founder-autonomy-20261013/controller.db').resolve().as_uri()+'?mode=ro',uri=True,timeout=.1)) as db:

   return db.execute('SELECT status FROM founder_control WHERE id=1').fetchone()==('running',)

 except (OSError,ValueError,sqlite3.Error):return False

def evaluate(b,seconds,lookback,point,split_at=None):

 for i,x in enumerate(b):

  if not all(isinstance(x.get(k),(int,float)) and math.isfinite(x[k]) and x[k]>0 for k in ['time','open','high','low','close']) or x['low']>min(x['open'],x['close']) or x['high']<max(x['open'],x['close']) or x['high']<x['low'] or (i and x['time']<=b[i-1]['time']):raise ValueError('Invalid historical bars')

 split_at=split_at if split_at is not None else (b[int(len(b)*.7)]['time'] if b else 0)

 results={}

 for profile in ['baseline','spread','trend']:

  results[profile]={k:{'candidates':0,'filtered':0,'complete':0,'ambiguous':0,'gap':0,'unresolved':0,'missingSpread':0,'priceScenarioR':0.,'stressScenarioR':0.} for k in ['development','validation']}

 first=None;next_free={p:0 for p in results};rejected_gap=0;total=0;ambiguity=0

 for i in range(60,len(b)-1):

  x=b[i];prior=b[i-lookback:i]

  side=1 if x['close']>max(y['high'] for y in prior) else -1 if x['close']<min(y['low'] for y in prior) else 0

  if not side:continue

  if any(b[j]['time']-b[j-1]['time']!=seconds for j in range(i-59,i+2)):

   rejected_gap+=1;continue

  total+=1

  if first is None:first={'time':x['time'],'side':side,'close':x['close']}

  entrybar=b[i+1];spread=entrybar.get('spread');spread=spread*point if isinstance(spread,(int,float)) and math.isfinite(spread) and spread>=0 and math.isfinite(point) and point>0 else None

  segment='validation' if entrybar['time']>=split_at else 'development'

  trend=sum(y['close'] for y in b[i-10:i])/10-sum(y['close'] for y in b[i-50:i-10])/40

  for profile in results:

   if i+1<next_free[profile]:continue

   r=results[profile][segment];r['candidates']+=1

   if spread is None:r['missingSpread']+=1;continue

   entry=entrybar['open']+(spread if side==1 else 0)

   stop=min(y['low'] for y in b[i-2:i+1]) if side==1 else max(y['high'] for y in b[i-2:i+1])+spread

   distance=(entry-stop)*side

   if distance<=0:r['filtered']+=1;continue

   if (profile=='spread' and spread/distance>.1) or (profile=='trend' and trend*side<=0):r['filtered']+=1;continue

   outcome=None;last=min(i+24,len(b)-1);kind='unresolved';end=i+1

   for j in range(i+1,last+1):

    end=j;y=b[j]

    if y['time']-b[j-1]['time']!=seconds:kind='gap';break

    if (y['time']>=split_at)!=(segment=='validation'):end=j-1;break

    current_spread=y.get('spread')

    if not isinstance(current_spread,(int,float)) or not math.isfinite(current_spread) or current_spread<0:kind='missingSpread';break

    ask_adjust=current_spread*point if side==-1 else 0

    low,high=y['low']+ask_adjust,y['high']+ask_adjust

    target=entry+side*2*distance

    hitstop=low<=stop if side==1 else high>=stop

    hittarget=high>=target if side==1 else low<=target

    if hitstop and hittarget:kind='ambiguous';break

    if hitstop:outcome=min(-1.,(y['open']+ask_adjust-entry)*side/distance);kind='complete';break

    if hittarget:outcome=2.;kind='complete';break

    if j==i+24:outcome=(y['close']+ask_adjust-entry)*side/distance;kind='complete'

   next_free[profile]=end+1;r[kind]+=1

   if kind=='ambiguous':ambiguity+=1

   if outcome is not None:

    r['priceScenarioR']+=outcome-spread/distance

    r['stressScenarioR']+=outcome-2*spread/distance

 return {'candidates':total,'rejectedGap':rejected_gap,'ambiguous':ambiguity,'firstSignal':first,'developmentEnd':split_at-1,'validationStart':split_at,'profiles':results,'profitabilityProven':False,'historicalProxy':True}

def atomic(file,value):

 temp=file.with_suffix(file.suffix+'.tmp');temp.write_text(value,encoding='utf-8');temp.replace(file)

def report(db,dir,policy,inventory):

 try:

  costs=load('numaron_research_costs','research-costs.py').overlay(db,policy,evaluate,time.time())

  attempt=db.execute("SELECT v FROM meta WHERE k='costCaptureStatus'").fetchone()

  costs['lastCapture']=json.loads(attempt[0]) if attempt else None

 except Exception as error:costs={'status':'cost_overlay_unavailable','errorType':type(error).__name__,'netProfitVerified':False}

 jobs=[]

 for symbol,tf,status,cursor,error in db.execute('SELECT symbol,tf,status,cursor,error FROM jobs ORDER BY symbol,tf'):

  n,lo,hi=db.execute('SELECT COUNT(*),MIN(t),MAX(t) FROM bars WHERE symbol=? AND tf=?',(symbol,tf)).fetchone()

  seconds=TIMEFRAMES[tf]

  missing=max(0,int((hi-lo)//seconds)+1-n) if n and seconds else None

  jobs.append({'symbol':symbol,'timeframe':tf,'status':status,'bars':n,'oldest':lo,'newest':hi,'missingGridSlotsEstimate':missing,'error':error})

 studies=[json.loads(x[0]) for x in db.execute('SELECT payload FROM results ORDER BY symbol,tf,lookback')]

 studies=[s for s in studies if s.get('engineVersion')==ENGINE_VERSION]

 prospective=[json.loads(x[0]) for x in db.execute('SELECT payload FROM prospective_results ORDER BY symbol,tf,lookback')]

 value={'version':1,'updatedAt':time.time(),'executionEnabled':False,'automaticPromotion':False,'profitabilityProven':False,'policy':policy,'timeframes':inventory,'unsupported':['H15'],'jobs':jobs,'studies':studies,'prospectiveStudies':prospective,'limitations':['Historical and prospective next-bar open with bar spread are proxies; live quote confirmation and fills cannot be reconstructed.','Commission, financing, currency conversion and actual slippage unverified. No net profit or winner.','Ambiguous intrabar order, gaps and incomplete outcomes are unknown, never zero returns.','One position per profile and symbol/timeframe/lookback; sums across overlapping studies are not portfolio returns.','MT5 server candle timestamps retained; historical cutoff is frozen. Prospective enrollment has its own later frozen server-time start per series.','All native timeframes are archived; only M1/M5/H1/H4 are tested. Repeated polls are not independent samples.']}

 value['costResearch']=costs
 if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_bar_coverage'").fetchone():
  value['prospectiveCoverage']=[{'symbol':symbol,'timeframe':tf,**json.loads(payload)} for symbol,tf,payload in db.execute('SELECT symbol,tf,payload FROM research_bar_coverage ORDER BY symbol,tf')]
 else:value['prospectiveCoverage']=[]
 try:value['fixedH4Research']=load('numaron_h4_experiments','h4-experiments.py').overlay(db,policy,evaluate,costs,time.time())
 except Exception as error:value['fixedH4Research']={'status':'unavailable','errorType':type(error).__name__,'executionEnabled':False}
 try:value['breakout10H4Research']=load('numaron_h4_breakout10','h4-breakout10.py').overlay(db,policy,evaluate,costs,time.time(),lambda:allowed(dir.parents[1]))
 except Exception as error:value['breakout10H4Research']={'status':'unavailable','errorType':type(error).__name__,'executionEnabled':False}
 try:value['bchTradeLearning']=load('numaron_bch_trade_learning','bch-trade-learning.py').overlay(dir.parents[1],value['fixedH4Research'].get('executionMeasurement',{}),{'account':policy['account'],'server':policy['server']},lambda:allowed(dir.parents[1]))
 except Exception as error:value['bchTradeLearning']={'status':'unavailable','errorType':type(error).__name__,'executionEnabled':False}

 atomic(dir/'multiframe-research.json',json.dumps(value,indent=2,allow_nan=False))

 rows=''.join('<tr>'+''.join('<td>'+html.escape(str(j[k]))+'</td>' for k in ['symbol','timeframe','status','bars','error'])+'</tr>' for j in jobs)

 body='<!doctype html><html lang="de"><meta charset="utf-8"><title>Numaron Mehrzeitebenen-Forschung</title><style>body{font:16px system-ui;margin:32px;background:#101c2b;color:#e4edf7}td,th{padding:9px;border:1px solid #526277}table{border-collapse:collapse}pre{white-space:pre-wrap}</style><h1>Historische Mehrzeitebenen-Forschung</h1><p>Nur Forschung · acht feste Kombinationen · keine Orders oder automatische Übernahme.</p><p>Die Historie wird in begrenzten Portionen geladen. Teilbestände sind vorläufig; fehlende Kosten erlauben keine Nettogewinnaussage. H15 ist nicht nativ verfügbar; M15 bezeichnet 15 Minuten.</p><table><tr><th>Produkt</th><th>Zeitebene</th><th>Status</th><th>Kerzen</th><th>Hinweis</th></tr>'+rows+'</table><h2>Feste Regeln, Ergebnisse und Datenabdeckung</h2><pre>'+html.escape(json.dumps(value,indent=2,ensure_ascii=False))+'</pre></html>'

 cost_note='<h2>Fuenf Kryptoprodukte H4 · Kontokosten und Szenarien</h2><p>Gebuchte Demokosten sind Tatsachen für die beobachteten Deals. Historische Finanzierung und unbestätigte Kommissionen bleiben Szenarien; kein verifizierter Nettogewinn.</p><pre>'+html.escape(json.dumps(costs,indent=2,ensure_ascii=False))+'</pre>'

 comparison_rows=[]

 for c in costs.get('comparisonAt5BpsPerSide',[]):

  values=[c['symbol'],c['profile'],c['lookback'],datetime.fromtimestamp(c['oldest'],timezone.utc).strftime('%Y-%m-%d %H:%M'),datetime.fromtimestamp(c['newest'],timezone.utc).strftime('%Y-%m-%d %H:%M'),c['validationCases'],c['validationR'],c['totalR'],c['totalStressR'],c['unknownPaths'],c['unknownCostCases'],c['provisional']]

  comparison_rows.append('<tr>'+''.join('<td>'+html.escape(str(round(v,3) if isinstance(v,float) else v))+'</td>' for v in values)+'</tr>')

 cost_table='<p>Einheitliches Szenario: 5 Basispunkte Kommission je Seite, aktuelle Finanzierung und modellierte Slippage. R-Summen sind keine Kontorendite. Nur gleiche Zeitabdeckung vergleichen; wenige Fälle, ungeklärte Verläufe und unbestätigte Tarife verhindern einen validierten Gewinner.</p><table><tr><th>Produkt</th><th>Filter</th><th>Kerzen</th><th>Beginn (Serverzeit)</th><th>Ende (Serverzeit)</th><th>Prüffälle</th><th>Prüf-R</th><th>Gesamt-R</th><th>Gesamt-Stress-R</th><th>Unklare Verläufe</th><th>Fehlende Kostenfälle</th><th>Vorläufig</th></tr>'+''.join(comparison_rows)+'</table>'

 cost_note=cost_note.replace('<pre>',cost_table+'<pre>',1)
 experiment_note='<h2>15 feste H4-Forschungskombinationen und Ausfuehrungskosten</h2><p>Nur Forschung. Referenz, engerer Spread, Aktivitaetsfilter und12/18Kerzen Haltedauer. Historische Diagnosen und neue Beobachtungen bleiben getrennt.</p><pre>'+html.escape(json.dumps(value['fixedH4Research'],indent=2,ensure_ascii=False))+'</pre>'
 cost_note+=experiment_note
 cost_note+='<h2>Zwei feste H4-Ausbruch-10-Varianten</h2><p>BCHUSD und LTCUSD mit bestehendem Spreadfilter. Eigener Forschungsstart; keine automatische Handelsfreigabe.</p><pre>'+html.escape(json.dumps(value['breakout10H4Research'],indent=2,ensure_ascii=False))+'</pre>'
 cost_note+='<h2>BCHUSD: Tradeanalyse und Lernhypothesen</h2><p>Automatische lokale Auswertung vorhandener abgeschlossener Demotrades. Erkenntnisse und Hypothesen getrennt; keine automatische Strategieänderung.</p><pre>'+html.escape(json.dumps(value['bchTradeLearning'],indent=2,ensure_ascii=False))+'</pre>'

 atomic(dir/'multiframe-research.html',body.replace('<h2>Feste Regeln, Ergebnisse und Datenabdeckung</h2>',cost_note+'<h2>Feste Regeln, Ergebnisse und Datenabdeckung</h2>'))

def run(root=ROOT):

 if not allowed(root):return 'off'

 directory=root/DIRECTORY;directory.mkdir(parents=True,exist_ok=True)

 lock=open(directory/'multiframe-research.lock','a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)

 try:

  import msvcrt

  try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)

  except OSError:return 'busy'

  if not allowed(root):return 'off'

  with closing(sqlite3.connect(directory/'multiframe-research.db',timeout=.2)) as db:

   db.executescript('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT);CREATE TABLE IF NOT EXISTS jobs(symbol TEXT,tf TEXT,status TEXT,cursor INTEGER,error TEXT,updated REAL DEFAULT 0,PRIMARY KEY(symbol,tf));CREATE TABLE IF NOT EXISTS bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,t));CREATE TABLE IF NOT EXISTS results(symbol TEXT,tf TEXT,lookback INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,lookback));CREATE TABLE IF NOT EXISTS prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL,PRIMARY KEY(symbol,tf));CREATE TABLE IF NOT EXISTS prospective_bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,t));CREATE TABLE IF NOT EXISTS prospective_results(symbol TEXT,tf TEXT,lookback INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,lookback));')

   last=db.execute("SELECT v FROM meta WHERE k='lastRun'").fetchone()

   if last and time.time()-float(last[0])<15:return 'throttled'

   db.execute("INSERT OR REPLACE INTO meta VALUES('lastRun',?)",(str(time.time()),));db.commit()

   p=json.loads((root/'artifacts/founder-integration-20261012/mt5-demo-profile.json').read_text())

   frozen=db.execute("SELECT v FROM meta WHERE k='policy'").fetchone()

   if frozen:policy=json.loads(frozen[0])

   else:

    now=int(time.time());policy={'version':'historical-eight-v1','startedAt':now,'cutoff':now-365*86400,'splitAt':now-int(365*86400*.3),'variants':VARIANTS,'maxHoldingBars':24,'pageSize':5000,'account':str(p['login']),'server':p['server']}

    db.execute("INSERT INTO meta VALUES('policy',?)",(json.dumps(policy),));db.commit()

   if policy['account']!=str(p['login']) or policy['server']!=p['server']:raise RuntimeError('Research binding changed')

   turn=db.execute("SELECT v FROM meta WHERE k='turn'").fetchone();turn=int(turn[0])+1 if turn else 1

   db.execute("INSERT OR REPLACE INTO meta VALUES('turn',?)",(str(turn),));db.commit()

   import MetaTrader5 as mt5

   facade=load('historical_demo_facade','mt5-demo-readonly.py')

   class HistoryOnly(facade.DemoOnly):

    READS=facade.DemoOnly.READS|{'copy_rates_from'}

    CONSTANTS=facade.DemoOnly.CONSTANTS|{'TIMEFRAME_'+k for k in TIMEFRAMES}

   broker=HistoryOnly(mt5,p['terminal'],p['login'],p['server'])

   if not allowed(root):return 'off'

   if not broker.initialize(p['terminal'],timeout=3000):return 'unavailable'

   try:

    if not allowed(root):return 'off'

    try:

     cost_module=load('numaron_research_cost_capture','research-costs.py')

     cost_status={'status':cost_module.capture_next(db,broker,policy,lambda:allowed(root),time.time()),'at':time.time()}

    except Exception as error:cost_status={'status':'capture_failed','errorType':type(error).__name__,'at':time.time()}

    if not allowed(root):return 'off'

    db.execute("INSERT OR REPLACE INTO meta VALUES('costCaptureStatus',?)",(json.dumps(cost_status),));db.commit()
    if not allowed(root):return 'off'
    try:
     experiment_status={'status':load('numaron_h4_experiment_capture','h4-experiments.py').capture(db,broker,policy,root,lambda:allowed(root),time.time()),'at':time.time()}
    except Exception as error:experiment_status={'status':'capture_failed','errorType':type(error).__name__,'at':time.time()}
    if not allowed(root):return 'off'
    db.execute("INSERT OR REPLACE INTO meta VALUES('h4ExperimentCaptureStatus',?)",(json.dumps(experiment_status),));db.commit()

    inventory=[{'name':k,'seconds':v,'native':hasattr(mt5,'TIMEFRAME_'+k),'tested':k in ['M1','M5','H1','H4']} for k,v in TIMEFRAMES.items()]

    # Existing paired observer's crypto catalog is used; no new market or symbol selection.

    catalog=broker.symbols_get() or []

    symbols=[s for s in catalog if getattr(s,'path','').startswith('Cryptocurrencies\\') and getattr(s,'trade_mode',None)==getattr(mt5,'SYMBOL_TRADE_MODE_FULL',4)][:10]

    for s in symbols:

     for tf in TIMEFRAMES:

      if hasattr(mt5,'TIMEFRAME_'+tf):db.execute('INSERT OR IGNORE INTO jobs(symbol,tf,status,cursor,error) VALUES(?,?,\'pending\',?,\'\')',(s.name,tf,policy['startedAt']))

     for tf in ['M1','M5','H1','H4']:db.execute('INSERT OR IGNORE INTO prospective VALUES(?,?,NULL,0)',(s.name,tf))

    job=db.execute("SELECT symbol,tf,cursor FROM jobs WHERE status IN ('pending','collecting','retry') ORDER BY CASE WHEN tf IN ('M1','M5','H1','H4') AND updated=0 THEN 0 WHEN updated=0 THEN 1 ELSE 2 END,updated,symbol,tf LIMIT 1").fetchone()

    stale=db.execute("SELECT j.symbol,j.tf,j.cursor FROM jobs j JOIN results r ON j.symbol=r.symbol AND j.tf=r.tf WHERE j.status IN ('complete_requested_range','available_history_exhausted') AND json_extract(r.payload,'$.engineVersion') IS NOT ? LIMIT 1",(ENGINE_VERSION,)).fetchone()

    if stale:job=stale

    urgent=priority_forward_job(db,time.time())
    if urgent or turn%4==0 or job is None:

     forward(db,broker,policy,root,job=urgent)

    elif job:

     symbol,tf,cursor=job

     if not allowed(root):return 'off'

     oldstate=db.execute('SELECT status FROM jobs WHERE symbol=? AND tf=?',(symbol,tf)).fetchone()[0]

     rescore_only=oldstate in ['complete_requested_range','available_history_exhausted']

     rates=None if rescore_only else broker.copy_rates_from(symbol,getattr(broker,'TIMEFRAME_'+tf),datetime.fromtimestamp(cursor,timezone.utc),5000)

     if not allowed(root):return 'off'

     if rescore_only:pass

     elif rates is None:

      db.execute("UPDATE jobs SET status='retry',error='history_unavailable',updated=? WHERE symbol=? AND tf=?",(time.time(),symbol,tf))

     elif len(rates)==0:

      db.execute("UPDATE jobs SET status='available_history_exhausted',error='Broker history shorter than requested or unavailable',updated=? WHERE symbol=? AND tf=?",(time.time(),symbol,tf))

     else:

      seconds=TIMEFRAMES[tf];oldest=min(int(x['time']) for x in rates)

      for x in rates:

       stamp=int(x['time'])

       opened=datetime.fromtimestamp(stamp,timezone.utc)

       closed=stamp+seconds if seconds else int(datetime(opened.year+(opened.month==12),opened.month%12+1,1,tzinfo=timezone.utc).timestamp())

       if policy['cutoff']<=stamp and closed<=policy['startedAt']:

        bar={k:float(x[k]) for k in ['open','high','low','close']};bar.update(time=stamp,spread=int(x['spread']))
        if 'tick_volume' in (x.keys() if isinstance(x,dict) else getattr(getattr(x,'dtype',None),'names',()) or ()):bar['tick_volume']=int(x['tick_volume'])

        db.execute('INSERT OR IGNORE INTO bars VALUES(?,?,?,?)',(symbol,tf,stamp,json.dumps(bar)))

      status='complete_requested_range' if oldest<=policy['cutoff'] else 'available_history_exhausted' if oldest>=cursor else 'collecting'

      db.execute('UPDATE jobs SET status=?,cursor=?,updated=?,error=? WHERE symbol=? AND tf=?',(status,oldest-1,time.time(),'' if status!='available_history_exhausted' else 'No older history returned',symbol,tf))

     # Shared finalization also handles empty-page exhaustion after multiple successful pages.

     state=db.execute('SELECT status FROM jobs WHERE symbol=? AND tf=?',(symbol,tf)).fetchone()[0]

     prior=db.execute('SELECT payload FROM results WHERE symbol=? AND tf=? LIMIT 1',(symbol,tf)).fetchone()

     terminal=state in ['complete_requested_range','available_history_exhausted']

     if tf in ['M1','M5','H1','H4'] and (terminal or not prior or json.loads(prior[0]).get('engineVersion')!=ENGINE_VERSION):

      b=[json.loads(x[0]) for x in db.execute('SELECT payload FROM bars WHERE symbol=? AND tf=? ORDER BY t',(symbol,tf))]

      info=broker.symbol_info(symbol)

      for lookback in [20,40]:

       result=evaluate(b,TIMEFRAMES[tf],lookback,float(info.point),policy['splitAt']);result.update(engineVersion=ENGINE_VERSION,symbol=symbol,timeframe=tf,lookback=lookback,bars=len(b),provisional=not terminal)

       db.execute('INSERT OR REPLACE INTO results VALUES(?,?,?,?)',(symbol,tf,lookback,json.dumps(result,allow_nan=False)))

     db.commit()

    if not allowed(root):return 'off'

    report(db,directory,policy,inventory)

   finally:broker.shutdown()

  return 'collected'

 finally:lock.close()

def priority_forward_job(db,now):
 return db.execute("SELECT symbol,tf,start FROM prospective WHERE tf='H4' AND symbol IN ('BCHUSD','LTCUSD') AND updated<? ORDER BY updated,symbol LIMIT 1",(now-120,)).fetchone()

def closed_history_clock(broker,symbol,now,allowed):
 if not allowed():return None,{'source':'off'}
 origin=time.monotonic();samples=[];interrupted=False
 def read(name):
  nonlocal interrupted
  if not allowed():interrupted=True;return None,None
  raw=getattr(broker.symbol_info_tick(name),'time',None)
  received=now+time.monotonic()-origin
  sample={'symbol':name,'rawTime':raw,'observedAtUtc':received};samples.append(sample)
  if not allowed():interrupted=True;sample['status']='off';return None,None
  if not isinstance(raw,(int,float)) or not math.isfinite(raw):sample['status']='missing_or_invalid_tick';sample['rawTime']=None;return None,None
  offset=min([0,10800],key=lambda value:abs(received+value-raw));age=received+offset-raw
  sample.update(matchedOffsetSeconds=offset,ageSeconds=age)
  if not -1<=age<=15:
   inferred=round((raw-received)/900)*900
   sample['status']='unsupported_offset' if inferred not in [0,10800] and abs(age)>900 else 'stale_tick' if age>15 else 'future_tick'
   return None,None
  sample['status']='fresh';return raw,offset
 raw,offset=read(symbol)
 if interrupted:return None,{'source':'off','samples':samples}
 if raw is not None:return raw,{'source':'fresh_product_tick','offsetSeconds':offset,'samples':samples}
 witnesses={}
 for name in ['BCHUSD','LTCUSD','BTCUSD','ETHUSD','XRPUSD']:
  if name==symbol:continue
  stamp,offset=read(name)
  if interrupted:return None,{'source':'off','samples':samples}
  if stamp is None:continue
  received=samples[-1]['observedAtUtc']
  witnesses.setdefault(offset,[]).append((name,stamp))
  fresh=[x for x in witnesses[offset] if -1<=received+offset-x[1]<=15]
  if len(fresh)>=2:return min(x[1] for x in fresh),{'source':'two_fresh_other_symbols','offsetSeconds':offset,'witnesses':[x[0] for x in fresh],'samples':samples}
 return None,{'source':'clock_unverified','samples':samples}

def record_bar_coverage(db,symbol,tf,payload):
 db.execute('CREATE TABLE IF NOT EXISTS research_bar_coverage(symbol TEXT,tf TEXT,payload TEXT,PRIMARY KEY(symbol,tf))')
 prior=db.execute('SELECT payload FROM research_bar_coverage WHERE symbol=? AND tf=?',(symbol,tf)).fetchone()
 old=json.loads(prior[0]) if prior else {}
 if payload['status']=='captured':
  payload['lastSuccessfulCapture']={k:payload.get(k) for k in ['observedAt','latestBrokerClosedBar','latestStoredBar','clockProof']}
 elif old.get('lastSuccessfulCapture'):payload['lastSuccessfulCapture']=old['lastSuccessfulCapture']
 elif old.get('status')=='captured':payload['lastSuccessfulCapture']={k:old.get(k) for k in ['observedAt','latestBrokerClosedBar','latestStoredBar','clockProof']}
 # Previous success is display-only. No clock or enrollment path reads it.
 db.execute('INSERT OR REPLACE INTO research_bar_coverage VALUES(?,?,?)',(symbol,tf,json.dumps(payload)))

def forward(db,broker,policy,root,job=None):

 job=job or db.execute('SELECT symbol,tf,start FROM prospective ORDER BY updated,symbol,tf LIMIT 1').fetchone()

 if not job or not allowed(root):return

 symbol,tf,start=job

 # Attempt scheduling is independent of valid data/enrollment; a stale series must yield.

 db.execute('UPDATE prospective SET updated=? WHERE symbol=? AND tf=?',(time.time(),symbol,tf));db.commit()

 db.execute('CREATE TABLE IF NOT EXISTS research_bar_coverage(symbol TEXT,tf TEXT,payload TEXT,PRIMARY KEY(symbol,tf))');db.commit()
 raw,proof=closed_history_clock(broker,symbol,time.time(),lambda:allowed(root))
 if raw is None:
  if allowed(root):record_bar_coverage(db,symbol,tf,{'observedAt':time.time(),'status':'clock_unverified','clockProof':proof});db.commit()
  return

 seconds=TIMEFRAMES[tf]

 if start is None:start=int(raw)

 if not allowed(root):return

 rates=broker.copy_rates_from(symbol,getattr(broker,'TIMEFRAME_'+tf),datetime.fromtimestamp(raw,timezone.utc),5000)

 if not allowed(root):return

 if rates is None:
  record_bar_coverage(db,symbol,tf,{'observedAt':time.time(),'status':'history_unavailable','clockProof':proof});db.commit();return

 db.execute('UPDATE prospective SET start=? WHERE symbol=? AND tf=?',(start,symbol,tf))

 for x in rates:

  stamp=int(x['time'])

  if stamp>=start-61*seconds and stamp+seconds<=raw:

   bar={k:float(x[k]) for k in ['open','high','low','close']};bar.update(time=stamp,spread=int(x['spread']))
   if 'tick_volume' in (x.keys() if isinstance(x,dict) else getattr(getattr(x,'dtype',None),'names',()) or ()):bar['tick_volume']=int(x['tick_volume'])

   db.execute('INSERT OR IGNORE INTO prospective_bars VALUES(?,?,?,?)',(symbol,tf,stamp,json.dumps(bar)))

 b=[json.loads(x[0]) for x in db.execute('SELECT payload FROM prospective_bars WHERE symbol=? AND tf=? ORDER BY t',(symbol,tf))]
 returned=[int(x['time']) for x in rates if int(x['time'])+seconds<=raw]
 latest=max(returned) if returned else None;stored=b[-1]['time'] if b else None
 missing=[stamp for stamp in returned if stamp>=start-61*seconds and not db.execute('SELECT 1 FROM prospective_bars WHERE symbol=? AND tf=? AND t=?',(symbol,tf,stamp)).fetchone()]
 record_bar_coverage(db,symbol,tf,{'observedAt':time.time(),'status':'captured' if not missing else 'missing_returned_bars','clockProof':proof,'latestBrokerClosedBar':latest,'latestStoredBar':stored,'missingReturnedBarCount':len(missing),'missingGridSlotsInStoredWindow':sum(max(0,int((b[i]['time']-b[i-1]['time'])/seconds)-1) for i in range(1,len(b))),'openBarsExcluded':sum(int(x['time'])+seconds>raw for x in rates)})

 info=broker.symbol_info(symbol)

 for n in [20,40]:

  result=evaluate(b,seconds,n,float(info.point),start);result.update(engineVersion=ENGINE_VERSION,symbol=symbol,timeframe=tf,lookback=n,prospectiveStartServerTime=start,mode='prospective_bar_proxy',bars=len(b))

  db.execute('INSERT OR REPLACE INTO prospective_results VALUES(?,?,?,?)',(symbol,tf,n,json.dumps(result,allow_nan=False)))

 db.commit()

if __name__=='__main__':

 try:print(json.dumps({'status':run(),'executionEnabled':False}))

 except Exception as e:

  # Do not expose terminal/account configuration in error messages.

  if allowed(ROOT):atomic(ROOT/DIRECTORY/'multiframe-research-error.json',json.dumps({'at':time.time(),'type':type(e).__name__,'executionEnabled':False}))

  raise SystemExit(1)

