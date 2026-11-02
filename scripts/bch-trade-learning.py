"""Repeatable local trade postmortem; no broker, model, order or policy writes."""
import json,math,sqlite3
from contextlib import closing
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def analyze(rows,fills,binding):
 trades=[];totals={}
 for intent,status,result in rows:
  if intent.get('symbol')!='BCHUSD' or any(intent.get(k)!=binding[k] for k in ['account','server']) or status!='closed' or not result or result.get('finalityVerified') is not True:continue
  entry,stop=intent.get('entry'),intent.get('stop');risk=abs(entry-stop) if finite(entry) and finite(stop) else None
  matched=[f for f in fills if f.get('symbol')=='BCHUSD' and f.get('strategyVersion')==intent.get('strategyVersion') and f.get('signalObservedAtUtcMs')==intent.get('observedAt')]
  entries=[f for f in matched if f.get('kind')=='entry'];exits=[f for f in matched if f.get('kind')=='exit']
  opening=entries[0] if len(entries)==1 else None
  closing=exits[0] if len(exits)==1 and opening and exits[0].get('position')==opening.get('position') else None
  spread=(opening.get('capturedSignalQuote') or {}).get('spread') if opening else None
  ratio=spread/risk if finite(spread) and spread>=0 and risk and risk>0 else None
  side=1 if intent.get('side')=='BUY' else -1 if intent.get('side')=='SELL' else None
  price_r=(closing['fillPrice']-opening['fillPrice'])*side/risk if opening and closing and side and risk and all(finite(f.get('fillPrice')) for f in [opening,closing]) else None
  booked={k:sum(f[k] for f in [opening,closing]) if opening and closing and all(finite(f.get(k)) for f in [opening,closing]) else None for k in ['commission','swap','fee']}
  profit=result.get('realizedDemoProfit');currency=result.get('currency')
  if finite(profit) and isinstance(currency,str):totals[currency]=totals.get(currency,0)+profit
  duration=(closing['dealTimeRawMs']-opening['dealTimeRawMs'])/1000 if opening and closing and all(finite(f.get('dealTimeRawMs')) for f in [opening,closing]) and closing['dealTimeRawMs']>=opening['dealTimeRawMs'] else None
  trades.append({'signalId':intent.get('signalId'),'observedAt':intent.get('observedAt'),'side':intent.get('side'),'entry':entry,'stop':stop,'target':intent.get('target'),'realizedDemoProfit':profit if finite(profit) else None,'currency':currency,'initialPriceRisk':risk,'priceMoveR':price_r,'spreadToInitialRisk':ratio,'fixedSpread10WouldAccept':ratio<=.1 if ratio is not None else None,'holdingSecondsBrokerLabels':duration,'bookedCosts':booked,'fillEvidenceComplete':opening is not None and closing is not None})
 trades.sort(key=lambda t:t.get('observedAt') or 0)
 return {'version':'bch-trade-learning-v1','status':'analyzed' if trades else 'no_verified_closed_trades','trades':trades,'latestTradeSignalId':trades[-1]['signalId'] if trades else None,'totalsByCurrency':totals,'fixedCounterfactual':{'rule':'captured spread / initial price risk <= 0.10','rejectedSignals':[t['signalId'] for t in trades if t['fixedSpread10WouldAccept'] is False],'unknownSignals':[t['signalId'] for t in trades if t['fixedSpread10WouldAccept'] is None]},'lessons':[{'status':'evidence','claim':'Compare every verified closed BCH trade, including losses; report account-currency result separately from price R.'},{'status':'hypothesis','claim':'A fixed 10% spread filter can exclude winners as well as losers; test prospective paired cases before any promotion.'},{'status':'research_required','claim':'Compare fixed spread/trend rules on the actual M5 strategy timeframe. H4 results cannot establish an improvement to M5 execution.'},{'status':'research_required','claim':'Do not infer optimal holding time, trailing stops or position size from a single winning path; predefine separate tests with costs and adverse cases.'}],'limitations':['Small selected demo sample is not a profitability proof.','Captured quote is from signal observation, not immediately before execution.','Booked zero costs apply only to recorded deals; future/historical tariffs remain unverified.','Missing, partial or multiple fills remain unresolved. Price R excludes spread/funding/FX and is not net account R.','Counterfactual entry rejection alone does not reconstruct replacement trades or portfolio returns.'],'executionEnabled':False,'automaticPromotion':False}
def overlay(root,measurement,binding,allowed):
 if not allowed():return {'status':'off','executionEnabled':False}
 file=root/'artifacts/founder-integration-20261012/demo-execution-20261017.db.orders.db'
 if not file.exists():return {'status':'journal_missing','executionEnabled':False}
 with closing(sqlite3.connect(file.resolve().as_uri()+'?mode=ro',uri=True,timeout=.2)) as db:
  rows=[(json.loads(i),status,json.loads(result) if result else None) for i,status,result in db.execute("SELECT payload,status,result FROM intents WHERE status='closed' AND json_extract(payload,'$.symbol')='BCHUSD' AND json_extract(payload,'$.account')=? AND json_extract(payload,'$.server')=? ORDER BY rowid",(binding['account'],binding['server']))]
 return analyze(rows,measurement.get('fills',[]),binding)
