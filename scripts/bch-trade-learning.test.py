import unittest,importlib.util,tempfile,sqlite3,json
from pathlib import Path
s=importlib.util.spec_from_file_location('learning',Path(__file__).with_name('bch-trade-learning.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_overlay_keeps_old_closed_bch_after_unrelated_intents(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);directory=root/'artifacts/founder-integration-20261012';directory.mkdir(parents=True)
   with sqlite3.connect(directory/'demo-execution-20261017.db.orders.db') as db:
    db.execute('CREATE TABLE intents(payload TEXT,status TEXT,result TEXT)')
    i={'signalId':'old','symbol':'BCHUSD','account':'1','server':'s','entry':100.,'stop':99.,'side':'BUY','observedAt':1}
    db.execute('INSERT INTO intents VALUES(?,?,?)',(json.dumps(i),'closed',json.dumps({'finalityVerified':True,'realizedDemoProfit':2.,'currency':'EUR'})))
    db.executemany('INSERT INTO intents VALUES(?,?,?)',[(json.dumps({'symbol':'OTHER'}),'submitted',None)]*501)
   db.close()
   out=m.overlay(root,{}, {'account':'1','server':'s'},lambda:True)
   self.assertEqual(out['totalsByCurrency']['EUR'],2.);self.assertEqual(len(out['trades']),1)
   self.assertEqual(m.overlay(root,{}, {},lambda:False)['status'],'off')
 def test_closed_trade_is_bound_and_counterfactual_is_not_promoted(self):
  intent={'signalId':'a','symbol':'BCHUSD','account':'1','server':'fake','strategyVersion':'v','observedAt':1000,'side':'SELL','entry':100.,'stop':104.,'target':92.}
  rows=[(intent,'closed',{'finalityVerified':True,'realizedDemoProfit':8.,'currency':'EUR'})]
  fills=[{'symbol':'BCHUSD','strategyVersion':'v','signalObservedAtUtcMs':1000,'kind':'entry','position':7,'fillPrice':100.,'dealTimeRawMs':100000,'capturedSignalQuote':{'spread':1.},'commission':0.,'swap':0.,'fee':0.}, {'symbol':'BCHUSD','strategyVersion':'v','signalObservedAtUtcMs':1000,'kind':'exit','position':7,'fillPrice':92.,'dealTimeRawMs':200000,'commission':0.,'swap':0.,'fee':0.}]
  out=m.analyze(rows,fills,{'account':'1','server':'fake'})
  self.assertEqual(out['trades'][0]['spreadToInitialRisk'],.25)
  self.assertFalse(out['trades'][0]['fixedSpread10WouldAccept'])
  self.assertEqual(out['trades'][0]['priceMoveR'],2.)
  self.assertEqual(out['totalsByCurrency']['EUR'],8.)
  self.assertFalse(out['automaticPromotion'])
  self.assertEqual(m.analyze(rows,fills,{'account':'2','server':'fake'})['trades'],[])
  rows[0]=(intent,'submitted',None)
  self.assertEqual(m.analyze(rows,fills,{'account':'1','server':'fake'})['trades'],[])
 def test_missing_exit_and_quote_stay_unknown(self):
  i={'signalId':'a','symbol':'BCHUSD','account':'1','server':'s','strategyVersion':'v','observedAt':1,'side':'BUY','entry':100.,'stop':99.,'target':102.}
  out=m.analyze([(i,'closed',{'finalityVerified':True,'realizedDemoProfit':1.,'currency':'EUR'})],[],{'account':'1','server':'s'})
  self.assertIsNone(out['trades'][0]['priceMoveR']);self.assertIsNone(out['trades'][0]['fixedSpread10WouldAccept'])
if __name__=='__main__':unittest.main()
