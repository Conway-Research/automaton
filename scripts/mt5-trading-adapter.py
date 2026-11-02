"""Account-bound MT5 adapter. CLI exposes readonly collection only; execution requires explicit in-process authorization."""
import math,time,json,argparse,importlib.util,hashlib
from pathlib import Path
_clock_spec=importlib.util.spec_from_file_location("numaron_readonly_clock",Path(__file__).with_name("mt5-market-readonly.py"))
_clock_module=importlib.util.module_from_spec(_clock_spec);_clock_spec.loader.exec_module(_clock_module)
_credit_spec=importlib.util.spec_from_file_location('numaron_demo_credit',Path(__file__).with_name('mt5-demo-credit-proof.py'))
_credit_module=importlib.util.module_from_spec(_credit_spec);_credit_spec.loader.exec_module(_credit_module)
from datetime import datetime,timezone,timedelta

def read_cost_terms(symbol):
 """Raw broker contract terms; never a complete account-currency cost proof."""
 def finite(name):
  value=getattr(symbol,name,None)
  return value if isinstance(value,(int,float)) and math.isfinite(value) else None
 return {'source':'MT5 symbol_info','verified':False,'observedAt':int(time.time()*1000),
  'swapLong':finite('swap_long'),'swapShort':finite('swap_short'),'swapMode':finite('swap_mode'),
  'tripleSwapWeekday':finite('swap_rollover3days'),'profitCurrency':getattr(symbol,'currency_profit',None),
  'contractSize':finite('trade_contract_size'),'marginCurrency':getattr(symbol,'currency_margin',None),'tickSize':finite('trade_tick_size'),
  'tickValue':finite('trade_tick_value'),'path':getattr(symbol,'path',None),'point':finite('point'),'commission':None,'slippage':None,
  'missing':['commission','slippage','holding-period financing in account currency'],
  'note':'Swap values require swap mode, holding period and currency conversion; they are not CHF costs.'}

def round_volume(value,symbol):
 if not all(math.isfinite(v) and v>0 for v in [value,symbol.volume_min,symbol.volume_max,symbol.volume_step]):return 0
 n=math.floor(min(value,symbol.volume_max)/symbol.volume_step+1e-10)*symbol.volume_step
 return round(n,8) if n+1e-10>=symbol.volume_min else 0

def costs_valid(c,currency):
 return isinstance(c,dict) and c.get('verified') is True and c.get('currency')==currency and c.get('source') and all(isinstance(c.get(k),(int,float)) and math.isfinite(c[k]) and c[k]>=0 for k in ['commissionPerLot','slippagePerLot','financingPerLot']) and c.get('expiresAt',0)>time.time()

def require_authorization(auth,action,account):
 if not isinstance(auth,dict) or auth.get('enabled') is not True or auth.get('login')!=account['login'] or auth.get('server')!=account['server'] or action not in auth.get('actions',[]) or auth.get('expiresAt',0)<=time.time():raise RuntimeError('Explicit account-bound authorization required')

def broker_size(m,signal,risk_budget,costs):
 a=m.account_info();s=m.symbol_info(signal['symbol'])
 if a is None or s is None or not costs_valid(costs,a.currency):return {'reasons':['Complete verified account-currency costs required'],'costsVerified':False}
 entry,stop,target=signal['entry'],signal['stop'],signal['target'];side=signal['side']
 if not(side=='BUY' and 0<stop<entry<target or side=='SELL' and 0<target<entry<stop):return {'reasons':['Invalid protection prices'],'costsVerified':False}
 action=m.ORDER_TYPE_BUY if side=='BUY' else m.ORDER_TYPE_SELL
 loss=m.order_calc_profit(action,s.name,s.volume_min,entry,stop)
 if loss is None or not math.isfinite(loss) or loss>=0:return {'reasons':['Broker loss calculation unavailable'],'costsVerified':False}
 cost=sum(costs[k] for k in ['commissionPerLot','slippagePerLot','financingPerLot']);unit=-loss/s.volume_min+cost
 lots=round_volume(risk_budget/unit,s)
 if not lots:return {'reasons':['Minimum lot exceeds budget'],'costsVerified':False}
 actual=m.order_calc_profit(action,s.name,lots,entry,stop);margin=m.order_calc_margin(action,s.name,lots,entry)
 if actual is None or margin is None or not math.isfinite(actual) or not math.isfinite(margin) or margin<=0:return {'reasons':['Broker sizing unavailable'],'costsVerified':False}
 return {'lots':lots,'plannedLoss':-actual+lots*cost,'margin':margin,'costsVerified':True,'reasons':[]}

def read_quote_continuity(m,name,offset,now_ms):
 """Stricter enrollment only. Never backfill or clear a forward coverage gap."""
 result={'version':'tick-continuity-admission-1','eligible':False,'windowMs':60000,'gapLimitMs':15000,'maxGapMs':None,'ticks':0,'reason':'tick-history-unavailable'}
 begin_ms=now_ms-60000
 try:
  begin=datetime.fromtimestamp((begin_ms+offset*1000)/1000,timezone.utc)
  ticks=m.copy_ticks_from(name,begin,10000,m.COPY_TICKS_ALL)
  if ticks is None:return result
  times=[]
  for tick in ticks:
   raw,bid,ask=tick['time_msc'],tick['bid'],tick['ask']
   if not all(math.isfinite(float(x)) for x in [raw,bid,ask]) or bid<=0 or ask<bid:
    return {**result,'reason':'invalid-tick-history'}
   stamp=int(raw)-offset*1000
   # MT5's datetime query boundary is second-resolution; discard its prefix.
   if stamp<begin_ms:continue
   if stamp>now_ms or (times and stamp<times[-1]):return {**result,'reason':'invalid-tick-history'}
   if not times or stamp!=times[-1]:times.append(stamp)
  if len(times)<5:return {**result,'ticks':len(times),'reason':'insufficient-tick-history'}
  # Include both boundaries; a truncated or stale window cannot pass.
  gaps=[times[0]-begin_ms,now_ms-times[-1]]+[b-a for a,b in zip(times,times[1:])]
  largest=max(gaps)
  return {**result,'eligible':largest<=15000,'maxGapMs':largest,'ticks':len(times),'reason':None if largest<=15000 else 'tick-gap'}
 except Exception:return result

def read_watch_quotes(m,names,offset):
 rows=[]
 for name in list(dict.fromkeys(names))[:100]:
  if not isinstance(name,str) or len(name)>80:continue
  tick=m.symbol_info_tick(name)
  if tick is None:continue
  if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in [tick.bid,tick.ask,tick.time_msc]):continue
  rows.append({'symbol':name,'bid':tick.bid,'ask':tick.ask,'quoteAt':tick.time_msc-offset*1000,'rawQuoteAt':tick.time_msc,'clockOffsetSeconds':offset})
 return rows

def _history_record_digest(d):
 return hashlib.sha256(json.dumps([d.ticket,d.type,d.time_msc,d.profit,d.commission,d.swap,getattr(d,'fee',0),d.symbol,getattr(d,'comment','')],ensure_ascii=True).encode()).hexdigest()


def _read_day_history_once(m,window,offset,now_ms,binding=None):
 """Collect a deliberately wider interval; quote clock is not proof of deal clock."""
 failed={'complete':False,'windowVerified':False,'cashFlows':None,'reason':'Broker history incomplete or unclassified.'}
 if not window or not all(isinstance(window.get(k),(int,float)) and math.isfinite(window[k]) for k in ['startsAt','endsAt']):return failed
 if not window['startsAt']<=now_ms<window['endsAt']:return failed
 begin=datetime(1970,1,1,tzinfo=timezone.utc)+timedelta(milliseconds=window['startsAt']-86400000)
 end=datetime(1970,1,1,tzinfo=timezone.utc)+timedelta(milliseconds=now_ms+86400000)
 deals=m.history_deals_get(begin,end);count=m.history_deals_total(begin,end)
 if deals is None:return {**failed,'reasonCode':'history-read-unavailable','retryableHistory':count in (None,0)}
 if count is None or count!=len(deals):return {**failed,'reasonCode':'history-count-mismatch','retryableHistory':len(deals)==0,'minimumRecordCount':count if isinstance(count,int) and count>0 else 0}
 rows=[];ids=set()
 for d in deals:
  values=[d.profit,d.commission,d.swap,getattr(d,'fee',0),d.time_msc]
  if d.ticket in ids or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in values):return failed
  ids.add(d.ticket)
  kind='external' if d.type==m.DEAL_TYPE_BALANCE else 'trading' if d.type in [m.DEAL_TYPE_BUY,m.DEAL_TYPE_SELL] else None
  if kind is None:return failed
  if kind=='external' and (d.commission or d.swap or getattr(d,'fee',0)):return failed
  rows.append({'id':str(d.ticket),'kind':kind,'amount':sum(values[:4]),'rawTime':d.time_msc,'estimatedTime':d.time_msc-offset*1000,'symbol':d.symbol,'commission':d.commission,'swap':d.swap,'fee':getattr(d,'fee',0)})
 digests=[_history_record_digest(d) for d in deals]
 failed['observedRecordDigests']=digests
 # A 14-hour guard covers UTC and civil server offsets without treating quote
 # time as proof of deal time. Only absence throughout this guard is conclusive.
 day_rows=[r for r in rows if window['startsAt']-14*3600000<=r['rawTime']<=now_ms+14*3600000]
 empty=not day_rows
 # A broker mail with an opening balance received before this Zurich day can
 # anchor one exact initial demo credit without guessing its transaction clock.
 # No general deposit/trading timestamp conversion is implied by this exception.
 if not empty and binding and binding.get('server')=='AdmiralsGroup-Demo':
  receipt=_credit_module.load_receipt()
  if receipt is None:return {**failed,'reasonCode':'opening-credit-receipt-unavailable','reason':'Beleg der Demo-Startgutschrift derzeit nicht lesbar oder ungültig.'}
  if receipt is not None and len(rows)==1:
   lifetime=m.history_deals_get(datetime(1970,1,1,tzinfo=timezone.utc),end)
   lifetime_count=m.history_deals_total(datetime(1970,1,1,tzinfo=timezone.utc),end)
   if (lifetime is not None and len(lifetime)>1) or (isinstance(lifetime_count,int) and lifetime_count>1):return {**failed,'reasonCode':'opening-credit-additional-deals','reason':'Weitere Buchungen in der vollständigen Historie; Startgutschrift allein genügt nicht.'}
   if lifetime is None or len(lifetime)==0:return {**failed,'reasonCode':'opening-credit-lifetime-incomplete','retryableHistory':True,'reason':'Vollständige Brokerhistorie vorübergehend nicht konsistent lesbar.'}
   if lifetime_count!=len(lifetime):return {**failed,'reasonCode':'opening-credit-lifetime-count-mismatch','reason':'Anzahl und Inhalte der vollständigen Brokerhistorie widersprechen sich.'}
   if _history_record_digest(lifetime[0])!=digests[0]:return {**failed,'reasonCode':'opening-credit-history-conflict','reason':'Tageszeitraum und vollständige Historie melden unterschiedliche Buchungsinhalte.'}
   account=m.account_info();positions=m.positions_get();orders=m.orders_get()
   if account is None or positions is None or orders is None:return {**failed,'reasonCode':'opening-credit-account-incomplete','retryableHistory':True,'reason':'Kontobestand während des Historienabgleichs unvollständig.'}
   if account is not None and lifetime is not None and lifetime_count==len(lifetime)==1 and str(account.login)==binding.get('account') and account.server==binding.get('server') and str(lifetime[0].ticket)==rows[0]['id'] and lifetime[0].time_msc==rows[0]['rawTime']:
    proof=_credit_module.verify_demo_opening_credit(receipt,account,lifetime,window,now_ms,positions=positions,orders=orders)
    if proof is not None and _credit_module.verify_demo_opening_credit(receipt,account,deals,window,now_ms,positions=positions,orders=orders) is not None:
     return {**binding,'complete':True,'windowVerified':True,'cashFlows':[],'flowWindow':window,'source':'MT5 history_deals_get + history_deals_total','observedAt':now_ms,'wideIntervalEmpty':False,'dayIntervalEmpty':True,'recordCount':len(rows),'observedRecordDigests':digests,'timeGuardHours':14,'priorDayCreditProof':proof,'excludedPriorDayRecords':rows,'reason':None}
 return {**(binding or {}),'complete':True,'windowVerified':empty,'cashFlows':[] if empty else rows,'flowWindow':window,'source':'MT5 history_deals_get + history_deals_total','observedAt':now_ms,'wideIntervalEmpty':not rows,'dayIntervalEmpty':empty,'recordCount':len(rows),'timeGuardHours':14,'reasonCode':None if empty else 'opening-credit-evidence-rejected','reason':None if empty else 'Buchungshistorie oder Startgutschrift nicht vollständig bestätigt; Beleg, Kontobestand und Buchungsdaten müssen übereinstimmen.'}

def read_day_history(m,window,offset,now_ms,binding=None):
 """Retry a transient incomplete read once; never reuse a prior verified result."""
 previous=None;seen=set();minimum=0
 for attempt in (1,2):
  result=_read_day_history_once(m,window,offset,now_ms,binding)
  result['historyReadAttempts']=attempt
  if result.get('windowVerified') and (not seen.issubset(set(result.get('observedRecordDigests',[]))) or result.get('recordCount',0)<minimum):return {'complete':False,'windowVerified':False,'cashFlows':None,'historyReadAttempts':attempt,'reasonCode':'history-records-changed-during-retry','reason':'Bereits beobachtete Buchungen fehlen oder unterscheiden sich beim erneuten Historienabgleich.'}
  seen.update(result.get('observedRecordDigests',[]));minimum=max(minimum,result.get('minimumRecordCount',0))
  if previous is not None:result['retriedAfter']=previous
  if not result.get('retryableHistory') or attempt==2:return result
  previous=result.get('reasonCode')


CRYPTO_SCAN_SYMBOLS=frozenset(['BTCUSD','BTCEUR','ETHUSD','ETHEUR','LTCUSD','LTCEUR',
 'XRPUSD','XRPEUR','BCHUSD','BCHEUR','ADAUSD','DOTUSD','DGEUSD','LNKUSD','SOLUSD','UNIUSD','XLMUSD'])

def select_scan(m,universe,start,server,mode,clock):
 """Demo-only priority reads. Eligibility and order gates remain independent."""
 start=start%len(universe) if universe else 0
 priority=[];catalog=[]
 if server=='AdmiralsGroup-Demo' and mode==0 and clock is not None:
  now=time.time();offset=clock['offsetSeconds']
  for s in universe:
   if s.name not in CRYPTO_SCAN_SYMBOLS and not str(getattr(s,'path','')).lower().startswith('cryptocurrencies\\'):continue
   item={'symbol':s.name,'tradeMode':s.trade_mode,'reason':None};catalog.append(item)
   if not s.visible:item['reason']='Market subscription unavailable';continue
   if s.trade_mode!=getattr(m,'SYMBOL_TRADE_MODE_FULL',4):item['reason']='Trading restricted';continue
   tick=m.symbol_info_tick(s.name)
   if tick is None or not all(isinstance(getattr(tick,k,None),(int,float)) and math.isfinite(getattr(tick,k)) for k in ['time_msc','bid','ask']):item['reason']='Invalid quote';continue
   if not -1<=now-tick.time_msc/1000+offset<=15 or not 0<tick.bid<=tick.ask:item['reason']='Fresh quote unavailable';continue
   priority.append(s)
  # Rotate the priority window too if the broker adds more than ten eligible products.
  if len(priority)>10:
   cursor=(start//40)%len(priority);priority=(priority[cursor:]+priority[:cursor])[:10]
 width=40 if priority else 50
 rotating=universe[start:start+width]
 selected=[];seen=set()
 for s in priority+list(rotating):
  if s.name not in seen:selected.append(s);seen.add(s.name)
 return selected,(start+len(rotating))%len(universe) if universe else 0,{'cryptoPriority':bool(priority),'prioritySymbols':[s.name for s in priority],'cryptoUniverse':catalog,'rotationProducts':len(rotating),'maxProducts':50}

def collect_market(m,terminal,login,server,start=0,watch=(),day_window=None):
 if not m.initialize(terminal,timeout=10000):raise RuntimeError('MT5 initialization failed')
 try:
  a=m.account_info();t=m.terminal_info()
  if a is None or t is None or not t.connected or a.login!=login or a.server!=server:raise RuntimeError('Connected account mismatch')
  universe=m.symbols_get();positions=m.positions_get();orders=m.orders_get()
  if universe is None or positions is None or orders is None:raise RuntimeError('Incomplete account observation')
  clock=_clock_module.read_clock(m,[s for s in universe if s.visible],server,sample_interval=.4)
  offset=clock['offsetSeconds'] if clock else 0
  selected,next_start,scan=select_scan(m,universe,start,server,getattr(a,'trade_mode',None),clock)
  rows=[]
  for s in selected:
   reasons=[]
   if not s.visible and not m.symbol_select(s.name,True):reasons.append('Market subscription unavailable')
   tick=m.symbol_info_tick(s.name)
   if tick is None or (server in _clock_module.BROKER_CLOCK_SERVERS and clock is None) or not -1<=time.time()-tick.time_msc/1000+offset<=15:reasons.append('Fresh quote unavailable')
   if s.trade_mode!=getattr(m,'SYMBOL_TRADE_MODE_FULL',4):reasons.append('Trading restricted')
   history_requested=not reasons
   bars=m.copy_rates_from_pos(s.name,m.TIMEFRAME_M5,1,100) if history_requested else None
   if bars is None or len(bars)<100:reasons.append('History unavailable')
   # All current research entries use breakout20. Query tick history only once
   # a necessary breakout condition holds; every actual entry still needs proof.
   candidate=False
   if not reasons:
    prior=bars[-21:-1];last=bars[-1]
    candidate=bool(last['close']>max(b['high'] for b in prior) and tick.bid>max(b['high'] for b in prior) or last['close']<min(b['low'] for b in prior) and tick.ask<min(b['low'] for b in prior))
   continuity=read_quote_continuity(m,s.name,offset,int(time.time()*1000)) if candidate else None
   if continuity is not None and not continuity['eligible']:reasons.append('Research quote continuity unavailable: '+str(continuity['reason']))
   rows.append({'symbol':s.name,'contractKind':str(getattr(s,'trade_calc_mode','unknown')),'capability':not reasons,'reasons':reasons,'bid':getattr(tick,'bid',None),'ask':getattr(tick,'ask',None),'quoteAt':getattr(tick,'time_msc',0)-offset*1000,'rawQuoteAt':getattr(tick,'time_msc',0),'clockOffsetSeconds':offset,'closedBars':[] if bars is None else [{**{k:float(b[k]) for k in ['open','high','low','close']},'time':float(b['time'])-offset,'rawTime':float(b['time'])} for b in bars],'volumeMin':s.volume_min,'volumeMax':s.volume_max,'volumeStep':s.volume_step,'stopDistance':s.trade_stops_level*s.point,'costEvidence':None,'costTerms':read_cost_terms(s)})
   rows[-1]['researchQuoteCoverage']=continuity
   rows[-1]['historyRead']={'requested':history_requested,'receivedBars':None if bars is None else len(bars)}
  watch_quotes=read_watch_quotes(m,watch,offset) if clock or server not in _clock_module.BROKER_CLOCK_SERVERS else []
  end=m.account_info()
  if end is None or end.login!=login or end.server!=server:raise RuntimeError('Account changed')
  day_history=read_day_history(m,day_window,offset,int(time.time()*1000),{'account':str(login),'server':server}) if day_window else None
  positions=m.positions_get();orders=m.orders_get()
  if positions is None or orders is None:raise RuntimeError('Incomplete final account observation')
  stable=m.account_info()
  if stable is None or stable.login!=login or stable.server!=server or stable.balance!=end.balance or stable.equity!=end.equity:day_history={'complete':False,'windowVerified':False,'cashFlows':None,'reason':'Account changed during history read.'}
  fields=lambda x,n:{k:getattr(x,k) for k in n}
  return {'schemaVersion':1,'clockProof':clock,'scan':scan,'readOnly':True,'executionEnabled':False,'account':{'identity':str(login),'server':server,'company':getattr(end,'company',None),'currency':end.currency,'equity':end.equity,'balance':end.balance,'profit':end.profit,'credit':end.credit,'freeMargin':end.margin_free,'mode':end.trade_mode,'observedAt':int(time.time()*1000)},'instruments':rows,'positions':[fields(p,['ticket','symbol','type','volume','price_open','sl','tp','profit','magic']) for p in positions],'orders':[fields(o,['ticket','symbol','type','volume_current','price_open','sl','tp','magic']) for o in orders],'cashFlows':day_history['cashFlows'] if day_history and day_history.get('windowVerified') else None,'flowWindow':day_window,'dayHistory':day_history,'watchQuotes':watch_quotes,'totalProducts':len(universe),'nextStart':next_start}
 finally:m.shutdown()

# The callable execution boundary is not exposed as a CLI command.
def submit_once(m,request,authorization):
 a=m.account_info()
 if a is None:raise RuntimeError('Account missing')
 require_authorization(authorization,'entry',{'login':a.login,'server':a.server})
 if authorization.get('strategyValidated') is not True or authorization.get('riskAuthorized') is not True or authorization.get('expiresAt',0)>time.time()+15:raise RuntimeError('Fresh strategy/risk authorization required')
 if request.get('magic')!=authorization.get('magic') or request.get('action')!=m.TRADE_ACTION_DEAL or request.get('type') not in [m.ORDER_TYPE_BUY,m.ORDER_TYPE_SELL] or request.get('volume',0)<=0 or request.get('sl',0)<=0 or request.get('tp',0)<=0:raise RuntimeError('Invalid protected entry')
 symbol=m.symbol_info(request['symbol']);tick=m.symbol_info_tick(request['symbol'])
 if symbol is None or tick is None or not -1<=time.time()-tick.time_msc/1000<=15:return {'status':'rejected'}
 buy=request['type']==m.ORDER_TYPE_BUY;entry=tick.ask if buy else tick.bid
 if not(buy and 0<request['sl']<entry<request['tp'] or not buy and 0<request['tp']<entry<request['sl']):return {'status':'rejected'}
 if abs(request.get('price',0)-entry)>symbol.point*request.get('deviation',0):return {'status':'rejected'}
 if abs(round_volume(request['volume'],symbol)-request['volume'])>1e-8:return {'status':'rejected'}
 costs=authorization.get('costs')
 if not costs_valid(costs,a.currency):return {'status':'rejected'}
 positions=m.positions_get();orders=m.orders_get()
 if positions is None or orders is None:return {'status':'unknown'}
 # Netting cannot safely mix external ownership with Numaron's position.
 if a.margin_mode!=getattr(m,'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING',2) and any(p.symbol==request['symbol'] for p in positions):return {'status':'rejected'}
 loss=m.order_calc_profit(request['type'],request['symbol'],request['volume'],entry,request['sl'])
 margin=m.order_calc_margin(request['type'],request['symbol'],request['volume'],entry)
 if loss is None or margin is None or not math.isfinite(loss) or loss>=0 or not math.isfinite(margin) or margin>a.margin_free:return {'status':'rejected'}
 proposed=-loss+request['volume']*sum(costs[k] for k in ['commissionPerLot','slippagePerLot','financingPerLot'])
 if proposed>a.equity*.05:return {'status':'rejected'}
 existing=0
 for p in positions:
  if p.sl<=0:return {'status':'rejected'}
  risk=m.order_calc_profit(p.type,p.symbol,p.volume,p.price_current,p.sl)
  if risk is None or not math.isfinite(risk):return {'status':'rejected'}
  existing+=max(0,-risk)
 for o in orders:
  if o.sl<=0:return {'status':'rejected'}
  side=m.ORDER_TYPE_BUY if o.type in [2,4,6] else m.ORDER_TYPE_SELL if o.type in [3,5,7] else None
  if side is None:return {'status':'rejected'}
  risk=m.order_calc_profit(side,o.symbol,o.volume_current,o.price_open,o.sl)
  if risk is None or not math.isfinite(risk):return {'status':'rejected'}
  existing+=max(0,-risk)
 # Existing portfolio cost reserves are mandatory and bound to the current observation.
 portfolio_costs=authorization.get('portfolioCostReserve')
 daily_remaining=authorization.get('dailyRiskRemaining')
 if not isinstance(portfolio_costs,(int,float)) or not math.isfinite(portfolio_costs) or portfolio_costs<0 or not isinstance(daily_remaining,(int,float)) or not math.isfinite(daily_remaining):return {'status':'rejected'}
 if proposed+existing+portfolio_costs>a.equity*.15 or proposed+existing+portfolio_costs>daily_remaining:return {'status':'rejected'}
 checked=m.order_check(request)
 if checked is None or checked.retcode!=0:return {'status':'rejected'}
 result=m.order_send(request)
 if result is None:return {'status':'unknown'}
 if result.retcode==m.TRADE_RETCODE_DONE:return {'status':'accepted','brokerIds':[str(result.order),str(result.deal)],'filledVolume':result.volume,'filledPrice':result.price,'protectionVerified':False}
 if result.retcode==m.TRADE_RETCODE_DONE_PARTIAL:return {'status':'partial','brokerIds':[str(result.order),str(result.deal)],'protectionVerified':False}
 return {'status':'unknown','retcode':result.retcode}

def reconcile_intent(m,intent,result,authorization):
 a=m.account_info()
 if a is None:raise RuntimeError('Account missing')
 require_authorization(authorization,'reconcile',{'login':a.login,'server':a.server})
 ids=set(str(x) for x in (result or {}).get('brokerIds',[]));positions=m.positions_get();orders=m.orders_get()
 deals=m.history_deals_get(datetime.fromtimestamp(intent['observedAt']/1000,timezone.utc),datetime.now(timezone.utc))
 if positions is None or orders is None or deals is None:return {'status':'unknown'}
 own=[d for d in deals if d.magic==authorization['magic'] and (str(d.ticket) in ids or str(d.order) in ids or d.comment==intent['signalId'][:24])]
 if not own:return {'status':'unknown'}
 position_ids={d.position_id for d in own}
 if any(p.magic!=authorization['magic'] and p.ticket in position_ids for p in positions):return {'status':'unknown'}
 active=[p for p in positions if p.magic==authorization['magic'] and p.ticket in position_ids]
 pending=[o for o in orders if o.magic==authorization['magic'] and str(o.ticket) in ids]
 fills=sum(d.volume for d in own if d.entry==getattr(m,'DEAL_ENTRY_IN',0))
 if active or pending:
  protected=all(p.sl>0 and p.tp>0 and (p.type==m.ORDER_TYPE_BUY and p.sl>=intent['stop'] and p.tp==intent['target'] or p.type==m.ORDER_TYPE_SELL and p.sl<=intent['stop'] and p.tp==intent['target']) for p in active)
  return {'status':'partial' if fills<intent['lots'] else 'accepted','brokerIds':list(ids),'positionIds':[str(p.ticket) for p in active],'protectionVerified':bool(active) and protected}
 all_position_deals=[d for d in deals if d.position_id in position_ids]
 if any(d.magic!=authorization['magic'] for d in all_position_deals):return {'status':'unknown'}
 exits=sum(d.volume for d in all_position_deals if d.entry==getattr(m,'DEAL_ENTRY_OUT',1))
 if fills>0 and exits+1e-8>=fills:return {'status':'closed','finalityVerified':True,'brokerIds':list(ids)}
 return {'status':'unknown'}

def cancel_own_entries(m,known_tickets,authorization):
 a=m.account_info()
 if a is None:raise RuntimeError('Account missing')
 require_authorization(authorization,'cancel',{'login':a.login,'server':a.server})
 orders=m.orders_get()
 if orders is None:return {'status':'unknown'}
 results=[]
 for o in orders:
  if o.magic!=authorization['magic'] or str(o.ticket) not in known_tickets:continue
  r=m.order_send({'action':m.TRADE_ACTION_REMOVE,'order':o.ticket,'magic':authorization['magic']})
  remaining=m.orders_get(ticket=o.ticket)
  results.append({'id':str(o.ticket),'status':'cancelled' if r is not None and r.retcode==m.TRADE_RETCODE_DONE and remaining is not None and not remaining else 'unknown','finalityVerified':remaining is not None and not remaining})
 return results

def manage_exit(m,intent,position_ticket,authorization):
 a=m.account_info()
 if a is None:raise RuntimeError('Account missing')
 require_authorization(authorization,'exit',{'login':a.login,'server':a.server})
 rows=m.positions_get(ticket=int(position_ticket))
 if rows is None:return {'status':'unknown'}
 if len(rows)!=1:return {'status':'unknown'}
 p=rows[0]
 if p.magic!=authorization['magic'] or p.symbol!=intent['symbol'] or (p.type==m.ORDER_TYPE_BUY)!=(intent['side']=='BUY'):raise RuntimeError('Position ownership mismatch')
 if a.margin_mode!=getattr(m,'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING',2):
  history=m.history_deals_get(position=p.ticket)
  if history is None or any(d.magic!=authorization['magic'] for d in history):raise RuntimeError('Mixed netting ownership')
 tick=m.symbol_info_tick(p.symbol)
 if tick is None or not -1<=time.time()-tick.time_msc/1000<=15:return {'status':'unknown'}
 price=tick.bid if p.type==m.ORDER_TYPE_BUY else tick.ask
 reason='stop' if (price<=intent['stop'] if p.type==m.ORDER_TYPE_BUY else price>=intent['stop']) else 'target' if (price>=intent['target'] if p.type==m.ORDER_TYPE_BUY else price<=intent['target']) else 'protection-invalid' if p.sl<=0 or p.tp!=intent['target'] or (p.sl<intent['stop'] if p.type==m.ORDER_TYPE_BUY else p.sl>intent['stop']) else None
 if reason is None:return {'status':'hold'}
 request={'action':m.TRADE_ACTION_DEAL,'position':p.ticket,'symbol':p.symbol,'volume':p.volume,'type':m.ORDER_TYPE_SELL if p.type==m.ORDER_TYPE_BUY else m.ORDER_TYPE_BUY,'price':price,'deviation':authorization['maximumDeviationPoints'],'magic':authorization['magic'],'comment':intent['signalId'][:24],'type_filling':authorization['fillingMode']}
 checked=m.order_check(request)
 if checked is None or checked.retcode!=0:return {'status':'unknown','reason':reason}
 r=m.order_send(request)
 return {'status':'exit-submitted' if r is not None and r.retcode==m.TRADE_RETCODE_DONE else 'unknown','reason':reason,'finalityVerified':False}

if __name__=='__main__':
 import sys
 p=argparse.ArgumentParser();p.add_argument('--terminal',required=True);p.add_argument('--login',required=True,type=int);p.add_argument('--server',required=True);p.add_argument('--start',type=int,default=0);p.add_argument('--watch',action='append',default=[]);p.add_argument('--day-start',type=int);p.add_argument('--day-end',type=int);p.add_argument('--operation',choices=['read','submit','reconcile','cancel','exit'],default='read');args=p.parse_args()
 import MetaTrader5 as mt5
 if args.operation=='read':result=collect_market(mt5,args.terminal,args.login,args.server,args.start,args.watch,{'startsAt':args.day_start,'endsAt':args.day_end} if args.day_start is not None and args.day_end is not None else None)
 else:
  raw=sys.stdin.read(65537)
  if len(raw)>65536:raise RuntimeError('Oversized operation')
  payload=json.loads(raw)
  if not mt5.initialize(args.terminal,timeout=10000):raise RuntimeError('Terminal unavailable')
  try:
   a=mt5.account_info()
   if a is None or a.login!=args.login or a.server!=args.server:raise RuntimeError('Account mismatch')
   auth=payload.get('authorization',{});intent=payload.get('intent',{})
   if args.operation=='submit':
    symbol=mt5.symbol_info(intent['symbol'])
    if symbol is None:raise RuntimeError('Instrument unavailable')
    fill=mt5.ORDER_FILLING_IOC if symbol.filling_mode&2 else mt5.ORDER_FILLING_FOK if symbol.filling_mode&1 else None
    if fill is None:raise RuntimeError('Execution filling mode unsupported')
    request={'action':mt5.TRADE_ACTION_DEAL,'symbol':intent['symbol'],'type':mt5.ORDER_TYPE_BUY if intent['side']=='BUY' else mt5.ORDER_TYPE_SELL,'price':intent['entry'],'sl':intent['stop'],'tp':intent['target'],'volume':intent['lots'],'magic':auth['magic'],'deviation':auth['maximumDeviationPoints'],'comment':intent['signalId'][:24],'type_filling':fill}
    result=submit_once(mt5,request,auth)
   elif args.operation=='reconcile':result=reconcile_intent(mt5,intent,payload.get('result'),auth)
   elif args.operation=='cancel':result=cancel_own_entries(mt5,payload.get('knownTickets',[]),auth)
   else:result=manage_exit(mt5,intent,payload['positionTicket'],auth)
  finally:mt5.shutdown()
 print(json.dumps(result,allow_nan=False))
