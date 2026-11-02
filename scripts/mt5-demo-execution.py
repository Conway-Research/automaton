"""Virtual-money execution only. Never imports MetaTrader5 during isolated tests.

Unvalidated experimental strategy, conservative demo risk reserve, no live cost
or profitability attestation. A persistent journal prevents blind order retries.
"""
import argparse,importlib.util,json,math,os,sqlite3,sys,time,hashlib
from pathlib import Path
from datetime import datetime,timezone,timedelta
from contextlib import closing

def load(name):
 spec=importlib.util.spec_from_file_location(name.replace('-','_'),Path(__file__).with_name(name+'.py'))
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

reader=load('mt5-demo-readonly')
signal_audit=load('mt5-signal-audit')
MAGIC=170102601

class DemoExecutionBroker(reader.DemoOnly):
 READS=reader.DemoOnly.READS
 CONSTANTS=reader.DemoOnly.CONSTANTS|frozenset(['TRADE_ACTION_DEAL','TRADE_RETCODE_DONE','TRADE_RETCODE_DONE_PARTIAL','ORDER_FILLING_IOC','ORDER_FILLING_FOK','ACCOUNT_MARGIN_MODE_RETAIL_HEDGING','DEAL_ENTRY_IN','DEAL_ENTRY_OUT'])
 def __init__(self,*args,offset=0,power=lambda:True,close_only=False):super().__init__(*args);self.offset=offset;self.power=power;self.close_only=close_only
 def order_check(self,request):
  self.account_info();result=self._broker.order_check(request);self.account_info();return result
 def order_send(self,request):
  account=self.account_info();terminal=self.terminal_info()
  if getattr(terminal,'trade_allowed',None) is not True or getattr(terminal,'tradeapi_disabled',None) is not False or getattr(account,'trade_allowed',None) is not True or getattr(account,'trade_expert',None) is not True:raise RuntimeError('Demo terminal or account trading disabled')
  # After OFF only closing an own open position remains possible; every entry stays behind the power check.
  if self.close_only:
   if not request.get('position'):raise RuntimeError('Protection run may only close a position')
  elif not self.power():raise RuntimeError('Manual power is OFF or unreadable')
  if request.get('magic')!=MAGIC:raise RuntimeError('Demo ownership required')
  result=self._broker.order_send(request)
  self.account_info();return result

class Journal:
 def __init__(self,file):
  self.db=sqlite3.connect(file,timeout=1)
  self.db.execute('CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,result TEXT)');self.db.commit()
  self.db.execute('CREATE TABLE IF NOT EXISTS demo_day(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');self.db.commit()
  signal_audit.setup(self.db)
 def reserve(self,id,intent):
  try:self.db.execute('INSERT INTO intents VALUES(?,?,?,NULL)',(id,json.dumps(intent),'pending'));self.db.commit();return True
  except sqlite3.IntegrityError:return False
 def finish(self,id,result):
  self.db.execute('UPDATE intents SET status=?,result=? WHERE id=?',(result['status'],json.dumps(result),id));self.db.commit()
 def blocked(self):return bool(self.db.execute("SELECT 1 FROM intents WHERE status IN ('pending','unknown','partial') LIMIT 1").fetchone())
 def active(self):return [(id,json.loads(p),json.loads(r) if r else {}) for id,p,r in self.db.execute("SELECT id,payload,result FROM intents WHERE status NOT IN ('closed','rejected')")]
 def events(self):return [{'id':id,'status':s,'result':json.loads(r) if r else None} for id,s,r in self.db.execute('SELECT id,status,result FROM intents ORDER BY rowid DESC LIMIT 20')]
 def close(self):self.db.close()

def finite(v):return isinstance(v,(float,int)) and not isinstance(v,bool) and math.isfinite(v)
def positive(v):return finite(v) and v>0

def operating_power(power_file,controller_file):
 try:
  if json.loads(Path(power_file).read_text(encoding='utf-8').strip().splitlines()[-1]).get('enabled') is not True:return False
  with closing(sqlite3.connect(Path(controller_file).resolve().as_uri()+'?mode=ro',uri=True,timeout=.2)) as db:
   row=db.execute('SELECT status FROM founder_control WHERE id=1').fetchone()
   return row is not None and row[0]=='running'
 except Exception:return False

def demo_day(m,payload,journal):
 """Extend a proven flat demo baseline only with complete owned broker history.

No conversion of broker deal timestamps, no general live-history attestation.
"""
 supplied=payload['day'];a=m.account_info();positions=m.positions_get();orders=m.orders_get()
 begin=datetime(1970,1,1,tzinfo=timezone.utc);end=datetime.now(timezone.utc)+timedelta(days=1)
 deals=m.history_deals_get(begin,end);count=m.history_deals_total(begin,end);after=m.account_info()
 if positions is None or orders is None or deals is None or count!=len(deals):return {**supplied,'verified':False}
 if any(getattr(a,k,None)!=getattr(after,k,None) for k in ['login','server','currency','balance','credit','equity','profit']):return {**supplied,'verified':False}
 records={}
 for deal in deals:
  fields={k:getattr(deal,k,None) for k in ['ticket','type','entry','magic','position_id','comment','symbol','volume','time_msc','profit','commission','swap','fee']}
  fields['fee']=getattr(deal,'fee',0)
  if fields['ticket'] in records or not all(finite(fields[k]) for k in ['ticket','time_msc','profit','commission','swap','fee']):return {**supplied,'verified':False}
  records[fields['ticket']]=hashlib.sha256(json.dumps(fields,sort_keys=True).encode()).hexdigest()
 row=journal.db.execute('SELECT payload FROM demo_day WHERE id=1').fetchone();anchor=json.loads(row[0]) if row else None
 identity=[str(a.login),a.server,a.currency]
 if anchor is None:
  if supplied.get('verified') is not True or positions or orders or a.profit!=0 or a.balance!=a.equity or supplied.get('account')!=str(a.login) or supplied.get('server')!=a.server or supplied.get('currency')!=a.currency:return {**supplied,'verified':False}
  captured=payload['market']['account'];history=payload['market'].get('dayHistory',{})
  if any(getattr(a,k,None)!=captured.get(k) for k in ['balance','equity','credit','profit']) or history.get('complete') is not True or history.get('windowVerified') is not True:return {**supplied,'verified':False}
  if history.get('recordCount')==0 and history.get('wideIntervalEmpty') is True:
   if deals:return {**supplied,'verified':False}
  elif history.get('recordCount')==1 and history.get('priorDayCreditProof') and len(deals)==1:
   deal=deals[0]
   proof_digest=hashlib.sha256(json.dumps([deal.ticket,deal.type,deal.time_msc,deal.profit,deal.commission,deal.swap,getattr(deal,'fee',0),deal.symbol,getattr(deal,'comment','')],ensure_ascii=True).encode()).hexdigest()
   if history.get('observedRecordDigests')!=[proof_digest]:return {**supplied,'verified':False}
  else:return {**supplied,'verified':False}
  anchor={'identity':identity,'day':supplied,'balance':a.balance,'credit':a.credit,'records':{str(k):v for k,v in records.items()}}
  journal.db.execute('INSERT INTO demo_day VALUES(1,?)',(json.dumps(anchor),));journal.db.commit()
 if anchor['identity']!=identity or anchor['credit']!=a.credit or any(records.get(int(k))!=v for k,v in anchor.get('seen',anchor['records']).items()):return {**supplied,'verified':False}
 original=anchor['day'];same_day=original['startsAt']==supplied.get('startsAt') and original['endsAt']==supplied.get('endsAt')
 intents={id[:24]:json.loads(p) for id,p in journal.db.execute('SELECT id,payload FROM intents')}
 added=[x for x in deals if str(x.ticket) not in anchor['records']]
 owned_positions={}
 for deal in added:
  if deal.entry==m.DEAL_ENTRY_IN:
   intent=intents.get(deal.comment)
   if not intent or deal.magic!=MAGIC or deal.symbol!=intent['symbol'] or deal.type!=(m.ORDER_TYPE_BUY if intent['side']=='BUY' else m.ORDER_TYPE_SELL):return {**supplied,'verified':False}
   owned_positions[deal.position_id]=intent
 for deal in added:
  intent=owned_positions.get(deal.position_id)
  if not intent or deal.magic!=MAGIC or deal.symbol!=intent['symbol'] or deal.entry not in [m.DEAL_ENTRY_IN,m.DEAL_ENTRY_OUT] or deal.type not in [m.ORDER_TYPE_BUY,m.ORDER_TYPE_SELL]:return {**supplied,'verified':False}
 booked=sum(x.profit+x.commission+x.swap+getattr(x,'fee',0) for x in added)
 if abs(a.balance-anchor['balance']-booked)>.000001:return {**supplied,'verified':False}
 # A flat checkpoint with identical complete history proves no activity across
 # midnight. Otherwise rollover stays blocked; never guess a deal's day.
 checkpoint=anchor.get('flatCheckpoint')
 if not same_day:
  if not checkpoint or not checkpoint['at']<supplied['startsAt']<=time.time()*1000<supplied['endsAt'] or checkpoint['records']!={str(k):v for k,v in records.items()} or checkpoint['balance']!=a.balance or positions or orders or a.profit!=0 or a.equity!=a.balance:
   # Complete owned-history reconciliation above proves a flat account NOW,
   # not the missing opening equity. Save only a checkpoint for a future day.
   if not positions and not orders and a.profit==0 and a.equity==a.balance:
    anchor['flatCheckpoint']={'at':time.time()*1000,'balance':a.balance,'records':{str(k):v for k,v in records.items()}}
    anchor['seen']={str(k):v for k,v in records.items()}
    journal.db.execute('UPDATE demo_day SET payload=? WHERE id=1',(json.dumps(anchor),));journal.db.commit()
   return {**supplied,'verified':False,'reason':'Demo-Tagesstart nicht belegt; neuer Flachkonto-Kontrollpunkt fuer Folgetag gespeichert.'}
  original={**supplied,'verified':True,'account':str(a.login),'server':a.server,'currency':a.currency,'openingEquity':a.equity,'netExternalFlow':0,'method':'demo-flat-checkpoint-unchanged-full-history'}
  anchor={'identity':identity,'day':original,'balance':a.balance,'credit':a.credit,'records':{str(k):v for k,v in records.items()}}
 if not positions and not orders and a.profit==0 and a.equity==a.balance:
  anchor['flatCheckpoint']={'at':time.time()*1000,'balance':a.balance,'records':{str(k):v for k,v in records.items()}}
 anchor['seen']={str(k):v for k,v in records.items()}
 journal.db.execute('UPDATE demo_day SET payload=? WHERE id=1',(json.dumps(anchor),));journal.db.commit()
 return {**original,'verified':True,'method':'demo-owned-history-reconciled'}

def quote(m,symbol):
 t=m.symbol_info_tick(symbol)
 if t is None or not -1<=time.time()-t.time_msc/1000+m.offset<=15 or not positive(t.bid) or not finite(t.ask) or t.ask<t.bid:raise RuntimeError('Fresh demo quote required')
 return t

def stop_protection_matches(actual,expected,buy):
 # Only representation noise: never grant a tick-sized price allowance.
 if not positive(actual) or not positive(expected):return False
 tolerance=4*max(math.ulp(actual),math.ulp(expected))
 return (actual>=expected if buy else actual<=expected) or abs(actual-expected)<=tolerance

def reconcile(m,intent):
 a=m.account_info()
 if intent.get('account')!=str(a.login) or intent.get('server')!=a.server:return {'status':'unknown'}
 positions=m.positions_get();orders=m.orders_get()
 # Broker history clocks can differ from quote clocks: bound a wider interval.
 since=datetime.fromtimestamp(intent['observedAt']/1000,timezone.utc)-timedelta(hours=14)
 deals=m.history_deals_get(since,datetime.now(timezone.utc)+timedelta(hours=14))
 if positions is None or orders is None or deals is None:return {'status':'unknown'}
 own=[d for d in deals if d.magic==MAGIC and d.comment==intent['signalId'][:24]]
 ids={d.position_id for d in own}
 if not ids:return {'status':'unknown'}
 all_deals=[d for d in deals if d.position_id in ids]
 if any(d.magic!=MAGIC for d in all_deals):return {'status':'unknown'}
 active=[p for p in positions if p.ticket in ids]
 if any(p.magic!=MAGIC or p.symbol!=intent['symbol'] for p in active):return {'status':'unknown'}
 incoming=sum(d.volume for d in all_deals if d.entry==m.DEAL_ENTRY_IN)
 outgoing=sum(d.volume for d in all_deals if d.entry==m.DEAL_ENTRY_OUT)
 if active:
  protected=all(positive(p.sl) and positive(p.tp) and abs(p.tp-intent['target'])<1e-8 and stop_protection_matches(p.sl,intent['stop'],intent['side']=='BUY') for p in active)
  return {'status':'accepted' if abs(incoming-intent['lots'])<1e-8 and protected else 'partial','protectionVerified':protected,'positionIds':[str(p.ticket) for p in active]}
 if incoming>0 and outgoing+1e-8>=incoming and not any(o.magic==MAGIC and o.comment==intent['signalId'][:24] for o in orders):
  return {'status':'closed','finalityVerified':True,'realizedDemoProfit':sum(d.profit+d.commission+d.swap+getattr(d,'fee',0) for d in all_deals),'currency':m.account_info().currency}
 return {'status':'unknown'}

def filling(m,s):
 if s.filling_mode&2:return m.ORDER_FILLING_IOC
 if s.filling_mode&1:return m.ORDER_FILLING_FOK
 raise RuntimeError('Supported filling policy missing')

def protect(m,intent,result):
 a=m.account_info()
 if intent.get('account')!=str(a.login) or intent.get('server')!=a.server:return {'status':'unknown'}
 if result['status'] not in ['accepted','partial']:return result
 for ticket in result.get('positionIds',[]):
  rows=m.positions_get(ticket=int(ticket))
  if rows is None or len(rows)!=1:return {'status':'unknown'}
  p=rows[0];q=quote(m,p.symbol);buy=intent['side']=='BUY'
  if p.magic!=MAGIC or p.symbol!=intent['symbol'] or (p.type==m.ORDER_TYPE_BUY)!=buy:return {'status':'unknown'}
  exit_price=q.bid if buy else q.ask
  must_exit=not result.get('protectionVerified') or (exit_price<=intent['stop'] or exit_price>=intent['target'] if buy else exit_price>=intent['stop'] or exit_price<=intent['target'])
  if must_exit:
   s=m.symbol_info(p.symbol)
   request={'action':m.TRADE_ACTION_DEAL,'position':p.ticket,'symbol':p.symbol,'volume':p.volume,'type':m.ORDER_TYPE_SELL if buy else m.ORDER_TYPE_BUY,'price':exit_price,'deviation':20,'magic':MAGIC,'comment':intent['signalId'][:24],'type_filling':filling(m,s)}
   check=m.order_check(request)
   if check is None or check.retcode!=0:return {'status':'unknown'}
   response=m.order_send(request)
   if response is None or response.retcode!=m.TRADE_RETCODE_DONE:return {'status':'unknown'}
   return reconcile(m,intent)
 return result

def protect_only(m,journal):
 """Patrice's decision of 2.11.2026: after OFF, positions without a confirmed stop may still be protected. Never enters."""
 if m.account_info().trade_mode!=0:raise RuntimeError('Demo account required')
 unprotected=0
 for id,intent,old in journal.active():
  if old.get('protectionVerified') and old.get('status') in ['accepted','partial']:continue
  result=protect(m,intent,reconcile(m,intent));journal.finish(id,result)
  if result['status'] not in ['closed','rejected'] and not result.get('protectionVerified'):unprotected+=1
 return {'mode':'demo-only','status':'protect-only','executionEnabled':False,'liveAuthorized':False,'unprotected':unprotected}

def enter(m,signal,payload,journal):
 a=m.account_info();day=payload['day'];limits=payload['limits'];now=time.time()*1000
 if not day.get('verified') or day.get('account')!=str(a.login) or day.get('server')!=a.server or day.get('currency')!=a.currency or not finite(day.get('startsAt')) or not finite(day.get('endsAt')) or not day['startsAt']<=now<day['endsAt'] or not positive(day.get('openingEquity')) or not finite(day.get('netExternalFlow')):return {'outcome':'not_submitted','reason':'day_binding_or_balance_unverified'}
 if not isinstance(signal.get('signalId'),str) or len(signal['signalId'])!=64 or any(c not in '0123456789abcdef' for c in signal['signalId']) or signal.get('side') not in ['BUY','SELL'] or not all(positive(signal.get(k)) for k in ['entry','stop','target','observedAt','expiresAt']) or signal['expiresAt']<=now or signal['observedAt']>now+1000 or now-signal['observedAt']>15000:return {'outcome':'not_submitted','reason':'signal_invalid_or_expired'}
 s=m.symbol_info(signal['symbol']);q=quote(m,signal['symbol']);buy=signal['side']=='BUY';price=q.ask if buy else q.bid
 if s is None or s.trade_mode!=m.SYMBOL_TRADE_MODE_FULL or not positive(s.point):return {'outcome':'not_submitted','reason':'symbol_trading_restricted'}
 if not (0<signal['stop']<price<signal['target'] if buy else 0<signal['target']<price<signal['stop']):return {'outcome':'not_submitted','reason':'protection_prices_invalid'}
 if abs(price-signal['entry'])>20*s.point:return {'outcome':'not_submitted','reason':'price_moved_beyond_deviation'}
 minimum=s.trade_stops_level*s.point
 if abs(price-signal['stop'])<minimum or abs(price-signal['target'])<minimum:return {'outcome':'not_submitted','reason':'broker_minimum_stop_distance'}
 positions=m.positions_get();orders=m.orders_get()
 if positions is None or orders is None or positions or orders:return {'outcome':'not_submitted','reason':'positions_or_orders_present_or_unreadable'} # Never mix ownership.
 if not all(positive(getattr(a,k,None)) for k in ['equity','margin_free']):return {'outcome':'not_submitted','reason':'equity_or_margin_unavailable'}
 side=m.ORDER_TYPE_BUY if buy else m.ORDER_TYPE_SELL
 unit=m.order_calc_profit(side,s.name,s.volume_min,price,signal['stop'])
 if not finite(unit) or unit>=0:return {'outcome':'not_submitted','reason':'broker_loss_calculation_unavailable'}
 # Demo-only conservative reserve: twice stop loss; NOT verified transaction costs.
 budget=a.equity*min(.005,limits['perTrade'])
 lots=math.floor(min(s.volume_max,budget/(-unit/s.volume_min*2))/s.volume_step+1e-10)*s.volume_step
 lots=round(lots,8)
 if not positive(lots) or lots<s.volume_min:return {'outcome':'not_submitted','reason':'minimum_lot_exceeds_risk_budget'}
 loss=m.order_calc_profit(side,s.name,lots,price,signal['stop']);margin=m.order_calc_margin(side,s.name,lots,price)
 if not finite(loss) or loss>=0 or not positive(margin) or margin>a.margin_free:return {'outcome':'not_submitted','reason':'broker_sizing_or_margin_check_failed'}
 reserved=-loss*2;daily_loss=max(0,day['openingEquity']+day['netExternalFlow']-a.equity)
 if reserved>a.equity*limits['perTrade'] or reserved>a.equity*limits['total'] or daily_loss+reserved>day['openingEquity']*limits['dailyEntryStop']:return {'outcome':'not_submitted','reason':'risk_limit'}
 intent={**signal,'lots':lots,'entry':price,'account':str(a.login),'server':a.server,'plannedLossWithDemoReserve':reserved,'costsVerified':False}
 request={'action':m.TRADE_ACTION_DEAL,'symbol':s.name,'type':side,'price':price,'sl':signal['stop'],'tp':signal['target'],'volume':lots,'magic':MAGIC,'deviation':20,'comment':signal['signalId'][:24],'type_filling':filling(m,s)}
 check=m.order_check(request)
 if check is None or check.retcode!=0:return {'outcome':'not_submitted','reason':'broker_order_check_rejected','retcode':getattr(check,'retcode',None)}
 if not journal.reserve(signal['signalId'],intent):return {'outcome':'not_submitted','reason':'signal_already_journaled'}
 try:
  response=m.order_send(request)
  if response is not None and response.retcode in [10006,10013,10014,10015,10016,10017,10018,10019,10021,10027,10030]:result={'status':'rejected','retcode':response.retcode}
  else:result=protect(m,intent,reconcile(m,intent)) if response is not None else {'status':'unknown'}
 except Exception:result={'status':'unknown'}
 journal.finish(signal['signalId'],result)
 return {'outcome':'journaled','result':result}

def cycle(m,payload,journal):
 if payload.get('liveAuthorized') is not False or payload.get('limits')!={'perTrade':.05,'total':.15,'dailyEntryStop':.30}:raise RuntimeError('Unchanged limits and demo mode required')
 a=m.account_info();binding=payload['binding'];market=payload['market']
 if a.trade_mode!=0 or a.login!=binding['login'] or a.server!=binding['server'] or market['account']['identity']!=str(a.login) or market['account']['server']!=a.server or not finite(market['account'].get('observedAt')) or not -1000<=time.time()*1000-market['account']['observedAt']<=15000:raise RuntimeError('Demo binding or freshness changed')
 for id,intent,old in journal.active():journal.finish(id,protect(m,intent,reconcile(m,intent)))
 payload={**payload,'day':demo_day(m,payload,journal)}
 terminal=m.terminal_info();account=m.account_info();now=time.time()*1000
 capable=sum(1 for row in market.get('instruments',[]) if row.get('capability') is True and finite(row.get('quoteAt')) and -1000<=now-row['quoteAt']<=15000)
 checks={'terminalTradeAllowed':getattr(terminal,'trade_allowed',None) is True,'externalTradeApiAllowed':getattr(terminal,'tradeapi_disabled',None) is False,'accountTradeAllowed':getattr(account,'trade_allowed',None) is True,'accountExpertAllowed':getattr(account,'trade_expert',None) is True,'capableProducts':capable,'dayVerified':payload['day'].get('verified') is True,'observedAt':now}
 permissions=all(checks[k] for k in ['terminalTradeAllowed','externalTradeApiAllowed','accountTradeAllowed','accountExpertAllowed'])
 audit_id=signal_audit.begin(journal.db,payload,checks);attempts=[]
 try:
  if not journal.blocked() and permissions and capable:
   for signal in payload.get('signals',[])[:1]:attempts.append({'symbol':signal.get('symbol'),'signalId':signal.get('signalId'),'outcome':enter(m,signal,payload,journal)})
  result={'mode':'demo-only','status':'blocked' if journal.blocked() else 'waiting-terminal' if not permissions else 'waiting-market' if not capable else 'waiting-day' if not payload['day'].get('verified') else 'observing','executionEnabled':not journal.blocked() and permissions and capable>0 and payload['day'].get('verified') is True,'checks':checks,'liveAuthorized':False,'profitabilityProven':False,'costsVerified':False,'riskReserve':'2x stop loss; experimental demo assumption','events':journal.events()}
 except Exception as error:
  # Keep the started record if even completion logging fails; never retry orders.
  signal_audit.finish(journal.db,audit_id,{'status':'cycle_error','errorType':type(error).__name__},attempts)
  raise
 try:signal_audit.finish(journal.db,audit_id,{'status':result['status'],'executionEnabled':result['executionEnabled']},attempts);result['signalHistory']={'cycleId':audit_id,'status':'recorded'}
 except Exception:result['signalHistory']={'cycleId':audit_id,'status':'completion_write_failed'}
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--terminal',required=True);p.add_argument('--login',type=int,required=True);p.add_argument('--server',required=True);p.add_argument('--operation',choices=['cycle','protect'],required=True);args=p.parse_args()
 raw=sys.stdin.read(1048577)
 if len(raw)>1048576:raise RuntimeError('Oversized demo payload')
 payload=json.loads(raw);binding=payload['binding']
 if binding.get('requireDemo') is not True or binding.get('portable') is not True or binding.get('executionEnabled') is not False or binding.get('login')!=args.login or binding.get('server')!=args.server or os.path.normcase(os.path.abspath(binding['terminal']))!=os.path.normcase(os.path.abspath(args.terminal)):raise RuntimeError('Strict demo profile required')
 # Cross-process lock remains held through the broker operation, including crashes.
 lock=open(payload['journal']+'.lock','a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
 if os.name=='nt':
  import msvcrt;msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
 else:
  import fcntl;fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
 import MetaTrader5 as mt5
 offset=payload['market'].get('clockProof',{}).get('offsetSeconds',0) if payload['market'].get('clockProof') else 0
 if not finite(offset) or abs(offset)>14*3600:raise RuntimeError('Invalid broker clock')
 power_file=Path(__file__).resolve().parents[1]/'artifacts/founder-integration-20261012/power-state.jsonl'
 controller_file=Path(__file__).resolve().parents[1]/'artifacts/founder-autonomy-20261013/controller.db'
 def power():return operating_power(power_file,controller_file)
 protecting=args.operation=='protect'
 if not protecting and not power():raise RuntimeError('Manual power is OFF or unreadable')
 broker=DemoExecutionBroker(mt5,args.terminal,args.login,args.server,offset=offset,power=power,close_only=protecting);journal=Journal(payload['journal'])
 try:
  if not broker.initialize(args.terminal):raise RuntimeError('Demo terminal unavailable')
  result=protect_only(broker,journal) if protecting else cycle(broker,payload,journal)
  try:
   report=Path(__file__).resolve().parents[1]/'artifacts/demo-execution-20261017/signal-history.html'
   temp=report.with_suffix('.tmp');temp.write_text(signal_audit.render(journal.db),encoding='utf-8');temp.replace(report)
  except Exception:result['signalHistoryReport']='write_failed'
  print(json.dumps(result,allow_nan=False))
 finally:broker.shutdown();journal.close();lock.close()

if __name__=='__main__':main()
