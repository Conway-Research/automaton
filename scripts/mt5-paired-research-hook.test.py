import unittest,tempfile,json,importlib.util,subprocess
from unittest.mock import patch
from pathlib import Path
s=importlib.util.spec_from_file_location('hook',Path(__file__).with_name('mt5-paired-research-hook.py'));h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
class Tests(unittest.TestCase):
 def test_history_dispatch_survives_paired_observer_failure(self):
  for failure in ['exit','timeout','invalid']:
   with self.subTest(failure=failure),tempfile.TemporaryDirectory() as td:
    root=Path(td);market=self.fixture(root,True)
    (root/'artifacts/founder-integration-20261012/mt5-demo-profile.json').write_text('{}')
    controller=root/'artifacts/founder-autonomy-20261013/controller.db';controller.parent.mkdir();controller.touch()
    def observer(*a,**k):
     if failure=='timeout':raise subprocess.TimeoutExpired('fake',3)
     return subprocess.CompletedProcess([],1 if failure=='exit' else 0,'invalid')
    with patch.object(h.subprocess,'Popen') as dispatch:
     result=h.observe(market,root,observer)
    self.assertEqual(result['status'],'observer_failed')
    self.assertEqual(result.get('historicalResearch'),'dispatched_guarded_worker')
    self.assertEqual(dispatch.call_count,1)
 def test_off_during_observer_never_dispatches_history(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);market=self.fixture(root,True)
   (root/'artifacts/founder-integration-20261012/mt5-demo-profile.json').write_text('{}')
   controller=root/'artifacts/founder-autonomy-20261013/controller.db';controller.parent.mkdir();controller.touch()
   def observer(*a,**k):
    (root/'artifacts/founder-integration-20261012/power-state.jsonl').write_text('{"enabled":false}')
    return subprocess.CompletedProcess([],0,'{"status":"collecting","executionEnabled":false}')
   with patch.object(h.subprocess,'Popen') as dispatch:result=h.observe(market,root,observer)
   self.assertEqual(dispatch.call_count,0)
 def test_watch_adds_bound_open_research_symbols_without_exceeding_capacity(self):
  import sqlite3
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);self.fixture(root,True)
   file=root/'artifacts/demo-execution-20261017/paired-crypto-research-61.db'
   with sqlite3.connect(file) as db:
    db.execute('CREATE TABLE strategy_opt_records(symbol TEXT,status TEXT,account TEXT,server TEXT)')
    db.executemany('INSERT INTO strategy_opt_records VALUES(?,?,?,?)',[('BTCUSD','open','123','fixture'),('ETHUSD','open','123','fixture'),('FOREIGN','open','456','fixture'),('CLOSED','closed','123','fixture')])
   db.close()
   plan=h.plan_watch(root,['EXISTING'],123,'fixture')
   self.assertEqual(plan['symbols'],['EXISTING','BTCUSD','ETHUSD']);self.assertEqual(plan['dropped'],[])
   full=h.plan_watch(root,['S'+str(i) for i in range(100)],123,'fixture');self.assertEqual(len(full['symbols']),100);self.assertEqual(len(full['dropped']),2)
   with sqlite3.connect(file) as db:db.executemany('INSERT INTO strategy_opt_records VALUES(?,?,?,?)',[('COIN'+str(i),'open','123','fixture') for i in range(30)])
   db.close()
   limited=h.plan_watch(root,[],123,'fixture');self.assertEqual(len(limited['added']),20);self.assertEqual(len(limited['dropped']),12)

 def fixture(self,root,enabled):
  p=root/'artifacts/founder-integration-20261012';p.mkdir(parents=True);(p/'power-state.jsonl').write_text(json.dumps({'enabled':enabled}));(root/'artifacts/demo-execution-20261017').mkdir(parents=True)
  return {'readOnly':True,'executionEnabled':False,'accountBinding':{'demo':True}}
 def test_off_never_starts_observer(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);m=self.fixture(root,False);self.assertEqual(h.observe(m,root,lambda *a,**k:self.fail('OFF started research'))['status'],'off')
 def test_failure_is_visible_and_cannot_enable_execution(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);m=self.fixture(root,True)
   def timeout(*a,**k):raise subprocess.TimeoutExpired('isolated',3)
   self.assertEqual(h.observe(m,root,timeout),{'status':'observer_failed','executionEnabled':False})
   self.assertEqual(h.observe(m,root,lambda *a,**k:subprocess.CompletedProcess([],0,'{"status":"collecting","executionEnabled":false}'))['status'],'collecting')
if __name__=='__main__':unittest.main()
