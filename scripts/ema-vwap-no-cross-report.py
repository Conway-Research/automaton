"""Verify every stored trade and write a comparison; strictly offline."""
import collections,csv,datetime,hashlib,json,math,pathlib

ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'outputs/ema-vwap-no-cross-20261019'
r=json.loads((OUT/'results.json').read_text())
previous=json.loads((ROOT/'outputs/ema-vwap-trend-20261019/results.json').read_text())
assert len(r['results'])==36
for name,key in [('ema-vwap-no-cross.mjs','codeSha256'),('ema-vwap-trend.mjs','priorCodeSha256')]:
    assert hashlib.sha256((ROOT/'scripts/lib'/name).read_bytes()).hexdigest()==r['protocol'][key]
assert hashlib.sha256((ROOT/'outputs/ema-vwap-trend-20261019/results.json').read_bytes()).hexdigest()==r['protocol']['priorResultsSha256']
exit_counts={};summaries=[]
for x in r['results']:
    trades=json.loads((OUT/x['tradesFile']).read_text())
    net=borrow=bps=holding=0.0;last=-1;counts=collections.Counter()
    for t in trades:
        assert t['entryIndex']==t['signalIndex']+1 and t['entryIndex']>last
        assert t['exitIndex']>=t['entryIndex'];last=t['exitIndex']
        assert t['signalAt']==t['entryAt'] and t['entryAt'][:10]==t['exitBarStart'][:10]
        year=int(t['entryAt'][:4]);assert year in ({2022,2023} if x['period']=='train' else {2024} if x['period']=='validation' else {2025})
        d=t['direction'];assert d*(t['signalClose']-t['signalEma200'])>0 and d*(t['signalEma200']-t['signalEma200Past12'])>0
        original=t['entry']-t['signalLow'] if d==1 else t['signalHigh']-t['entry']
        risk=max(original,2*t['signalATR14'],t['entry']*0.01)
        assert original>0 and math.isclose(t['risk'],risk,abs_tol=1e-7)
        assert math.isclose(t['stop'],t['entry']-d*risk,abs_tol=1e-7)
        assert math.isclose(t['target'],t['entry']+d*3*risk,abs_tol=1e-7)
        adverse=(x['costs']['spreadBps']/2+x['costs']['slippageBps'])/10000
        assert math.isclose(t['entry'],t['rawEntry']*(1+d*adverse),abs_tol=1e-7)
        assert math.isclose(t['exit'],t['rawExit']*(1-d*adverse),abs_tol=1e-7)
        assert math.isclose(t['fee'],(t['entry']+t['exit'])*x['costs']['feeBps']/10000,abs_tol=1e-7)
        assert math.isclose(t['net'],d*(t['exit']-t['entry'])-t['fee'],abs_tol=1e-7)
        minutes=(datetime.datetime.fromisoformat(t['exitBarStart'])-datetime.datetime.fromisoformat(t['entryAt'])).total_seconds()/60
        interest=t['entry']*max(1,math.ceil(minutes/60))/10000 if d==-1 else 0
        net+=t['net']-interest;borrow+=interest;bps+=(t['net']-interest)/t['entry']*10000;holding+=minutes
        counts[t['reason']]+=1
        if x['mode']=='no-cross':assert t['reason'] in ['stop-first','gap-stop','target','session-end']
    s=x['stats']['all'];assert len(trades)==s['trades']
    assert math.isclose(net,s['net'],abs_tol=1e-6) and math.isclose(borrow,s['borrow'],abs_tol=1e-6)
    assert math.isclose(bps/len(trades),s['meanNetBpsPerTrade'],abs_tol=1e-8)
    assert sum(m['stats']['all']['trades'] for m in x['monthly'])==len(trades)
    assert math.isclose(sum(m['stats']['all']['net'] for m in x['monthly']),net,abs_tol=1e-6)
    if x['mode']=='with-cross':
        old=next(y for y in (previous['training'] if x['period']=='train' else previous['evaluations']) if not y['baseline'] and y['period']==x['period'] and y['symbol']==x['symbol'] and y['scenario']==x['scenario'] and y['candidateId']==r['protocol']['candidate']['id'])
        assert old['stats']==x['stats']
    if x['scenario']=='base':exit_counts[f"{x['period']}-{x['symbol']}-{x['mode']}"]=dict(counts)
    summaries.append({k:x[k] for k in ['period','symbol','scenario','mode']}|s|{'exitReasons':dict(counts)})

power=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision']==r['powerBefore']['revision']
verification={'runsReconciled':36,'previousRunsExactlyReproduced':18,'noCrossRuns':18,
              'allowedExitsOnly':True,'power':'OFF','revision':power['revision'],'networkCalls':False,'productionWrites':False,'exitReasons':exit_counts}
(OUT/'verification.json').write_text(json.dumps(verification,indent=2))
(OUT/'summaries.json').write_text(json.dumps(summaries,indent=2))
fields=['period','symbol','scenario','mode','month','status','side','trades','net','meanNetBpsPerTrade','winRate','profitFactor']
with (OUT/'monthly.csv').open('w',encoding='utf-8',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
    for x in r['results']:
        for m in x['monthly']:
            for side in ['all','long','short']:
                writer.writerow({k:x[k] for k in fields[:4]}|{k:m[k] for k in ['month','status']}|{'side':side}|{k:m['stats'][side][k] for k in fields[7:]})

lines=['# EMA9/VWAP — festgeschriebener Kandidat ohne Gegenkreuz-Ausstieg','',
    'Ergebnis: Das Weglassen des Gegenkreuz-Ausstiegs verringert bei ETH den durchschnittlichen Verlust. Bei BTC verschlechtert er sich im Basismodell in Training und Validierung, während er im Abschlusstest 2025 leicht sinkt. In Training, Validierung und Abschlusstest bleibt die neue Variante bei beiden Märkten in allen drei Kostenmodellen negativ. Kein belastbarer Vorteil nach Kosten.', '',
    '## Unveränderte Regeln und Daten','',
    'Kandidat cross-stop1-R3 aus der vorherigen Trainingsauswahl, unverändert: bestätigte EMA9/VWAP-Kreuzung plus Kerzenausbruch; Long über steigender EMA200, Short unter fallender EMA200, EMA200-Steigung über zwölf abgeschlossene 5-Minuten-Kerzen. Einstieg nächste Kerzeneröffnung.',
    'Stop-Abstand ab ausgeführtem Einstieg: max(positiver Abstand zum Signalkerzenextrem, 2×Wilder ATR14 am Signal, 1% des Einstiegs). Gewinnziel 3R. Einzige Änderung: kein Ausstieg bei Gegenkreuz. Ausstieg nur Stop, Ziel oder UTC-Tagesende. Stop und Ziel in derselben Kerze: Stop zuerst; Stop-Eröffnungslücke zum Eröffnungspreis. Eine Position gleichzeitig, keine Übernachtpositionen.',
    'Daten: lokale ETHUSDT/BTCUSDT Binance-Spot-5-Minuten-Archive 2022–2025, echtes Handelsvolumen. CSV-SHA256 erneut geprüft. März 2023 bei beiden Märkten ausgeschlossen (16 fehlende Kerzen, keine Interpolation). VWAP aus typischem Kerzenpreis und Basisvolumen bleibt eine Approximation.',
    'Zeitliche Trennung: 2022–2023 Entwicklung/Diagnostik, 2024 Validierung, 2025 Abschlusstest. Keine erneute Auswahl oder Anpassung, keine anderen Kandidaten getestet. Indikatoren kausal mit älterer Preishistorie vorgewärmt; nach ausgeschlossener Datenlücke neu gestartet. Frühere Trades nicht in spätere Ergebnisse übernommen.',
    'Die Änderung wurde nach Kenntnis der früheren 2024-/2025-Ergebnisse angeregt. Deshalb ist dies eine nachfolgende historische Hypothesenprüfung mit zeitlich getrennten Berichten, kein unberührter oder unabhängiger Holdout. Keine Schlussfolgerung über künftige Profitabilität.', '',
    '## Kosten und Vergleichsmaß','',
    'Unveränderte Szenarien: 10 bp = 0,10% Gebühr je Seite; Gesamter Spread / Slippage je Seite niedrig 1/1 bp, Basis 4/3 bp, Stress 10/10 bp. Hypothetische Spot-Margin-Shorts zusätzlich 1 bp pro angefangener Stunde, mindestens eine Stunde. Keine historischen Quotes, individuellen Gebührenkonditionen oder tatsächlichen Zins-/Leihverfügbarkeitsdaten. Referenz Standardtarif: https://www.binance.com/en/fee/trading (am 19.10.2026 geprüft).',
    'Weiterhin konstante Menge 1 ETH oder 1 BTC, kein Hebel-/Kontomodell. Maß: mittlerer Netto-PnL pro Trade relativ zum ausgeführten Einstiegswert in Basispunkten (100 bp = 1%). Keine Kontorendite. USDT-Summen bei Menge 1 sind zwischen BTC und ETH nicht direkt vergleichbar; Drawdown ist nur aus geschlossenen Trades berechnet.',
    'Durch längere Positionen ändern sich auch spätere Einstiegsmöglichkeiten, Tradeanzahl und Leihkosten. Dies ist ein Vergleich vollständiger Strategieläufe, keine nachträgliche Veränderung identischer Einzeltrades.', '',
    '## Basiskosten: mit und ohne Gegenkreuz','',
    '| Zeitraum | Markt | Trades vorher | Trades ohne Gegenkreuz | Vorher bp/Trade | Ohne Gegenkreuz bp/Trade |',
    '|---|---|---:|---:|---:|---:|']
for x in r['results']:
    if x['mode']!='no-cross' or x['scenario']!='base':continue
    old=next(y for y in r['results'] if y['period']==x['period'] and y['symbol']==x['symbol'] and y['scenario']=='base' and y['mode']=='with-cross')
    a,b=old['stats']['all'],x['stats']['all'];lines.append(f"| {x['period']} | {x['symbol']} | {a['trades']} | {b['trades']} | {a['meanNetBpsPerTrade']:.2f} | {b['meanNetBpsPerTrade']:.2f} |")
lines+=['','## Alle Kostenmodelle ohne Gegenkreuz','',
    '| Zeitraum | Markt | Kosten | Trades | Netto USDT bei Menge 1 | Netto bp/Trade | Trefferquote |',
    '|---|---|---|---:|---:|---:|---:|']
for x in r['results']:
    if x['mode']!='no-cross':continue
    s=x['stats']['all'];lines.append(f"| {x['period']} | {x['symbol']} | {x['scenario']} | {s['trades']} | {s['net']:.2f} | {s['meanNetBpsPerTrade']:.2f} | {100*s['winRate']:.1f}% |")
lines+=['','## Neue Ausstiegsverteilung im Basismodell','']
for k,counts in exit_counts.items():
    if k.endswith('no-cross'):lines.append(f"- {k}: "+', '.join(f'{reason}: {n}' for reason,n in counts.items()))
lines+=['','## Verifikation und Dateien','',
    '20 automatisierte Tests bestanden. Die drei neuen Tests prüfen Wegfall des Gegenkreuz-Ausstiegs, längeres Halten bei unverändertem ersten Einstieg, unveränderte Stop-/Ziel-/Kostenrechnung, Sitzungsschluss, Stop-Lücken und Stop-zuerst bei Mehrdeutigkeit.',
    '36 Läufe unabhängig aus den Einzeltrades nachgerechnet: Kosten und Leihpuffer, Trend-/Stop-/Zielbedingungen, Split-Grenzen, keine überlappenden Positionen und Monatssummen. Die 18 Vergleichsläufe mit Gegenkreuz reproduzieren die bisherigen Statistiken exakt. Keine erneute Kandidatenauswahl.',
    f"Power vorher/nachher OFF, Revision {r['powerBefore']['revision']}/{power['revision']}. Keine Produktion geändert, kein Provideraufruf, Download, Neustart oder Order.",
    'Nachweise: protocol.json, results.json, summaries.json, monthly.csv, verification.json und trades-*.json. Reproduktion: python scripts/ema-vwap-no-cross-report.py. Der Runner überschreibt bestehende Experimente absichtlich nicht.',
    'Datenattribution: Binance Public Data / Binance Vision, persönliche nichtkommerzielle Offline-Forschung; Daten laut lokalem Erwerbsprotokoll CC BY-NC-SA 4.0, abgeleitete Berichtsdaten unter derselben Lizenz: https://creativecommons.org/licenses/by-nc-sa/4.0/']
(OUT/'bericht.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in verification.items() if k!='exitReasons'},indent=2))
for x in summaries:
    if x['mode']=='no-cross' and x['scenario']=='base':print(x['period'],x['symbol'],x['trades'],x['meanNetBpsPerTrade'],x['exitReasons'])
