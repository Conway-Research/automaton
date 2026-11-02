import unittest, importlib.util, time
from types import SimpleNamespace as N
from pathlib import Path
spec=importlib.util.spec_from_file_location('reader',Path(__file__).with_name('mt5-market-readonly.py'));reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
class Broker:
    TIMEFRAME_M5=5;ORDER_TYPE_BUY=0;ORDER_TYPE_SELL=1
    def __init__(self): self.closed=False;self.login=1;self.age=0;self.calls=[]
    def initialize(self,*args,**kwargs):return True
    def account_info(self):return N(login=self.login,server='fixture',currency='EUR')
    def symbols_get(self):return [N(name='TEST',visible=True,trade_mode=4,volume_min=.01)]
    def symbol_info_tick(self,name):return N(time_msc=(time.time()-self.age)*1000,bid=102,ask=102.1)
    def copy_rates_from_pos(self,name,tf,start,count):
        self.calls.append(('bars',start,count));end=int(time.time()//300)*300
        b=[dict(time=end-(25-i)*300,open=100,high=101,low=99,close=100) for i in range(25)];b[-1].update(high=103,close=102);return b
    def order_calc_profit(self,*args):return (args[-1]-args[-2])
    def order_calc_margin(self,*args):return 10
    def shutdown(self):self.closed=True
    def order_send(self,*args):raise AssertionError('Order submission forbidden')
class Tests(unittest.TestCase):
    def test_clock_discovers_broker_crypto_sources_and_bounds_sampling(self):
        visible=[N(name='BTCUSD'),N(name='LTCUSD'),N(name='NEWCOIN',path='Cryptocurrencies\\NEWCOIN'),N(name='OTHER',path='Stock CFDs\\OTHER')]
        names=reader.clock_witnesses(visible)
        self.assertIn('LTCUSD',names);self.assertIn('NEWCOIN',names);self.assertNotIn('OTHER',names)
        self.assertEqual(len(reader.clock_witnesses([N(name='C'+str(i),path='Cryptocurrencies\\C'+str(i)) for i in range(50)])),32)

    def test_weekend_clock_uses_advancing_crypto_when_forex_is_frozen(self):
        from unittest.mock import patch
        class Clock:
            value=1800000000.0
            def time(self):return self.value
            def monotonic(self):return self.value-1700000000
            def sleep(self,seconds):self.value+=seconds
        clock=Clock()
        class M:
            def symbol_info_tick(self,name):
                return N(time_msc=((1800000000-86400) if name=='EURUSD' else clock.value+10800)*1000)
        visible=[N(name=n) for n in ['EURUSD','BTCUSD','ETHUSD','BCHUSD']]
        with patch.object(reader,'time',clock):
            proof=reader.read_clock(M(),visible,'AdmiralsGroup-Demo',sample_interval=.4)
        self.assertIsNotNone(proof)
        self.assertEqual(proof['offsetSeconds'],10800)
        self.assertEqual(proof['sources'],3)

    def test_fast_clock_keeps_eight_samples_three_sources_and_two_second_minimum(self):
        import inspect
        from unittest.mock import patch
        self.assertIn('sample_interval',inspect.signature(reader.sample_clock).parameters)
        class Clock:
            value=1800000000.0
            def time(self):return self.value
            def monotonic(self):return self.value-1700000000
            def sleep(self,seconds):self.value+=seconds
        clock=Clock()
        class M:
            def symbol_info_tick(self,name):return N(time_msc=(clock.value+10800)*1000)
        with patch.object(reader,'time',clock):
            samples=reader.sample_clock(M(),[N(name=n) for n in ['EURUSD','GBPUSD','USDJPY']],sample_interval=.4)
        self.assertEqual(len(samples),8)
        proof=reader.verify_clock(samples,'AdmiralsGroup-Live')
        self.assertIsNotNone(proof)
        self.assertGreaterEqual(proof['sampleSeconds'],2)
        self.assertEqual(proof['sources'],3)
        with self.assertRaises(ValueError):reader.sample_clock(M(),[],sample_interval=.1)

    def test_cost_fx_uses_large_calculation_not_rounded_tiny_loss(self):
        class CostBroker(Broker):
            def symbols_get(self):
                return [N(name='TEST',visible=True,trade_mode=4,volume_min=.01,path='Stock CFDs\\US (NYSE)\\TEST',trade_contract_size=1,point=.01,currency_profit='USD',swap_mode=5,swap_long=-7.49,swap_short=0,swap_rollover3days=5)]
            def order_calc_profit(self,action,symbol,lots,entry,exit):
                return round((exit-entry)*lots*.91*(1 if action==0 else -1),2)
        result=reader.read_market(CostBroker(),'fixture',1,'fixture')['rows'][0]['costEvaluation']
        self.assertAlmostEqual(result['commission'],1.82)
        self.assertLess(result['netTarget'],0)
        self.assertFalse(result['verified'])
    def test_read_only_and_closed_bars(self):
        m=Broker();r=reader.read_market(m,'fixture',1,'fixture');self.assertFalse(r['executionEnabled']);self.assertTrue(m.closed);self.assertEqual(m.calls,[('bars',1,25),('bars',1,25)]);self.assertGreater(r['rows'][0]['plannedLoss'],0)
    def test_wrong_account_and_future_quotes(self):
        m=Broker()
        with self.assertRaises(RuntimeError):reader.read_market(m,'fixture',2,'fixture')
        self.assertTrue(m.closed);m=Broker();m.age=-10800;r=reader.read_market(m,'fixture',1,'fixture');self.assertEqual(m.calls,[('bars',1,25)]);self.assertEqual(r['rows'][0]['status'],'quote_time_unverified')
    def test_static_no_mutating_broker_calls(self):
        import ast
        tree=ast.parse(Path(__file__).with_name('mt5-market-readonly.py').read_text())
        allowed={'initialize','account_info','symbols_get','symbol_info_tick','copy_rates_from_pos','order_calc_profit','order_calc_margin','shutdown'}
        calls={n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='m'}
        self.assertLessEqual(calls,allowed)

class ClockTests(unittest.TestCase):
    def test_advancing_consensus_clock(self):
        samples=[{'utc':1000+i,'mono':50+i,'ticks':{s:1000+i+10800-.2 for s in ['EURUSD','GBPUSD','USDJPY']}} for i in range(4)]
        self.assertEqual(reader.verify_clock(samples,'AdmiralsGroup-Live')['offsetSeconds'],10800)
        utc=[dict(x,ticks={s:t-10800 for s,t in x['ticks'].items()}) for x in samples]
        self.assertEqual(reader.verify_clock(utc,'other')['offsetSeconds'],0)
    def test_stale_frozen_mixed_and_unknown_fail(self):
        base=[{'utc':1000+i,'mono':50+i,'ticks':{s:1000+i+10800-.2 for s in ['EURUSD','GBPUSD','USDJPY']}} for i in range(4)]
        import copy
        cases=[]
        frozen=copy.deepcopy(base)
        for x in frozen:x['ticks']={s:11800 for s in x['ticks']}
        cases.append(frozen)
        stale=copy.deepcopy(base)
        for x in stale:x['ticks']={s:t-60 for s,t in x['ticks'].items()}
        cases.append(stale)
        mixed=copy.deepcopy(base)
        for x in mixed:x['ticks']['USDJPY']-=3600
        cases.append(mixed)
        jump=copy.deepcopy(base);jump[-1]['utc']+=2;cases.append(jump)
        for samples in cases:self.assertIsNone(reader.verify_clock(samples,'AdmiralsGroup-Live'))
        self.assertIsNone(reader.verify_clock(base,'unknown'))

class NormalizationTests(unittest.TestCase):
    def test_normalizes_ticks_and_bars_without_changing_prices(self):
        from unittest.mock import patch
        class Shifted(Broker):
            def account_info(self):return N(login=1,server='AdmiralsGroup-Live',currency='EUR')
            def symbol_info_tick(self,name):
                t=super().symbol_info_tick(name);t.time_msc+=10800000;return t
            def copy_rates_from_pos(self,*args):
                bars=super().copy_rates_from_pos(*args)
                for b in bars:b['time']+=10800
                return bars
        now=time.time();samples=[{'utc':now+i,'mono':50+i,'ticks':{s:now+i+10800-.2 for s in ['EURUSD','GBPUSD','USDJPY']}} for i in range(4)]
        with patch.object(reader,'sample_clock',return_value=samples):
            r=reader.read_market(Shifted(),'fixture',1,'AdmiralsGroup-Live')
        row=r['rows'][0];self.assertAlmostEqual(row['rawQuoteTime']-row['quoteTime'],10800)
        self.assertLess(abs(row['quoteTime']-time.time()),2)
        self.assertTrue(all(b['rawTime']-b['time']==10800 for b in row['bars']))
        self.assertEqual(row['bid'],102);self.assertEqual(row['ask'],102.1)
    def test_failed_clock_does_not_normalize_broker_quotes(self):
        from unittest.mock import patch
        class Shifted(Broker):
            def account_info(self):return N(login=1,server='AdmiralsGroup-Live',currency='EUR')
        with patch.object(reader,'sample_clock',return_value=[]):
            r=reader.read_market(Shifted(),'fixture',1,'AdmiralsGroup-Live')
        self.assertIsNone(r['clock']);self.assertNotIn('quoteTime',r['rows'][0])
if __name__=='__main__':unittest.main()


