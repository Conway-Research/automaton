import importlib.util,json,tempfile,unittest,os
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('timing',Path(__file__).with_name('mt5-capture-timing.py'));timing=importlib.util.module_from_spec(spec);spec.loader.exec_module(timing)
class Tests(unittest.TestCase):
 def test_clock_failure_logs_fixed_phase_code_and_preserves_exception(self):
  def fail():raise TimeoutError('PRIVATE token=secret')
  clock=N(read_clock=fail);original=clock.read_clock
  with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'NUMARON_MARKET_READ_ID':'12345678-1234-1234-1234-123456789abc'}):
   target=Path(d)/'timing.jsonl'
   with self.assertRaises(TimeoutError):timing.measure(N(_clock_module=clock),lambda:clock.read_clock(),target)
   row=json.loads(target.read_text());self.assertEqual(row['errorCode'],'READ_TIMEOUT');self.assertEqual(row['errorPhase'],'clock');self.assertEqual(row['readId'],'12345678-1234-1234-1234-123456789abc');self.assertNotIn('PRIVATE',target.read_text());self.assertIs(clock.read_clock,original)
 def test_unknown_error_and_malicious_clock_metadata_are_not_serialized(self):
  clock=N(read_clock=lambda:{'sampleSeconds':'PRIVATE','sources':{'private':'PRIVATE'}})
  with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'NUMARON_MARKET_READ_ID':'PRIVATE'}):
   target=Path(d)/'timing.jsonl'
   def read():clock.read_clock();raise RuntimeError('PRIVATE')
   with self.assertRaises(RuntimeError):timing.measure(N(_clock_module=clock),read,target)
   row=json.loads(target.read_text());self.assertEqual(row['errorCode'],'CAPTURE_FAILED');self.assertEqual(row['errorPhase'],'capture');self.assertIsNone(row['readId']);self.assertNotIn('PRIVATE',target.read_text())
 def test_known_binding_failure_is_classified_without_raw_exception(self):
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'timing.jsonl'
   def read():raise RuntimeError('Connected account mismatch')
   with self.assertRaises(RuntimeError):timing.measure(N(_clock_module=N(read_clock=lambda:None)),read,target)
   self.assertEqual(json.loads(target.read_text())['errorCode'],'ACCOUNT_BINDING_FAILED')
 def test_error_argument_objects_are_never_converted_to_text(self):
  class Private:
   def __str__(self):raise AssertionError('Do not inspect private argument')
  failure=RuntimeError(Private())
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'timing.jsonl'
   def read():raise failure
   with self.assertRaises(RuntimeError) as caught:timing.measure(N(_clock_module=N(read_clock=lambda:None)),read,target)
   self.assertIs(caught.exception,failure);self.assertEqual(json.loads(target.read_text())['errorCode'],'CAPTURE_FAILED')
 def test_log_write_failure_preserves_result_and_original_failure(self):
  with tempfile.TemporaryDirectory() as d:
   target=Path(d);clock=N(read_clock=lambda:None);m=N(_clock_module=clock)
   self.assertEqual(timing.measure(m,lambda:42,target),42)
   failure=PermissionError('PRIVATE')
   def fail():raise failure
   with self.assertRaises(PermissionError) as caught:timing.measure(m,fail,target)
   self.assertIs(caught.exception,failure)
 def test_success_keeps_error_fields_empty_and_filters_nonfinite_metadata(self):
  clock=N(read_clock=lambda:{'sampleSeconds':float('nan'),'sources':True})
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'timing.jsonl'
   timing.measure(N(_clock_module=clock),lambda:clock.read_clock(),target)
   row=json.loads(target.read_text());self.assertTrue(row['ok']);self.assertIsNone(row['errorCode']);self.assertIsNone(row['errorPhase']);self.assertIsNone(row['clockSampleSeconds']);self.assertEqual(row['clockSources'],0)
if __name__=='__main__':unittest.main()
