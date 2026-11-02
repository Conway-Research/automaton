import unittest, importlib.util

from pathlib import Path

spec=importlib.util.spec_from_file_location('e',Path(__file__).with_name('trade-evaluation.py'));e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)

META=dict(path='Stock CFDs\\US (NYSE)\\TEST',contractSize=1,volumeMin=1,point=.01,profitCurrency='USD',swapMode=5,swapLong=-7.49,swapShort=0,rollover3days=5)

class Tests(unittest.TestCase):

 def test_minimum_commission_both_sides(self):

  c=e.costs(META,'BUY',100,101,.02,1,0)

  self.assertEqual(c['commission'],2);self.assertGreater(c['totalExtra'],2)

 def test_unknown_contract_not_zero_cost(self):

  self.assertIsNone(e.costs(dict(META,path='Unknown'),'BUY',100,101,.02,1,0))

 def test_financing_and_stress(self):

  c=e.costs(META,'BUY',100,101,.02,1,3);self.assertGreater(c['financing'],0)

  self.assertGreater(e.costs(META,'BUY',100,101,.02,1,3,stress=True)['totalExtra'],c['totalExtra'])

 def test_spread_not_double_counted(self):

  c=e.costs(META,'BUY',100,101,.02,1,0);self.assertNotIn('spread',c['extraComponents'])

 def test_empty_history_is_not_profitable(self):

  self.assertEqual(e.backtest([],META)['status'],'insufficient-data')

 def test_future_bars_do_not_change_earlier_signal(self):

  bars=[dict(time=100000+i*300,open=100,high=101,low=99,close=100,spread=2) for i in range(100)]

  bars[24].update(high=103,close=102);bars[25].update(open=102,high=110,low=90,close=100)

  a=e.simulate(bars[:60],META);b=e.simulate(bars,META)

  self.assertTrue(a);self.assertEqual(a[0],b[0]);self.assertLess(a[0]['netR'],0)

 def test_split_has_no_spanning_positions(self):

  bars=[dict(time=100000+i*300,open=100,high=101,low=99,close=100,spread=2) for i in range(150)]

  bars[24].update(high=103,close=102);bars[25].update(open=102,high=110,low=90,close=100)

  r=e.backtest(bars,META);self.assertFalse(r['profitabilityProven']);self.assertIn('holdout',r)

 def test_missing_open_position_data_is_recorded(self):

  bars=[dict(time=100000+i*300,open=100,high=101,low=99,close=100,spread=2) for i in range(100)]

  bars[24].update(high=103,close=102);bars[25].update(open=102,high=103,low=101,close=102);bars[26]['spread']=0

  d={};self.assertEqual(e.simulate(bars,META,diagnostics=d),[]);self.assertEqual(d['unresolved'],1)

 def test_rollover_weekday_triple(self):

  from datetime import datetime,timezone

  start=datetime(2026,10,14,23,55,tzinfo=timezone.utc).timestamp()

  self.assertEqual(e.rollover_days(start,start+600,3),3)

 def test_unsupported_swap_never_free(self):

  self.assertIsNone(e.costs(dict(META,swapMode=99),'BUY',100,101,.02,1,0))

 def test_stock_unknown_dividends_prevent_positive(self):

  r=e.backtest([dict(time=100000+i*300,open=100,high=101,low=99,close=100,spread=2) for i in range(100)],META)

  self.assertTrue(r['costsIncomplete']);self.assertNotEqual(r['status'],'conditional-positive')

class CostRefinement(unittest.TestCase):
 def forex(self,**extra):
  return dict(path='Forex\\Majors',symbol='EURUSD',contractSize=100000,volumeMin=.01,point=.00001,profitCurrency='USD',accountCurrency='EUR',swapMode=5,swapLong=-4.44,swapShort=-1.62,**extra)
 def test_trade_account_forex_has_no_zero_commission(self):
  self.assertEqual(e.costs(self.forex(accountType='Trade.MT5'),'BUY',1.1,1.2,.0001,.01,0)['commission'],0)
 def test_unknown_account_does_not_invent_forex_tariff(self):
  self.assertIsNone(e.costs(self.forex(),'BUY',1.1,1.2,.0001,.01,0))
 def test_zero_eur_tariff_is_account_currency_not_usd(self):
  self.assertAlmostEqual(e.costs(self.forex(accountType='Zero.MT5',accountPerQuote=.8),'BUY',1.1,1.2,.0001,1,0)['commission'],6.5)
 def test_conversion_minimum_is_per_commission_and_pnl(self):
  c=e.costs(dict(META,accountCurrency='EUR',accountPerQuote=.8),'BUY',100,200,.01,1,0)
  self.assertAlmostEqual(c['conversion'],.325)
 def test_cost_filter_rejects_fee_dominated_entry(self):
  bars=[dict(time=100000+i*300,open=100,high=100.01,low=99.99,close=100,spread=1) for i in range(80)]
  bars[24].update(high=100.04,close=100.03);bars[25].update(open=100.03,high=101,low=99,close=100)
  self.assertTrue(e.simulate(bars,META))
  self.assertEqual(e.simulate(bars,META,variant='cost-filter-1'),[])

class StressGate(unittest.TestCase):
 def test_filter_uses_doubled_spread_even_in_baseline_run(self):
  meta=dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.01,profitCurrency='USD',swapMode=0,swapLong=0,swapShort=0)
  bars=[dict(time=100000+i*300,open=100,high=100.1,low=99.1,close=100,spread=10) for i in range(80)]
  bars[24].update(high=100.3,close=100.2);bars[25].update(open=100.21,high=104,low=99,close=100)
  self.assertTrue(e.simulate(bars,meta))
  self.assertEqual(e.simulate(bars,meta,variant='cost-filter-1'),[])

class StrategyExpansion(unittest.TestCase):
 def bars(self,n=180):
  return [dict(time=100000+i*300,open=100,high=101,low=99,close=100,spread=1) for i in range(n)]
 def meta(self):
  return dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.001,profitCurrency='USD',swapMode=0,swapLong=0,swapShort=0)
 def test_intraday_closes_at_fixed_horizon_without_future_selection(self):
  bars=self.bars();bars[24].update(high=103,close=102);bars[25].update(open=102,high=102.2,low=101.9,close=102)
  for i in range(26,49):bars[i].update(open=102,high=102.2,low=101.9,close=102)
  result=e.simulate(bars,self.meta(),variant='intraday-cost-1')
  self.assertTrue(result);self.assertEqual(result[0]['closedAt'],bars[48]['time']+300);self.assertEqual(result[0]['exitReason'],'time')
  changed=[dict(b) for b in bars];changed[60].update(high=200)
  self.assertEqual(result[0],e.simulate(changed,self.meta(),variant='intraday-cost-1')[0])
 def test_trend_rejects_breakout_against_previous_fifty_bar_trend(self):
  bars=self.bars()
  for i in range(29):bars[i].update(open=150,high=151,low=99,close=150)
  bars[49].update(open=102,high=103,low=99,close=102);bars[50].update(open=102.1,high=110,low=90,close=102)
  self.assertTrue(e.simulate(bars,self.meta(),variant='cost-filter-1'))
  self.assertEqual(e.simulate(bars,self.meta(),variant='trend-cost-1'),[])
 def test_walk_forward_windows_have_nonoverlapping_outcomes(self):
  report=e.walk_forward(self.bars(600),self.meta(),'intraday-cost-1')
  self.assertEqual(len(report['windows']),3)
  self.assertTrue(all(a['toTime']<b['fromTime'] for a,b in zip(report['windows'],report['windows'][1:])))
  self.assertFalse(report['independentValidation']);self.assertFalse(report['promoted'])

class InvalidPrefix(unittest.TestCase):
 def test_bad_timestamps_and_missing_closes_are_rejected_without_crash(self):
  bars=[dict(time=100000+i*300,open=100,high=101,low=99,close=100,spread=1) for i in range(100)]
  bars[5]['time']=None;bars[7]['close']=None
  self.assertEqual(e.simulate(bars,META),[])

class TimeoutRollover(unittest.TestCase):
 def test_timeout_close_charges_midnight_triple_swap(self):
  from datetime import datetime,timezone
  last=datetime(2026,10,14,23,55,tzinfo=timezone.utc).timestamp()
  bars=[dict(time=last+(i-48)*300,open=100,high=101,low=99,close=100,spread=1) for i in range(100)]
  bars[24].update(high=103,close=102)
  for i in range(25,49):bars[i].update(open=102,high=102.2,low=101.9,close=102)
  meta=dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.001,profitCurrency='USD',swapMode=5,swapLong=-1,swapShort=-1,rollover3days=3)
  trade=e.simulate(bars,meta,variant='intraday-cost-1')[0]
  self.assertEqual(trade['closedAt'],last+300);self.assertEqual(trade['nights'],3)

class SegmentStudy(unittest.TestCase):
 def fixture(self):
  segments=[]
  for start in (100000,200000):
   bars=[dict(time=start+i*300,open=100,high=101,low=99,close=100,spread=1) for i in range(100)]
   bars[24].update(high=103,close=102);bars[25].update(open=102,high=110,low=90,close=102)
   segments.extend(bars)
  return segments
 def meta(self):
  return dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.001,profitCurrency='USD',swapMode=0,swapLong=0,swapShort=0)
 def test_all_disjoint_segments_are_checked_without_crossing_gap(self):
  r=e.segment_study(self.fixture(),self.meta(),'intraday-cost-1')
  self.assertEqual(r['segments'],2);self.assertEqual(r['knownOutcomes']['trades'],2)
  self.assertEqual(r['knownStressOutcomes']['trades'],2);self.assertFalse(r['continuousPortfolio']);self.assertFalse(r['profitabilityProven'])
 def test_unknown_tail_is_counted_and_does_not_erase_later_segment(self):
  bars=self.fixture()
  for i in range(25,31):bars[i].update(open=102,high=102.2,low=101.9,close=102)
  bars=bars[:31]+bars[100:]
  r=e.segment_study(bars,self.meta(),'intraday-cost-1')
  self.assertEqual(r['segments'],2);self.assertEqual(r['unknownOutcomes'],1)
  self.assertEqual(r['knownOutcomes']['trades'],1);self.assertFalse(r['eligibleForPromotion'])
 def test_bad_bar_is_excluded_and_counted_not_treated_as_zero_loss(self):
  bars=self.fixture();bars[99]['time']=None
  r=e.segment_study(bars,self.meta(),'intraday-cost-1')
  self.assertEqual(r['invalidBars'],1);self.assertEqual(r['segments'],2);self.assertFalse(r['eligibleForPromotion'])

class VolatilityStop(unittest.TestCase):
 def test_atr_stop_uses_only_past_ranges_and_widens_tight_stop(self):
  meta=dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.001,profitCurrency='USD',swapMode=0,swapLong=0,swapShort=0)
  bars=[dict(time=100000+i*300,open=100,high=102,low=98,close=100,spread=1) for i in range(100)]
  for i in (22,23):bars[i].update(open=101,high=102,low=100,close=101)
  bars[24].update(high=103,low=100,close=102.5);bars[25].update(open=102.6,high=110,low=90,close=102)
  a=e.simulate(bars[:60],meta,variant='atr-intraday-1')[0]
  self.assertGreater(a['initialRiskDistance'],5)
  bars[60].update(high=300)
  self.assertEqual(a,e.simulate(bars,meta,variant='atr-intraday-1')[0])

class HigherTimeframe(unittest.TestCase):
 def bars(self):
  return [dict(time=90000+i*300,open=100+i,high=102+i,low=99+i,close=101+i,spread=i+1) for i in range(7)]
 def test_only_complete_contiguous_frames_are_aggregated(self):
  a=e.resample_m15(self.bars())
  self.assertEqual(len(a),2);self.assertEqual(a[0]['time'],90000)
  self.assertEqual(a[0]['open'],100);self.assertEqual(a[0]['close'],103)
  self.assertEqual(a[0]['high'],104);self.assertEqual(a[0]['low'],99);self.assertEqual(a[0]['spread'],3)
 def test_missing_or_invalid_m5_bar_does_not_create_m15_frame(self):
  a=self.bars();del a[1];self.assertEqual(len(e.resample_m15(a)),1)
  a=self.bars();a[1]['spread']=0;self.assertEqual(len(e.resample_m15(a)),1)
 def test_m15_timeout_uses_900_second_bars(self):
  bars=[dict(time=90000+i*900,open=100,high=101,low=99,close=100,spread=1) for i in range(80)]
  bars[24].update(high=103,close=102)
  for i in range(25,49):bars[i].update(open=102,high=102.2,low=101.9,close=102)
  m=dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.001,profitCurrency='USD',swapMode=0,swapLong=0,swapShort=0,barSeconds=900)
  t=e.simulate(bars,m,variant='atr-intraday-1')[0]
  self.assertEqual(t['closedAt'],bars[48]['time']+900)

class CausalM15Spread(unittest.TestCase):
 def test_later_source_spreads_cannot_change_entry_admission_or_risk(self):
  source=[dict(time=90000+i*300,open=100,high=101,low=99,close=100,spread=1) for i in range(240)]
  source[74].update(high=103,close=102)
  for i in range(75,147):source[i].update(open=102,high=102.2,low=101.9,close=102)
  meta=dict(path='Forex\\Majors',symbol='EURUSD',accountType='Trade.MT5',contractSize=1,volumeMin=1,point=.001,profitCurrency='USD',swapMode=0,swapLong=0,swapShort=0,barSeconds=900)
  first=e.simulate(e.resample_m15(source),meta,variant='atr-intraday-1')
  source[76]['spread']=999;source[77]['spread']=999
  second=e.simulate(e.resample_m15(source),meta,variant='atr-intraday-1')
  self.assertTrue(first);self.assertTrue(second)
  self.assertEqual(first[0]['openedAt'],second[0]['openedAt']);self.assertEqual(first[0]['initialRiskDistance'],second[0]['initialRiskDistance'])

if __name__=='__main__' :unittest.main()

