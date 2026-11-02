"""Observability only: no broker calls, signal generation or trading permissions."""
import json,math,time,html
from datetime import datetime,timezone
MAX_CYCLES=5000
def number(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def explain(row,signals,at,clock_verified=True):
 bars=row.get('closedBars') or [];last=bars[-1] if bars else {};prior=bars[-21:-1]
 reasons=list(row.get('reasons') or [])
 history_skipped=row.get('historyRead',{}).get('requested') is False
 if history_skipped:
  reasons=[r for r in reasons if r!='History unavailable'];reasons.append('history_skipped_prerequisite')
 if not row.get('capability'):reasons.append('market_not_eligible')
 quote=row.get('quoteAt');bid=row.get('bid');ask=row.get('ask')
 if not clock_verified:reasons.append('broker_clock_unverified')
 elif not number(quote) or not -1000<=at-quote<=15000:reasons.append('quote_stale_or_future')
 if not number(bid) or not number(ask) or not 0<bid<=ask:reasons.append('invalid_bid_ask')
 valid=len(bars)>=25
 if not valid and not history_skipped:reasons.append('insufficient_closed_bars')
 for i,b in enumerate(bars):
  if not all(number(b.get(k)) and b[k]>0 for k in ['time','open','high','low','close']):valid=False;break
  if b['high']<max(b['open'],b['close']) or b['low']>min(b['open'],b['close']) or b['high']<b['low'] or b['time']*1000+300000>at or (i and b['time']<=bars[i-1]['time']):valid=False;break
 if bars and not valid:reasons.append('invalid_or_unfinished_bars')
 if valid and at-(last['time']*1000+300000)>300000:reasons.append('last_closed_bar_stale')
 high=max((b['high'] for b in prior),default=None) if valid else None
 low=min((b['low'] for b in prior),default=None) if valid else None
 side=None
 if valid:
  if last['close']>high:side='BUY'
  elif last['close']<low:side='SELL'
  else:reasons.append('no_closed_breakout')
  if side and not (number(bid) and number(ask) and (bid>high if side=='BUY' else ask<low)):reasons.append('current_quote_does_not_confirm')
  if side and not reasons:
   entry=ask if side=='BUY' else bid
   stop=min(b['low'] for b in bars[-3:]) if side=='BUY' else max(b['high'] for b in bars[-3:])+ask-bid
   distance=abs(entry-stop);target=entry+2*distance if side=='BUY' else entry-2*distance
   if distance<=0 or target<=0 or (stop>=entry if side=='BUY' else stop<=entry):reasons.append('invalid_protection_geometry')
 forwarded=[{k:s.get(k) for k in ['signalId','side','observedAt','expiresAt']} for s in signals if s.get('symbol')==row.get('symbol')]
 return {'symbol':row.get('symbol'),'decision':'forwarded_to_execution' if forwarded else 'input_rejected' if reasons else 'qualifies_but_not_forwarded',
  'diagnosticReasons':list(dict.fromkeys(reasons)),'forwardedSignals':forwarded,'quoteAt':quote,'quoteAgeMs':at-quote if clock_verified and number(quote) else None,'bid':bid,'ask':ask,
  'bars':len(bars),'historyRead':row.get('historyRead'),'lastClose':last.get('close'),'lastBarTime':last.get('time'),'prior20High':high,'prior20Low':low,
  'inputDigestNote':'Rule diagnosis reconstructed from captured inputs at market observation time; forwardedSignals is the actual executor input.'}
def setup(db):
 db.execute('CREATE TABLE IF NOT EXISTS signal_checks(id INTEGER PRIMARY KEY AUTOINCREMENT,at REAL NOT NULL,payload TEXT NOT NULL)');db.commit()
def begin(db,payload,checks):
 market=payload['market'];at=market['account']['observedAt']
 record={'version':1,'phase':'started','recordedAt':time.time()*1000,'marketObservedAt':at,'strategy':'numaron-demo-breakout20-v1','clockProof':market.get('clockProof'),'scan':market.get('scan'),
  'checks':checks,'forwardedSignalCount':len(payload.get('signals',[])),'products':[explain(r,payload.get('signals',[]),at,market.get('clockProof') is not None) for r in market.get('instruments',[])],
  'retentionMaxCycles':MAX_CYCLES,'historicalBackfill':False}
 cursor=db.execute('INSERT INTO signal_checks(at,payload) VALUES(?,?)',(record['recordedAt'],json.dumps(record,allow_nan=False)));db.commit()
 db.execute('DELETE FROM signal_checks WHERE id <= ?',(cursor.lastrowid-MAX_CYCLES,));db.commit()
 return cursor.lastrowid
def finish(db,id,execution,attempts):
 record=json.loads(db.execute('SELECT payload FROM signal_checks WHERE id=?',(id,)).fetchone()[0]);record.update(phase='completed',execution=execution,attempts=attempts)
 db.execute('UPDATE signal_checks SET payload=? WHERE id=?',(json.dumps(record,allow_nan=False),id));db.commit()
def render(db):
 esc=lambda x:html.escape(str(x))
 labels={'history_skipped_prerequisite':'Kerzenabruf übersprungen: Kurs- oder Freigabeprüfung nicht bestanden','broker_clock_unverified':'Brokerzeit nicht durch aktuelle Kursquellen bestätigt','input_rejected':'Voraussetzung fehlt','forwarded_to_execution':'Signal an Ausführung übergeben','qualifies_but_not_forwarded':'Diagnostisch geeignet, nicht übergeben',
  'no_closed_breakout':'Kein Ausbruch im abgeschlossenen Kerzenschluss','current_quote_does_not_confirm':'Aktueller Kurs bestätigt den Ausbruch nicht',
  'market_not_eligible':'Marktdatenprüfung nicht bestanden','quote_stale_or_future':'Kurszeit veraltet oder zukünftig','invalid_bid_ask':'Bid/Ask ungültig',
  'insufficient_closed_bars':'Zu wenige abgeschlossene Kerzen','invalid_or_unfinished_bars':'Ungültige oder noch offene Kerzen','last_closed_bar_stale':'Letzte abgeschlossene Kerze veraltet',
  'invalid_protection_geometry':'Stop/Ziel nicht gültig','Fresh quote unavailable':'Kein frischer bestätigter Kurs','History unavailable':'Kerzenhistorie nicht verfügbar oder wegen Vorprüfung nicht abgerufen',
  'Trading restricted':'Broker-Handelsfreigabe eingeschränkt','Market subscription unavailable':'Marktabonnement nicht verfügbar'}
 entries=[]
 def display_reasons(product):
  reasons=list(product['diagnosticReasons'])
  # Legacy collector skipped bars on any failed preliminary quote/trade check.
  # Clarify presentation without rewriting historical records in the database.
  skipped=product.get('historyRead',{}).get('requested') is False if isinstance(product.get('historyRead'),dict) else (product.get('bars')==0 and 'History unavailable' in reasons and any(r in reasons for r in ['Fresh quote unavailable','Trading restricted','Market subscription unavailable']))
  if skipped:
   reasons=[r for r in reasons if r not in ['History unavailable','insufficient_closed_bars']]
   if 'history_skipped_prerequisite' not in reasons:reasons.append('history_skipped_prerequisite')
  if 'Fresh quote unavailable' in reasons:
   reasons=[r for r in reasons if r!='quote_stale_or_future']
  if len(reasons)>1:reasons=[r for r in reasons if r!='market_not_eligible']
  return '; '.join(labels.get(reason,reason) for reason in reasons) or '—'
 for id,at,payload in db.execute('SELECT id,at,payload FROM signal_checks ORDER BY id DESC LIMIT 30'):
  r=json.loads(payload);stamp=datetime.fromtimestamp(at/1000,timezone.utc).isoformat()
  rows=''.join('<tr>'+''.join('<td>'+esc(v)+'</td>' for v in [p['symbol'],labels.get(p['decision'],p['decision']),display_reasons(p),p['lastClose'],p['prior20Low'],p['prior20High'],p['bid'],p['ask']])+'</tr>' for p in r['products'])
  entries.append('<section><h2>Zyklus '+esc(id)+' · '+esc(stamp)+'</h2><p>'+esc(r['phase'])+' · '+esc(r.get('execution',{}).get('status','Abschluss noch nicht protokolliert'))+'</p><table><tr><th>Produkt</th><th>Entscheidung</th><th>Diagnosegründe</th><th>M5-Schluss</th><th>20-Tief</th><th>20-Hoch</th><th>Bid</th><th>Ask</th></tr>'+rows+'</table><details><summary>Vollständige Prüfdaten, Kryptouniversum und Ausführung</summary><pre>'+esc(json.dumps(r,ensure_ascii=False,indent=2))+'</pre></details></section>')
 return '<!doctype html><html lang="de"><meta charset="utf-8"><title>Numaron · Signalhistorie</title><style>body{font:15px system-ui;margin:30px;background:#101c2b;color:#e4edf7}table{border-collapse:collapse;width:100%}td,th{padding:7px;border:1px solid #405064;text-align:left}section{margin:30px 0}pre{white-space:pre-wrap}summary{cursor:pointer}</style><h1>Numaron · Demo-Signalprüfungen</h1><p>Letzte 30 gespeicherte Zyklen. Zeiten in UTC. Bericht wird nach regulären Demo-Zyklen erneuert; Datei erneut öffnen/aktualisieren. SQLite speichert bis zu 5000 Zyklen. Keine Rekonstruktion früherer Prüfungen.</p><p>no_closed_breakout: kein bestätigter Kerzenausbruch; current_quote_does_not_confirm: aktueller Kurs bestätigt nicht; market_not_eligible: Datenprüfung nicht bestanden; qualifies_but_not_forwarded: diagnostisch geeignet, aber nicht im tatsächlich übergebenen Signal enthalten (z. B. Auswahlbegrenzung). Die Diagnosen verwenden den Marktaufnahmezeitpunkt, der vom exakten JavaScript-Auswertungszeitpunkt abweichen kann. forwarded_to_execution bestätigt die Übergabe, keine Ausführung.</p>'+''.join(entries)+'</html>'
