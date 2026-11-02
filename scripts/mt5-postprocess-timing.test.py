import importlib.util,json,tempfile,unittest,os,io,shutil,subprocess,sys
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('posttiming',Path(__file__).with_name('mt5-postprocess-timing.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_phases_are_paired_correlated_and_exclude_values(self):
  with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'NUMARON_MARKET_READ_ID':'12345678-1234-1234-1234-123456789abc'}):
   target=Path(d)/'timing.jsonl';clock=iter([1,1.25,2,2.5]);meter=m.PhaseTiming(target,clock=lambda:next(clock))
   self.assertEqual(meter.measure('research_hook',lambda:'PRIVATE'),'PRIVATE');meter.measure('serialization',lambda:{'private':'PRIVATE'})
   rows=[json.loads(l) for l in target.read_text().splitlines()];self.assertEqual([r['event'] for r in rows],['begin','end','begin','end']);self.assertEqual(rows[1]['elapsedMs'],250);self.assertEqual(rows[3]['elapsedMs'],500);self.assertEqual(rows[0]['readId'],'12345678-1234-1234-1234-123456789abc');self.assertNotIn('PRIVATE',target.read_text())
 def test_failure_preserves_exception_and_records_no_raw_error(self):
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'timing.jsonl';meter=m.PhaseTiming(target);failure=ValueError('PRIVATE')
   def fail():raise failure
   with self.assertRaises(ValueError) as caught:meter.measure('serialization',fail)
   self.assertIs(caught.exception,failure);rows=[json.loads(l) for l in target.read_text().splitlines()];self.assertEqual(rows[-1]['outcome'],'failed');self.assertNotIn('PRIVATE',target.read_text())
 def test_log_failure_and_invalid_phase_cannot_run_extra_operations(self):
  with tempfile.TemporaryDirectory() as d:
   meter=m.PhaseTiming(Path(d));calls=[];self.assertEqual(meter.measure('output',lambda:calls.append(1) or 42),42);self.assertEqual(calls,[1])
   with self.assertRaises(ValueError):meter.measure('PRIVATE',lambda:calls.append(2))
   self.assertEqual(calls,[1])
 def test_begin_is_visible_while_operation_is_still_running(self):
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'timing.jsonl';meter=m.PhaseTiming(target)
   def operation():self.assertEqual(json.loads(target.read_text())['event'],'begin')
   meter.measure('research_hook',operation)
 def test_wrapper_integration_with_synthetic_modules_and_no_broker(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);scripts=root/'scripts';scripts.mkdir()
   for name in ['mt5-demo-readonly.py','mt5-postprocess-timing.py']:shutil.copyfile(Path(__file__).with_name(name),scripts/name)
   (scripts/'MetaTrader5.py').write_text('# offline stub, no broker APIs\n')
   (scripts/'mt5-readonly.py').write_text("def snapshot(*args):return {'private':'PRIVATE','readOnly':True}\n")
   completed=subprocess.run([sys.executable,str(scripts/'mt5-demo-readonly.py'),'--reader','account','--terminal',str(root/'terminal64.exe'),'--login','123','--server','PRIVATE'],capture_output=True,text=True,timeout=10)
   self.assertEqual(completed.returncode,0);self.assertEqual(json.loads(completed.stdout)['private'],'PRIVATE')
   target=root/'artifacts/capture-delay-repair-20261016/postprocess-timing.jsonl';rows=[json.loads(l) for l in target.read_text().splitlines()]
   self.assertEqual([(r['phase'],r['event']) for r in rows],[('serialization','begin'),('serialization','end'),('output','begin'),('output','end')]);self.assertNotIn('PRIVATE',target.read_text())
 def test_output_contract_and_flush_are_preserved(self):
  class Buffer(io.StringIO):
   flushed=False
   def flush(self):self.flushed=True
  output=Buffer()
  with patch('sys.stdout',output):m.write_output('{"private":"PRIVATE"}')
  self.assertEqual(output.getvalue(),'{"private":"PRIVATE"}\n');self.assertTrue(output.flushed)
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'result.json';status=Buffer()
   with patch('sys.stdout',status):m.write_output('{"private":"PRIVATE"}',target)
   self.assertEqual(target.read_text(),'{"private":"PRIVATE"}');self.assertTrue(json.loads(status.getvalue())['readOnly']);self.assertTrue(status.flushed)
 def test_trading_hook_is_measured_and_existing_failure_fallback_is_preserved(self):
  for failed in [False,True]:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);scripts=root/'scripts';scripts.mkdir()
    for name in ['mt5-demo-readonly.py','mt5-postprocess-timing.py']:shutil.copyfile(Path(__file__).with_name(name),scripts/name)
    (scripts/'MetaTrader5.py').write_text('# no broker APIs\n')
    (scripts/'mt5-trading-adapter.py').write_text("def collect_market(*args):return {'instruments':[],'watchQuotes':[],'private':'PRIVATE'}\n")
    (scripts/'mt5-capture-timing.py').write_text('def measure(module,read,target):return read()\n')
    (scripts/'mt5-paired-research-hook.py').write_text("def plan_watch(*args):return {'symbols':[]}\ndef observe(*args):"+("raise RuntimeError('PRIVATE')\n" if failed else "return {'status':'offline','executionEnabled':False}\n"))
    completed=subprocess.run([sys.executable,str(scripts/'mt5-demo-readonly.py'),'--reader','trading','--terminal',str(root/'terminal64.exe'),'--login','123','--server','PRIVATE'],capture_output=True,text=True,timeout=10)
    self.assertEqual(completed.returncode,0);result=json.loads(completed.stdout);self.assertEqual(result['pairedResearch']['status'],'observer_failed' if failed else 'offline')
    target=root/'artifacts/capture-delay-repair-20261016/postprocess-timing.jsonl';rows=[json.loads(l) for l in target.read_text().splitlines()]
    self.assertEqual([r['phase'] for r in rows if r['event']=='end'],['research_hook','serialization','output']);self.assertEqual(rows[1]['outcome'],'failed' if failed else 'ok');self.assertNotIn('PRIVATE',target.read_text())
if __name__=='__main__':unittest.main()
