import importlib.util,unittest,tempfile,json,sqlite3,sys,types
from unittest.mock import patch
from contextlib import closing
from pathlib import Path
s=importlib.util.spec_from_file_location('research',Path(__file__).with_name('multiframe-research.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def bars(n=120):
 return [dict(time=100000+i*60,open=100.,high=101.,low=99.,close=100.,spread=2) for i in range(n)]
class Tests(unittest.TestCase):
 def test_manual_resume_recovers_both_h4_series_and_is_idempotent(self):
  with tempfile.TemporaryDirectory() as td,closing(sqlite3.connect(':memory:')) as db:
   root=Path(td);self.fixture(root)
   power=root/'artifacts/founder-integration-20261012/power-state.jsonl'
   power.write_text('{"enabled":false}')
   db.executescript('CREATE TABLE prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL);CREATE TABLE prospective_bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,t));CREATE TABLE prospective_results(symbol TEXT,tf TEXT,lookback INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,lookback));')
   floor=1800000000//14400*14400;now=floor+10810;start=floor-7*14400
   data=[dict(time=floor-(70-i)*14400,open=100.,high=101.,low=99.,close=100.,spread=2,tick_volume=100) for i in range(71)]
   for symbol in ['BCHUSD','LTCUSD']:
    db.execute('INSERT INTO prospective VALUES(?,?,?,0)',(symbol,'H4',start))
    for bar in data[:-7]:db.execute('INSERT INTO prospective_bars VALUES(?,?,?,?)',(symbol,'H4',bar['time'],json.dumps(bar)))
   db.commit();reads=[]
   fake=types.SimpleNamespace(TIMEFRAME_H4=4,symbol_info_tick=lambda _:types.SimpleNamespace(time=now-2),copy_rates_from=lambda symbol,*a:(reads.append(symbol) or data),symbol_info=lambda _:types.SimpleNamespace(point=.01))
   with patch.object(m.time,'time',return_value=now):
    m.forward(db,fake,{},root);self.assertEqual(reads,[])
    # This ON transition belongs exclusively to temporary test state.
    power.write_text('{"enabled":true}')
    for _ in range(2):m.forward(db,fake,{},root,job=m.priority_forward_job(db,now))
    for symbol in ['BCHUSD','LTCUSD']:
     self.assertEqual(db.execute('SELECT COUNT(*),MAX(t) FROM prospective_bars WHERE symbol=?',(symbol,)).fetchone(),(70,floor-14400))
     self.assertEqual(db.execute('SELECT start FROM prospective WHERE symbol=?',(symbol,)).fetchone()[0],start)
    self.assertEqual(reads,['BCHUSD','LTCUSD'])
    m.forward(db,fake,{},root,job=('BCHUSD','H4',start))
    self.assertEqual(db.execute("SELECT COUNT(*) FROM prospective_bars WHERE symbol='BCHUSD'").fetchone()[0],70)
    power.write_text('{"enabled":false}')
    m.forward(db,fake,{},root);self.assertEqual(len(reads),3)
 def test_history_recovers_after_unverified_clock_without_changing_start(self):
  with closing(sqlite3.connect(':memory:')) as db:
   db.executescript('CREATE TABLE prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL);CREATE TABLE prospective_bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,t));CREATE TABLE prospective_results(symbol TEXT,tf TEXT,lookback INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,lookback));')
   now=1800000010;floor=now//14400*14400;start=floor-14400
   db.execute("INSERT INTO prospective VALUES('BCHUSD','H4',?,0)",(start,));db.commit()
   fresh=False;reads=[]
   data=[dict(time=floor-(70-i)*14400,open=100.,high=101.,low=99.,close=100.,spread=2,tick_volume=100) for i in range(71)]
   fake=types.SimpleNamespace(TIMEFRAME_H4=4,symbol_info_tick=lambda name:types.SimpleNamespace(time=now-2 if fresh else now-60),copy_rates_from=lambda *a:(reads.append(1) or data),symbol_info=lambda _:types.SimpleNamespace(point=.01))
   with patch.object(m,'allowed',return_value=True),patch.object(m.time,'time',return_value=now):
    m.forward(db,fake,{},Path('.'));self.assertEqual(reads,[])
    fresh=True;m.forward(db,fake,{},Path('.'))
   self.assertEqual(len(reads),1);self.assertEqual(db.execute('SELECT start FROM prospective').fetchone()[0],start)
   self.assertEqual(db.execute('SELECT MAX(t) FROM prospective_bars').fetchone()[0],floor-14400)
   c=json.loads(db.execute('SELECT payload FROM research_bar_coverage').fetchone()[0]);self.assertEqual(c['status'],'captured');self.assertEqual(c['missingReturnedBarCount'],0)
 def test_slow_clock_read_compares_against_receive_time(self):
  now=1800000000;fake=types.SimpleNamespace(symbol_info_tick=lambda name:types.SimpleNamespace(time=now+10800+5))
  with patch.object(m.time,'monotonic',side_effect=[0,5]):raw,proof=m.closed_history_clock(fake,'BCHUSD',now,lambda:True)
  self.assertEqual(raw,now+10800+5);self.assertEqual(proof['source'],'fresh_product_tick')
 def test_clock_failure_records_each_witness_reason(self):
  now=1800000000;fake=types.SimpleNamespace(symbol_info_tick=lambda name:types.SimpleNamespace(time=now+10800-60))
  raw,proof=m.closed_history_clock(fake,'BCHUSD',now,lambda:True)
  self.assertIsNone(raw);self.assertEqual(len(proof['samples']),5)
  self.assertTrue(all(v['status']=='stale_tick' for v in proof['samples']))
 def test_failed_coverage_keeps_last_success_without_using_old_clock(self):
  db=sqlite3.connect(':memory:')
  m.record_bar_coverage(db,'BCHUSD','H4',{'status':'captured','observedAt':10,'latestBrokerClosedBar':1,'latestStoredBar':1,'clockProof':{'offsetSeconds':10800}})
  m.record_bar_coverage(db,'BCHUSD','H4',{'status':'clock_unverified','observedAt':20,'clockProof':{'source':'clock_unverified'}})
  c=json.loads(db.execute('SELECT payload FROM research_bar_coverage').fetchone()[0])
  self.assertEqual(c['lastSuccessfulCapture']['observedAt'],10);self.assertEqual(c['clockProof']['source'],'clock_unverified');db.close()
 def test_due_h4_candidate_gets_priority_without_starving_fresh_series(self):
  db=sqlite3.connect(':memory:');db.execute('CREATE TABLE prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL)')
  db.executemany('INSERT INTO prospective VALUES(?,?,?,?)',[('BTCUSD','M1',1,0),('BCHUSD','H4',1,0),('LTCUSD','H4',1,990)])
  self.assertEqual(m.priority_forward_job(db,1000)[0],'BCHUSD')
  db.execute("UPDATE prospective SET updated=1000 WHERE symbol='BCHUSD'")
  self.assertIsNone(m.priority_forward_job(db,1000));db.close()
 def test_closed_history_clock_can_use_two_fresh_other_symbols(self):
  fake=types.SimpleNamespace(symbol_info_tick=lambda symbol:types.SimpleNamespace(time=1 if symbol=='BCHUSD' else 1800010798))
  raw,proof=m.closed_history_clock(fake,'BCHUSD',1800000000,lambda:True)
  self.assertEqual(raw,1800010798);self.assertEqual(proof['source'],'two_fresh_other_symbols')
  self.assertEqual(proof['offsetSeconds'],10800)
 def test_off_history_clock_has_no_reads(self):
  self.assertEqual(m.closed_history_clock(types.SimpleNamespace(),'BCHUSD',1,lambda:False),(None,{'source':'off'}))
 def test_single_or_disagreeing_clock_witnesses_are_rejected(self):
  now=1800000000
  for values in [{'LTCUSD':now-2},{'LTCUSD':now-2,'BTCUSD':now+10800-2}]:
   fake=types.SimpleNamespace(symbol_info_tick=lambda name:types.SimpleNamespace(time=values.get(name,1)))
   self.assertIsNone(m.closed_history_clock(fake,'BCHUSD',now,lambda:True)[0])
 def test_power_off_between_witnesses_prevents_more_reads(self):
  calls=[];checks=[]
  def power():checks.append(1);return len(checks)<=2
  fake=types.SimpleNamespace(symbol_info_tick=lambda name:(calls.append(name) or types.SimpleNamespace(time=1)))
  self.assertIsNone(m.closed_history_clock(fake,'BCHUSD',1800000000,power)[0]);self.assertEqual(calls,['BCHUSD'])
 def test_stale_product_still_captures_all_closed_bars_and_excludes_open(self):
  with closing(sqlite3.connect(':memory:')) as db:
   db.executescript('CREATE TABLE prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL);CREATE TABLE prospective_bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,t));CREATE TABLE prospective_results(symbol TEXT,tf TEXT,lookback INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,lookback));')
   now=1800000010;floor=now//14400*14400
   db.execute("INSERT INTO prospective VALUES('BCHUSD','H4',?,0)",(floor-14400,));db.commit()
   data=[dict(time=floor-(70-i)*14400,open=100.,high=101.,low=99.,close=100.,spread=2,tick_volume=100) for i in range(71)]
   fake=types.SimpleNamespace(TIMEFRAME_H4=4,symbol_info_tick=lambda symbol:types.SimpleNamespace(time=1 if symbol=='BCHUSD' else now-2),copy_rates_from=lambda *a:data,symbol_info=lambda symbol:types.SimpleNamespace(point=.01))
   with patch.object(m,'allowed',return_value=True),patch.object(m.time,'time',return_value=now):m.forward(db,fake,{},Path('.'))
   self.assertEqual(db.execute('SELECT MAX(t) FROM prospective_bars').fetchone()[0],floor-14400)
   coverage=json.loads(db.execute('SELECT payload FROM research_bar_coverage').fetchone()[0]);self.assertEqual(coverage['missingReturnedBarCount'],0);self.assertEqual(coverage['openBarsExcluded'],1)
 def test_fixed_variants_and_timeframes(self):
  self.assertEqual(len(m.VARIANTS),8);self.assertIn('H12',m.TIMEFRAMES);self.assertIn('M15',m.TIMEFRAMES);self.assertNotIn('H15',m.TIMEFRAMES)
 def test_no_breakout(self):
  self.assertEqual(m.evaluate(bars(),60,20,.01)['candidates'],0)
 def test_future_does_not_change_signal(self):
  b=bars();b[65].update(high=103.,close=102.);b[66].update(open=102.,high=110.,low=98.)
  a=m.evaluate(b,60,20,.01);b[100].update(high=500.)
  self.assertEqual(a['firstSignal'],m.evaluate(b,60,20,.01)['firstSignal']);self.assertGreater(a['ambiguous'],0)
 def test_gap_prevents_entry(self):
  b=bars();b[65].update(high=103.,close=102.);b[60]['time']+=1
  self.assertEqual(m.evaluate(b,60,20,.01)['candidates'],0)
 def test_invalid_bars_rejected(self):
  b=bars();b[65]['close']=float('nan')
  with self.assertRaises(ValueError):m.evaluate(b,60,20,.01)
 def test_future_prices_do_not_leak_across_development_split(self):
  b=bars();b[80].update(high=103.,close=102.)
  a=m.evaluate(b,60,20,.01,split_at=b[82]['time'])
  b[83].update(high=1000.)
  c=m.evaluate(b,60,20,.01,split_at=b[82]['time'])
  self.assertEqual(a['profiles']['baseline']['development'],c['profiles']['baseline']['development'])
 def test_missing_spread_is_unknown_not_free(self):
  b=bars();b[65].update(high=103.,close=102.);b[66].pop('spread')
  r=m.evaluate(b,60,20,.01)
  self.assertGreater(r['profiles']['baseline']['development']['missingSpread'],0)
  self.assertEqual(r['profiles']['baseline']['development']['complete'],0)
 def test_off_no_collection(self):
  with tempfile.TemporaryDirectory() as td:
   self.assertFalse(m.allowed(Path(td)))
 def test_temporal_split(self):
  b=bars();r=m.evaluate(b,60,20,.01)
  self.assertLess(r['developmentEnd'],r['validationStart']);self.assertFalse(r['profitabilityProven'])
 def fixture(self,root):
  p=root/'artifacts/founder-integration-20261012';p.mkdir(parents=True)
  (p/'power-state.jsonl').write_text(json.dumps({'enabled':True}))
  (p/'mt5-demo-profile.json').write_text(json.dumps({'terminal':str(root/'terminal64.exe'),'login':123,'server':'fixture'}))
  c=root/'artifacts/founder-autonomy-20261013';c.mkdir()
  with closing(sqlite3.connect(c/'controller.db')) as db:db.execute('CREATE TABLE founder_control(id INTEGER,status TEXT)');db.execute("INSERT INTO founder_control VALUES(1,'running')");db.commit()
 def test_bounded_paging_uses_fake_demo_only_and_throttles(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);self.fixture(root);calls=[]
   fake=types.SimpleNamespace()
   fake.initialize=lambda *a,**kw:True
   fake.shutdown=lambda:None
   fake.account_info=lambda:types.SimpleNamespace(login=123,server='fixture',trade_mode=0)
   fake.terminal_info=lambda:types.SimpleNamespace(connected=True,path=str(root),data_path=str(root))
   symbol=types.SimpleNamespace(name='TEST',path='Cryptocurrencies\\TEST',trade_mode=4,point=.01)
   fake.symbols_get=lambda:[symbol];fake.symbol_info=lambda _:symbol
   for i,tf in enumerate(m.TIMEFRAMES):setattr(fake,'TIMEFRAME_'+tf,i)
   def read(symbol,tf,end,count):
    calls.append((symbol,tf,count));end=int(end.timestamp());step=m.TIMEFRAMES[list(m.TIMEFRAMES)[tf]] or 86400;return [dict(time=end-step*(121-i),open=100.,high=101.,low=99.,close=100.,spread=2) for i in range(120)]
   fake.copy_rates_from=read
   with patch.dict(sys.modules,{'MetaTrader5':fake}):
    self.assertEqual(m.run(root),'collected');self.assertEqual(len(calls),1);self.assertEqual(calls[0][2],5000)
    self.assertEqual(m.run(root),'throttled');self.assertEqual(len(calls),1)
    with closing(sqlite3.connect(root/m.DIRECTORY/'multiframe-research.db')) as db:
     db.execute("UPDATE jobs SET status='complete_requested_range' WHERE updated=0");db.execute("UPDATE meta SET v='0' WHERE k IN ('lastRun','turn')");db.commit()
    self.assertEqual(m.run(root),'collected')
    with closing(sqlite3.connect(root/m.DIRECTORY/'multiframe-research.db')) as db:
     db.execute("UPDATE meta SET v='0' WHERE k IN ('lastRun','turn')");db.commit()
    fake.copy_rates_from=lambda *args:[]
    self.assertEqual(m.run(root),'collected')
   report=json.loads((root/m.DIRECTORY/'multiframe-research.json').read_text())
   self.assertFalse(report['executionEnabled']);self.assertEqual(len(report['jobs']),len(m.TIMEFRAMES))
   self.assertEqual(report['studies'][0]['bars'],240);self.assertFalse(report['studies'][0]['provisional'])
   with closing(sqlite3.connect(root/m.DIRECTORY/'multiframe-research.db')) as db:
    db.execute("UPDATE results SET payload=json_remove(payload,'$.engineVersion')")
    db.execute("UPDATE meta SET v='0' WHERE k IN ('lastRun','turn')");db.commit()
   with patch.dict(sys.modules,{'MetaTrader5':fake}):
    fake.copy_rates_from=lambda *args:self.fail('Cached rescore must not fetch history')
    self.assertEqual(m.run(root),'collected')
   report=json.loads((root/m.DIRECTORY/'multiframe-research.json').read_text())
   self.assertEqual(len(report['studies']),2)
 def test_stale_prospective_series_does_not_starve_healthy_series(self):
  with closing(sqlite3.connect(':memory:')) as db:
   db.execute('CREATE TABLE prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL)')
   db.executemany('INSERT INTO prospective VALUES(?,?,NULL,0)',[('A','M1'),('B','M1')]);db.commit()
   fake=types.SimpleNamespace(symbol_info_tick=lambda s:types.SimpleNamespace(time=1))
   with patch.object(m,'allowed',return_value=True):m.forward(db,fake,{},Path('.'))
   self.assertEqual(db.execute('SELECT symbol FROM prospective ORDER BY updated,symbol LIMIT 1').fetchone()[0],'B')
 def test_prospective_start_is_frozen_and_results_separate(self):
  with closing(sqlite3.connect(':memory:')) as db:
   db.executescript('CREATE TABLE prospective(symbol TEXT,tf TEXT,start INTEGER,updated REAL);CREATE TABLE prospective_bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,t));CREATE TABLE prospective_results(symbol TEXT,tf TEXT,lookback INTEGER,payload TEXT,PRIMARY KEY(symbol,tf,lookback));')
   db.execute("INSERT INTO prospective VALUES('A','M1',NULL,0)");db.commit()
   now=1800000000
   fake=types.SimpleNamespace(TIMEFRAME_M1=1,symbol_info_tick=lambda s:types.SimpleNamespace(time=now),symbol_info=lambda s:types.SimpleNamespace(point=.01))
   def read(*args):return [dict(time=now-(121-i)*60,open=100.,high=101.,low=99.,close=100.,spread=2) for i in range(120)]
   fake.copy_rates_from=read
   with patch.object(m,'allowed',return_value=True),patch.object(m.time,'time',side_effect=lambda:now):
    m.forward(db,fake,{},Path('.'));now+=180;m.forward(db,fake,{},Path('.'))
   self.assertEqual(db.execute('SELECT start FROM prospective').fetchone()[0],1800000000)
   result=json.loads(db.execute('SELECT payload FROM prospective_results LIMIT 1').fetchone()[0])
   self.assertEqual(result['mode'],'prospective_bar_proxy');self.assertFalse(result['profitabilityProven'])
 def test_off_worker_creates_no_files(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);self.assertEqual(m.run(root),'off');self.assertEqual(list(root.iterdir()),[])
if __name__=='__main__':unittest.main()
