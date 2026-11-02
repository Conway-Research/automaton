"""Offline fake-feed regressions; no terminals, credentials or broker actions."""
import copy, importlib.util, time, unittest
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('clock',Path(__file__).with_name('mt5-market-readonly.py'))
clock=importlib.util.module_from_spec(spec);spec.loader.exec_module(clock)
def samples(count=3,offset=10800):
    return [{'utc':1000+i,'mono':50+i,'ticks':{s:1000+i+offset-.2 for s in ['EURUSD','GBPUSD','USDJPY'][:count]}} for i in range(4)]
class Tests(unittest.TestCase):
    def test_demo_accepts_measured_advancing_three_source_consensus(self):
        result=clock.verify_clock(samples(),'AdmiralsGroup-Demo')
        self.assertIsNotNone(result);self.assertEqual(result['offsetSeconds'],10800);self.assertEqual(result['sources'],3)
    def test_demo_retains_all_existing_freshness_and_consensus_constraints(self):
        bad=[]
        frozen=samples()
        for row in frozen:row['ticks']={s:11800 for s in row['ticks']}
        bad.extend([frozen,samples(2),samples(offset=7200)])
        mixed=samples()
        for row in mixed:row['ticks']['USDJPY']-=3600
        bad.append(mixed)
        jump=samples();jump[-1]['mono']+=2;bad.append(jump)
        for rows in bad:self.assertIsNone(clock.verify_clock(rows,'AdmiralsGroup-Demo'))
        self.assertIsNone(clock.verify_clock(samples(),'untrusted-server'))
    def test_no_second_discarded_measurement_or_cached_proof(self):
        with patch.object(clock,'sample_clock',return_value=samples(2)) as sampler:
            self.assertIsNone(clock.read_clock(object(),[],'AdmiralsGroup-Demo',sample_interval=.4))
        self.assertEqual(sampler.call_count,1)
        with patch.object(clock,'sample_clock',return_value=samples()) as sampler:
            self.assertIsNotNone(clock.read_clock(object(),[],'AdmiralsGroup-Demo',sample_interval=.4))
        self.assertEqual(sampler.call_count,1)
        with patch.object(clock,'sample_clock',return_value=[]) as sampler:
            self.assertIsNone(clock.read_clock(object(),[],'AdmiralsGroup-Demo',sample_interval=.4))
        self.assertEqual(sampler.call_count,1)
    def test_demo_without_clock_proof_rejects_even_apparently_utc_quotes(self):
        class Broker:
            TIMEFRAME_M5=5
            def initialize(self,*a,**k):return True
            def account_info(self):return N(login=1,server='AdmiralsGroup-Demo',currency='EUR')
            def symbols_get(self):return [N(name='EURUSD',visible=True)]
            def symbol_info_tick(self,*a):return N(time_msc=time.time()*1000,bid=1,ask=2)
            def copy_rates_from_pos(self,*a):return []
            def shutdown(self):pass
        with patch.object(clock,'sample_clock',return_value=[]):
            result=clock.read_market(Broker(),'fake',1,'AdmiralsGroup-Demo')
        self.assertEqual(result['rows'][0]['status'],'quote_time_unverified')
        self.assertIsNone(result['clock'])
if __name__=='__main__':unittest.main()
