import unittest,importlib.util,sqlite3,json,math
from pathlib import Path
from types import SimpleNamespace as S
s=importlib.util.spec_from_file_location('costs',Path(__file__).with_name('research-costs.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_unavailable_product_yields_to_next_product(self):
  db=sqlite3.connect(':memory:');m.setup(db);calls=[]
  broker=S(account_info=lambda:S(login=1,server='s',trade_mode=0,currency='EUR'),symbol_info=lambda name:(calls.append(name) or None))
  policy={'account':'1','server':'s'}
  self.assertEqual(m.capture_next(db,broker,policy,lambda:True,100),'symbol_unavailable')
  self.assertEqual(m.capture_next(db,broker,policy,lambda:True,101),'symbol_unavailable')
  self.assertEqual(calls,['BCHUSD','LTCUSD']);db.close()
 def test_product_capture_is_separate_and_rotates(self):
  db=sqlite3.connect(':memory:');m.setup(db);calls=[]
  broker=S(account_info=lambda:S(login=1,server='s',trade_mode=0,currency='EUR'),symbol_info=lambda name:(calls.append(name) or S(name=name,point=.01,swap_mode=5,swap_long=-10,swap_short=-20)),history_deals_get=lambda *a:[],positions_get=lambda **k:[])
  policy={'account':'1','server':'s'}
  for _ in range(5):self.assertEqual(m.capture_next(db,broker,policy,lambda:True,100),'captured')
  self.assertEqual(set(calls),set(m.SYMBOLS))
  self.assertEqual(m.latest(db,policy,'LTCUSD')['symbol']['name'],'LTCUSD')
  self.assertEqual(m.capture_next(db,S(),policy,lambda:True,101),'cached');db.close()
 def test_all_products_and_filters_in_overlay(self):
  spec=importlib.util.spec_from_file_location('research',Path(__file__).with_name('multiframe-research.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
  db=sqlite3.connect(':memory:');m.setup(db);db.execute('CREATE TABLE bars(symbol TEXT,tf TEXT,t INTEGER,payload TEXT)');db.execute('CREATE TABLE jobs(symbol TEXT,tf TEXT,status TEXT)')
  policy={'account':'1','server':'s','splitAt':14400*84}
  for name in m.SYMBOLS:
   e={'binding':{'account':'1','server':'s'},'observedAt':100,'symbol':{'name':name,'point':.01,'swap_mode':5,'swap_long':-10,'swap_short':-20}}
   db.execute('INSERT INTO research_cost_evidence(at,payload) VALUES(100,?)',(json.dumps(e),));db.execute('INSERT INTO jobs VALUES(?,?,?)',(name,'H4','complete_requested_range'))
   for i in range(120):
    b=dict(time=14400*(i+1),open=100.,high=103. if i==65 else 101.,low=99.,close=102. if i==65 else 100.,spread=2)
    db.execute('INSERT INTO bars VALUES(?,?,?,?)',(name,'H4',b['time'],json.dumps(b)))
  x=m.overlay(db,policy,r.evaluate,101)
  self.assertEqual(len(x['studies']),180);self.assertEqual({s['profile'] for s in x['studies']},{'baseline','spread','trend'})
  self.assertEqual({s['symbol'] for s in x['studies']},set(m.SYMBOLS));self.assertFalse(x['netProfitVerified']);db.close()
 def test_four_hour_proration(self):
  t={'entryTime':1,'exitTime':14400,'side':1,'entry':360.,'risk':10.,'grossR':1.,'spread':.1}
  e={'symbol':{'swap_mode':5,'swap_long':-10.,'swap_short':-10.}}
  self.assertAlmostEqual(m.trade_cost(t,e,0)['fundingR'],1/600)
  t['exitTime']=14399;self.assertEqual(m.trade_cost(t,e,0)['fundingR'],0)
 def test_unknown_not_verified_zero(self):
  e={'symbol':{'swap_mode':4}}
  self.assertIsNone(m.trade_cost({'side':1},e,0))
 def test_wrong_account_and_off_no_broker_reads(self):
  db=sqlite3.connect(':memory:');m.setup(db)
  self.assertEqual(m.capture(db,S(),{'account':'1','server':'s'},lambda:False,100),'off')
  broker=S(account_info=lambda:S(login=2,server='s',trade_mode=0))
  with self.assertRaises(ValueError):m.capture(db,broker,{'account':'1','server':'s'},lambda:True,100)
  db.close()
 def test_actual_bookings_deduplicate_and_never_become_tariff(self):
  db=sqlite3.connect(':memory:');m.setup(db)
  d=S(symbol='BCHUSD',ticket=1,position_id=3,entry=0,time=10,volume=1,price=360,commission=-2,swap=-1,fee=0,profit=0)
  sym=S(name='BCHUSD',swap_mode=5,swap_long=-20.1,swap_short=-19.9,point=.01)
  broker=S(account_info=lambda:S(login=1,server='s',trade_mode=0,currency='EUR'),symbol_info=lambda _:sym,history_deals_get=lambda *a:[d,d],positions_get=lambda **k:[])
  policy={'account':'1','server':'s'}
  self.assertEqual(m.capture(db,broker,policy,lambda:True,100),'captured')
  e=m.latest(db,policy);self.assertEqual(e['bookedTotals']['commission'],-2)
  self.assertFalse(e['commissionTariffVerified']);self.assertEqual(e['dealCount'],1)
  self.assertEqual(m.capture(db,S(),policy,lambda:True,101),'cached')
  db.close()
 def test_overlay_reconciles_original_and_does_not_change_evaluator(self):
  spec=importlib.util.spec_from_file_location('research',Path(__file__).with_name('multiframe-research.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
  b=[dict(time=14400*(i+1),open=100.,high=101.,low=99.,close=100.,spread=2) for i in range(120)]
  b[65].update(high=103.,close=102.)
  original=r.evaluate(b,14400,20,.01)
  ledger=m.replay(r.evaluate,b,20,.01,b[84]['time'])
  self.assertGreater(len(ledger),0);self.assertEqual(original,r.evaluate(b,14400,20,.01))
 def test_stale_evidence_cannot_produce_current_scenarios(self):
  db=sqlite3.connect(':memory:');m.setup(db);policy={'account':'1','server':'s'}
  e={'binding':policy,'observedAt':0}
  db.execute('INSERT INTO research_cost_evidence(at,payload) VALUES(0,?)',(json.dumps(e),))
  self.assertEqual(m.overlay(db,policy,None,7201)['status'],'evidence_stale');db.close()
if __name__=='__main__':unittest.main()
