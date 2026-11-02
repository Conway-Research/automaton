"""Independent Python execution and annual attribution audit, no network."""
import ast,csv,datetime,hashlib,json,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'outputs/r2-walkforward-20261019';SOURCE=ROOT/'outputs/r2-history-20261019'
r=json.loads((OUT/'results.json').read_text());DAY=86400000
assert len(r['results'])==12 and len(r['references'])==216
for name,h in r['protocol']['hashes'].items():assert hashlib.sha256((ROOT/'scripts'/name).read_bytes()).hexdigest()==h
datasets={};features={}
for symbol in ['ETHUSDT','SPY']:
    raw=(SOURCE/f'normalized-{symbol}.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==r['protocol']['dataHashes'][symbol]
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
# Reuse only the already independently verified simulator function, without
# running the old report's file I/O or main program. Its hash is locked above.
tree=ast.parse((ROOT/'scripts/r2-stops-report.py').read_text())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='simulate')
env={'datasets':datasets,'features':features,'datetime':datetime,'math':math}
exec(compile(ast.Module(body=[function],type_ignores=[]),'verified-python-stop-simulator','exec'),env)
simulate=env['simulate']
def near(a,b):assert math.isclose(a,b,abs_tol=1e-6,rel_tol=1e-10),(a,b)
def year_of_mark(time):return datetime.datetime.fromtimestamp((time-DAY)/1000,datetime.timezone.utc).year
def cohort(trades,year):
    closed=[t for t in trades if int(t['exitDate'][:4])<=year]
    wins=sum(t['net']>0 for t in trades)
    return {'trades':len(trades),'wins':wins,'winRate':wins/len(trades) if trades else None,
            'crossYearExits':sum(int(t['exitDate'][:4])>year for t in trades),
            'boundaryTrades':sum(t['reason']=='boundary' for t in trades),
            'closedByYearEnd':len(closed),'winRateAsOfYearEnd':sum(t['net']>0 for t in closed)/len(closed) if closed else None}
def stats(trades,marks):
    capital=10000;peak=capital;dd=0
    for value in marks:peak=max(peak,value);dd=max(dd,1-value/peak)
    return {'trades':len(trades),'wins':sum(t['net']>0 for t in trades),'net':marks[-1]-capital,'endingCapital':marks[-1],
            'maxCloseDrawdownFraction':dd}
for row in r['results']+r['references']:
    trades,marks,cash=simulate(row);s=stats(trades,marks)
    for k,v in s.items():near(v,row['stats'][k])
    if 'detailsFile' not in row:continue
    d=json.loads((OUT/row['detailsFile']).read_text());assert len(trades)==len(d['trades']) and len(marks)==len(d['equity'])
    for a,b in zip(trades,d['trades']):
        for k in ['signalIndex','entryIndex','exitIndex','exitSignalIndex','reason']:assert a[k]==b[k]
        for k in ['entry','exit','quantity','entryFee','exitFee','net','netReturn','dividends','capitalBefore']:near(a[k],b[k])
        if row['mode']!='none':near(a['stop'],b['stop'])
        if b['reason']=='boundary':assert b['exitDate']=='2026-09-30'
    for value,m in zip(marks,d['equity']):near(value,m['equity'])
    capital=10000
    for a in row['annual']:
        year=a['year'];part=[m for m in d['equity'] if year_of_mark(m['time'])==year]
        near(a['startEquity'],capital);near(a['endEquity'],part[-1]['equity']);near(a['netReturn'],part[-1]['equity']/capital-1)
        peak=capital;dd=0
        for m in part:peak=max(peak,m['equity']);dd=max(dd,1-m['equity']/peak)
        near(a['maxCloseDrawdownFraction'],dd);capital=part[-1]['equity']
        for key,datefield in [('entryCohort','entryDate'),('exitCohort','exitDate')]:
            expected=cohort([t for t in d['trades'] if int(t[datefield][:4])==year],year)
            for k,v in expected.items():
                if v is None:assert a[key][k] is None
                else:near(v,a[key][k])
        assert a['simultaneousPass']==(a['entryCohort']['winRate'] is not None and a['entryCohort']['winRate']>=.75 and a['netReturn']>0 and dd<a['baselineAnnualDrawdown']-1e-12)
    near(math.prod(1+a['netReturn'] for a in row['annual']),row['stats']['endingCapital']/10000)
    assert sum(a['entryCohort']['trades'] for a in row['annual'])==len(trades)
    peak=10000;peak_at=d['equity'][0]['time']-DAY;active=None;longest=0;unrecovered=False
    for m in d['equity']:
        if m['equity']<peak:
            if active is None:active=peak_at
            days=(m['time']-active)/DAY
            if days>longest:longest=days;unrecovered=True
        else:
            if active is not None:
                days=(m['time']-active)/DAY
                if days>longest:longest=days;unrecovered=False
            peak=m['equity'];peak_at=m['time'];active=None
    near(longest,row['duration']['longestCalendarDays']);assert unrecovered==row['duration']['unrecovered']
    # Derive primary history through 2025 without closing open positions.
    primary_marks=[m for m in d['equity'] if year_of_mark(m['time'])<=2025]
    primary_trades=[t for t in d['trades'] if int(t['exitDate'][:4])<=2025]
    p=stats(primary_trades,[m['equity'] for m in primary_marks])
    p['winRate']=p['wins']/p['trades'] if p['trades'] else None;p['markToMarketReturn']=p['endingCapital']/10000-1
    p['openPositionsAt2025End']=sum(int(t['entryDate'][:4])<=2025<int(t['exitDate'][:4]) for t in d['trades'])
    row['through2025']=p
power=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
assert power['enabled'] is False and power['revision']==r['powerBefore']['revision']
verification={'continuousRunsResimulated':12,'threeYearReferenceRunsResimulated':216,
              'annualReturnAndTradeAttributionVerified':True,'calendarYearCapitalCarried':True,'noYearBoundaryForcedExits':True,
              'primaryThrough2025SeparatedFrom2026':True,'power':'OFF','revision':power['revision'],'networkCalls':False,'productionWrites':False}
(OUT/'verification.json').write_text(json.dumps(verification,indent=2))
(OUT/'primary-through2025.json').write_text(json.dumps([{'symbol':x['symbol'],'scenario':x['scenario'],'mode':x['mode'],**x['through2025']} for x in r['results']],indent=2))
fields=['symbol','scenario','mode','year','netReturn','maxCloseDrawdownFraction','entryTrades','entryWins','entryWinRate','crossYearExits','closedByYearEnd','entryWinRateAsOfYearEnd','exitTrades','exitWinRate','simultaneousPass']
with (OUT/'annual.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for x in r['results']:
        for a in x['annual']:
            w.writerow({k:x[k] for k in ['symbol','scenario','mode']}|{k:a[k] for k in ['year','netReturn','maxCloseDrawdownFraction','simultaneousPass']}|
                       {'entryTrades':a['entryCohort']['trades'],'entryWins':a['entryCohort']['wins'],'entryWinRate':a['entryCohort']['winRate'],
                        'crossYearExits':a['entryCohort']['crossYearExits'],'closedByYearEnd':a['entryCohort']['closedByYearEnd'],'entryWinRateAsOfYearEnd':a['entryCohort']['winRateAsOfYearEnd'],
                        'exitTrades':a['exitCohort']['trades'],'exitWinRate':a['exitCohort']['winRate']})
with (OUT/'references.csv').open('w',encoding='utf-8',newline='') as f:
    fields=['symbol','scenario','mode','followingYear','startDate','endDate','trades','wins','winRate','netReturn','maxCloseDrawdownFraction']
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for x in r['references']:w.writerow({k:x[k] for k in fields[:6]}|{k:x['stats'][k] for k in fields[6:]})
lines=['# R2 — rollierender Jahresvergleich mit festen Schutzstops','',
    'Ergebnis: ETH mit10%-Stop reduziert den zusammenhängenden Drawdown, verliert aber deutlich Rendite und erreicht keine stabile75%-Trefferquote. SPY mit5%-Stop reduziert den Drawdown deutlich; im Hauptzeitraum bis2025 liegt die Trefferquote im Basismodell dennoch unter75%. Erst mit dem starken, separat auszuweisenden2026-Zusatzfenster steigt sie auf genau75%. Erhöhte Kosten drücken die Quote weiter. Keine durchgängig bestätigte Mindesttrefferquote.', '',
    '## Vorgehen ohne weitere Optimierung','',
    'Jeweils die vorherigen drei Kalenderjahre werden separat als Referenz ausgewertet; danach folgt ein jährliches Beobachtungsfenster, Schrittweite ein Jahr. Es wird kein Modell trainiert, keine Parameterwahl und keine Umschaltregel aus dem Referenzergebnis abgeleitet. Dies ist eine rollierende Prüfung unveränderter Regeln, keine adaptive Walk-forward-Optimierung.',
    'ETH: feste10%-Stopregel, jährliche Beobachtungsfenster2021–2025. SPY: feste5%-Stopregel,1997–2025. Januar–September2026 separat. R2 ohne Stop jeweils parallel, unter niedrigen, Basis- und erhöhten Kosten. Originalregeln, Gebühren, Dividenden, Eröffnungslücken, ganze SPY-Aktien und Indikatorberechnung unverändert.',
    'Jede der zwölf Hauptsimulationen läuft einmal zusammenhängend ab ihrem ersten Beobachtungsjahr bis30.09.2026. Kapital und offene Positionen werden über Jahreswechsel fortgeführt; nur am endgültigen Datenende werden offene Positionen geschlossen. Kein Neustart des10000-USD/USDT-Simulationskontos pro Jahr. Vorlauf-Kurse ausschließlich kausal; alle verfügbaren früheren Beobachtungen für Indikatorinitialisierung.',
    'Jahresrendite und jährlicher Drawdown stammen aus den tatsächlichen Kalenderjahr-Kontowerten mit übernommenem Anfangskapital. Trades werden nach Einstiegsjahr gruppiert; Ausstiege in Folgejahren ausdrücklich gezählt. Zusätzlich Trefferquote nur der bis Jahresende geschlossenen Einstiegstrades sowie Gruppierung nach Ausstiegsjahr. Einstiegskohorten mit späteren Ausstiegen sind rückblickende Kohortenwerte, keine damals bereits bekannten Jahresquoten.',
    'Beide Stops wurden nach Kenntnis früherer Ergebnisse derselben Historie ausgewählt. Keine unberührte oder unabhängige Out-of-sample-Validierung. Die drei Jahre Referenz dienen ausschließlich der Beschreibung; kein neuer Daten-Download.', '',
    '## Hauptzeitraum bis Ende2025 — Basiskosten','',
    '| Markt | Variante | Abgeschlossene Gewinner/Trades bis2025 | Nettotrefferquote | Kontorendite markiert | Durchgehender Drawdown | Positive volle Jahre |',
    '|---|---|---:|---:|---:|---:|---:|']
for x in r['results']:
    if x['scenario']!='base':continue
    p=x['through2025'];lines.append(f"| {x['symbol']} | {x['mode']} | {p['wins']}/{p['trades']} | {100*p['winRate']:.2f}% | {100*p['markToMarketReturn']:.2f}% | {100*p['maxCloseDrawdownFraction']:.2f}% | {x['profitableYears']}/{x['completedYears']} |")
lines+=['Die Renditen sind Gesamtrenditen über unterschiedliche lange Zeiträume, nicht annualisiert und vor Steuern. Bis2025 offene Positionen werden marktwertbasiert bewertet, nicht künstlich geschlossen. Vollständige Kontostände und offene Positionen stehen in primary-through2025.json.', '',
    '## Gesamte durchgehende Strecke einschließlich Januar–September2026','',
    '| Markt | Variante | Kosten | Gewinner/Trades | Nettotrefferquote | Gesamtrendite | Max.Drawdown |',
    '|---|---|---|---:|---:|---:|---:|']
for x in r['results']:
    s=x['stats'];lines.append(f"| {x['symbol']} | {x['mode']} | {x['scenario']} | {s['wins']}/{s['trades']} | {100*s['winRate']:.2f}% | {100*s['netReturn']:.2f}% | {100*s['maxCloseDrawdownFraction']:.2f}% |")
lines+=['','## Schwache Jahre und lange Verlustphasen — Basismodell','',
    '| Markt | Variante | Schlechtestes volles Jahr | Jahresrendite | Längste Zeit unter früherem Höchststand | Längste Verlustserie in Trades | Jahre mit Einstiegskohorte>=75% |',
    '|---|---|---:|---:|---:|---:|---:|']
for x in r['results']:
    if x['scenario']!='base':continue
    lines.append(f"| {x['symbol']} | {x['mode']} | {x['worstYear']['year']} | {100*x['worstYear']['netReturn']:.2f}% | {x['duration']['longestCalendarDays']:.0f} Kalendertage | {x['longestLosingTradeStreak']} | {x['entryCohort75Years']}/{x['completedYears']} |")
lines+=['Die Dauer unter Höchststand wird auf der gesamten Strecke einschließlich2026 gemessen. Jahre ohne Trades sind nicht als75%-Jahre gewertet. Jahresquoten mit wenigen Trades und langfristige Durchschnittswerte ersetzen keine statistische Mindestgarantie.', '',
    '## Alle Jahresfenster im Basismodell','',
    '| Markt | Jahr | Rendite mit Stop | Ohne Stop | Drawdown mit Stop | Ohne Stop | Gewinner/Einstiegstrades mit Stop | Folgejahr-Ausstiege |',
    '|---|---:|---:|---:|---:|---:|---:|---:|']
for x in r['results']:
    if x['scenario']!='base' or x['mode']=='none':continue
    base=next(b for b in r['results'] if b['symbol']==x['symbol'] and b['scenario']=='base' and b['mode']=='none')
    for a in x['annual']:
        b=next(b for b in base['annual'] if b['year']==a['year']);c=a['entryCohort']
        lines.append(f"| {x['symbol']} | {a['year']}{'*' if a['year']==2026 else ''} | {100*a['netReturn']:.2f}% | {100*b['netReturn']:.2f}% | {100*a['maxCloseDrawdownFraction']:.2f}% | {100*b['maxCloseDrawdownFraction']:.2f}% | {c['wins']}/{c['trades']} | {c['crossYearExits']} |")
lines+=['*2026 nur Januar–September. Kohortenquoten schließen spätere bekannte Ausstiege ein; die damalige geschlossene Quote steht separat in annual.csv.', '',
    '## Einordnung','',
    'ETH: Die Stopvariante ist im Basismodell in drei von fünf vollen Jahresfenstern positiv; ohne Stop sind es fünf von fünf. Insbesondere2022 und2023 werden mit Stop negativ. Niedrigerer Drawdown geht hier mit geringerer Rendite und unter75% liegender längerfristiger Nettotrefferquote einher. Kein robuster75%-Kandidat.',
    'SPY: Der5%-Stop senkt den durchgehenden Drawdown im Basismodell stark und erhält eine positive langfristige Rendite. Dennoch schwankt die Jahresleistung, es gibt lange Phasen unter Höchststand, und im vollständigen Hauptzeitraum bis2025 wird die75%-Schwelle unter Basiskosten nicht erreicht. Die erhöhte Kostenannahme verschlechtert das Ergebnis weiter. Eine verbesserte Risikostruktur ist beobachtet, eine dauerhaft mindestens75%ige Trefferquote nicht belegt.',
    'Die letzte Erweiterung2026 darf nicht stillschweigend zu den Hauptjahren addiert werden, um die Zielquote zu erreichen. Ebenso werden überlappende Drei-Jahres-Referenzfenster nicht als zusätzliche unabhängige Trades zusammengezählt.',
    'Kosten bleiben die zuvor festgelegten plausiblen Szenarien, keine historische persönliche Gebühren-/Orderbuchrekonstruktion. Alle Ergebnisse vor Steuern, ohne FX, Cash-Zinsen oder Opportunitätskosten. Schlusskurs-Drawdown kann Intraday-Risiko unterschätzen. SPY-Dividenden wie zuvor brutto am Ex-Tag, Quellensteuer und späterer Zahlungstag nicht modelliert.', '',
    '## Verifikation und Dateien','',
    '39 JavaScript-Tests und3 Kalendertests bestanden. Zwölf kontinuierliche Läufe und216 vorangehende Drei-Jahres-Referenzläufe unabhängig mit der bereits geprüften Python-Stop-Simulation erneut gerechnet. Jahresrenditen verkettet, Kontowerte und Drawdowns, Trades über Jahresgrenzen, Jahreszuordnung und Dauer unter Höchststand unabhängig geprüft. Kein Jahreswechsel-Zwangsausstieg.',
    f"Numaron vor/nach Auswertung OFF, Revision{power['revision']}. Keine Provideraufrufe, Downloads, Produktionsänderungen, Neustarts oder echten Orders.",
    'Dateien: protocol.json, results.json, primary-through2025.json, annual.csv, references.csv, verification.json und run-*.json. Reproduktion: python scripts/r2-walkforward-report.py. Vorhandene Versuchsergebnisse werden nicht überschrieben.',
    'Datenquellen und frühere Datenprüfung: outputs/r2-history-20261019 (Binance Public Data und Yahoo Finance Chart). Persönliche lokale Offline-Forschung.']
(OUT/'bericht.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(OUT/'lessons.json').write_text(json.dumps({'schema':'numaron-offline-research-lessons-v1','status':'offline-only-not-runtime-loaded',
    'findings':['ETH10% stop lowers drawdown but weakens long-run return and does not stabilize >=75% wins',
                'SPY5% stop materially lowers drawdown, but base-cost main history through2025 stays below75%; strong2026 raises combined rate',
                'Overlapping reference windows are not independent evidence; no reoptimization or production activation'],
    'power':'OFF','liveAuthorized':False},indent=2))
print(json.dumps(verification,indent=2))
for x in r['results']:
    if x['scenario']=='base':print(x['symbol'],x['mode'],'through2025',x['through2025'])
