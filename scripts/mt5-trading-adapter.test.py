import unittest, importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('adapter',Path(__file__).with_name('mt5-trading-adapter.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class Tests(unittest.TestCase):
 def test_priority_discovers_broker_crypto_category_outside_named_list(self):
  import time
  from types import SimpleNamespace as N
  symbols=[N(name='NEWCOIN',path='Cryptocurrencies\\NEWCOIN',visible=True,trade_mode=4),N(name='CLOSEONLY',path='Cryptocurrencies\\CLOSEONLY',visible=True,trade_mode=3)]
  class M:
   SYMBOL_TRADE_MODE_FULL=4
   def symbol_info_tick(self,name):return N(time_msc=(time.time()+10800)*1000,bid=100,ask=101)
  rows,nxt,info=a.select_scan(M(),symbols,0,'AdmiralsGroup-Demo',0,{'offsetSeconds':10800})
  self.assertEqual(info['prioritySymbols'],['NEWCOIN'])
  self.assertEqual(info['cryptoUniverse'][1]['reason'],'Trading restricted')

 def test_demo_scan_prioritizes_fresh_tradable_crypto_and_keeps_rotation(self):
  import time
  from types import SimpleNamespace as N
  symbols=[N(name='S'+str(i),visible=True,trade_mode=4) for i in range(100)]
  symbols += [N(name=n,visible=True,trade_mode=4) for n in ['BTCUSD','ETHUSD','LTCUSD','XRPUSD']]
  class M:
   SYMBOL_TRADE_MODE_FULL=4
   def symbol_info_tick(self,name):return N(time_msc=(time.time()+10800)*1000,bid=100,ask=101)
  for start in [0,40,80]:
   rows,nxt,info=a.select_scan(M(),symbols,start,'AdmiralsGroup-Demo',0,{'offsetSeconds':10800})
   self.assertEqual([s.name for s in rows[:4]],['BTCUSD','ETHUSD','LTCUSD','XRPUSD'])
   self.assertLessEqual(len(rows),50)
   self.assertEqual(len({s.name for s in rows}),len(rows))
   self.assertEqual(nxt,(start+min(40,len(symbols)-start))%len(symbols))
   self.assertTrue(info['cryptoPriority'])

 def test_demo_priority_never_admits_stale_restricted_or_unverified_quotes(self):
  import time
  from types import SimpleNamespace as N
  symbols=[N(name='S'+str(i),visible=True,trade_mode=4) for i in range(60)]
  symbols += [N(name='BTCUSD',visible=True,trade_mode=4),N(name='ETHUSD',visible=True,trade_mode=0)]
  class M:
   SYMBOL_TRADE_MODE_FULL=4
   def symbol_info_tick(self,name):return N(time_msc=(time.time()+10800-100)*1000,bid=100,ask=101)
  for server,mode,clock in [('AdmiralsGroup-Demo',0,None),('AdmiralsGroup-Demo',0,{'offsetSeconds':10800}),('AdmiralsGroup-Live',2,{'offsetSeconds':10800})]:
   rows,nxt,info=a.select_scan(M(),symbols,0,server,mode,clock)
   self.assertFalse(info['cryptoPriority'])
   self.assertEqual(nxt,50)
   self.assertEqual([s.name for s in rows],[s.name for s in symbols[:50]])

 def test_collection_requests_fast_but_independently_verified_clock(self):
  from types import SimpleNamespace as N
  from unittest.mock import patch
  class M:
   def initialize(self,*args,**kwargs):return True
   def account_info(self):return N(login=1,server='expected')
   def terminal_info(self):return N(connected=True)
   def symbols_get(self):return []
   def positions_get(self):return []
   def orders_get(self):return []
   def shutdown(self):pass
  def sampler(*args,**kwargs):
   self.assertEqual(kwargs.get('sample_interval'),.4)
   raise StopIteration('sampling boundary reached')
  with patch.object(a._clock_module,'sample_clock',sampler):
   with self.assertRaises(StopIteration):a.collect_market(M(),'terminal',1,'expected')

 def test_day_history_classifies_cash_and_refuses_unknown_types_or_count_mismatch(self):
  from types import SimpleNamespace as N
  class M:
   DEAL_TYPE_BUY=0;DEAL_TYPE_SELL=1;DEAL_TYPE_BALANCE=2
   def history_deals_get(self,*args):return [N(ticket=1,type=2,time_msc=10801000,profit=20,commission=0,swap=0,fee=0,symbol='',volume=0)]
   def history_deals_total(self,*args):return 1
  result=a.read_day_history(M(),{'startsAt':0,'endsAt':86400000},10800,2000)
  self.assertTrue(result['complete'])
  self.assertEqual(result['cashFlows'][0]['kind'],'external')
  self.assertEqual(result['cashFlows'][0]['amount'],20)
  class Unknown(M):
   def history_deals_get(self,*args):return [N(ticket=1,type=99,time_msc=10801000,profit=20,commission=0,swap=0,fee=0,symbol='',volume=0)]
  self.assertFalse(a.read_day_history(Unknown(),{'startsAt':0,'endsAt':86400000},10800,2000)['complete'])
  class Incomplete(M):
   def history_deals_total(self,*args):return 2
  self.assertFalse(a.read_day_history(Incomplete(),{'startsAt':0,'endsAt':86400000},10800,2000)['complete'])
 def test_watch_quotes_correct_verified_offset_and_preserve_raw_time(self):
  from types import SimpleNamespace as N
  class M:
   def symbol_info_tick(self,name):return N(bid=100,ask=101,time_msc=10801000) if name=='TEST' else None
  rows=a.read_watch_quotes(M(),['TEST','TEST','missing'],10800)
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['quoteAt'],1000)
  self.assertEqual(rows[0]['rawQuoteAt'],10801000)
 def test_broker_cost_terms_are_observations_not_verified_total_costs(self):
  from types import SimpleNamespace as N
  terms=a.read_cost_terms(N(swap_long=-2.5,swap_short=1.2,swap_mode=1,swap_rollover3days=3,currency_profit='USD',currency_margin='EUR',point=.01,trade_tick_size=.01,trade_tick_value=2))
  self.assertEqual(terms['swapLong'],-2.5)
  self.assertFalse(terms['verified'])
  self.assertIsNone(terms['commission'])
  self.assertIn('slippage',terms['missing'])
  self.assertIsNone(a.read_cost_terms(N())['swapLong'])
 def test_size_rounds_down_and_never_forces_minimum(self):
  class S: volume_min=.1;volume_max=10;volume_step=.1
  self.assertEqual(a.round_volume(.29,S()),.2)
  self.assertEqual(a.round_volume(.09,S()),0)
 def test_order_requires_bound_authorization(self):
  with self.assertRaises(RuntimeError):a.require_authorization({},'entry',{'login':1,'server':'s'})
 def test_costs_missing_blocks_sizing(self):
  self.assertFalse(a.costs_valid(None,'EUR'))
  self.assertFalse(a.costs_valid({'currency':'USD','verified':True},'EUR'))
 def test_account_mismatch_shutdown_and_no_order(self):
  from types import SimpleNamespace as N
  class M:
   closed=False
   def initialize(self,*args,**kw):return True
   def account_info(self):return N(login=2,server='wrong')
   def terminal_info(self):return N(connected=True)
   def shutdown(self):self.closed=True
  m=M()
  with self.assertRaises(RuntimeError):a.collect_market(m,'terminal',1,'expected')
  self.assertTrue(m.closed)
 def test_submit_independently_checks_five_percent_and_protection(self):
  import time
  from types import SimpleNamespace as N
  class M:
   ORDER_TYPE_BUY=0;ORDER_TYPE_SELL=1;TRADE_ACTION_DEAL=1;TRADE_RETCODE_DONE=10009;TRADE_RETCODE_DONE_PARTIAL=10010
   sent=0;loss=-2
   def account_info(self):return N(login=1,server='s',currency='EUR',equity=1000,margin_free=900,margin_mode=2)
   def symbol_info(self,s):return N(name=s,point=.01,volume_min=.01,volume_max=10,volume_step=.01)
   def symbol_info_tick(self,s):return N(time_msc=time.time()*1000,ask=100,bid=99.99)
   def positions_get(self):return []
   def orders_get(self):return []
   def order_calc_profit(self,*args):return self.loss
   def order_calc_margin(self,*args):return 10
   def order_check(self,r):return N(retcode=0)
   def order_send(self,r):self.sent+=1;return N(retcode=10009,order=1,deal=2,volume=.1,price=100)
  m=M();auth={'enabled':True,'login':1,'server':'s','actions':['entry'],'expiresAt':time.time()+10,'magic':999,'strategyValidated':True,'riskAuthorized':True,'portfolioCostReserve':0,'dailyRiskRemaining':300,'costs':{'verified':True,'currency':'EUR','source':'fixture','commissionPerLot':1,'slippagePerLot':1,'financingPerLot':1,'expiresAt':time.time()+100}}
  request={'action':1,'type':0,'symbol':'TEST','price':100,'volume':.1,'sl':95,'tp':110,'deviation':0,'magic':999}
  self.assertEqual(a.submit_once(m,request,auth)['status'],'accepted');self.assertEqual(m.sent,1)
  m.loss=-51
  self.assertEqual(a.submit_once(m,request,auth)['status'],'rejected');self.assertEqual(m.sent,1)
  request['sl']=105
  self.assertEqual(a.submit_once(m,request,auth)['status'],'rejected');self.assertEqual(m.sent,1)
if __name__=='__main__':unittest.main()
