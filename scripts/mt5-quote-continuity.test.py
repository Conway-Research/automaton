"""Offline admission tests: fake MT5 only, no production accounts or terminals."""
import unittest,importlib.util,os
from pathlib import Path
spec=importlib.util.spec_from_file_location('adapter_continuity',Path(os.environ.get('NUMARON_TEST_ADAPTER',Path(__file__).with_name('mt5-trading-adapter.py'))))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
NOW=1000000
class Broker:
 COPY_TICKS_ALL=0
 def __init__(self,times):self.times=times;self.calls=[]
 def copy_ticks_from(self,*args):
  self.calls.append(args)
  return None if self.times is None else [{'time_msc':t,'bid':100,'ask':101} for t in self.times]
class Tests(unittest.TestCase):
 def proof(self,times,offset=0):
  m=Broker(times);return a.read_quote_continuity(m,'TEST',offset,NOW),m
 def test_dense_ticks_pass_with_bounded_request_and_preserved_time_domain(self):
  r,m=self.proof(range(NOW-60000,NOW+1,1000));self.assertTrue(r['eligible']);self.assertEqual(r['maxGapMs'],1000);self.assertEqual(m.calls[0][2],10000);self.assertEqual(m.calls[0][1].timestamp(),(NOW-60000)/1000)
 def test_sparse_price_updates_fail_even_when_latest_quote_is_fresh(self):
  r,_=self.proof([NOW-60000,NOW-59000,NOW-20000,NOW-1000,NOW]);self.assertFalse(r['eligible']);self.assertEqual(r['reason'],'tick-gap');self.assertEqual(r['maxGapMs'],39000)
 def test_exact_15_second_limit_passes_but_one_millisecond_more_fails(self):
  self.assertTrue(self.proof(range(NOW-60000,NOW+1,15000))[0]['eligible']);self.assertFalse(self.proof([NOW-60000,NOW-45000,NOW-29999,NOW-15000,NOW])[0]['eligible'])
 def test_missing_or_short_history_fails_closed(self):
  for times in [None,[],[NOW],[NOW-10000,NOW]]:self.assertFalse(self.proof(times)[0]['eligible'])
 def test_stale_or_future_history_fails_closed(self):
  for times in [range(NOW-60000,NOW-16000,1000),range(NOW-60000,NOW+1001,1000)]:self.assertFalse(self.proof(times)[0]['eligible'])
 def test_verified_offset_is_applied_to_query_and_returned_ticks(self):
  r,m=self.proof(range(NOW-60000+10800000,NOW+10800001,1000),10800);self.assertTrue(r['eligible']);self.assertEqual(m.calls[0][1].timestamp(),(NOW-60000+10800000)/1000)
 def test_broker_second_resolution_query_prefix_is_cropped_not_counted_as_gap(self):
  r,_=self.proof([NOW-60074]+list(range(NOW-59000,NOW+1,1000)));self.assertTrue(r['eligible']);self.assertEqual(r['ticks'],60);self.assertEqual(r['maxGapMs'],1000)
 def test_reverse_timestamp_and_invalid_prices_fail_closed(self):
  self.assertFalse(self.proof([NOW-60000,NOW-1000,NOW-2000,NOW])[0]['eligible'])
  m=Broker([]);m.copy_ticks_from=lambda *args:[{'time_msc':t,'bid':0,'ask':1} for t in range(NOW-60000,NOW+1,1000)];self.assertFalse(a.read_quote_continuity(m,'TEST',0,NOW)['eligible'])
 def test_collection_rejects_sparse_new_entries_but_preserves_existing_watch_quotes(self):
  from types import SimpleNamespace as N
  from unittest.mock import patch
  class M(Broker):
   TIMEFRAME_M5=5;closed=False
   def initialize(self,*args,**kwargs):return True
   def account_info(self):return N(login=1,server='fixture',currency='USD',equity=100,balance=100,profit=0,credit=0,margin_free=100,trade_mode=0)
   def terminal_info(self):return N(connected=True)
   def symbols_get(self):return [N(name=n,visible=True,trade_mode=4,volume_min=.1,volume_max=10,volume_step=.1,trade_stops_level=0,point=.01) for n in ['DENSE','SPARSE']]
   def symbol_info_tick(self,name):return N(bid=104,ask=105,time_msc=NOW)
   def copy_rates_from_pos(self,*args):return [{'time':1,'open':100,'high':102,'low':99,'close':101}]*99+[{'time':2,'open':101,'high':104,'low':100,'close':103}]
   def copy_ticks_from(self,name,*args):
    times=range(NOW-60000,NOW+1,1000) if name=='DENSE' else [NOW-60000,NOW-59000,NOW-20000,NOW-1000,NOW]
    return [{'time_msc':t,'bid':100,'ask':101} for t in times]
   def positions_get(self):return []
   def orders_get(self):return []
   def shutdown(self):self.closed=True
   def order_send(self,*args):raise AssertionError('No order allowed')
  m=M([])
  with patch.object(a._clock_module,'sample_clock',return_value=[]),patch.object(a._clock_module,'verify_clock',return_value={'offsetSeconds':0}),patch.object(a.time,'time',return_value=NOW/1000):
   r=a.collect_market(m,'fake',1,'fixture',watch=['SPARSE'])
  self.assertTrue(r['instruments'][0]['capability']);self.assertFalse(r['instruments'][1]['capability']);self.assertEqual(r['instruments'][1]['researchQuoteCoverage']['reason'],'tick-gap')
  self.assertEqual([x['symbol'] for x in r['watchQuotes']],['SPARSE']);self.assertFalse(r['executionEnabled']);self.assertTrue(m.closed)
  # No breakout means no possible enrollment: history downloads must be skipped.
  m.copy_rates_from_pos=lambda *args:[{'time':1,'open':100,'high':106,'low':99,'close':101}]*100
  m.copy_ticks_from=lambda *args:(_ for _ in ()).throw(AssertionError('Unnecessary tick history read'))
  with patch.object(a._clock_module,'sample_clock',return_value=[]),patch.object(a._clock_module,'verify_clock',return_value={'offsetSeconds':0}),patch.object(a.time,'time',return_value=NOW/1000):
   r=a.collect_market(m,'fake',1,'fixture',watch=['SPARSE'])
  self.assertTrue(all(x['capability'] for x in r['instruments']))
if __name__=='__main__':unittest.main()
