"""Independent archive, trade and summary reconciliation plus German report."""
import csv, datetime, hashlib, io, json, math, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs/ema-vwap-extended-20261019'
data = json.loads((OUT / 'results.json').read_text())
manifest = json.loads((OUT / 'download-manifest.json').read_text())
assert len(manifest['archives']) == 96 and not manifest['errors']
for a in manifest['archives']:
    name = f"{a['symbol']}-5m-{a['year']}-{a['month']:02d}"
    raw = (OUT / 'data' / (name + '.zip')).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == a['archiveSha256']
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        content = z.read(name + '.csv')
    assert content == (OUT / 'data' / (name + '.csv')).read_bytes()
    assert hashlib.sha256(content).hexdigest() == a['csvSha256']

for r in data['results']:
    trades = json.loads((OUT / r['tradesFile']).read_text())
    assert len(trades) == r['overall']['all']['trades']
    previous = -1
    net, borrow, bp = 0.0, 0.0, 0.0
    for t in trades:
        assert t['entryIndex'] == t['signalIndex'] + 1
        assert t['entryIndex'] > previous and t['exitIndex'] >= t['entryIndex']
        previous = t['exitIndex']
        assert t['entryAt'][:10] == t['exitBarStart'][:10]
        assert math.isclose(t['gross'] - t['cost'], t['net'], abs_tol=1e-7)
        adverse = (r['costs']['spreadBps'] / 2 + r['costs']['slippageBps']) / 10000
        assert math.isclose(t['entry'], t['rawEntry'] * (1 + t['direction'] * adverse), abs_tol=1e-7)
        assert math.isclose(t['exit'], t['rawExit'] * (1 - t['direction'] * adverse), abs_tol=1e-7)
        assert math.isclose(t['fee'], (t['entry'] + t['exit']) * r['costs']['feeBps'] / 10000, abs_tol=1e-7)
        begin = datetime.datetime.fromisoformat(t['entryAt'])
        end = datetime.datetime.fromisoformat(t['exitBarStart'])
        hours = max(1, math.ceil((end - begin).total_seconds() / 3600))
        interest = t['entry'] * hours / 10000 if t['direction'] == -1 else 0
        borrow += interest
        net += t['net'] - interest
        bp += (t['net'] - interest) / t['entry'] * 10000
    s = r['overall']['all']
    assert math.isclose(net, s['net'], abs_tol=1e-6)
    assert math.isclose(borrow, s['borrow'], abs_tol=1e-6)
    assert math.isclose(bp / len(trades), s['meanNetBpsPerTrade'], abs_tol=1e-8)
    assert sum(y['all']['trades'] for y in r['yearly']) == len(trades)
    assert math.isclose(sum(y['all']['net'] for y in r['yearly']), net, abs_tol=1e-6)
    assert math.isclose(sum(m['all']['net'] for m in r['monthly']), net, abs_tol=1e-6)
power = json.loads((ROOT / 'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision'] == data['powerBefore']['revision']
verification = {'archivesVerified': 96, 'runsReconciled': len(data['results']),
                'tests': 'Archive hashes and extracted CSV, chronology, no overlapping trades, same-session exits, fee/fill arithmetic, borrow arithmetic, annual and monthly totals',
                'power': 'OFF', 'revision': power['revision'], 'productionWrites': False}
(OUT / 'verification.json').write_text(json.dumps(verification, indent=2))

fields = ['symbol','variant','scenario','month','dataStatus','direction','trades','net','meanNetBpsPerTrade','winRate','profitFactor']
with (OUT / 'monthly.csv').open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in data['results']:
        for m in r['monthly']:
            for side in ['all','long','short']:
                writer.writerow({**{k:r[k] for k in ['symbol','variant','scenario']},
                                 **{k:m[k] for k in ['month','dataStatus']}, 'direction':side,
                                 **{k:m[side][k] for k in fields[6:]}})

lines = ['# EMA9 / VWAP — historischer Vergleich 2022–2025', '',
    'Beide Varianten sind auf ETH/USDT und BTC/USDT nach Kosten negativ. Auch jedes ausgewertete Kalenderjahr und jeder der 47 ausgewerteten Monate je Markt ist in allen drei Kostenmodellen insgesamt negativ. Das Ergebnis wird durch den zweiten Markt und den längeren Zeitraum gestützt; kein Beweis für alle zukünftigen Marktphasen.', '',
    '## Daten und feste Regeln', '',
    '96 öffentliche Binance-Spot-Monatsarchive (2 Märkte × 48 Monate), Januar 2022 bis Dezember 2025, einmalig mit ausdrücklicher Freigabe heruntergeladen. Alle Anbieter-Prüfsummen stimmen. CSV-Inhalt unabhängig erneut mit dem ZIP-Inhalt verglichen. Quellen-URLs, Zeitpunkte und Hashes stehen im download-manifest.json.',
    'Quelle und Namensschema: https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/5m/BTCUSDT-5m-2022-01.zip (entsprechend für ETHUSDT und alle Monate).',
    'März 2023 ist bei beiden Märkten ausgeschlossen: jeweils 8.912 statt 8.928 erwarteten Kerzen. Fehlende 16 Kerzen nicht interpoliert. Ausgeschlossen wird der ganze Monat gemäß vorab festgelegtem Monatsprüfprotokoll; die Ursache der fehlenden Zeilen ist nicht unabhängig belegt.',
    'Je Markt ausgewertet: 47 Monate, 411.840 Kerzen, zwei kontinuierliche Abschnitte. EMA wird innerhalb der Abschnitte über Monats-/Jahresgrenzen fortgeführt, nach der ausgeschlossenen Lücke neu aufgewärmt. Session-VWAP täglich 00:00 UTC zurückgesetzt.',
    'Regeln unverändert: EMA9, bestätigtes Kreuz mit Kerzenausbruch oder früher Einstieg bei Annäherung auf maximal 10 bp; nächste Kerzeneröffnung; Stop am Signalkerzenextrem; Ziel 1,5R; Gegenkreuz-Ausstieg nächste Eröffnung; Sitzungsschluss glatt; eine Position. Bei Stop und Ziel in derselben Kerze Stop zuerst. Kein Optimieren anhand der Ergebnisse.',
    'VWAP bleibt eine Approximation aus typischem Kerzenpreis (H+L+C)/3 und echtem Basis-Handelsvolumen. Kein tickgenauer VWAP. Beide Zeitstempelvarianten (Millisekunden vor 2025, Mikrosekunden ab 2025) streng normalisiert.', '',
    '## Kosten und Vergleichsmaß', '',
    'Unveränderte Gebührenannahme 10 bp = 0,10% je Seite, keine Rabatte. Referenz öffentlicher Standardtarif: https://www.binance.com/en/fee/trading (am 19.10.2026 geprüft, keine Belegung des individuellen historischen Tarifs). Mögliche historische Sonderaktionen nicht nachgebildet.',
    'Gesamter Spread / Slippage je Seite: niedrig 1/1 bp, Basis 4/3 bp, Stress 10/10 bp. Jeweils volle Gebühr auf Ein- und Ausstieg. Spread und Slippage sind nachteilige Annahmen, keine gemessenen historischen Quotes oder Fills.',
    'Shorts sind hypothetische Margin-Diagnostik auf Spotpreisen. Zusätzlich 1 bp pro angefangener Stunde, mindestens eine Stunde, als Leihkostenpuffer. Keine bestätigte Leihverfügbarkeit oder historische Zinskurve; keine Futures-, Margin- oder Liquidationssimulation.',
    'Simuliert wird weiterhin 1 ETH beziehungsweise 1 BTC je Trade. USDT-PnL deshalb nicht zwischen den Märkten vergleichen. Das vergleichbare Maß ist der arithmetische Durchschnitt von Netto-PnL / ausgeführtem Einstiegswert × 10.000 pro Trade, einschließlich Leihpuffer. Das ist keine Kontorendite und keine kumulierte Prozentperformance.',
    'Verschiedene Kosten ändern Einstieg, Ziel und Haltezeit; die Tradeanzahl kann deshalb variieren. Long/Short sind Aufteilungen desselben Laufes, keine separat simulierten reinen Richtungsstrategien.', '',
    '## Gesamtergebnis', '',
    '| Markt | Variante | Kosten | Trades | Netto USDT bei Menge 1 | Netto bp/Trade | Trefferquote | Positive Monate |',
    '|---|---|---|---:|---:|---:|---:|---:|']
for r in data['results']:
    s = r['overall']['all']
    positive = sum(m['dataStatus']=='valid' and m['all']['net']>0 for m in r['monthly'])
    lines.append(f"| {r['symbol']} | {r['variant']} | {r['scenario']} | {s['trades']} | {s['net']:.2f} | {s['meanNetBpsPerTrade']:.2f} | {100*s['winRate']:.1f}% | {positive}/47 |")
lines += ['', '## Jahresvergleich im Basismodell', '',
    '| Markt | Variante | 2022 bp/Trade | 2023 bp/Trade* | 2024 bp/Trade | 2025 bp/Trade |',
    '|---|---|---:|---:|---:|---:|']
for r in data['results']:
    if r['scenario']=='base':
        lines.append('| '+r['symbol']+' | '+r['variant']+' | '+' | '.join(f"{y['all']['meanNetBpsPerTrade']:.2f}" for y in r['yearly'])+' |')
lines += ['', '*2023 ohne März. Diese Jahres-/Monatsaufteilung ist eine deskriptive Prüfung unterschiedlicher historischer Zeitabschnitte, keine vorab definierte Klassifizierung von Bull-, Bear- und Seitwärtsregimen und kein unabhängiger Holdout.', '',
    '## Grenzen und Bewertung', '',
    'Die getesteten engen Stop-/Zielabstände erzielen nach den unveränderten Kosten keinen tragfähigen Vorteil. Das frühere Ergebnis beschränkt sich damit nicht auf ETH im September 2026. Auf ETH schneidet die bestätigte Kreuzung im Basismodell etwas besser ab; auf BTC der frühe Einstieg. Beide bleiben klar negativ.',
    'Keine Aussage zur Ausführbarkeit mit Kleinstkapital, Mindestordergrößen, Gebührenwährung, Liquidität, exakter Intrabar-Reihenfolge oder tatsächlicher Short-Finanzierung. Der ausgewiesene Drawdown basiert auf geschlossenen Trades bei fester Menge, nicht auf Mark-to-Market-Konto- oder Liquidationsrisiko. Der Versuch ist retrospektiv und ohne Parameteroptimierung; keine Live-Freigabe.',
    'Datenattribution: Binance Public Data / Binance Vision. Persönliche nichtkommerzielle Offline-Forschung; Daten laut bisherigem Erwerbsprotokoll CC BY-NC-SA 4.0. Abgeleitete Berichtsdaten unter derselben Lizenz: https://creativecommons.org/licenses/by-nc-sa/4.0/', '',
    '## Nachweise', '',
    '10 automatisierte Tests bestanden. Alle 12 Läufe unabhängig aus den gespeicherten Einzeltrades nachgerechnet, einschließlich Kosten, Leihpuffer, Monat-/Jahressummen, zeitlich getrennter Positionen und Ausführung zur nächsten Kerze. Alle 96 Archive erneut geprüft.',
    f"Numaron vorher/nachher OFF, Revision {data['powerBefore']['revision']}/{power['revision']}. Keine Produktion geändert oder gestartet. Nur der ausdrücklich freigegebene öffentliche Archivdownload; keine Accounts, Schlüssel, bezahlten Daten oder Orders.",
    'Dateien: results.json (Jahres-/Monatswerte und Long/Short), monthly.csv, trades-*.json (Einzeltrades), download-manifest.json, protocol.json und verification.json.',
    'Reproduktion ohne weiteren Download: node --test scripts/ema-vwap-offline.test.mjs scripts/ema-vwap-history.test.mjs; python scripts/ema-vwap-extended-report.py. Der Runner überschreibt bestehende results.json absichtlich nicht.']
(OUT / 'bericht.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(json.dumps(verification, indent=2))
