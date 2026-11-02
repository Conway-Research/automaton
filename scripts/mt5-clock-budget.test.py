"""Deterministic slow-tick clock reproduction; no broker or real sleep."""
import importlib.util,unittest,math
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('clock',Path(__file__).with_name('mt5-market-readonly.py'))
clock=importlib.util.module_from_spec(spec);spec.loader.exec_module(clock)

class VirtualTime:
 def __init__(self):self.value=1000.
 def time(self):return self.value
 def monotonic(self):return self.value-900
 def sleep(self,seconds):self.value+=seconds

class Tests(unittest.TestCase):
 def run_feed(self,frozen=False,mixed=False):
  timer=VirtualTime()
  class Broker:
   def symbol_info_tick(self,name):
    stamp=1000 if frozen else 1000+math.floor((timer.value-1000+1e-8)/2)*2
    return N(time_msc=(stamp+10800+(3600 if mixed and name=='USDJPY' else 0))*1000)
  with patch.object(clock,'time',timer):
   proof=clock.read_clock(Broker(),[N(name=n) for n in ['EURUSD','GBPUSD','USDJPY']],'AdmiralsGroup-Demo',sample_interval=.4)
  return proof,timer.value-1000
 def test_slow_ticks_reuse_current_window_and_finish_within_seven_seconds(self):
  proof,elapsed=self.run_feed()
  self.assertIsNotNone(proof)
  self.assertEqual(proof['sources'],3)
  self.assertEqual(proof['offsetSeconds'],10800)
  self.assertLessEqual(elapsed,7.001)
  self.assertGreaterEqual(proof['sampleSeconds'],3.999)
 def test_frozen_ticks_are_still_rejected_with_bounded_wait(self):
  proof,elapsed=self.run_feed(frozen=True)
  self.assertIsNone(proof);self.assertLessEqual(elapsed,7.001)
 def test_conflicting_offsets_are_still_rejected_with_bounded_wait(self):
  proof,elapsed=self.run_feed(mixed=True)
  self.assertIsNone(proof);self.assertLessEqual(elapsed,7.001)
if __name__=='__main__':unittest.main()
