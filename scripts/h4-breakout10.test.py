import unittest,sqlite3,json,importlib.util
from pathlib import Path
def load(name,file):
 s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('ten','h4-breakout10.py');r=load('ten_engine','multiframe-research.py')
class Tests(unittest.TestCase):
 def fixture(self):
  db=sqlite3.connect(':memory:');self.addCleanup(db.close)
  db.executescript('CREATE TABLE bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT);CREATE TABLE prospective_bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT);CREATE TABLE research_bar_coverage(symbol TEXT,tf TEXT,payload TEXT);')
  policy={'account':'1','server':'fake','splitAt':1000000}
  costs={'products':{}}
  for sym in ['BCHUSD','LTCUSD']:
   costs['products'][sym]={'evidence':{'observedAt':2000000,'symbol':{'point':.01}}}
   for i in range(120):
    b=dict(time=(i+1)*14400,open=100.,close=100.,high=101.,low=99.,spread=2,tick_volume=100)
    for table in ['bars','prospective_bars']:db.execute('INSERT INTO '+table+' VALUES(?,?,?,?)',(sym,'H4',b['time'],json.dumps(b)))
  return db,policy,costs
 def test_off_no_state_or_reads(self):
  db,p,c=self.fixture();self.assertEqual(m.overlay(db,p,r.evaluate,c,2000000,lambda:False)['status'],'off')
  self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='h4_breakout10_meta'").fetchone())
 def test_clock_start_uses_only_agreeing_validated_witnesses(self):
  db,p,c=self.fixture();m.overlay(db,p,r.evaluate,c,2000000,lambda:True)
  samples=[{'symbol':name,'status':'fresh','rawTime':raw,'observedAtUtc':2000001,'matchedOffsetSeconds':offset} for name,raw,offset in [('BCHUSD',2000001,0),('LTCUSD',2010800,10800),('BTCUSD',2010801,10800)]]
  proof={'source':'two_fresh_other_symbols','offsetSeconds':10800,'witnesses':['LTCUSD','BTCUSD'],'samples':samples}
  db.execute('INSERT INTO research_bar_coverage VALUES(?,?,?)',('BCHUSD','H4',json.dumps({'clockProof':proof})))
  out=m.overlay(db,p,r.evaluate,c,2000002,lambda:True)
  self.assertEqual(out['manifest']['forwardStartServerTime'],2010800)
 def test_new_frozen_start_does_not_reuse_old_coverage(self):
  db,p,c=self.fixture()
  proof={'observedAt':1999999,'clockProof':{'source':'fresh_product_tick','offsetSeconds':10800,'samples':[{'symbol':'BCHUSD','status':'fresh','rawTime':2010799,'observedAtUtc':1999999,'matchedOffsetSeconds':10800}]}}
  db.execute('INSERT INTO research_bar_coverage VALUES(?,?,?)',('BCHUSD','H4',json.dumps(proof)))
  a=m.overlay(db,p,r.evaluate,c,2000000,lambda:True)
  self.assertIsNone(a['manifest']['forwardStartServerTime'])
  proof['observedAt']=2000001;proof['clockProof']['samples'][0].update(rawTime=2010801,observedAtUtc=2000001)
  db.execute('UPDATE research_bar_coverage SET payload=?',(json.dumps(proof),))
  b=m.overlay(db,p,r.evaluate,c,2000002,lambda:True)
  self.assertEqual(b['manifest']['forwardStartServerTime'],2010801)
  later=m.overlay(db,p,r.evaluate,c,2000010,lambda:True)
  self.assertEqual(b['manifest'],later['manifest'])
  self.assertEqual(len(b['studies']),4)
  for s in b['studies']:
   self.assertEqual(s['lookback'],10);self.assertEqual(s['profile'],'spread')
   if s['source']=='prospective':
    self.assertEqual(s['segments']['validation']['counts']['candidates'],0)
    self.assertIsNone(s['segments']['validation']['scenarios'][1]['R'])
  with self.assertRaises(ValueError):m.overlay(db,{**p,'account':'2'},r.evaluate,c,2000010,lambda:True)
 def test_new_signal_is_scored_with_costs_and_old_signal_excluded(self):
  db,p,c=self.fixture()
  first=m.overlay(db,p,r.evaluate,c,2000000,lambda:True)
  manifest=first['manifest'];manifest['forwardStartServerTime']=64*14400
  db.execute('UPDATE h4_breakout10_meta SET v=?',(json.dumps(manifest),))
  for sym in ['BCHUSD','LTCUSD']:
   c['products'][sym]['evidence']['symbol'].update(swap_mode=5,swap_long=-20.,swap_short=-20.)
   row=db.execute("SELECT payload FROM prospective_bars WHERE symbol=? AND t=?",(sym,66*14400)).fetchone()
   bar=json.loads(row[0]);bar.update(close=102.,high=103.)
   db.execute('UPDATE prospective_bars SET payload=? WHERE symbol=? AND t=?',(json.dumps(bar),sym,66*14400))
  out=m.overlay(db,p,r.evaluate,c,2000001,lambda:True)
  for study in out['studies']:
   if study['source']!='prospective':continue
   seg=study['segments']['validation'];self.assertEqual(seg['counts']['complete'],1)
   self.assertGreater(seg['scenarios'][0]['R'],seg['scenarios'][1]['R'])
   self.assertGreater(seg['scenarios'][1]['R'],seg['scenarios'][1]['stressR'])
  manifest['forwardStartServerTime']=70*14400
  db.execute('UPDATE h4_breakout10_meta SET v=?',(json.dumps(manifest),))
  later=m.overlay(db,p,r.evaluate,c,2000001,lambda:True)
  self.assertTrue(all(s['segments']['validation']['counts']['candidates']==0 for s in later['studies'] if s['source']=='prospective'))
if __name__=='__main__':unittest.main()
