"""Independent trade and selection verification; report only, no execution adapter."""
import collections, csv, datetime, hashlib, json, math, pathlib

ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'outputs/ema-vwap-trend-20261019'
r=json.loads((OUT/'results.json').read_text())
lock=json.loads((OUT/'selection-lock.json').read_text())
assert hashlib.sha256((OUT/'training.json').read_bytes()).hexdigest()==lock['trainingSha256']
assert hashlib.sha256((ROOT/'scripts/lib/ema-vwap-trend.mjs').read_bytes()).hexdigest()==r['protocol']['codeSha256']
assert len(r['training'])==60 and len(r['evaluations'])==36
ranking=[]
for c in r['protocol']['candidates']:
    pair=[x for x in r['training'] if x['candidateId']==c['id'] and x['scenario']=='base' and not x['baseline']]
    assert {x['symbol'] for x in pair}=={'ETHUSDT','BTCUSDT'}
    score=sum(x['stats']['all']['meanNetBpsPerTrade'] for x in pair)/2
    ranking.append((score,c['id']))
ranking.sort(key=lambda x:(-x[0],x[1]))
assert ranking[0][1]==lock['selected']['id']
assert math.isclose(ranking[0][0],lock['selection']['score'],abs_tol=1e-10)

reasons={}
for row in r['training']+r['evaluations']:
    assert row['period']=='train' or row['baseline'] or row['candidateId']==lock['selected']['id']
    if not row['baseline']:
        c=next(c for c in r['protocol']['candidates'] if c['id']==row['candidateId'])
    trades=json.loads((OUT/row['tradesFile']).read_text())
    net=0.0;bps=0.0;borrow=0.0;previous=-1
    counts=collections.Counter()
    for t in trades:
        assert t['entryIndex']==t['signalIndex']+1 and t['entryIndex']>previous
        assert t['exitIndex']>=t['entryIndex'];previous=t['exitIndex']
        assert t['signalAt']==t['entryAt']
        assert t['entryAt'][:10]==t['exitBarStart'][:10]
        year=int(t['entryAt'][:4])
        assert year in ({2022,2023} if row['period']=='train' else {2024} if row['period']=='validation' else {2025})
        if not row['baseline']:
            d=t['direction']
            assert d*(t['signalClose']-t['signalEma200'])>0
            assert d*(t['signalEma200']-t['signalEma200Past12'])>0
            original=t['entry']-t['signalLow'] if d==1 else t['signalHigh']-t['entry']
            risk=max(original,2*t['signalATR14'],t['entry']*c['minStopFraction'])
            assert original>0 and math.isclose(t['risk'],risk,abs_tol=1e-7)
            assert math.isclose(t['stop'],t['entry']-d*risk,abs_tol=1e-7)
            assert math.isclose(t['target'],t['entry']+d*c['rewardR']*risk,abs_tol=1e-7)
        adverse=(row['costs']['spreadBps']/2+row['costs']['slippageBps'])/10000
        assert math.isclose(t['entry'],t['rawEntry']*(1+t['direction']*adverse),abs_tol=1e-7)
        assert math.isclose(t['exit'],t['rawExit']*(1-t['direction']*adverse),abs_tol=1e-7)
        assert math.isclose(t['fee'],(t['entry']+t['exit'])*row['costs']['feeBps']/10000,abs_tol=1e-7)
        assert math.isclose(t['net'],t['direction']*(t['exit']-t['entry'])-t['fee'],abs_tol=1e-7)
        hours=max(1,math.ceil((datetime.datetime.fromisoformat(t['exitBarStart'])-datetime.datetime.fromisoformat(t['entryAt'])).total_seconds()/3600))
        interest=t['entry']*hours/10000 if t['direction']==-1 else 0
        net+=t['net']-interest;bps+=(t['net']-interest)/t['entry']*10000;borrow+=interest
        counts[t['reason']]+=1
    s=row['stats']['all']
    assert len(trades)==s['trades']
    assert math.isclose(net,s['net'],abs_tol=1e-6)
    assert math.isclose(borrow,s['borrow'],abs_tol=1e-6)
    assert math.isclose(bps/len(trades),s['meanNetBpsPerTrade'],abs_tol=1e-8)
    assert sum(m['stats']['all']['trades'] for m in row['monthly'])==len(trades)
    assert math.isclose(sum(m['stats']['all']['net'] for m in row['monthly']),net,abs_tol=1e-6)
    if not row['baseline'] and row['scenario']=='base' and row['period']!='train':
        reasons[f"{row['period']}-{row['symbol']}"]=dict(counts)

power=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision']==r['powerBefore']['revision']
verification={'runsReconciled':96,'trainingCandidates':8,'trainingRunsIncludingOriginals':60,
              'validationAndTestRunsIncludingOriginals':36,'selectionRecomputedFromTrainingOnly':True,
              'selectedCandidate':lock['selected']['id'],'power':'OFF','revision':power['revision'],
              'exitReasons':reasons,'productionWrites':False,'networkCalls':False}
(OUT/'verification.json').write_text(json.dumps(verification,indent=2))

fields=['period','symbol','candidate','scenario','month','status','side','trades','net','meanNetBpsPerTrade','winRate','profitFactor']
with (OUT/'monthly.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for x in r['training']+r['evaluations']:
        for m in x['monthly']:
            for side in ['all','long','short']:
                w.writerow(dict(period=x['period'],symbol=x['symbol'],candidate=x['candidateId'],scenario=x['scenario'],
                                month=m['month'],status=m['status'],side=side,**{k:m['stats'][side][k] for k in fields[7:]}))

lines=['# EMA9/VWAP mit Trendfilter und weiteren Stops — getrennter historischer Versuch','',
    'Die getestete Änderung liefert keine tragfähige Verbesserung nach Kosten. Alle acht Trainingskandidaten sind im Basismodell auf beiden Märkten negativ. Der ausschließlich auf 2022–2023 ausgewählte Kandidat bleibt auch 2024 und 2025 negativ. Bei ETH fällt der mittlere Verlust im Basismodell etwas kleiner aus, bei BTC größer.', '',
    '## Festgelegte Methode','',
    'Acht Kombinationen: bestätigtes Kreuz oder früher Einstieg × Mindeststop 0,5% oder 1,0% × Gewinnziel 2R oder 3R. Für alle: Long nur oberhalb einer steigenden EMA200, Short nur unterhalb einer fallenden EMA200; 5-Minuten-Schlusskurse, Steigung gegenüber zwölf abgeschlossenen Kerzen zuvor.',
    'EMA200 wird mit den ersten 200 Schlusskursen gestartet. ATR14 nutzt Wilder-Glättung; True Range berücksichtigt den vorherigen Schlusskurs. Stop-Abstand ab ausgeführtem Einstieg ist das Maximum aus positivem Signalkerzenabstand, 2×ATR14 am Signal und Mindestprozentsatz. Nächste Kerzeneröffnung als Einstieg, Stop zuerst bei mehrdeutiger Kerze, Gegenkreuz nächste Eröffnung als Ausstieg, Glattstellung zum UTC-Tagesende. Keine zusätzliche Änderung an Gegenkreuz oder Session-Ausgang.',
    'Daten: vorhandene lokale, per SHA256 erneut geprüfte Binance-Spot-5-Minuten-Historie mit Volumen, ETHUSDT/BTCUSDT 2022–2025. März 2023 vollständig ausgeschlossen, da jeweils 16 Kerzen fehlen. Keine neuen Daten geladen. Indikatorhistorie über Split-Grenzen fortgeführt, nach der ausgeschlossenen Lücke neu aufgewärmt. Vorjahreskurse dienen nur der kausalen Indikatorinitialisierung, keine Vorjahrestrades in den Prüfergebnissen.',
    'Auswahl: acht Kandidaten ausschließlich auf 2022–2023. Je Kandidat gleichgewichteter Durchschnitt des mittleren Nettoergebnisses pro Trade beider Märkte, nur Basiskosten. Keine Auswahl anhand von 2024 oder 2025. Der Gewinner und SHA256 der Trainingsdatei wurden vor Laden der Validierungs-/Testpreise dieses Versuchs in selection-lock.json gespeichert. Auch ein negativer Gewinner wird einmal diagnostisch weitergeprüft.',
    'Danach nur der festgeschriebene Kandidat auf 2024 (Validierung) und 2025 (Abschlusstest), ohne Anpassung, Austausch oder erneute Auswahl. Die ursprünglichen beiden Varianten dienen als unveränderte Vergleichsläufe auf denselben Zeitabschnitten.',
    'Die Jahre wurden zuvor bereits für die ursprüngliche Strategie ausgewertet. Die zeitliche Trennung verhindert Auswahl anhand der neuen Prüfergebnisse, erzeugt aber keinen vollständig unberührten oder unabhängigen Holdout. Kein Nachweis künftiger Profitabilität.', '',
    '## Kosten und Maße','',
    'Kosten unverändert: 10 bp = 0,10% Gebühr je Seite. Gesamter Spread / Slippage je Seite: niedrig 1/1 bp, Basis 4/3 bp, Stress 10/10 bp. Hypothetische Spot-Margin-Shorts zusätzlich 1 bp pro angefangener Stunde Leihpuffer. Keine verifizierten historischen Quotes, individuellen Gebührenaktionen, tatsächlichen Kreditkonditionen oder Leihverfügbarkeit. Referenz öffentlicher Standardtarif: https://www.binance.com/en/fee/trading (am 19.10.2026 geprüft).',
    'Menge 1 ETH beziehungsweise 1 BTC, keine Hebel-/Kontosimulation. Vergleichsmaß: arithmetischer Durchschnitt Netto-PnL / Einstiegswert × 10.000 pro Trade, einschließlich Leihpuffer; keine Kontorendite. Drawdown in results.json nur aus geschlossenen Trades bei fester Menge. VWAP weiterhin typische Kerzenpreise nach echtem Basisvolumen gewichtet, keine tickgenaue Rekonstruktion.', '',
    '## Alle acht Trainingskandidaten, Basiskosten','',
    '| Kandidat | ETH bp/Trade | BTC bp/Trade | Gleichgewichteter Score |',
    '|---|---:|---:|---:|']
for score,cid in ranking:
    pair={x['symbol']:x['stats']['all']['meanNetBpsPerTrade'] for x in r['training'] if x['candidateId']==cid and x['scenario']=='base'}
    lines.append(f"| {cid} | {pair['ETHUSDT']:.2f} | {pair['BTCUSDT']:.2f} | {score:.2f} |")
lines += ['',f"Ausgewählt: **{lock['selected']['id']}**, Score {lock['selection']['score']:.2f} bp/Trade. Negativer Auswahlwert; ausschließlich diagnostische Fortsetzung.",'',
    '## Getrennte Validierung und Abschlusstest — Basiskosten','',
    '| Zeitraum | Markt | Trades neu | Original Kreuz bp/Trade | Mit Trendfilter/weiterem Stop bp/Trade | Neue Trefferquote |',
    '|---|---|---:|---:|---:|---:|']
for x in r['evaluations']:
    if x['baseline'] or x['scenario']!='base':continue
    old=next(y for y in r['evaluations'] if y['baseline'] and y['candidateId']=='original-cross' and y['period']==x['period'] and y['symbol']==x['symbol'] and y['scenario']=='base')
    s=x['stats']['all'];lines.append(f"| {x['period']} | {x['symbol']} | {s['trades']} | {old['stats']['all']['meanNetBpsPerTrade']:.2f} | {s['meanNetBpsPerTrade']:.2f} | {s['winRate']*100:.1f}% |")
lines += ['', '## Kostensensitivität des festgeschriebenen Kandidaten','',
    '| Zeitraum | Markt | Kosten | Trades | Netto USDT, Menge 1 | Netto bp/Trade |',
    '|---|---|---|---:|---:|---:|']
for x in r['evaluations']:
    if x['baseline']:continue
    s=x['stats']['all'];lines.append(f"| {x['period']} | {x['symbol']} | {x['scenario']} | {s['trades']} | {s['net']:.2f} | {s['meanNetBpsPerTrade']:.2f} |")
lines += ['', '## Beobachtete Ausstiege und Einordnung','',
    'Im Basismodell schließt das Gegenkreuz den überwiegenden Teil der neuen Trades. Die weiteren Ziele werden daher häufig nicht erreicht. Dies ist eine Beobachtung des Versuchs, kein Beweis, dass das Entfernen des Gegenkreuzes die Strategie profitabel machen würde. Die freigegebenen Ausstiegsregeln wurden beibehalten.']
for k,v in reasons.items():
    total=sum(v.values());lines.append(f"- {k}: {v.get('counter-cross',0)}/{total} Gegenkreuz-Ausstiege ({100*v.get('counter-cross',0)/total:.1f}%), {v.get('target',0)} Ziel-Ausstiege.")
lines += ['',
    'Nach diesen Ergebnissen ist die Änderung keine belastbar profitable Strategie. Keine Live-Aktivierung empfohlen oder vorgenommen. Isolierte Tests und getrennte historische Prüfung ersetzen keine realen Ausführungsnachweise.', '',
    '## Verifikation und Dateien','',
    '17 automatisierte Tests bestanden, darunter EMA/ATR-Warmup, Filterrichtung, Kausalität, Stop-/Zielabstände, Auswahl ohne Prüfdaten, Gap-Stop und konservative Mehrdeutigkeitsbehandlung. Alle 96 Läufe (60 Training inklusive Originale, 36 Validierung/Test inklusive Originale) unabhängig aus Einzeltrades nachgerechnet: Trendbedingungen, Stop-/Zielmathematik, Gebühren/Fills, Leihpuffer, Zeitgrenzen, nicht überlappende Positionen, Monats- und Gesamtsummen. Auswahl aus Training unabhängig neu berechnet.',
    f"Power vorher/nachher OFF, Revision {r['powerBefore']['revision']}/{power['revision']}. Kein Provideraufruf, Download, Konto, Produktionsimport, Neustart oder Order.",
    'Dateien: protocol.json, selection-lock.json, training.json, results.json, monthly.csv, verification.json, trades-*.json. Reproduktion der Verifikation: python scripts/ema-vwap-trend-report.py. Tests: node --test scripts/ema-vwap-offline.test.mjs scripts/ema-vwap-history.test.mjs scripts/ema-vwap-trend.test.mjs. Der Runner überschreibt bestehende Versuchsdaten nicht.',
    'Datenattribution: Binance Public Data / Binance Vision. Persönliche nichtkommerzielle Offline-Forschung; Daten laut lokalem Erwerbsprotokoll CC BY-NC-SA 4.0. Abgeleitete Berichtsdaten unter derselben Lizenz: https://creativecommons.org/licenses/by-nc-sa/4.0/']
(OUT/'bericht.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(verification,indent=2))
