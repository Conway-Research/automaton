import unittest,importlib.util,inspect,sqlite3,json,math
from types import SimpleNamespace as S
from pathlib import Path
def load(name,file):
 s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('experiments','h4-experiments.py');r=load('research','multiframe-research.py')
class Tests(unittest.TestCase):
 def test_ten_bar_breakout_keeps_existing_spread_filter(self):
  b=self.bars();b[40]['high']=110.
  cutoff=b[64]['time']
  _,old=m.variant(r.evaluate,b,.01,cutoff,'reference',admit_after=cutoff)
  _,new=m.variant(r.evaluate,b,.01,cutoff,'reference',admit_after=cutoff,lookback=10)
  self.assertFalse(any(t['signalTime']==b[65]['time'] and t['profile']=='spread' for t in old))
  self.assertTrue(any(t['signalTime']==b[65]['time'] and t['profile']=='spread' for t in new))
  b[66]['spread']=1000
  _,new=m.variant(r.evaluate,b,.01,cutoff,'reference',admit_after=cutoff,lookback=10)
  self.assertFalse(any(t['signalTime']==b[65]['time'] and t['profile']=='spread' for t in new))
 def test_activity_filter_does_not_use_next_bar_volume(self):
  b=self.bars();_,one=m.variant(r.evaluate,b,.01,b[100]['time'],'activity')
  b[66]['tick_volume']=10000000
  _,two=m.variant(r.evaluate,b,.01,b[100]['time'],'activity')
  self.assertEqual(one[0]['entryTime'],two[0]['entryTime']);self.assertEqual(one[0]['signalTime'],two[0]['signalTime'])
 def test_old_positions_do_not_reserve_prospective_slots(self):
  b=self.bars()
  for j in range(66,len(b)):b[j].update(open=102.,close=102.,high=103.,low=101.)
  b[70].update(close=104.,high=105.)
  cutoff=b[69]['time']
  _,ledger=m.variant(r.evaluate,b,.01,cutoff,'reference',admit_after=cutoff)
  self.assertTrue(any(t['signalTime']==b[70]['time'] and t['profile']=='spread' for t in ledger))
  self.assertTrue(all(t['entryTime']>=cutoff for t in ledger))
 def test_off_no_reads_and_wrong_binding_rejected(self):
  db=sqlite3.connect(':memory:')
  self.assertEqual(m.capture(db,S(),{},Path('.'),lambda:False,100),'off')
  with self.assertRaises(ValueError):m.capture(db,S(account_info=lambda:S(login=2,server='s',trade_mode=0)),{'account':'1','server':'s'},Path('.'),lambda:True,100)
  self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0],0);db.close()
 def test_volume_backfill_preserves_prices_and_marks_conflicts(self):
  db=sqlite3.connect(':memory:');db.execute('CREATE TABLE bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT)')
  b=dict(time=1,open=100.,high=101.,low=99.,close=100.,spread=2)
  db.execute('INSERT INTO bars VALUES(?,?,?,?)',('LTCUSD','H4',1,json.dumps(b)))
  broker=S(account_info=lambda:S(login=1,server='s',trade_mode=0),symbol_info_tick=lambda _:S(time=100),TIMEFRAME_H4=4,copy_rates_from=lambda *a:[{**b,'tick_volume':123}])
  self.assertEqual(m.capture(db,broker,{'account':'1','server':'s','startedAt':100},Path('.'),lambda:True,100),'volume_backfilled')
  saved=json.loads(db.execute('SELECT payload FROM bars').fetchone()[0]);self.assertEqual(saved.pop('tick_volume'),123);self.assertEqual(saved,b);db.close()
 def test_existing_backfill_also_repairs_prospective_warmup(self):
  db=sqlite3.connect(':memory:');m.setup(db)
  for table in ['bars','prospective_bars']:db.execute('CREATE TABLE '+table+'(symbol TEXT,tf TEXT,t INTEGER,payload TEXT)')
  b=dict(time=1,open=100.,high=101.,low=99.,close=100.,spread=2)
  for table in ['bars','prospective_bars']:db.execute('INSERT INTO '+table+' VALUES(?,?,?,?)',('LTCUSD','H4',1,json.dumps(b)))
  db.execute('INSERT INTO h4_experiment_meta VALUES(?,?)',('volume:LTCUSD',json.dumps({'matched':1,'conflicts':0,'at':1})))
  broker=S(account_info=lambda:S(login=1,server='s',trade_mode=0),symbol_info_tick=lambda _:S(time=100),TIMEFRAME_H4=4,copy_rates_from=lambda *a:[{**b,'tick_volume':123}])
  self.assertEqual(m.capture(db,broker,{'account':'1','server':'s','startedAt':100},Path('.'),lambda:True,100),'volume_backfilled')
  saved=json.loads(db.execute('SELECT payload FROM prospective_bars').fetchone()[0]);self.assertEqual(saved.pop('tick_volume'),123);self.assertEqual(saved,b);db.close()
 def bars(self):
  b=[dict(time=(i+1)*14400,open=100.,high=101.,low=99.,close=100.,spread=2,tick_volume=100) for i in range(120)]
  b[65].update(high=103.,close=102.);return b
 def test_reference_exact(self):
  b=self.bars();x,ledger=m.variant(r.evaluate,b,.01,b[84]['time'],'reference')
  self.assertEqual(x,r.evaluate(b,14400,40,.01,b[84]['time']));self.assertGreater(len(ledger),0)
 def test_shorter_holding_and_unknown_volume(self):
  b=self.bars();_,ledger=m.variant(r.evaluate,b,.01,b[110]['time'],'hold12')
  self.assertTrue(all(t['exitTime']-t['entryTime']<=12*14400 for t in ledger))
  for x in b:x.pop('tick_volume')
  x,ledger=m.variant(r.evaluate,b,.01,b[110]['time'],'activity')
  self.assertGreater(x['profiles']['spread']['development'].get('missingVolume',0),0)
  self.assertFalse(ledger)
 def test_measurement_matches_owned_fill_and_distinguishes_stop(self):
  intent={'signalId':'a'*64,'symbol':'BCHUSD','side':'BUY','entry':100.,'stop':98.,'target':104.,'account':'1','server':'s','observedAt':1}
  d={'ticket':1,'position_id':7,'entry':0,'type':0,'magic':170102601,'comment':'a'*24,'symbol':'BCHUSD','price':100.2,'volume':1,'time_msc':200,'commission':-1,'swap':0,'fee':0}
  out=m.measure([intent],[d],{'account':'1','server':'s'})
  self.assertAlmostEqual(out['fills'][0]['adverseDeviationPrice'],.2)
  self.assertEqual(out['fills'][0]['benchmarkType'],'submitted_entry_price')
  d['magic']=0;self.assertEqual(m.measure([intent],[d],{'account':'1','server':'s'})['fills'],[])
if __name__=='__main__':unittest.main()
