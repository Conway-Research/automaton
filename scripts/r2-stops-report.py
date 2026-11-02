"""Independent Python simulation of all protective-stop scenarios and report."""
import collections,csv,datetime,hashlib,json,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'outputs/r2-stops-20261019-verified';SOURCE=ROOT/'outputs/r2-history-20261019'
r=json.loads((OUT/'results.json').read_text());old=json.loads((SOURCE/'results.json').read_text())
assert len(r['results'])==195
assert hashlib.sha256((ROOT/'scripts/lib/r2-stops.mjs').read_bytes()).hexdigest()==r['protocol']['codeSha256']
assert hashlib.sha256((ROOT/'scripts/lib/r2-long-history.mjs').read_bytes()).hexdigest()==r['protocol']['priorCodeSha256']
datasets={};features={}
for symbol,h in r['protocol']['dataHashes'].items():
    raw=(SOURCE/f'normalized-{symbol}.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==h
    bars=json.loads(raw);datasets[symbol]=bars;f=[];gain=loss=atr=0
    for i,b in enumerate(bars):
        if i:
            delta=b['close']-bars[i-1]['close'];g=max(delta,0);l=max(-delta,0)
            if i<=2:gain+=g/2;loss+=l/2
            else:gain=(gain+g)/2;loss=(loss+l)/2
        rsi=None if i<2 else 50 if gain==loss==0 else 100 if loss==0 else 100-100/(1+gain/loss)
        tr=b['high']-b['low'] if i==0 else max(b['high']-b['low'],abs(b['high']-bars[i-1]['close']),abs(b['low']-bars[i-1]['close']))
        atr=atr+tr/14 if i<14 else (atr*13+tr)/14
        f.append({'sma':sum(x['close'] for x in bars[i-199:i+1])/200 if i>=199 else None,'rsi':rsi,'atr':atr if i>=13 else None})
    features[symbol]=f
def near(a,b):assert math.isclose(a,b,abs_tol=1e-6,rel_tol=1e-10),(a,b)
def simulate(row):
    bars=datasets[row['symbol']];f=features[row['symbol']];variant=row['stop'];cost=row['costs']
    start=int(datetime.datetime.fromisoformat(row['startDate']).replace(tzinfo=datetime.timezone.utc).timestamp()*1000)
    end=int(datetime.datetime.fromisoformat(row['endDate']).replace(tzinfo=datetime.timezone.utc).timestamp()*1000)
    slip=(cost['spreadBps']/2+cost['slippageBps'])/10000
    def commission(q,p,sell=False):
        return q*p*cost['feeBps']/10000 if row['symbol']!='SPY' else min(q*p*.01,max(cost['minFee'],q*cost['perShare']))+(q*p*cost['regulatorySellBps']/10000 if sell else 0)
    cash=10000.;p=None;pending=None;trades=[];marks=[]
    def sell(i,raw,reason,sig=None):
        nonlocal cash,p
        exit=raw*(1-slip);exitfee=commission(p['quantity'],exit,True)
        net=(exit-p['entry'])*p['quantity']-p['entryFee']-exitfee+p['dividends']
        cash+=p['quantity']*exit-exitfee
        trades.append(p|{'exitIndex':i,'exitSignalIndex':sig,'rawExit':raw,'exit':exit,'exitFee':exitfee,
                        'fee':p['entryFee']+exitfee,'net':net,'netReturn':net/p['capitalBefore'],'reason':reason});p=None
    for i,b in enumerate(bars):
        if not start<=b['time']<end:continue
        last=i==len(bars)-1 or bars[i+1]['time']>=end
        if p and b.get('dividend',0):amount=p['quantity']*b['dividend'];p['dividends']+=amount;cash+=amount
        if p and p['stop'] is not None and b['open']<=p['stop']:sell(i,b['open'],'gap-stop');pending=None
        if pending:
            kind,sig=pending
            if kind=='exit' and p:sell(i,b['open'],'signal',sig)
            elif kind=='entry' and p is None and not last:
                entry=b['open']*(1+slip);capital=cash
                stop=None if variant['id']=='none' else entry*(1-variant['fraction']) if variant['type']=='fixed' else entry-3*f[sig]['atr']
                if variant['id']=='none' or stop is not None and 0<stop<entry:
                    q=cash/(entry*(1+cost['feeBps']/10000)) if row['symbol']!='SPY' else math.floor(cash/entry)
                    while q>0 and q*entry+commission(q,entry)>cash+1e-9:q-=1
                    if q>0:
                        entryfee=commission(q,entry);cash-=q*entry+entryfee
                        p={'signalIndex':sig,'entryIndex':i,'rawEntry':b['open'],'entry':entry,'quantity':q,
                           'capitalBefore':capital,'entryFee':entryfee,'dividends':0,'stop':stop}
            pending=None
        if p and p['stop'] is not None and b['low']<=p['stop']:sell(i,p['stop'],'stop')
        if last and p:sell(i,b['close'],'boundary')
        marks.append(cash+(p['quantity']*b['close'] if p else 0))
        if not last:
            a=f[i]
            if p and a['rsi']>75:pending=('exit',i)
            elif p is None and i>=4 and a['sma'] is not None and b['close']>a['sma'] and f[i-2]['rsi']<65 and f[i-1]['rsi']<f[i-2]['rsi'] and a['rsi']<f[i-1]['rsi']:pending=('entry',i)
    return trades,marks,cash
for row in r['results']:
    d=json.loads((OUT/row['detailsFile']).read_text());trades,marks,cash=simulate(row)
    assert len(trades)==len(d['trades'])==row['stats']['trades']
    for a,b in zip(trades,d['trades']):
        for k in ['signalIndex','entryIndex','exitIndex','exitSignalIndex','reason']:assert a[k]==b[k],(row['detailsFile'],k,a[k],b[k])
        for k in ['entry','rawEntry','quantity','capitalBefore','entryFee','dividends','rawExit','exit','exitFee','fee','net','netReturn']:near(a[k],b[k])
        if row['stop']['id']!='none':near(a['stop'],b['stop'])
    assert len(marks)==len(d['equity'])
    for a,b in zip(marks,d['equity']):near(a,b['equity'])
    s=row['stats'];near(cash,s['endingCapital']);near(cash-10000,s['net'])
    wins=sum(t['net']>0 for t in trades);assert wins==s['wins'];near(wins/len(trades),s['winRate'])
    peak=10000;dd=0
    for value in marks:peak=max(peak,value);dd=max(dd,1-value/peak)
    near(dd,s['maxCloseDrawdownFraction'])
    assert s['boundaryTrades']==sum(t['reason']=='boundary' for t in trades)
    passed=wins/len(trades)>=.75 and cash>10000 and dd<row['baselineStats']['maxCloseDrawdownFraction']-1e-12
    assert bool(passed)==row['simultaneousPass']
    if row['stop']['id']=='none':
        baseline=next(x for x in old['results'] if x['symbol']==row['symbol'] and x['period']==row['period'] and x['scenario']==row['scenario'])
        assert s==baseline['stats']
    # The pre-report fix affected only stop/boundary classification, not trades or equity.
    preliminary=json.loads((ROOT/'outputs/r2-stops-20261019'/row['detailsFile']).read_text())
    assert d['trades']==preliminary['trades'] and d['equity']==preliminary['equity']
power=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision']==r['powerBefore']['revision']
verification={'runsIndependentlyResimulated':195,'baselineRunsExactlyReproduced':39,'stopRuns':156,
              'tests':'Full Python resimulation of every signal, protective stop, gap execution, fee, dividend, position and daily account value; net winners, drawdowns and simultaneous pass recomputed',
              'preReportBoundaryCountCorrectionTradesUnchanged':True,'power':'OFF','revision':power['revision'],'networkCalls':False,'productionWrites':False}
(OUT/'verification.json').write_text(json.dumps(verification,indent=2))
fields=['symbol','period','scenario','stop','trades','wins','winRate','netReturn','maxCloseDrawdownFraction','baselineDrawdown','profitFactor','boundaryTrades','stopExits','simultaneousPass']
with (OUT/'summary.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for x in r['results']:w.writerow({k:x[k] for k in ['symbol','period','scenario','stopExits','simultaneousPass']}|{'stop':x['stop']['id'],'baselineDrawdown':x['baselineStats']['maxCloseDrawdownFraction']}|{k:x['stats'][k] for k in fields[4:9]+fields[10:12]})
lines=['# R2 mit Schutzstop — vier feste Varianten und Vergleich ohne Stop','',
    'Im historischen Basismodell erfüllen ETH mit 10%-Stop (Test2024–2025) und SPY mit 5%-Stop (Test2017–2025) alle drei Kriterien gleichzeitig: mindestens 75% Nettotrefferquote, positives Nettoergebnis und geringerer Schlusskurs-Drawdown als R2 ohne Stop. ETH besteht diese Kombination auch im erhöhten Kostenmodell; SPY nicht. BTC erreicht im Testabschnitt mit keiner der vier Stopvarianten 75%. Keine Bestätigung über alle Zeiträume oder aller Märkte, keine Live-Freigabe.', '',
    '## Feste Versuchsdefinition','',
    'Vier vorab festgelegte Stops: 5%, 10%, 15% unter ausgeführtem Einstieg sowie 3×Wilder-ATR14 Abstand. ATR verwendet ausschließlich abgeschlossene Tageskerzen bis zum Signaltag; Start als Mittel der ersten 14 True Ranges, danach Wilder-Glättung. Stop bleibt unverändert, ohne Nachziehen oder SPY-Dividendenanpassung. Kein Parametersuchlauf oder Nachjustieren.',
    'Unverändertes Improved R2: Kurs über SMA200, RSI2 vor zwei Sitzungen<65, danach zweimal fallend. Einstieg nächste Sitzungseröffnung. Regulärer Verkauf nächste Eröffnung nach RSI2>75 bleibt erhalten. Stop gilt ab Einstiegstag. Ein bestehender Stop durch Eröffnungslücke wird am schlechteren Eröffnungskurs ausgeführt; Tagesberührung am Stop. Jeder Verkauf zusätzlich mit bisherigem Spread, Slippage und Gebühren. Kein garantierter maximaler Verlust in Höhe des Stopabstands.',
    'Nur ein neu abgeschlossenes Tagessignal nach Stop-Ausstieg kann einen Einstieg zur nächsten Eröffnung auslösen. Keine Wiederverwendung alter Signale, kein Nachkaufen. ATR-Stop bei nichtpositivem Preis würde den Einstieg auslassen und als Ablehnung gezählt; in diesen Läufen keine solchen Ablehnungen.',
    'Daten unverändert aus r2-history-20261019: ETH/BTC native Tagesdaten September2017–September2026, je 3317 Tage; SPY Januar1993–September2026, 8475 Börsensitzungen. SHA256 erneut geprüft, keine Downloads. Kryptoabschnitte 2018–2021, 2022–2023, 2024–2025; SPY1994–2006, 2007–2016, 2017–2025. Januar–September2026 separat. SPY1995–2006 zusätzlich als früher festgelegter Quellenvergleich.',
    'Jeder Zeitraum beginnt flat mit vergangenheitsbasiertem Warmup. Bisherige 10000 synthetische USD/USDT, Wiederanlage, ganze SPY-Aktien und vollständig bezahlte Positionen beibehalten. SPY-Bruttodividenden vor Ex-Tag-Eröffnungsverkauf/Stop gutgeschrieben; keine doppelte Kursbereinigung. Offene Endpositionen an Daten-/Testgrenzen gesondert geschlossen.',
    'Alle Varianten werden berichtet. Gefundene erfüllende Kombinationen sind nach Betrachtung der Tabellen identifiziert, kein vorab unabhängig validierter Gewinner. Die historische Auswahl ist mehrfach betrachtet und kein unberührter Holdout.', '',
    '## Kosten und Erfolgskriterium','',
    'Unveränderte Krypto-Kosten je Seite: 0,10% Gebühr; Spread gesamt / Slippage je Seite niedrig1/1bp, Basis4/3bp, Stress10/10bp. SPY niedrig/Basis 0,005USD je Aktie, mindestens1USD, maximal1% des Orderwerts; Verkaufspuffer0,5bp, Spread/Slippage1/1bp beziehungsweise2/2bp. SPY-Stress: 0,01USD je Aktie, mindestens2USD, Verkaufspuffer1bp, Spread/Slippage10/10bp. Historische Quotes und persönliche Gebührenkurve nicht rekonstruiert; keine Steuern, Quellensteuer oder FX-Kosten.',
    'Erfüllt bedeutet im jeweiligen Markt-/Zeit-/Kostenszenario: Nettotrefferquote>=75%, positiver Gesamt-Netto-PnL und strikt niedrigerer täglicher Schlusskurs-Mark-to-Market-Drawdown als ohne Stop. Grenzliquidationen zählen als abgeschlossene Trades und sind separat gekennzeichnet. Trefferquote und Drawdown beruhen auf dem gesamten neuen Strategielauf, nicht nachträglich veränderten identischen Trades.',
    'Der Stop verändert spätere Einstiegsmöglichkeiten und damit die Tradeanzahl. Ein niedrigerer maximaler Drawdown ist nicht automatisch gleichbedeutend mit höheren Erträgen. Tages-OHLC-Fills sind Annahmen; echte Stop-Ausführungen können bei Sprüngen, Halt oder Liquiditätsmangel schlechter ausfallen. Schlusskurs-Drawdown kann Intraday-Drawdown unterschätzen.', '',
    '## Haupt-Testabschnitte im Basismodell — alle Varianten','',
    '| Markt | Stop | Gewinner/Trades | Nettotrefferquote | Gesamtrendite vor Steuer | Drawdown | Drawdown ohne Stop | Alle Kriterien? |',
    '|---|---|---:|---:|---:|---:|---:|---|']
for x in r['results']:
    if x['period']!='test' or x['scenario']!='base':continue
    s=x['stats'];lines.append(f"| {x['symbol']} | {x['stop']['id']} | {s['wins']}/{s['trades']} | {s['winRate']*100:.2f}% | {s['netReturn']*100:.2f}% | {s['maxCloseDrawdownFraction']*100:.2f}% | {x['baselineStats']['maxCloseDrawdownFraction']*100:.2f}% | {'ja' if x['simultaneousPass'] else 'nein'} |")
lines+=['','## Erfüllende Fälle im Haupttest — Kostenprüfung','',
    '| Markt/Stop | Kosten | Gewinner/Trades | Nettotrefferquote | Gesamtrendite | Drawdown | Alle Kriterien? |',
    '|---|---|---:|---:|---:|---:|---|']
for x in r['results']:
    if x['period']!='test' or (x['symbol'],x['stop']['id']) not in [('ETHUSDT','fixed10'),('SPY','fixed5')]:continue
    s=x['stats'];lines.append(f"| {x['symbol']}/{x['stop']['id']} | {x['scenario']} | {s['wins']}/{s['trades']} | {s['winRate']*100:.2f}% | {s['netReturn']*100:.2f}% | {s['maxCloseDrawdownFraction']*100:.2f}% | {'ja' if x['simultaneousPass'] else 'nein'} |")
lines+=['','## Dieselben Varianten in den anderen Zeitabschnitten — Basismodell','',
    '| Markt/Stop | Abschnitt | Gewinner/Trades | Nettotrefferquote | Gesamtrendite | Drawdown | Alle Kriterien? |',
    '|---|---|---:|---:|---:|---:|---|']
for x in r['results']:
    if x['scenario']!='base' or x['period']=='test' or (x['symbol'],x['stop']['id']) not in [('ETHUSDT','fixed10'),('SPY','fixed5')]:continue
    s=x['stats'];lines.append(f"| {x['symbol']}/{x['stop']['id']} | {x['period']} | {s['wins']}/{s['trades']} | {s['winRate']*100:.2f}% | {s['netReturn']*100:.2f}% | {s['maxCloseDrawdownFraction']*100:.2f}% | {'ja' if x['simultaneousPass'] else 'nein'} |")
lines+=['','## Statistische Einordnung','']
for symbol,stop in [('ETHUSDT','fixed10'),('SPY','fixed5')]:
    x=next(x for x in r['results'] if x['symbol']==symbol and x['stop']['id']==stop and x['period']=='test' and x['scenario']=='base');ci=x['stats']['winRateWilson95']
    lines.append(f"- {symbol}/{stop}: 95%-Wilson-Intervall für die beobachtete Trefferquote etwa {ci['low']*100:.1f}–{ci['high']*100:.1f}%. Die Untergrenze liegt unter75%.")
lines+=['Die Wilson-Näherung setzt unabhängige, gleichverteilte Trades voraus; zeitliche Abhängigkeit und Mehrfachbetrachtung von vier Stops, drei Märkten und mehreren Zeiträumen schwächen die Aussage. Es wurden keine multiplen Signifikanztests als Beleg einer Mindestquote verwendet.',
    'SPY-Januar–September2026: 5%-Stop und ATR3 erfüllen im Basismodell alle Kriterien bei 10/11 Gewinnern, doch die Stichprobe ist klein. Die 2026-Resultate aller Varianten stehen in results.json/summary.csv. Kein Schutzstop erfüllt das Ziel durchgehend über alle festgelegten Entwicklungs-, Validierungs- und Testabschnitte.', '',
    '## Verifikation und Dateien','',
    '36 JavaScript-Tests und 3 Kalendertests bestanden. Alle 195 Läufe unabhängig in Python vollständig erneut simuliert, einschließlich jeder Ein-/Ausstiegsentscheidung, Stop und Eröffnungslücke, Dividende, Gebühren, Stückzahl, Cash und täglichem Kontowert. Trefferquote, Drawdown und zusammengesetztes Erfolgskriterium erneut berechnet. Die39 Läufe ohne Stop reproduzieren die bisherigen Statistiken exakt.',
    'Vor der Berichtsfreigabe wurde eine reine Statistikzuordnung korrigiert: Der ältere gemeinsame Helfer hatte Stop-Ausstiege als Grenzliquidationen gezählt. Der Vorlauf bleibt unter outputs/r2-stops-20261019 erhalten. Die endgültige Fassung liegt hier unter r2-stops-20261019-verified; sämtliche Trades, Kontoverläufe und Hauptresultate stimmen mit dem Vorlauf überein. Keine Regeländerung oder Optimierung.',
    f"Numaron vorher/nachher OFF, Revision{power['revision']}. Keine Provideraufrufe, Downloads, Produktionsänderungen, Neustarts oder echten Orders.",
    'Dateien: protocol.json, results.json, summary.csv, verification.json und run-*.json. Reproduktion ohne Download: python scripts/r2-stops-report.py. Der Runner überschreibt vorhandene Experimente nicht.',
    'Datenquellen: Binance Public Data / Binance Vision für Krypto und Yahoo Finance Chart für SPY; Ursprungs-URLs, Hashes, Kalender- und Dividendenprüfung unter outputs/r2-history-20261019. Persönliche lokale Offline-Forschung.']
(OUT/'bericht.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(OUT/'lessons.json').write_text(json.dumps({'schema':'numaron-offline-research-lessons-v1','status':'offline-only-not-runtime-loaded',
    'historicalTestPasses':[{'symbol':x['symbol'],'stop':x['stop']['id'],'scenario':x['scenario'],'wins':x['stats']['wins'],'trades':x['stats']['trades']} for x in r['results'] if x['period']=='test' and x['simultaneousPass']],
    'limits':'No variant confirms >=75% true win probability or consistent pass across all periods; no live authority',
    'productionWrites':False,'power':'OFF'},indent=2))
print(json.dumps(verification,indent=2))
for x in r['results']:
    if x['scenario']=='base' and (x['symbol'],x['stop']['id']) in [('ETHUSDT','fixed10'),('SPY','fixed5')]:
        print(x['symbol'],x['period'],x['stop']['id'],x['stats']['wins'],x['stats']['trades'],x['stats']['netReturn'],x['simultaneousPass'])
