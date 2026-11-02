import unittest,importlib.util,sqlite3,tempfile,json
from pathlib import Path
s=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('mt5-signal-audit.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
class Tests(unittest.TestCase):
 def test_skipped_history_does_not_claim_missing_candles(self):
  row={'symbol':'CLOSED','capability':False,'quoteAt':1,'bid':100,'ask':101,'closedBars':[],'reasons':['Fresh quote unavailable','History unavailable'],'historyRead':{'requested':False}}
  result=a.explain(row,[],1800000000000)
  self.assertIn('history_skipped_prerequisite',result['diagnosticReasons'])
  self.assertNotIn('insufficient_closed_bars',result['diagnosticReasons'])
  self.assertNotIn('History unavailable',result['diagnosticReasons'])
  db=sqlite3.connect(':memory:');a.setup(db)
  legacy={**result,'diagnosticReasons':['Fresh quote unavailable','History unavailable','market_not_eligible','quote_stale_or_future','insufficient_closed_bars']}
  record={'phase':'completed','products':[legacy]}
  db.execute('insert into signal_checks(at,payload) values(?,?)',(1000,json.dumps(record)))
  report=a.render(db)
  self.assertIn('Kerzenabruf übersprungen',report)
  self.assertNotIn('<td>Kein frischer bestätigter Kurs; Kerzenhistorie',report);db.close()

 def test_unverified_broker_clock_is_not_reported_as_future_quote(self):
  db=sqlite3.connect(':memory:');a.setup(db)
  payload={'market':{'clockProof':None,'account':{'observedAt':1000},'instruments':[{'symbol':'TEST','capability':False,'quoteAt':10801000,'reasons':['Fresh quote unavailable']}]},'signals':[]}
  a.begin(db,payload,{})
  product=json.loads(db.execute('select payload from signal_checks').fetchone()[0])['products'][0]
  self.assertIn('broker_clock_unverified',product['diagnosticReasons'])
  self.assertNotIn('quote_stale_or_future',product['diagnosticReasons']);self.assertIsNone(product['quoteAgeMs']);db.close()

 def test_retention_keeps_only_newest_cycles(self):
  from unittest.mock import patch
  db=sqlite3.connect(':memory:');a.setup(db)
  payload={'market':{'account':{'observedAt':1000},'instruments':[]},'signals':[]}
  with patch.object(a,'MAX_CYCLES',2):
   for _ in range(3):a.begin(db,payload,{})
  self.assertEqual(db.execute('SELECT id FROM signal_checks ORDER BY id').fetchall(),[(2,),(3,)])
  db.close()

 def test_rejections_and_selected_signal_are_distinguished(self):
  now=1800000000000
  bars=[{'time':now/1000-(25-i)*300,'open':100,'high':101,'low':99,'close':100} for i in range(25)]
  row={'symbol':'TEST','capability':True,'quoteAt':now,'bid':102,'ask':103,'closedBars':bars}
  result=a.explain(row,[],now)
  self.assertIn('no_closed_breakout',result['diagnosticReasons'])
  bars[-1].update(close=102,high=103)
  result=a.explain(row,[],now);self.assertEqual(result['decision'],'qualifies_but_not_forwarded')
  self.assertEqual(a.explain(row,[{'symbol':'TEST','signalId':'a'*64,'side':'BUY'}],now)['decision'],'forwarded_to_execution')
  row['capability']=False;row['reasons']=['Trading restricted']
  self.assertIn('Trading restricted',a.explain(row,[],now)['diagnosticReasons'])
 def test_durable_bounded_history_and_escaped_report(self):
  db=sqlite3.connect(':memory:');a.setup(db)
  payload={'market':{'account':{'observedAt':1000},'instruments':[{'symbol':'<script>','capability':False,'reasons':['bad'],'closedBars':[]}],'scan':{}},'signals':[]}
  id=a.begin(db,payload,{'dayVerified':False})
  a.finish(db,id,{'status':'waiting-day','events':[]},[])
  result=json.loads(db.execute('select payload from signal_checks').fetchone()[0])
  self.assertEqual(result['execution']['status'],'waiting-day')
  self.assertEqual(result['phase'],'completed')
  self.assertNotIn('<script>',a.render(db));self.assertIn('&lt;script&gt;',a.render(db))
  a.begin(db,payload,{})
  self.assertIn('started',db.execute('select payload from signal_checks order by id desc').fetchone()[0])
  db.close()
if __name__=='__main__':unittest.main()
