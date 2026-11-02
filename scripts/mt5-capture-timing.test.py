"""Offline timing regression: fake readers only, no broker or account access."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as N

class Tests(unittest.TestCase):
 def test_phase_timing_preserves_result_and_never_serializes_market_data(self):
  source=Path(__file__).with_name('mt5-capture-timing.py')
  self.assertTrue(source.exists(),'capture timing helper missing')
  spec=importlib.util.spec_from_file_location('timing',source);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  with tempfile.TemporaryDirectory() as d:
   clock=N(read_clock=lambda *a,**k:{'sampleSeconds':7,'sources':3,'offsetSeconds':10800})
   original=clock.read_clock; module=N(_clock_module=clock)
   result={'private':'DO-NOT-LOG'}
   def read():clock.read_clock();return result
   target=Path(d)/'timing.jsonl'
   self.assertIs(m.measure(module,read,target),result)
   self.assertIs(clock.read_clock,original)
   data=json.loads(target.read_text())
   self.assertEqual(data['clockSampleSeconds'],7)
   self.assertEqual(data['clockSources'],3)
   self.assertNotIn('DO-NOT-LOG',target.read_text())
   self.assertGreaterEqual(data['elapsedMs'],data['clockMs'])
 def test_timing_preserves_failure_and_restores_function(self):
  source=Path(__file__).with_name('mt5-capture-timing.py');self.assertTrue(source.exists(),'capture timing helper missing')
  spec=importlib.util.spec_from_file_location('timing',source);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  clock=N(read_clock=lambda:None);original=clock.read_clock
  with tempfile.TemporaryDirectory() as d:
   def fail():raise ValueError('secret error')
   with self.assertRaisesRegex(ValueError,'secret error'):m.measure(N(_clock_module=clock),fail,Path(d)/'out')
   self.assertIs(clock.read_clock,original)
   self.assertNotIn('secret error',(Path(d)/'out').read_text())
if __name__=='__main__':unittest.main()
