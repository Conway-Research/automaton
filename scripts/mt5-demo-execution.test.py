import importlib.util,unittest,tempfile,sqlite3,time
from pathlib import Path
from types import SimpleNamespace as N
spec=importlib.util.spec_from_file_location('demo_execution',Path(__file__).with_name('mt5-demo-execution.py'))
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

class Broker:
 def __init__(self):self.mode=0;self.sent=[];self.initialized=False
 def initialize(self,*a,**k):self.initialized=True;return True
 def shutdown(self):self.initialized=False
 def account_info(self):return N(login=123,server='fixture',trade_mode=self.mode)
 def terminal_info(self):return N(connected=True,path=str(Path('/fixture').resolve()),data_path=str(Path('/fixture').resolve()))
 def order_send(self,r):self.sent.append(r);return N(retcode=10009)
 def order_check(self,r):return N(retcode=0)

class Tests(unittest.TestCase):
 def test_signal_history_records_preorder_rejection_without_sending(self):
  import json
  with tempfile.TemporaryDirectory() as td:
   m,b,p=Lifecycle.fixture(self);p['signals'][0]['entry']=110;s=d.Journal(str(Path(td)/'demo.db'))
   result=d.cycle(b,p,s);record=json.loads(s.db.execute('SELECT payload FROM signal_checks').fetchone()[0])
   self.assertEqual(record['phase'],'completed');self.assertEqual(record['forwardedSignalCount'],1)
   self.assertEqual(record['attempts'][0]['outcome']['reason'],'price_moved_beyond_deviation')
   self.assertEqual(result['signalHistory']['status'],'recorded');self.assertEqual(m.sent,[]);s.close()

 def test_signal_history_write_failure_prevents_new_entry(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as td:
   m,b,p=Lifecycle.fixture(self);s=d.Journal(str(Path(td)/'demo.db'))
   with patch.object(d.signal_audit,'begin',side_effect=OSError('isolated audit failure')):
    with self.assertRaises(OSError):d.cycle(b,p,s)
   self.assertEqual(m.sent,[]);s.close()

 def test_persisted_power_and_controller_are_both_required(self):
  with tempfile.TemporaryDirectory() as td:
   power=Path(td)/'power.jsonl';control=Path(td)/'controller.db'
   self.assertFalse(d.operating_power(power,control));power.write_text('{"enabled":true}\n')
   with sqlite3.connect(control) as db:db.execute('CREATE TABLE founder_control(id INTEGER,status TEXT)');db.execute("INSERT INTO founder_control VALUES(1,'paused')")
   db.close()
   self.assertFalse(d.operating_power(power,control))
   with sqlite3.connect(control) as db:db.execute("UPDATE founder_control SET status='running'")
   db.close()
   self.assertTrue(d.operating_power(power,control));power.write_text('{"enabled":false}\n');self.assertFalse(d.operating_power(power,control))
 def test_real_contest_missing_and_changed_accounts_never_send(self):
  for mode in [1,2,None]:
   m=Broker();m.mode=mode;b=d.DemoExecutionBroker(m,str(Path('/fixture/terminal64.exe').resolve()),123,'fixture')
   with self.assertRaises(RuntimeError):b.initialize(str(Path('/fixture/terminal64.exe').resolve()))
   self.assertEqual(m.sent,[])
  m=Broker();b=d.DemoExecutionBroker(m,str(Path('/fixture/terminal64.exe').resolve()),123,'fixture');b.initialize(str(Path('/fixture/terminal64.exe').resolve()));m.mode=2
  with self.assertRaises(RuntimeError):b.order_send({'magic':d.MAGIC})
  self.assertEqual(m.sent,[])
 def test_persistent_intent_deduplication_and_unknown_halt(self):
  with tempfile.TemporaryDirectory() as td:
   s=d.Journal(str(Path(td)/'demo.db'));self.assertTrue(s.reserve('signal',{'symbol':'fixture'}));self.assertFalse(s.reserve('signal',{}));s.finish('signal',{'status':'unknown'});self.assertTrue(s.blocked());s.close()
   s=d.Journal(str(Path(td)/'demo.db'));self.assertFalse(s.reserve('signal',{}));self.assertTrue(s.blocked());s.close()
 def test_mutation_allowlist_does_not_expose_login(self):
  m=Broker();b=d.DemoExecutionBroker(m,str(Path('/fixture/terminal64.exe').resolve()),123,'fixture');b.initialize(str(Path('/fixture/terminal64.exe').resolve()))
  with self.assertRaises(RuntimeError):b.login(123)

class TradingBroker(Broker):
 ORDER_TYPE_BUY=0;ORDER_TYPE_SELL=1;TRADE_ACTION_DEAL=1;TRADE_RETCODE_DONE=10009;TRADE_RETCODE_DONE_PARTIAL=10010;ORDER_FILLING_IOC=1;ORDER_FILLING_FOK=0;SYMBOL_TRADE_MODE_FULL=4;DEAL_ENTRY_IN=0;DEAL_ENTRY_OUT=1
 def __init__(self):super().__init__();self.positions=[];self.deals=[];self.reject=False;self.unknown=False;self.fail_check=False;self.unprotected=False;self.bid=100;self.ask=100.1
 def account_info(self):
  balance=10000+sum(x.profit+x.commission+x.swap+x.fee for x in self.deals)
  return N(login=123,server='fixture',trade_mode=self.mode,currency='EUR',equity=balance,balance=balance,profit=0,credit=0,margin_free=9000,trade_allowed=True,trade_expert=True)
 def terminal_info(self):
  t=super().terminal_info();t.trade_allowed=True;t.tradeapi_disabled=False;return t
 def symbol_info(self,symbol):return N(name=symbol,trade_mode=4,point=.01,trade_stops_level=1,volume_min=.1,volume_max=10,volume_step=.1,filling_mode=2)
 def symbol_info_tick(self,symbol):return N(bid=self.bid,ask=self.ask,time_msc=time.time()*1000)
 def positions_get(self,ticket=None):return [p for p in self.positions if ticket is None or p.ticket==ticket]
 def orders_get(self):return []
 def history_deals_get(self,*args,**kwargs):return self.deals
 def history_deals_total(self,*args,**kwargs):return len(self.deals)
 def order_calc_profit(self,side,symbol,lots,entry,stop):return (stop-entry)*lots*100 if side==0 else (entry-stop)*lots*100
 def order_calc_margin(self,side,symbol,lots,entry):return lots*100
 def order_check(self,r):return N(retcode=1 if self.fail_check else 0)
 def order_send(self,r):
  self.sent.append(r)
  if self.unknown:return None
  if self.reject:return N(retcode=10019)
  exiting='position' in r;position_id=r['position'] if exiting else 77+len(self.deals)
  self.deals.append(N(ticket=len(self.deals)+1,time_msc=int(time.time()*1000),type=r['type'],symbol=r['symbol'],magic=d.MAGIC,comment=r['comment'],position_id=position_id,entry=1 if exiting else 0,volume=r['volume'],profit=10 if exiting else 0,commission=-1,swap=0,fee=0))
  if exiting:self.positions=[]
  else:self.positions=[N(ticket=position_id,magic=d.MAGIC,symbol=r['symbol'],type=r['type'],sl=0 if self.unprotected else r['sl'],tp=r['tp'],volume=r['volume'])]
  return N(retcode=10009)

class Lifecycle(unittest.TestCase):
 def test_terminal_permissions_and_fresh_markets_gate_readiness(self):
  for issue in ['terminal','api','account','expert','no-market','stale-market']:
   with tempfile.TemporaryDirectory() as td:
    m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'))
    if issue in ['terminal','api']:
     original=m.terminal_info
     def restricted():t=original();t.trade_allowed=issue!='terminal';t.tradeapi_disabled=issue=='api';return t
     m.terminal_info=restricted
    if issue in ['account','expert']:
     original_account=m.account_info
     def restricted_account():a=original_account();a.trade_allowed=issue!='account';a.trade_expert=issue!='expert';return a
     m.account_info=restricted_account
    if issue=='no-market':p['market']['instruments']=[]
    if issue=='stale-market':p['market']['instruments'][0]['quoteAt']=1
    result=d.cycle(b,p,s);s.close();self.assertFalse(result['executionEnabled'],issue);self.assertEqual(m.sent,[],issue);self.assertIn('checks',result)
 def fixture(self):
  m=TradingBroker();terminal=str(Path('/fixture/terminal64.exe').resolve());b=d.DemoExecutionBroker(m,terminal,123,'fixture');b.initialize(terminal)
  now=time.time()*1000
  payload={'binding':{'login':123,'server':'fixture'},'market':{'account':{'identity':'123','server':'fixture','observedAt':now,'balance':10000,'equity':10000,'credit':0,'profit':0},'dayHistory':{'complete':True,'windowVerified':True,'recordCount':0,'wideIntervalEmpty':True}},'limits':{'perTrade':.05,'total':.15,'dailyEntryStop':.30},'liveAuthorized':False,'day':{'verified':True,'account':'123','server':'fixture','currency':'EUR','startsAt':now-10000,'endsAt':now+100000,'openingEquity':10000,'netExternalFlow':0},'signals':[{'signalId':'a'*64,'symbol':'EURUSD','side':'BUY','entry':100.1,'stop':99,'target':102.3,'observedAt':now,'expiresAt':now+14000}]}
  payload['market']['instruments']=[{'symbol':'EURUSD','capability':True,'quoteAt':now}]
  return m,b,payload
 def test_fill_restart_no_duplicate_and_broker_exit_profit(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();file=str(Path(td)/'demo.db');s=d.Journal(file)
   result=d.cycle(b,p,s);self.assertEqual(result['events'][0]['status'],'accepted');self.assertFalse(result['costsVerified']);self.assertEqual(len(m.sent),1);s.close()
   s=d.Journal(file);d.cycle(b,p,s);self.assertEqual(len(m.sent),1)
   m.bid=103;m.ask=103.1;result=d.cycle(b,p,s);self.assertEqual(len(m.sent),2);self.assertEqual(result['events'][0]['status'],'closed');self.assertEqual(result['events'][0]['result']['realizedDemoProfit'],8);s.close()
 def test_unknown_is_persistent_and_prevents_another_signal(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();m.unknown=True;s=d.Journal(str(Path(td)/'demo.db'));self.assertEqual(d.cycle(b,p,s)['status'],'blocked');p['signals'][0]['signalId']='b'*64;d.cycle(b,p,s);self.assertEqual(len(m.sent),1);s.close()
 def test_foreign_positions_invalid_day_and_failed_check_prevent_orders(self):
  for reason in ['foreign','day','check','loss','stale','limit']:
   with tempfile.TemporaryDirectory() as td:
    m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'))
    if reason=='foreign':m.positions=[N(magic=999,symbol='OTHER')]
    if reason=='day':p['day']['verified']=False
    if reason=='check':m.fail_check=True
    if reason=='loss':p['day']['openingEquity']=20000
    if reason=='stale':p['signals'][0]['expiresAt']=1
    if reason=='limit':p['limits']['perTrade']=1
    try:d.cycle(b,p,s)
    except RuntimeError:pass
    self.assertEqual(m.sent,[],reason);s.close()
 def test_power_change_before_send_is_checked_and_not_retried(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();b.power=lambda:False;s=d.Journal(str(Path(td)/'demo.db'));self.assertEqual(d.cycle(b,p,s)['status'],'blocked');self.assertEqual(m.sent,[]);s.close()
 def test_unprotected_fill_is_closed_on_following_cycle(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();m.unprotected=True;s=d.Journal(str(Path(td)/'demo.db'));result=d.cycle(b,p,s);self.assertEqual(result['events'][0]['status'],'closed');self.assertEqual(len(m.sent),2);s.close()
 def test_definite_rejection_is_recorded_once(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();m.reject=True;s=d.Journal(str(Path(td)/'demo.db'));self.assertEqual(d.cycle(b,p,s)['events'][0]['status'],'rejected');d.cycle(b,p,s);self.assertEqual(len(m.sent),1);s.close()
 def test_nonempty_own_history_preserves_original_daily_gate(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'));d.cycle(b,p,s)
   m.bid=103;m.ask=103.1;d.cycle(b,p,s)
   p['day']['verified']=False;m.bid=100;m.ask=100.1;p['signals'][0]['signalId']='b'*64
   result=d.cycle(b,p,s);s.close();self.assertEqual(len(m.sent),3);self.assertEqual(result['status'],'observing')
 def test_external_or_changed_history_blocks_new_entries(self):
  for change in ['foreign','missing','credit','next-day']:
   with tempfile.TemporaryDirectory() as td:
    m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'));d.cycle(b,p,s);m.bid=103;m.ask=103.1;d.cycle(b,p,s);p['day']['verified']=False
    if change=='foreign':m.deals[1].magic=999
    if change=='missing':m.deals.pop(0)
    if change=='credit':
     original=m.account_info
     def changed():a=original();a.credit=1;return a
     m.account_info=changed
    if change=='next-day':p['day']['startsAt']+=86400000;p['day']['endsAt']+=86400000
    p['signals'][0]['signalId']='c'*64;m.bid=100;m.ask=100.1;d.cycle(b,p,s);s.close();self.assertEqual(len(m.sent),2,change)
 def test_unchanged_flat_checkpoint_allows_safe_day_rollover(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'));p['signals']=[];d.cycle(b,p,s)
   future=time.time()+200;p['day']={**p['day'],'verified':False,'startsAt':future*1000-1000,'endsAt':future*1000+86400000};p['market']['account']['observedAt']=future*1000;p['market']['instruments'][0]['quoteAt']=future*1000
   with patch.object(d.time,'time',return_value=future):result=d.cycle(b,p,s)
   s.close();self.assertEqual(result['status'],'observing');self.assertEqual(m.sent,[])
 def test_missing_rollover_proof_records_only_a_future_checkpoint(self):
  import json
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'));p['signals']=[];d.cycle(b,p,s)
   anchor=json.loads(s.db.execute('SELECT payload FROM demo_day').fetchone()[0]);anchor['flatCheckpoint']['balance']-=1
   s.db.execute('UPDATE demo_day SET payload=?',(json.dumps(anchor),));s.db.commit()
   future=time.time()+200;p['day']={**p['day'],'verified':False,'startsAt':future*1000-1000,'endsAt':future*1000+100000}
   with patch.object(d.time,'time',return_value=future):day=d.demo_day(b,p,s)
   self.assertFalse(day['verified']) # Never fabricate today's opening equity.
   checkpoint=json.loads(s.db.execute('SELECT payload FROM demo_day').fetchone()[0])['flatCheckpoint']
   self.assertEqual(checkpoint['at'],future*1000);self.assertEqual(checkpoint['balance'],m.account_info().balance)
   later=future+200;p['day']={**p['day'],'startsAt':later*1000-1000,'endsAt':later*1000+86400000}
   with patch.object(d.time,'time',return_value=later):day=d.demo_day(b,p,s)
   self.assertTrue(day['verified']);self.assertEqual(m.sent,[]);s.close()
 def test_inconsistent_history_count_blocks_entry(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();m.history_deals_total=lambda *a:1;s=d.Journal(str(Path(td)/'demo.db'));result=d.cycle(b,p,s);s.close();self.assertEqual(m.sent,[]);self.assertEqual(result['status'],'waiting-day')
 def test_initial_baseline_rejects_deposit_or_balanced_hidden_history(self):
  for amount in [100,0]:
   with tempfile.TemporaryDirectory() as td:
    m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'))
    m.deals=[N(ticket=1,time_msc=int(time.time()*1000),type=2,entry=0,magic=0,position_id=0,comment='external',symbol='',volume=0,profit=amount,commission=0,swap=0,fee=0)]
    result=d.cycle(b,p,s);s.close();self.assertEqual(m.sent,[]);self.assertEqual(result['status'],'waiting-day')
 def test_persisted_intent_from_other_account_cannot_close_position(self):
  with tempfile.TemporaryDirectory() as td:
   m,b,p=self.fixture();s=d.Journal(str(Path(td)/'demo.db'));d.cycle(b,p,s);_,intent,_=s.active()[0];s.close();intent['account']='other';m.bid=103;m.ask=103.1
   result=d.protect(b,intent,d.reconcile(b,intent));self.assertEqual(result['status'],'unknown');self.assertEqual(len(m.sent),1)

if __name__=='__main__':unittest.main()
