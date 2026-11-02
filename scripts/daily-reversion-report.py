"""Independent daily indicator/trade/account verification and German results report."""
import collections,csv,datetime,hashlib,json,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'outputs/daily-reversion-20261019'
r=json.loads((OUT/'results.json').read_text())
assert len(r['results'])==54
assert hashlib.sha256((ROOT/'scripts/lib/daily-reversion.mjs').read_bytes()).hexdigest()==r['protocol']['codeSha256']
DAY=86400000
datasets={symbol:json.loads((OUT/f'daily-{symbol}.json').read_text()) for symbol in ['ETHUSDT','BTCUSDT']}
def features(bars):
    out=[];gain=loss=0.0
    for i,b in enumerate(bars):
        if i:
            d=b['close']-bars[i-1]['close'];g=max(d,0);l=max(-d,0)
            if i<=2:gain+=g/2;loss+=l/2
            else:gain=(gain+g)/2;loss=(loss+l)/2
        rsi=None if i<2 else 50 if gain==loss==0 else 100 if loss==0 else 100-100/(1+gain/loss)
        out.append({'sma':sum(x['close'] for x in bars[i-199:i+1])/200 if i>=199 else None,
                    'rsi':rsi,'ibs':.5 if b['high']==b['low'] else (b['close']-b['low'])/(b['high']-b['low'])})
    return out
cache={symbol:[features(segment) for segment in segments] for symbol,segments in datasets.items()}
def rule(strategy,bars,f,i):
    a=f[i];c=bars[i]['close']
    if a['rsi'] is None:return False,False
    if strategy=='improved-r2':
        return (i>=4 and a['sma'] is not None and c>a['sma'] and f[i-2]['rsi']<65 and f[i-1]['rsi']<f[i-2]['rsi'] and a['rsi']<f[i-1]['rsi'],a['rsi']>75)
    if strategy=='ibs-rsi2':return a['ibs']<.2 and a['rsi']<10,i>0 and c>bars[i-1]['high']
    if i<6:return False,False
    window=[b['close'] for b in bars[i-6:i+1]]
    return a['sma'] is not None and c>a['sma'] and c==min(window),c==max(window)
def close(a,b,tol=1e-7):assert math.isclose(a,b,abs_tol=tol,rel_tol=1e-10),(a,b)
for row in r['results']:
    d=json.loads((OUT/row['detailsFile']).read_text());s=d['stats'];cash=10000.0;net=0;wins=0;last={};profits=losses=0
    slip=(row['costs']['spreadBps']/2+row['costs']['slippageBps'])/10000;fee=row['costs']['feeBps']/10000
    for t in d['trades']:
        bars=datasets[row['symbol']][t['segmentId']];f=cache[row['symbol']][t['segmentId']]
        i=t['entryIndex'];j=t['exitIndex'];sig=t['signalIndex']
        assert i==sig+1 and j>=i and i>last.get(t['segmentId'],-1);last[t['segmentId']]=j
        assert d['period']['start']<=bars[sig]['time']<d['period']['end']
        assert d['period']['start']<=bars[i]['time']<=bars[j]['time']<d['period']['end']
        assert rule(row['strategy'],bars,f,sig)[0]
        assert t['entryAt']==t['signalAt']
        if t['reason']=='signal':
            assert j==t['exitSignalIndex']+1 and rule(row['strategy'],bars,f,t['exitSignalIndex'])[1]
            assert t['exitAt']==t['exitSignalAt'];raw=bars[j]['open']
        else:
            assert t['reason']=='boundary' and (j==len(bars)-1 or bars[j+1]['time']>=d['period']['end']);raw=bars[j]['close']
        close(t['rawEntry'],bars[i]['open']);close(t['entry'],bars[i]['open']*(1+slip))
        close(t['rawExit'],raw);close(t['exit'],raw*(1-slip))
        close(t['capitalBefore'],cash);quantity=cash/(t['entry']*(1+fee));close(t['quantity'],quantity)
        charge=(t['entry']+t['exit'])*quantity*fee;close(t['fee'],charge)
        pnl=(t['exit']-t['entry'])*quantity-charge;close(t['net'],pnl)
        cash=quantity*t['exit']*(1-fee);net+=pnl;wins+=pnl>0
        if pnl>0:profits+=pnl
        else:losses-=pnl
        close(t['netReturn'],pnl/t['capitalBefore'])
        worst=min([t['entry']]+[b['low'] for b in bars[i:j+(1 if t['reason']=='boundary' else 0)]])
        close(t['worstLow'],worst)
        close(t['worstLiquidationReturn'],quantity*worst*(1-slip)*(1-fee)/t['capitalBefore']-1)
        # No skipped earlier exit signal while the position was held.
        first_exit=t['exitSignalIndex'] if t['reason']=='signal' else j
        assert not any(rule(row['strategy'],bars,f,k)[1] for k in range(i,first_exit))
    close(cash,s['endingCapital']);close(net,s['net']);close(cash,10000+net)
    assert wins==s['wins'] and len(d['trades'])==s['trades']
    if d['trades']:close(wins/len(d['trades']),s['winRate'])
    assert s['meets75PercentObserved']==(len(d['trades'])>0 and wins/len(d['trades'])>=.75)
    if losses:close(profits/losses,s['profitFactor'])
    peak=10000;dd=0
    for mark in d['equity']:
        time=mark['time'];value=10000.0
        # Reconstruct cash and daily marked holdings independently, incl. exit fees only once paid.
        for t in d['trades']:
            begin=int(datetime.datetime.fromisoformat(t['entryAt']).timestamp()*1000)
            finish=int(datetime.datetime.fromisoformat(t['exitAt']).timestamp()*1000)
            if begin>=time:break
            # Prior day's close mark precedes the following open even though
            # both share a UTC boundary timestamp. A terminal close is paid
            # before that day's final mark; a next-open exit is not.
            if finish<time or finish==time and t['reason']=='boundary':
                value=t['capitalBefore']+t['net'];continue
            bars=datasets[row['symbol']][t['segmentId']]
            b=next(b for b in bars if b['time']+DAY==time)
            value=t['quantity']*b['close'];break
        close(value,mark['equity'])
        peak=max(peak,value);dd=max(dd,1-value/peak)
    close(dd,s['maxCloseDrawdownFraction'])
power=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision']==r['powerBefore']['revision']
qualifying=[x for x in r['results'] if x['stats']['meets75PercentObserved']]
test_qualifying=[x for x in qualifying if x['period']=='test']
verification={'runsReconciled':54,'strategies':3,'markets':2,'periods':3,'costScenarios':3,
              'independentlyRecomputed':'SMA200, Wilder RSI2, IBS, signals, next-open fills, fees, fully paid quantity, equity and daily-close drawdown, winners and trade count',
              'observed75Runs':len(qualifying),'test2025Observed75Runs':len(test_qualifying),
              'power':'OFF','revision':power['revision'],'productionWrites':False,'networkCalls':False}
(OUT/'verification.json').write_text(json.dumps(verification,indent=2))
fields=['symbol','strategy','period','scenario','trades','wins','winRate','net','netReturn','meanNetReturn','profitFactor',
        'maxCloseDrawdownFraction','worstTradeReturn','worstLiquidationReturn','boundaryTrades','naturalExitWinRate']
with (OUT/'summary.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for x in r['results']:w.writerow({k:x[k] for k in fields[:4]}|{k:x['stats'][k] for k in fields[4:]})
lines=['# Drei Tagesstrategien — Trefferquote nach Kosten auf ETH und BTC','',
    'Im getrennt ausgewerteten Testjahr 2025 erreicht keine der drei Strategien auf einem der beiden Märkte 75% Nettotrefferquote, auch nicht im niedrigen Kostenmodell. Improved R2 auf ETH erreicht 2024 10/13 = 76,92%, fällt aber 2025 auf 5/7 = 71,43%. Die kleinen Stichproben erlauben keine belastbare Zusage einer mindestens 75%igen künftigen Trefferquote.', '',
    '## Feste Regeln und Durchführung','',
    'Daten: vorhandene Binance-Spot-5-Minuten-Archive mit echtem Volumen, ETHUSDT und BTCUSDT 2022–2025. Ausschließlich vollständige UTC-Tage zu Tages-OHLCV aggregiert. März 2023 bei beiden Märkten wie zuvor vollständig ausgeschlossen (16 fehlende Kerzen). Keine Interpolation und kein neuer Download.',
    'Improved R2: Schlusskurs über SMA200; RSI2 von vor zwei Tagen <65, danach zweimal strikt fallend. Kauf nächste Tageseröffnung. Verkauf nächste Tageseröffnung nach RSI2>75. Quelle: https://tradingmarkets.com/recent/the_improved_r2_strategy_84_correct_with_just_6_rules_-674361',
    'Double7: Schlusskurs über SMA200 und am tiefsten Schlusskurs der letzten sieben Tage (einschließlich heute). Kauf nächste Eröffnung. Verkauf nächste Eröffnung nach Sieben-Tage-Schlusshoch. Quellen: https://traders.com/Documentation/FEEDbk_docs/2009/01/penn.html und https://statoasis.com/overfit/research/connors-double-7-strategy-your-beginner-s-guide-to-algo-trading-success',
    'IBS+RSI2: IBS=(Schluss-Tief)/(Hoch-Tief), IBS<0,2 und Wilder-RSI2<10. Kauf nächste Eröffnung. Verkauf nächste Eröffnung nach Schlusskurs über Vortageshoch. Kein zusätzlicher SMA-Filter. Regelquelle: https://therobusttrader.com/internal-bar-strength-ibs/',
    'Alle Ansätze ausschließlich long, eine Position pro Instrument, kein Hebel, kein Nachkaufen, keine hinzugefügten Stops. Mehrtägige Positionen bleiben offen; kein täglicher Zwangsausstieg. Im Gegensatz zu den veröffentlichten Schlusskurs-Fills wird nur nach bekanntem Signal zur nächsten Eröffnung gehandelt. Dies ist ein Krypto-Übertragungstest, keine exakte Reproduktion der ursprünglichen Aktien-/ETF-Tests.',
    'Getrennte Abschnitte: 2022–2023 Entwicklung, 2024 Validierung, 2025 Abschlusstest. Keine Auswahl, Parametersuche oder nachträgliche Anpassung. Jede Simulation beginnt flat. Nur vergangene Kurse dienen der Initialisierung. Nach März2023 Datenlücke Neustart der Indikatoren; SMA200 gibt erst nach 200 zusammenhängenden Tagen Signale frei. Dadurch ist die Trainingsstichprobe für R2/Double7 besonders klein.',
    'Offene Positionen an Daten-/Testgrenzen werden als offene Enden dokumentiert und zum letzten Schlusskurs mit Kosten glattgestellt. Solche Grenztrades zählen zur primären Nettotrefferquote, werden aber zusätzlich separat und mit Trefferquote nur regulärer Ausstiege ausgewiesen. Keine neuen Einstiege am letzten verfügbaren Tag.', '',
    '## Kosten, Kapitalmodell und Statistik','',
    'Bisherige Kostenszenarien: Gebühr 0,10% je Seite; gesamter Spread / Slippage je Seite niedrig 1/1 bp, Basis 4/3 bp, Stress 10/10 bp. Keine Leihkosten, da vollständig bezahlte Long-Spotpositionen. Kosten bleiben Annahmen, keine gemessene historische Quote-/Gebührenkurve. Historische Sonderaktionen nicht berücksichtigt.',
    'Pro Simulation 10.000 rein synthetische USDT Startkapital, volle verfügbare Mittel einschließlich Kaufgebühr, gebrochene Stückzahl und Wiederanlage. Dies ist ein einheitliches Offline-Vergleichsmodell, kein echtes Budget oder Vorschlag zur Positionsgröße. Es unterscheidet sich von den früheren EMA/VWAP-Tests mit fester Menge 1. Ergebnisse deshalb nicht direkt gegen deren USDT-Summen vergleichen.',
    'Gewinner bedeutet Netto-PnL strikt größer null nach allen Ein-/Ausstiegskosten. Trefferquote allein sagt nichts über Profitabilität. Nettorendite im Bericht ist die Rendite des beschriebenen synthetischen Kontos je Zeitraum. Drawdown basiert auf täglichen Schlusskurs-Marktwerten einschließlich realisierter Gebühren; er kann unter dem tatsächlichen Intraday-Drawdown liegen. Größte laufende Verluststrecke eines Einzeltrades anhand der Tages-Tiefs separat ausgewiesen.',
    '95%-Wilson-Intervalle setzen näherungsweise unabhängige gleichverteilte Trades voraus. Korrelation, geringe Stichprobe und vorherige Kenntnis dieser Jahre schwächen die Aussage. Der zeitliche Split ist kein vollständig unberührter oder unabhängiger Holdout.', '',
    '## Basismodell — alle Zeiträume','',
    '| Markt | Strategie | Zeitraum | Gewinner/Trades | Trefferquote netto | Synthetische Nettorendite | Schlusskurs-Drawdown | Grenztrades |',
    '|---|---|---|---:|---:|---:|---:|---:|']
for x in r['results']:
    if x['scenario']!='base':continue
    s=x['stats'];lines.append(f"| {x['symbol']} | {x['strategy']} | {x['period']} | {s['wins']}/{s['trades']} | {100*s['winRate']:.2f}% | {100*s['netReturn']:.2f}% | {100*s['maxCloseDrawdownFraction']:.2f}% | {s['boundaryTrades']} |")
lines+=['','## Abschlusstest 2025 — Kostensensitivität','',
    '| Markt | Strategie | Kosten | Gewinner/Trades | Trefferquote | 75% erreicht? |',
    '|---|---|---|---:|---:|---|']
for x in r['results']:
    if x['period']!='test':continue
    s=x['stats'];lines.append(f"| {x['symbol']} | {x['strategy']} | {x['scenario']} | {s['wins']}/{s['trades']} | {100*s['winRate']:.2f}% | {'ja' if s['meets75PercentObserved'] else 'nein'} |")
lines+=['','## Unsicherheit und Verlustseite, Test 2025 im Basismodell','',
    '| Markt | Strategie | 95%-Wilson-Intervall | Schlechtester abgeschlossener Trade | Schlechteste laufende Trade-Liquidation | Profitfaktor |',
    '|---|---|---|---:|---:|---:|']
for x in r['results']:
    if x['period']!='test' or x['scenario']!='base':continue
    s=x['stats'];ci=s['winRateWilson95'];pf=s['profitFactor'];lines.append(f"| {x['symbol']} | {x['strategy']} | {100*ci['low']:.1f}–{100*ci['high']:.1f}% | {100*s['worstTradeReturn']:.2f}% | {100*s['worstLiquidationReturn']:.2f}% | {pf:.2f} |")
lines+=['','## Gelernte Erkenntnisse','',
    '- Published hohe Trefferquoten aus Aktienmärkten und Schlusskurs-Fills wurden nicht als Krypto-Nachweis bestätigt. Die praktische nächste-Eröffnung-Variante erreicht das 75%-Ziel 2025 nicht.',
    '- Positive Nettorendite und hohe Trefferquote sind verschiedene Ziele: R2 ist 2025 auf beiden Märkten positiv, obwohl die Trefferquote bei rund 71% liegt. IBS auf ETH ist ebenfalls positiv, bei 8/11 Gewinnern aber unter 75%.',
    '- Das 76,92%-Validierungsergebnis von R2 auf ETH beruht auf nur 13 Trades. Wilson95 liegt ungefähr bei 49,7–91,8%; daraus folgt keine gesicherte Mindesttrefferquote.',
    '- Der Verzicht auf Stops kann erhebliche laufende Verluste zulassen. IBS zeigt im Trainingsabschnitt Schlusskurs-Drawdowns von ungefähr 47–49%, trotz deutlich mehr Gewinnern als Verlierern. Hohe Trefferquote allein ist kein ausreichendes Auswahlkriterium.',
    '- Kein Kandidat wird als Strategie mit belegten mindestens 75% für die Produktion übernommen. Die Erkenntnisse werden als Offline-Forschung gespeichert; keine Live-Aktivierung.', '',
    '## Verifikation','',
    '27 automatisierte Tests bestanden (sieben neue Tagesstrategie-Tests plus 20 bestehende Tests). Alle 54 Läufe zusätzlich unabhängig überprüft: SMA200, Wilder-RSI2, IBS, Signalregeln, nächste-Eröffnung-Ausführung, Gebühren, vollständig bezahlte Stückzahl, Kontoverlauf, Tages-Schlusskurs-Drawdown, Trefferquoten und Grenzausstiege.',
    f"Numaron vorher/nachher OFF, Revision {r['powerBefore']['revision']}/{power['revision']}. Keine Provideraufrufe, Downloads, Neustarts, Produktionsänderungen oder echten Trades.",
    'Dateien: protocol.json, results.json, summary.csv, verification.json, daily-*.json und run-*.json. Verifikation: python scripts/daily-reversion-report.py. Tests: node --test scripts/daily-reversion.test.mjs sowie die bestehenden EMA/VWAP-Tests. Bestehende Versuchsergebnisse werden vom Runner nicht überschrieben.',
    'Datenattribution: Binance Public Data / Binance Vision. Persönliche nichtkommerzielle Offline-Forschung, laut lokalem Erwerbsprotokoll CC BY-NC-SA 4.0; abgeleitete Berichtsdaten unter derselben Lizenz: https://creativecommons.org/licenses/by-nc-sa/4.0/']
(OUT/'bericht.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(OUT/'lessons.json').write_text(json.dumps({'schema':'numaron-offline-research-lessons-v1','status':'offline-only-not-runtime-loaded',
    'source':'outputs/daily-reversion-20261019/results.json','test2025CandidatesMeeting75Percent':[],
    'findings':['Published equity win rates not reproduced as >=75% net on test2025 ETH/BTC',
                'R2 ETH validation 10/13 but test 5/7; small samples, no confirmed minimum win probability',
                'Positive expectancy, loss tails and drawdown remain necessary alongside win rate'],
    'liveAuthorized':False,'power':'OFF'},indent=2))
print(json.dumps(verification,indent=2))
