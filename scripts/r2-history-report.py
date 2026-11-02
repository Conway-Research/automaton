"""Independent Python R2 simulation, archive checks, and result report."""
import collections,csv,datetime,hashlib,io,json,math,pathlib,zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'outputs/r2-history-20261019'
r=json.loads((OUT/'results.json').read_text());manifest=json.loads((OUT/'download-manifest.json').read_text())
assert len(r['results'])==39 and len(manifest['archives'])==218 and not manifest['errors']
for a in manifest['archives']:
    name=f"{a['symbol']}-1d-{a['year']}-{a['month']:02d}";raw=(OUT/'data'/(name+'.zip')).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==a['archiveSha256']
    with zipfile.ZipFile(io.BytesIO(raw)) as z:content=z.read(name+'.csv')
    assert content==(OUT/'data'/(name+'.csv')).read_bytes()
    assert hashlib.sha256(content).hexdigest()==a['csvSha256']
for symbol,h in r['protocol']['dataHashes'].items():assert hashlib.sha256((OUT/f'normalized-{symbol}.json').read_bytes()).hexdigest()==h
assert hashlib.sha256((ROOT/'scripts/lib/r2-long-history.mjs').read_bytes()).hexdigest()==r['protocol']['codeSha256']
assert hashlib.sha256((ROOT/'scripts/lib/daily-reversion.mjs').read_bytes()).hexdigest()==r['protocol']['sharedStatsCodeSha256']
assert hashlib.sha256((OUT/'data/SPY-yahoo.json').read_bytes()).hexdigest()==manifest['spy']['sha256']
DAY=86400000
def near(a,b):assert math.isclose(a,b,abs_tol=1e-6,rel_tol=1e-10),(a,b)
def simulate(bars,symbol,costs,start,end):
    f=[];g=l=0
    for i,b in enumerate(bars):
        if i:
            d=b['close']-bars[i-1]['close'];up=max(d,0);down=max(-d,0)
            if i<=2:g+=up/2;l+=down/2
            else:g=(g+up)/2;l=(l+down)/2
        rsi=None if i<2 else 50 if g==l==0 else 100 if l==0 else 100-100/(1+g/l)
        f.append((sum(x['close'] for x in bars[i-199:i+1])/200 if i>=199 else None,rsi))
    slip=(costs['spreadBps']/2+costs['slippageBps'])/10000
    def fee(q,price,sell=False):
        if symbol!='SPY':return q*price*costs['feeBps']/10000
        return min(q*price*.01,max(costs['minFee'],q*costs['perShare']))+(q*price*costs['regulatorySellBps']/10000 if sell else 0)
    cash=10000.0;pos=None;pending=None;trades=[];marks=[]
    def sell(i,price,reason,exit_signal=None):
        nonlocal cash,pos
        exit=price*(1-slip);exitfee=fee(pos['quantity'],exit,True)
        net=(exit-pos['entry'])*pos['quantity']-pos['entryFee']-exitfee+pos['dividends']
        cash+=pos['quantity']*exit-exitfee
        trades.append(pos|{'exitIndex':i,'exitSignalIndex':exit_signal,'exit':exit,'exitFee':exitfee,'fee':exitfee+pos['entryFee'],
                           'net':net,'netReturn':net/pos['capitalBefore'],'reason':reason})
        pos=None
    for i,b in enumerate(bars):
        if not start<=b['time']<end:continue
        last=i==len(bars)-1 or bars[i+1]['time']>=end
        if pos and b.get('dividend',0):
            paid=pos['quantity']*b['dividend'];cash+=paid;pos['dividends']+=paid
        if pending:
            kind,sig=pending
            if kind=='exit' and pos:sell(i,b['open'],'signal',sig)
            elif kind=='entry' and not pos and not last:
                entry=b['open']*(1+slip);capital=cash
                q=math.floor(cash/entry) if symbol=='SPY' else cash/(entry*(1+costs['feeBps']/10000))
                while q>0 and q*entry+fee(q,entry)>cash+1e-9:q-=1
                if q>0:
                    entryfee=fee(q,entry);cash-=q*entry+entryfee
                    pos={'signalIndex':sig,'entryIndex':i,'entry':entry,'quantity':q,'entryFee':entryfee,'capitalBefore':capital,'dividends':0,'worstLiquidationReturn':0}
            pending=None
        if pos:
            markexit=b['low']*(1-slip)
            pos['worstLiquidationReturn']=min(pos['worstLiquidationReturn'],(cash+pos['quantity']*markexit-fee(pos['quantity'],markexit,True))/pos['capitalBefore']-1)
        if last and pos:sell(i,b['close'],'boundary')
        marks.append(cash+(pos['quantity']*b['close'] if pos else 0))
        if not last:
            sma,rsi=f[i]
            if pos and rsi>75:pending=('exit',i)
            elif not pos and i>=4 and sma is not None and b['close']>sma and f[i-2][1]<65 and f[i-1][1]<f[i-2][1] and rsi<f[i-1][1]:pending=('entry',i)
    return trades,marks,cash
for row in r['results']:
    bars=json.loads((OUT/f"normalized-{row['symbol']}.json").read_text());actual=json.loads((OUT/row['detailsFile']).read_text())
    start=int(datetime.datetime.fromisoformat(row['startDate']).replace(tzinfo=datetime.timezone.utc).timestamp()*1000)
    end=int(datetime.datetime.fromisoformat(row['endDate']).replace(tzinfo=datetime.timezone.utc).timestamp()*1000)
    trades,marks,cash=simulate(bars,row['symbol'],row['costs'],start,end)
    assert len(trades)==len(actual['trades'])==row['stats']['trades']
    for a,b in zip(trades,actual['trades']):
        for k in ['signalIndex','entryIndex','exitIndex','exitSignalIndex','reason']:assert a[k]==b[k],(k,a[k],b[k])
        for k in ['entry','exit','quantity','entryFee','exitFee','fee','net','netReturn','dividends','capitalBefore','worstLiquidationReturn']:near(a[k],b[k])
    assert len(marks)==len(actual['equity'])
    for a,b in zip(marks,actual['equity']):near(a,b['equity'])
    near(cash,row['stats']['endingCapital']);near(cash-10000,row['stats']['net'])
    assert sum(t['net']>0 for t in trades)==row['stats']['wins']
    peak=10000;dd=0
    for value in marks:peak=max(peak,value);dd=max(dd,1-value/peak)
    near(dd,row['stats']['maxCloseDrawdownFraction'])
power=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision']==r['powerBefore']['revision']
verify={'archivesVerified':218,'SPYRows':8475,'runsIndependentlyResimulated':39,
        'verification':'Full Python resimulation: all daily signals and fills, no missing trades, cash/dividend/whole-share/commission accounting, marked equity, drawdowns and net winners',
        'power':'OFF','revision':power['revision'],'networkCallsDuringEvaluation':False,'productionWrites':False}
(OUT/'verification.json').write_text(json.dumps(verify,indent=2))
fields=['symbol','period','startDate','endDate','scenario','trades','wins','winRate','netReturn','profitFactor','maxCloseDrawdownFraction','boundaryTrades','naturalExitWinRate']
with (OUT/'summary.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for x in r['results']:w.writerow({k:x[k] for k in fields[:5]}|{k:x['stats'][k] for k in fields[5:]})
lines=['# R2 ohne Optimierung — längere Krypto-Historie und SPY','',
    'ETH erreicht im festgelegten Testabschnitt 2024–2025 genau 15/20 = 75% Nettotrefferquote in allen drei Kostenmodellen. BTC erreicht 23/32 = 71,88%, SPY im Testabschnitt 2017–2025 54/73 = 73,97% im Basismodell. Keine markt- und zeitraumübergreifend bestätigte Mindesttrefferquote von 75%. Kleine Stichproben und hohe zwischenzeitliche Verluste bleiben wesentlich.', '',
    '## Vorab festgelegte Zeitabschnitte und Daten','',
    'Krypto: native tägliche Binance-Spot-OHLCV-Archive ETHUSDT/BTCUSDT von September 2017 bis September 2026. Je 3.317 lückenlose Tage, 218 Monatsarchive, Anbieter-Checksumme und lokale CSV/ZIP-Gleichheit geprüft. Im Unterschied zu den früheren 5-Minuten-Aggregaten ist März2023 hier als nativer Tagesdatensatz enthalten; kein künstlicher Monatsausfall oder Neustart danach.',
    'Krypto-Aufteilung: Entwicklung 2018–2021, Validierung 2022–2023, Test 2024–2025, separate Erweiterung Januar–September 2026. September–Dezember 2017 dienen nur als Preisvorgeschichte; die SMA200 ist erst nach genügend Tagesbeobachtungen gültig.',
    'SPY: 8.475 echte Beobachtungstage vom 29.01.1993 bis 30.09.2026, öffentliche Yahoo-Chart-Daten. Unbereinigte Quote-OHLC, tatsächliches Handelsvolumen, 136 Dividendeneinträge. Keine Splits im Datensatz. Beobachtungstage mit lokalem NYSE-Feiertagskalender inklusive historischer Sonderschließungen verglichen: keine fehlenden/unerwarteten Sitzungen. Keine Wochenendinterpolation.',
    'SPY-Aufteilung: Entwicklung 1994–2006, Validierung 2007–2016, Test 2017–2025, separate Erweiterung Januar–September 2026. 1993 dient der Initialisierung. Ergänzender Quellenvergleich SPY 1995–2006, nicht zur Auswahl oder Optimierung.',
    'Originalveröffentlichung: https://tradingmarkets.com/recent/the_improved_r2_strategy_84_correct_with_just_6_rules_-674361 berichtet SPX 1995–2006 mit 102 Trades und 84,31%. Unser SPY-Proxy mit nächsten-Eröffnung-Fills ist ein anderer Versuch; keine Behauptung exakter Reproduktion dieser Zahl.',
    'Historische Abschnitte überschneiden frühere Untersuchungen. Die 2026-Erweiterung wurde jetzt erstmals für R2 ausgewertet, aber nicht prospektiv gesammelt. Kein vollständig unberührter Holdout und keine Garantie künftiger Trefferquoten.', '',
    '## Unveränderte Regeln und realistisches Ausführungsmodell','',
    'Improved R2: Schlusskurs über SMA200; Wilder-RSI2 vor zwei Handelssitzungen <65, danach zweimal strikt fallend. Kauf an der nächsten Sitzungseröffnung; Verkauf an der nächsten Sitzungseröffnung nach RSI2>75. Keine Schutzstops, keine Nachkäufe, kein Hebel, eine Position. Krypto-SMA/RSI je UTC-Tag, SPY je tatsächlicher Börsensitzung.',
    'Jeder Zeitraum beginnt flat mit 10.000 synthetischen USD/USDT. Vergangenheitskurse dienen nur dem Warmup. Kapital innerhalb eines Abschnitts wiederangelegt. Krypto mit gebrochenen Einheiten, SPY mit ganzen Aktien und verbleibendem Cash. Offene Endpositionen zum letzten verfügbaren Schlusskurs inklusive Kosten glattgestellt, Grenztrades gesondert ausgewiesen. Ergebnisse vor Steuern, keine echten Gelder.',
    'Krypto-Kosten unverändert: 10 bp = 0,10% Gebühr je Seite. Gesamter Spread / Slippage je Seite niedrig 1/1 bp, Basis 4/3 bp, Stress 10/10 bp.',
    'SPY-Kosten aus öffentlichem IBKR-Pro-Fixed-Tarif abgeleitet: 0,005 USD pro Aktie, mindestens 1 USD, maximal 1% des Orderwerts; zusätzlicher Verkaufspuffer 0,5 bp. Keine IBKR-Lite-Annahme. Spread/Slippage niedrig 1/1 bp, Basis 2/2 bp; Stress 0,01 USD/Aktie, mindestens 2 USD, Verkaufspuffer 1 bp, Spread/Slippage 10/10 bp. Referenz am 19.10.2026 geprüft: https://www.interactivebrokers.com/en/pricing/commissions-stocks.php',
    'Diese Gebührenszenarien sind keine Rekonstruktion historischer persönlicher Brokerkonditionen. Spread, Slippage und regulatorischer Puffer sind Annahmen, keine historischen Quotes. Steuern, Quellensteuer, Währungsumtausch, Verwahrung, Cash-Zinsen und Opportunitätskosten nicht modelliert.',
    'SPY-Dividenden: unbereinigte Kurse, Adjusted Close nicht verwendet. Brutto-Cashanspruch am Ex-Tag nur für Positionen vom vorherigen Schluss; auch ein Verkauf zur Ex-Tag-Eröffnung erhält die Ausschüttung, ein Kauf dort nicht. Gutschrift vereinfacht am Ex-Tag statt späterem Zahlungstag, keine sofortige Wiederanlage. Dadurch keine doppelte Dividendenzählung.',
    'Nettotrefferquote: Netto-PnL inklusive aller modellierten Gebühren und gegebenenfalls Bruttodividenden strikt >0. Rendite ist die Gesamtrendite des synthetischen Kontos über den jeweiligen unterschiedlich langen Abschnitt, nicht annualisiert. Drawdown auf täglichen Schlusskurs-Mark-to-Market-Werten; Intraday-Drawdown kann höher liegen.', '',
    '## Basismodell — vollständige Übersicht','',
    '| Markt | Abschnitt | Zeitraum | Gewinner/Trades | Netto-Trefferquote | Gesamtrendite vor Steuer | Schlusskurs-Drawdown |',
    '|---|---|---|---:|---:|---:|---:|']
for x in r['results']:
    if x['scenario']!='base':continue
    s=x['stats'];lines.append(f"| {x['symbol']} | {x['period']} | {x['startDate']} bis {x['endDate']} exklusiv | {s['wins']}/{s['trades']} | {100*s['winRate']:.2f}% | {100*s['netReturn']:.2f}% | {100*s['maxCloseDrawdownFraction']:.2f}% |")
lines+=['','## Test und separate 2026-Erweiterung — Kosten und Unsicherheit','',
    '| Markt | Abschnitt | Kosten | Gewinner/Trades | Trefferquote | 95%-Wilson-Intervall | Gesamtrendite |',
    '|---|---|---|---:|---:|---|---:|']
for x in r['results']:
    if x['period'] not in ['test','extension2026']:continue
    s=x['stats'];ci=s['winRateWilson95'];lines.append(f"| {x['symbol']} | {x['period']} | {x['scenario']} | {s['wins']}/{s['trades']} | {100*s['winRate']:.2f}% | {100*ci['low']:.1f}–{100*ci['high']:.1f}% | {100*s['netReturn']:.2f}% |")
lines+=['','## Interpretation','',
    '- Das Ziel wird in einzelnen Abschnitten beobachtet: ETH-Test 75%, SPY-Entwicklung 77,78%, SPY-Quellenfenster 78,64%, SPY-Erweiterung2026 90,91% im Basismodell. Es wird aber nicht konstant über Märkte und Zeiträume erreicht.',
    '- ETH 2024–2025 mit 15/20 hat ein 95%-Wilson-Intervall von etwa 53,1–88,8%. SPY 2026 mit 10/11 liegt ungefähr bei 62,3–98,4%. Die Untergrenzen liegen unter 75%. Kein Abschnitt belegt mit dieser Näherung eine verlässlich mindestens 75%ige Gewinnwahrscheinlichkeit. Trade-Abhängigkeit und Mehrfachbetrachtungen schwächen die Interpretation zusätzlich.',
    '- BTC-Validierung2022–2023 verliert im Basismodell 19,46%. ETH-Entwicklung2018–2021 hat trotz positiven Endergebnisses rund 60% Schlusskurs-Drawdown. SPY-Test2017–2025 hat rund 31% Drawdown; im erhöhten Kostenmodell liegt seine Nettorendite leicht unter null. Die fehlenden Stops bleiben eine wesentliche Verlustgefahr.',
    '- Keine Parameteränderung, Auswahl neuer Schwellen oder Aktivierung aus diesen Ergebnissen. R2 bleibt ein historischer Forschungskandidat, keine Strategie mit zugesicherter Mindesttrefferquote oder freigegebener Echtgeld-Ausführung.', '',
    '## Verifikation und Dateien','',
    '31 JavaScript-Tests und 3 Kalendertests bestanden. Alle 39 Läufe in einer unabhängigen Python-Implementierung vollständig erneut simuliert: sämtliche Signale und Fills, SMA/RSI, Aktienanzahl, Gebühren, Dividenden, Cash und tägliche Kontowerte, Trefferquoten und Drawdowns. Alle 218 Archive erneut gegen Hashes geprüft und CSV mit Archivinhalt verglichen.',
    f"Numaron vor/nach Download und Auswertung OFF, Revision {power['revision']}. Nur der ausdrücklich freigegebene öffentliche historische Download. Keine Produktionsänderungen, Konten, Schlüssel, Orders oder Neustarts.",
    'Nachweise: acquisition-plan.json, download-manifest.json, quality.json, protocol.json, results.json, summary.csv, verification.json, normalized-*.json und run-*.json. Reproduktion ohne weiteren Download: python scripts/r2-history-report.py.',
    'Quellenattribution: Krypto Binance Public Data / Binance Vision (Archiv-URLs im Manifest), SPY Yahoo Finance Chart (genaue URL und SHA256 im Manifest). Persönliche lokale Offline-Forschung. Für SPY wird keine Binance-Lizenz behauptet.']
(OUT/'bericht.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(verify,indent=2))
