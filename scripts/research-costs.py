"""Research overlay only: booked costs are facts, historical tariff projections are scenarios."""
import json,math,ast,inspect,sqlite3,hashlib
from datetime import datetime,timezone,timedelta
VERSION='five-crypto-h4-costs-2'
SYMBOLS=['BCHUSD','LTCUSD','BTCUSD','ETHUSD','XRPUSD']
def setup(db):
 db.executescript('CREATE TABLE IF NOT EXISTS research_cost_evidence(id INTEGER PRIMARY KEY,at REAL,payload TEXT);CREATE TABLE IF NOT EXISTS research_cost_cache(k TEXT PRIMARY KEY,payload TEXT);')
 db.execute('CREATE TABLE IF NOT EXISTS research_cost_attempts(symbol TEXT PRIMARY KEY,at REAL,status TEXT)')
def latest(db,policy,symbol=None):
 row=db.execute("SELECT payload FROM research_cost_evidence WHERE (? IS NULL OR COALESCE(json_extract(payload,'$.symbol.name'),'BCHUSD')=?) ORDER BY id DESC LIMIT 1",(symbol,symbol)).fetchone()
 if not row:return None
 e=json.loads(row[0])
 if e['binding']!={'account':policy['account'],'server':policy['server']}:raise ValueError('Cost evidence account mismatch')
 return e
def capture_next(db,broker,policy,allowed,now):
 if not allowed():return 'off'
 setup(db)
 attempts={name:at for name,at in db.execute('SELECT symbol,at FROM research_cost_attempts')}
 for name in sorted(SYMBOLS,key=lambda name:attempts.get(name,0)):
  e=latest(db,policy,name)
  if not e or not 0<=now-e['observedAt']<3600:
   if not allowed():return 'off'
   db.execute('INSERT OR REPLACE INTO research_cost_attempts VALUES(?,?,?)',(name,now,'attempted'));db.commit()
   status=capture(db,broker,policy,allowed,now,name)
   if allowed():db.execute('UPDATE research_cost_attempts SET status=? WHERE symbol=?',(status,name));db.commit()
   return status
 return 'cached'
def capture(db,broker,policy,allowed,now,symbol_name='BCHUSD'):
 if not allowed():return 'off'
 if symbol_name not in SYMBOLS:raise ValueError('Unsupported cost product')
 setup(db);e=latest(db,policy,symbol_name)
 if e and 0<=now-e['observedAt']<3600:return 'cached'
 a=broker.account_info()
 if str(a.login)!=policy['account'] or a.server!=policy['server'] or a.trade_mode!=0:raise ValueError('Bound demo cost evidence required')
 if not allowed():return 'off'
 symbol=broker.symbol_info(symbol_name)
 if symbol is None or getattr(symbol,'name',None)!=symbol_name:return 'symbol_unavailable'
 if not allowed():return 'off'
 deals=broker.history_deals_get(datetime.fromtimestamp(now,timezone.utc)-timedelta(days=30),datetime.fromtimestamp(now,timezone.utc)+timedelta(days=1))
 if deals is None:return 'history_unavailable'
 if len(deals)>10000:return 'history_capacity_exceeded'
 if not allowed():return 'off'
 positions=broker.positions_get(symbol=symbol_name)
 if positions is None:return 'positions_unavailable'
 selected={int(d.ticket):d for d in deals if d.symbol==symbol_name}
 def finite(v):return isinstance(v,(int,float)) and math.isfinite(v)
 if any(not all(finite(getattr(d,k,None)) for k in ['commission','swap','fee']) for d in selected.values()):return 'invalid_bookings'
 if any(not finite(getattr(p,'swap',None)) for p in positions):return 'invalid_position_swap'
 fields=['name','point','trade_contract_size','currency_profit','swap_mode','swap_long','swap_short','swap_rollover3days']
 e={'version':VERSION,'binding':{'account':str(a.login),'server':a.server},'observedAt':now,'historyFrom':now-30*86400,'historyTo':now+86400,'accountCurrency':a.currency,'symbol':{k:getattr(symbol,k,None) for k in fields},'dealCount':len(selected),'dealIds':sorted(selected),'bookedTotals':{k:sum(getattr(d,k) for d in selected.values()) for k in ['commission','swap','fee']},'openPositionSwaps':[{'position':p.ticket,'swap':p.swap} for p in positions], 'unattributedCashDealCount':sum(not d.symbol and any(getattr(d,k,0)!=0 for k in ['commission','swap','fee']) for d in deals),'commissionTariffVerified':False,'swapBillingVerified':False,'historicalTariffVerified':False,'source':'Bound demo MT5 symbol_info/history_deals_get/positions_get','scheduleSource':'https://admiralmarkets.com/cadmin/documents/en/amcy/key_information_document_cfd_on_a_cryptocurrency','scheduleStatus':'Published four-hour EET interval; account-specific calculation and historical applicability unconfirmed'}
 if not allowed():return 'off'
 db.execute('INSERT INTO research_cost_evidence(at,payload) VALUES(?,?)',(now,json.dumps(e,allow_nan=False)))
 db.execute('DELETE FROM research_cost_evidence WHERE id < (SELECT MAX(id)-999 FROM research_cost_evidence)');db.commit()
 return 'captured'
def trade_cost(t,e,bps):
 s=e.get('symbol',{})
 if s.get('swap_mode')!=5:return None
 rate=s.get('swap_long' if t['side']==1 else 'swap_short')
 if not isinstance(rate,(int,float)) or not math.isfinite(rate):return None
 # Bar timestamps retain broker server labels. EET/seasonal alignment is not verified.
 # Annual rate prorated by 4/24; never apply six full daily charges.
 crossings=max(0,t['exitTime']//14400-t['entryTime']//14400)
 funding=t['entry']*max(0,-rate)/100/360/6*crossings/t['risk']
 stressfunding=t['entry']*max(0,-rate)/100/360/6*(crossings+1)*2/t['risk']
 exitprice=t['entry']+t['side']*t['risk']*t['grossR']
 commission=(t['entry']+max(0,exitprice))*bps/10000/t['risk']
 return {'fundingR':funding,'commissionR':commission,'R':t['grossR']-t['spread']/t['risk']-funding-commission,'stressR':t['grossR']-2*t['spread']/t['risk']-stressfunding-2*commission}
def replay(evaluate,b,lookback,point,split):
 # Instrument the pure evaluator, then require exact equality of all original outputs.
 tree=ast.parse(inspect.getsource(evaluate));fn=tree.body[0];fn.name='cost_replay';fn.body.insert(0,ast.parse('ledger=[]').body[0])
 class Instrument(ast.NodeTransformer):
  def visit_If(self,node):
   self.generic_visit(node)
   if ast.unparse(node.test)=='outcome is not None':
    return [ast.parse("ledger.append(dict(profile=profile,segment=segment,entryTime=entrybar['time'],exitTime=b[end]['time']+seconds,side=side,entry=entry,risk=distance,spread=spread,kind=kind,grossR=outcome))").body[0],node]
   return node
 tree=Instrument().visit(tree)
 for node in ast.walk(tree):
  if isinstance(node,ast.Return):node.value.keys.append(ast.Constant('ledger'));node.value.values.append(ast.Name('ledger',ast.Load()))
 ns={'math':math};exec(compile(ast.fix_missing_locations(tree),'<research-cost-overlay>','exec'),ns)
 result=ns['cost_replay'](b,14400,lookback,point,split);ledger=result.pop('ledger')
 if result!=evaluate(b,14400,lookback,point,split):raise ValueError('Cost replay changed research rules')
 for profile in ['baseline','spread','trend']:
  for segment in ['development','validation']:
   trades=[t for t in ledger if t['profile']==profile and t['segment']==segment and t['kind']=='complete']
   expected=result['profiles'][profile][segment]
   if len(trades)!=expected['complete'] or not math.isclose(sum(t['grossR']-t['spread']/t['risk'] for t in trades),expected['priceScenarioR'],abs_tol=1e-9):raise ValueError('Cost trade ledger failed reconciliation')
 return ledger
def _overlay_symbol(db,policy,evaluate,now,symbol):
 setup(db);e=latest(db,policy,symbol)
 if not e:return {'status':'evidence_pending','netProfitVerified':False}
 age=now-e['observedAt']
 if age<0 or age>7200:return {'status':'evidence_stale','netProfitVerified':False,'evidence':e}
 rows=db.execute("SELECT payload FROM bars WHERE symbol=? AND tf='H4' ORDER BY t",(symbol,)).fetchall();b=[json.loads(x[0]) for x in rows]
 if not b:return {'status':'bars_pending','netProfitVerified':False,'evidence':e}
 state=db.execute("SELECT status FROM jobs WHERE symbol=? AND tf='H4'",(symbol,)).fetchone()
 key=hashlib.sha256((VERSION+str(state)+json.dumps(e,sort_keys=True)+inspect.getsource(evaluate)+str(policy['splitAt'])+''.join(x[0] for x in rows)).encode()).hexdigest()
 cached=db.execute('SELECT payload FROM research_cost_cache WHERE k=?',(key,)).fetchone()
 if cached:return json.loads(cached[0])
 point=e['symbol'].get('point')
 if not isinstance(point,(int,float)) or not math.isfinite(point) or point<=0:return {'status':'invalid_contract_terms','netProfitVerified':False,'evidence':e}
 studies=[]
 for lookback in [20,40]:
  ledger=replay(evaluate,b,lookback,point,policy['splitAt'])
  for profile in ['baseline','spread','trend']:
   for segment in ['development','validation']:
    accepted=[t for t in ledger if t['profile']==profile and t['segment']==segment];complete=[t for t in accepted if t['kind']=='complete']
    for bps in [0,5,10]:
     costs=[trade_cost(t,e,bps) for t in complete];known=[c for c in costs if c is not None]
     studies.append({'symbol':symbol,'timeframe':'H4','profile':profile,'lookback':lookback,'segment':segment,'assumedCommissionBpsPerSide':bps,'complete':len(complete),'unknownPaths':len(accepted)-len(complete),'unknownCostCases':len(costs)-len(known),'fundingR':sum(c['fundingR'] for c in known) if len(known)==len(costs) else None,'scenarioR':sum(c['R'] for c in known) if known and len(known)==len(costs) else None,'stressScenarioR':sum(c['stressR'] for c in known) if known and len(known)==len(costs) else None})
 result={'status':'current_terms_scenarios','version':VERSION,'netProfitVerified':False,'executionEnabled':False,'automaticPromotion':False,'evidence':e,'bars':len(b),'studies':studies,'limitations':['Booked EUR costs are evidence for observed demo deals only; never applied to hypothetical trades or interpreted as a zero commission tariff.','Current annual swaps projected into history using entry price, four-hour server-labelled boundaries and360-day year. Exact EET alignment, current-price reference, billing, historical tariffs and FX conversion remain unverified.','Annual rate is prorated by1/6 per four-hour interval. Stress doubles financing and adds one interval.','Spread is already in bid/ask entry/exit proxies; extra one/two spreads are slippage scenarios, not another spread fee.','Commission0/5/10bps per side are assumptions, not confirmed tariffs. No verified EUR/CHF net profit.','Intrabar exit time conservatively uses bar end; ambiguous and incomplete paths remain unknown.']}
 result.update(symbol=symbol,oldest=b[0]['time'],newest=b[-1]['time'])
 state=db.execute("SELECT status FROM jobs WHERE symbol=? AND tf='H4'",(symbol,)).fetchone()
 result['provisional']=not state or state[0]!='complete_requested_range'
 db.execute("DELETE FROM research_cost_cache WHERE json_extract(payload,'$.symbol')=? OR json_extract(payload,'$.symbol') IS NULL",(symbol,));db.execute('INSERT INTO research_cost_cache VALUES(?,?)',(key,json.dumps(result,allow_nan=False)));db.commit()
 return result

def overlay(db,policy,evaluate,now):
 products={name:_overlay_symbol(db,policy,evaluate,now,name) for name in SYMBOLS}
 studies=[]
 for name,result in products.items():
  for study in result.get('studies',[]):studies.append({**study,'provisional':result.get('provisional',True),'oldest':result['oldest'],'newest':result['newest']})
 statuses={r['status'] for r in products.values()}
 comparison=[]
 for row in studies:
  if row['segment']!='validation' or row['assumedCommissionBpsPerSide']!=5:continue
  earlier=next(s for s in studies if s['symbol']==row['symbol'] and s['profile']==row['profile'] and s['lookback']==row['lookback'] and s['segment']=='development' and s['assumedCommissionBpsPerSide']==5)
  comparison.append({'symbol':row['symbol'],'profile':row['profile'],'lookback':row['lookback'],'validationCases':row['complete'],'validationR':row['scenarioR'],'validationStressR':row['stressScenarioR'],'totalR':row['scenarioR']+earlier['scenarioR'] if row['scenarioR'] is not None and earlier['scenarioR'] is not None else None,'totalStressR':row['stressScenarioR']+earlier['stressScenarioR'] if row['stressScenarioR'] is not None and earlier['stressScenarioR'] is not None else None,'unknownPaths':row['unknownPaths']+earlier['unknownPaths'],'unknownCostCases':row['unknownCostCases']+earlier['unknownCostCases'],'oldest':row['oldest'],'newest':row['newest'],'provisional':row['provisional']})
 attempts=[dict(symbol=name,at=at,status=status) for name,at,status in db.execute('SELECT symbol,at,status FROM research_cost_attempts')]
 return {'version':VERSION,'status':'current_terms_scenarios' if studies else 'evidence_stale' if 'evidence_stale' in statuses else 'evidence_pending','netProfitVerified':False,'executionEnabled':False,'automaticPromotion':False,'products':products,'studies':studies,'comparisonAt5BpsPerSide':comparison,'captureAttempts':attempts,'comparisonPolicy':'Compare identical cost scenarios and matching oldest/newest coverage; provisional data, unknown costs, paths and differing small samples preclude a validated winner. No verified net returns.'}
