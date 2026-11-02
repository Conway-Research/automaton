# Trading Stand für Claude

Stand: 31. Oktober 2026, Europe/Zurich. Autor: Codex, bestehender Trading-Chat. Empfänger: Claude. Diese Ergänzung dokumentiert vorhandene lokale Forschung und gespeicherte Betriebsbelege. Dafür wurden keine neuen Backtests, Tests, Modellaufrufe, Downloads, Brokerabfragen oder Wartungsaktionen ausgeführt. Alle relativen Belegpfade beziehen sich auf `C:/Users/Patrice/automaton`.

**Fazit:** Es gibt keinen nach Kosten und über die getrennten Zeiträume bestätigten Kandidaten, der gleichzeitig mindestens 90 % Gewinner, mindestens 50 % jährliche Rendite und universelle Admirals-Handelbarkeit belegt. Für das zuletzt gewünschte Nicht-Krypto-Trading mit 500 CHF ergaben die Admirals-Studien keinen robust profitablen Freigabekandidaten. Einzelne positive Teilperioden und bedingte Freitrade-Szenarien sind keine bestandene Auswahlprüfung.

## Grenzen und heutiger Status

- Numaron bleibt OFF. Am 31. Oktober wurde aus der Power-Datei erneut `enabled=false`, Revision 101 gelesen. Keine Poweränderung, kein Dienstneustart, keine Orders und kein Paper-Start durch diese Dokumentation.
- Der Claude-Übergabe-HOLD bleibt bestehen. Diese gezielte Dokumentationsfreigabe erlaubt keine Fortsetzung alter Forschungs-/Implementierungsaufträge. Zuerst `AGENTS.md`, `TAKEOVER-COORDINATION.json` und `TAKEOVER-REPORT.md` im Übergabeordner lesen. Writer-Besitz vor späteren Edits klären; keine unklaren Requests wiederholen.
- Historische ON-, PID-, Verbindungs- oder Testbelege sind keine heutige Laufzeitbestätigung. Die Quellen unten sind datierte Belege, keine neuen Handlungsfreigaben.
- Jüngste inhaltliche Ausrichtung: 500 CHF, Admirals, vor allem Aktien/ETFs und Währungen statt Kryptowährungen. Keine Kontoeröffnung und keine Echtgeldorders. Ältere Krypto-Ergebnisse bleiben Forschungsreferenzen.

## Getestete Strategien und Ergebnisse nach Kosten

### EMA9 und Session VWAP auf 5 Minuten

Bestätigtes Kreuz mit Kerzenausbruch sowie früher Einstieg bei Annäherung wurden auf ETHUSDT und BTCUSDT getestet. Historie Januar 2022 bis Dezember 2025 aus 96 öffentlichen Binance-Monatsarchiven mit echtem Handelsvolumen; März 2023 wegen jeweils 16 fehlender Kerzen vollständig ausgeschlossen, nicht interpoliert. Ausgewertet wurden je Markt 47 Monate und 411.840 Kerzen. VWAP ist eine Kerzenpreis-/Volumenapproximation, kein Tick-VWAP.

Beide Varianten waren in allen drei Kostenmodellen negativ. Basiskosten: 0,10 % je Seite, 4 bp voller Spread, 3 bp Slippage je Seite; hypothetische Spot-Shorts zusätzlich Leihkostenpuffer. ETH Kreuz: −28,83 bp je Trade bei 4.838 Trades und 24,3 % Gewinnern; BTC Kreuz: −31,00 bp bei 4.960 Trades und 17,5 % Gewinnern. Diese Basispunkte sind durchschnittliche Trade-Ergebnisse bei fester Menge, keine Kontorendite.

Acht Kombinationen mit EMA200-Trendfilter, weiterem ATR-/Mindeststop und 2R/3R-Ziel blieben bereits im Training negativ. Gewählter diagnostischer Kandidat `cross-stop1-R3` blieb in Validierung 2024 und Test 2025 negativ. Ohne Gegenkreuz-Ausstieg, nur Stop/Ziel/UTC-Sitzungsschluss: 2025 ETH −23,99 bp/Trade, BTC −32,68 bp/Trade im Basismodell. Kein tragfähiger Kandidat.

Belege: `outputs/ema-vwap-extended-20261019/bericht.md`, `outputs/ema-vwap-trend-20261019/bericht.md`, `outputs/ema-vwap-no-cross-20261019/bericht.md`; Regeln, Rohsummen und Monatswerte jeweils daneben. Spot-Shorts waren Diagnostik ohne bestätigte Borrow-Verfügbarkeit.

### Tagesstrategien und Improved R2

Drei Tagesstrategien auf ETH/BTC erreichten im getrennten Jahr 2025 keine 75 % Nettotrefferquote. R2 wurde danach auf längerer ETH-/BTC-Historie und SPY sowie mit festen Stops 5/10/15 % und 3 ATR untersucht. R2: Schluss über SMA200; RSI2 vor zwei Sitzungen unter 65, danach zweimal strikt fallend; Einstieg nächste Sitzung; Ausstieg nach RSI2 über 75. Kein Handel zum erst später bekannten Signalschluss.

Rollierender Jahresvergleich ohne erneute Optimierung: ETH mit 10-%-Stop und SPY mit 5-%-Stop gegen R2 ohne Stop. Drei Vorjahre nur Referenz, keine adaptive Auswahl. SPY wurde zusätzlich unabhängig in Python nachgerechnet; 30 historische Vergleiche stimmten laut gespeichertem Audit überein.

| Datierter Vergleich, Basiskosten | Nettotrefferquote | Rendite und Drawdown |
|---|---:|---|
| ETH 10-%-Stop, 2021–2025 | 40/59 = 67,80 % | +59,11 % kumuliert; 26,21 % Schlusskurs-DD |
| ETH ohne Stop, 2021–2025 | 34/48 = 70,83 % | +117,80 % kumuliert; 37,89 % DD |
| SPY 5-%-Stop, 1997–2025 | 181/244 = 74,18 % | +256,73 % kumuliert; 12,57 % DD |
| SPY 5-%-Stop, bis September 2026 | 192/256 = 75,00 % | 4,72 % CAGR; 12,57 % DD |
| SPY 5-%-Stop, Stress bis September 2026 | 180/257 = 70,04 % | 2,38 % CAGR; 15,35 % DD |

SPY-Audit: 10.000 USD wurden modelliert zu 39.375,77 USD; längste Erholung 2.436 Kalendertage. Das Wilson-95-%-Intervall der 75-%-Quote beträgt 69,35–79,91 %: keine statistische Absicherung einer wahren Mindestquote. Geringere Risikobudgets senkten auch die Rendite. Dies sind Cash-Aktien-/ETF-Kostenmodelle, keine persönliche Admirals-CFD-Abrechnung und kein 500-CHF-Nachweis.

Belege: `outputs/daily-reversion-20261019/bericht.md`, `outputs/r2-history-20261019/bericht.md`, `outputs/r2-stops-20261019-verified/bericht.md`, `outputs/r2-walkforward-20261019/bericht.md`, maßgeblicher zusätzlicher Audit `outputs/spy-r2-offline-audit-20261021/BERICHT.txt`. Das SPY-Paper-Paket ist eine ungestartete manuelle Vorbereitung; der Audit ist kein Runner.

### Suche nach mindestens 50 % CAGR

TQQQ-Trend-/Wochenmodelle, FinLab-Adaptionen, BTC EMA600/Funding und das SOXL-Regime wurden über lange Historien mit Kosten und verzögerter Ausführung reproduziert. Keiner erfüllte mindestens 50 % CAGR bei weniger als 50 % DD zugleich in langer Historie und späterem Zeitraum unter Basis- und Stresskosten. Auch das strengere DD-Ziel 35 % wurde nicht erfüllt.

Basis, nächste Eröffnung: TQQQ EMA50 10,39 % CAGR/65,79 % DD; TQQQ Wochenregel 33,47 %/55,69 %; SOXL-Regime 18,93 %/80,94 % über 2011–September 2026. SOXL erreichte das Renditeziel nur im separaten Anbieterfenster 2020–2026, nicht über die lange Historie. Anbieterwerte wurden nicht als eigene Reproduktion ausgegeben. Unvollständig offengelegte Systeme wurden nicht durch erfundene Regeln ersetzt.

Beleg: `outputs/strategy-search-50-lower-dd-20261021/BERICHT.txt`; vollständige Kosten-/Ausführungsfälle und SOXL-Vergleiche daneben. Frühere Recherche: `outputs/strategy-research-50cagr-20261021/`.

### BTC Funding und feste Zielgewichte als ältere Referenz

Feste Regel: Stundenkurs kreuzt über EMA600; Ausstieg unter 98 % EMA; 15-%-Trailingstop; Ziel 11-facher ursprünglicher Einstieg; tägliches Zielgewicht um 00:00 UTC. Funding-Filter strikt Rang unter 55: 72-h-Mittel, 180-Tage-Rang, mindestens 720 gültige Rangwerte, eine Stunde Veröffentlichungsreserve; fehlende/veraltete Daten blockieren neue Einstiege. Funding ist beim Spot-Modell ein Filter, keine laufende Spotgebühr.

Im gemeinsamen USDT-Fenster Juli 2020–September 2026: Funding + 50-%-Zielgewicht 23,90 % Basis-CAGR/19,96 % stündlicher Schlusskurs-DD, Stress 19,67 %/23,48 %. Im jüngsten Abschnitt 2024–September 2026 nur 9,36 % Basis-CAGR. Keine dauerhaft 50 % jährlich.

Mit CHF-Bewertung, damaligen persönlichen Takergebühren, Ausführungsvarianten und angenommenen Wechselkosten bestanden 30 % und 20 % die deklarierten Tests; 40 % und 50 % nicht. 30 %: Basis-CAGR 11,91 %, Stress 9,97 %, schlechtester CHF-DD 26,42 %. 50 %: schlechtester CHF-DD 33,97 %. Das sind Ergebnisse des jeweiligen Modells und Startkapitals, keine Garantie oder allgemeine Kapitalfreigabe.

Belege: `outputs/btc-position-risk-20261021/BERICHT.txt`, `outputs/btc-chf-lower-weights-20261022/BERICHT.txt`. Nicht mit der späteren 500-CHF-Neusimulation vermischen: `outputs/chf500-strategy-search-20261023/report.txt` weist BTC-Funding30 über Juli 2020–September 2026 mit 1.002,85 CHF Endwert, 11,78 % CAGR und 23,27 % DD aus. Beide Studien haben eigene Kosten-/Rundungs-/Kapitaldefinitionen.

### Hoch-Trefferquote und gemeinsames Portfolio

Triple RSI5 wurde implementiert und auf insgesamt zehn gespeicherten Cash-/Spot-Instrumenten mit/ohne 5-%-Stop untersucht. Die beworbenen 89,9 % stammen aus einem Anbieter-SPY-Vergleich mit Signalschlusskursen ohne Gebühren/Slippage. Kein marktübergreifender Nettobeleg. Weitere 2.400 Szenarien mit TPS, kumuliertem RSI, RSI2 und 20/10-Trend, Stops, Kosten und Verzögerungen ergaben keinen Kandidaten mit mindestens 90 % Gewinnern und positivem Ergebnis in Validierung UND Test unter Basis- UND Stresskosten.

ETH TPS ohne Stop erreichte im Vollfenster 66/72 = 91,67 % Gewinner, 8,73 % CAGR, 28,54 % Schlusskurs-DD. Validierung 2022–2023: nur 10/13 = 76,92 %. Eine zusätzliche Sitzung Verzögerung senkte die Vollquote auf 57/70 = 81,43 %. Die 22/22 Gewinner im Test allein bestätigen keine stabile 90-%-Quote. Die spätere 500-CHF-/CHF-Rechnung liefert wiederum nur 1,28 % CAGR für ETH-TPS ohne Stop trotz 91,53 % Volltrefferquote. Hohe Trefferquote und hoher Gewinn sind verschiedene Ziele.

Trend20/10 + TPS als gemeinsames Cash-Portfolio mit festen Limits: Kern SPY, QQQ, IEF, GLD, BTC, ETH; erweitert zusätzlich TQQQ, TECL, SHY, SOXL. 360 Szenarien. 10.000-USD-Kernkonto 2018–September 2026 kombiniert 3,84 % CAGR/5,43 % beobachteter DD. Test 2024–2025 kombiniert 2,73 %/3,41 %, Trend allein 3,64 %/2,99 %. Kein allgemeiner Vorteil der Kombination und kein Admirals-CFD-Backtest aller Produkte.

Belege: `outputs/high-win90-universe-20261022/BERICHT.txt`, `outputs/high-win90-round2-20261022/BERICHT.txt`, `outputs/portfolio-trend-mr-20261022-v2/BERICHT.txt`, `outputs/chf500-strategy-search-20261023/report.txt`.

## Admirals und 500 CHF

Historische lesende Terminalprüfung bestätigte ein gebundenes EUR-Retail-Trade.MT5-Demokonto auf AdmiralsGroup-Demo; keine Reparatur nötig. Im Nicht-Krypto-Katalog standen 2.239 Symbole, darunter 75 FX und 2.057 Aktien-CFDs. Vollmodus im Katalog bedeutet weder Marktöffnung noch Orderfreigabe. Es ist kein vollständiger Admirals-Gesamtkatalog. Fehlende Kontoprodukte lassen sich nicht durch Adapterreparatur hinzufügen.

Unveränderte Limits in diesen Studien: anfänglich 50 CHF Nominal pro Position (10 %), 15 % Markt, 30 % Strategiebereich, 35 % Aktiengruppe, 60 % gesamt, sechs Plätze; 0,5 % Zyklusrisiko inklusive Kosten/Stop, 3 % gesamt, 2 % Tagesverlustsperre, dauerhafte Einstiegssperre ab 15 % CHF-DD. Volle Nominalreserve statt zusätzlichem Hebel. Gaps, EUR/CHF und Kontogebühren können den beobachteten Verlust über die Haltgrenze treiben.

### Nachgewiesene Gebühren und verbleibende Tarifannahmen

- Demoverlauf: 31 Ausführungen, darunter acht Aktien-CFD-Ausführungen mit Kommission. Zwei US-Ausführungen passen zu 0,02 USD/Aktie/Seite; sechs französische zu 0,10 % Nominal. Veröffentlichte Minima 1 USD beziehungsweise 1 EUR sind nicht durch kleine persönliche Orders empirisch bestätigt.
- Die acht Zusatzgebühren passen centgenau zu 0,3 % Umrechnung auf korrekt zugeordnete absolute PnL/Kommission/Swap, mit Rundung. Veröffentlichte Mindestumrechnung 0,01 Kontowährung im korrigierten Modell.
- Aktuelle gespeicherte US-CFD-Spezifikation: Longfinanzierung 7,49 % p.a., /360, dreifach Freitag. Keine vollständige historische persönliche Swapkurve.
- Authentifizierte Kontoübersicht zeigte Trade.MT5 Live und Demo, kein Invest.MT5. Echte Aktien/ETFs bleiben bedingte Produktmodelle; kein Investkonto eröffnet oder unterstellt.
- Veröffentlichte Aktion ab 13.07.2021: geeignete Aktien auf Invest.MT5 eine einseitige Freiausführung je EET-Tag; auf Trade.MT5 Live sechs geeignete Aktien-CFD-Ausführungen. Gemeinsames Tageskontingent, Kauf/Verkauf zählen getrennt. Nicht alle Produkte, insbesondere ETFs, sind eingeschlossen. Die individuellen Liveabrechnungen und lückenlose historische Geltung sind nicht belegt. Kostenpflichtige Demobuchungen widerlegen eine ausschließlich für Live geltende Aktion nicht.

Belege: `outputs/admirals-noncrypto-20261023/report.txt`, `outputs/admirals-personal-fees-20261023/bericht.txt`, `outputs/admirals-stock-fx-round2-20261023/bericht.txt`, jeweilige Protokolle und Gebühren-/Produktbelege daneben. Keine neuen Tarifabfragen am 31. Oktober.

### Ergebnisse der Nicht-Krypto-Runden

Entwicklung 2016–2021, Auswahl/Validierung 2022–2023, Test 2024–2025, Erweiterung Januar–September 2026; separater kontinuierlicher Lauf. Je Fenster frische 500 CHF, Ergebnisse nicht addieren. Zwölf heutige liquide US-Aktien; Survivorship-/Auswahlbias bleibt. Alle Kalenderfenster waren bereits betrachtet, kein unberührter Holdout.

| Studie | Feste Kandidaten / Umfang | Ergebnis |
|---|---|---|
| Aktien-CFD Tagesstrategien, nach Gebührenkorrektur | 79 Kandidaten, 2.370 Fälle | Kein positiver kontinuierlicher Fall. Rückblickend bester aktiver Langfall XOM-TPS: 429,13 CHF; nur zwei geschlossene Zyklen. |
| Weniger Trades: Monats-/Quartalstrend, Momentum, Band | 52 Kandidaten, 1.560 Fälle | Alle 312 kontinuierlichen Kosten-/Delayvarianten negativ. Quartalsportfolio Test: 475,29 CHF, −24,71 CHF, 9,81 % DD, 13 Zyklen. |
| Echte Aktien/ETFs gegen CFDs und FX | 90 Kandidaten, 3.090 Fälle | Keine robuste Auswahl. Bedingter CSCO-Freitrade-Test 502,15 CHF, ohne Aktion 488,84 CHF. ETF-Regeln: keine zulässigen Einstiege. |
| Weitere Aktien-/FX-Runde 2 | Donchian55/20, EMA50/200, RSI2, Bollinger | Keine bestandene Auswahl. Aktien-EMA-Portfolio mit Aktion im Test 509,98 CHF, ohne 469,68 CHF; Validierung mit Aktion 435,11 CHF. |
| Weitere Aktien-/FX-Runde 3 | Kanal126/63, Wochen-EMA13/40, Doppel-Momentum6/12 | Keine bestandene Auswahl. JPM-Wochentrend mit bedingter Investaktion im Test 509,05 CHF, ohne 484,40 CHF; Validierung mit Aktion 444,24 CHF. |

Auch kleine positive Ergänzungen 2026, etwa 522,38 CHF beim CFD-Doppelmomentumportfolio mit Aktionskosten, widerlegen die negativen Auswahl-/Testfenster nicht. Unter Standardkosten endet derselbe 2026-Fall bei 483,14 CHF. Keine nachträgliche Siegerauswahl als robuste Empfehlung ausgeben.

Forex: 75 gespeicherte Symbole anhand tatsächlicher Mindestlots geprüft; kein Mindestnominal passte unter anfänglich 50 CHF. Kleinstes indikativ 88,05 CHF, EURUSD etwa 925,60 CHF. Historische Regeln auf sechs Paaren lieferten in Runde 2 (720 Fälle) und Runde 3 (540 Fälle) keine zulässigen Orders. Das ist eine Signal-/Mindestorderprüfung, keine profitable oder unprofitable ausgeführte FX-Kurve. Keine künstlichen kleineren Lots oder nachträgliche Limitlockerung. Margin nicht mit Nominalwert verwechseln.

Langlaufverluste enthalten teilweise EUR/CHF und das angenommene Inaktivitätsszenario 10 EUR monatlich nach 24 Monaten ohne Ausführung, begrenzt auf positives freies Guthaben. Diese Verluste nicht ausschließlich als Strategie-PnL ausgeben. Persönliche Inaktivitätsabrechnung und PostFinance-Wechselquote unbestätigt. Eine zusätzliche Diagnose ohne Inaktivitätskosten ergab ebenfalls keinen aktiven Langzeitgewinner.

Belege: `outputs/admirals-cfd500-20261023/report.txt` (früher), maßgeblich korrigiert `outputs/admirals-personal-fees-20261023/bericht.txt`; `outputs/admirals-low-turnover-20261023/bericht.txt`; `outputs/admirals-invest-fx500-20261023/bericht.txt`; `outputs/admirals-stock-fx-round2-20261023/bericht.txt`; `outputs/admirals-stock-fx-round3-20261023/bericht.txt`.

## Brokeranbindungen und Paper-/Demo-Stand

| Bereich | Vorhandener Beleg | Grenze / heutige Bedeutung |
|---|---|---|
| Admirals MT5 | Bestehendes Demoterminal, gebundene Identität und Demo trade_mode0 historisch lesend bestätigt; Daten und Spezifikationen für Forschung gelesen | Keine heutige Onlineprüfung und kein Echtgeldkonto über MT5 durch diese Arbeit verbunden. Keine pauschale Mehrmarkt-Ausführung freigegeben. |
| Binance Spot | Angemeldete Gebührenansicht vom 22.10.: Regular Maker/Taker 0,10 %, mit BNB 0,075 %, Rabatt ON | Ausreichende BNB-Reserve nicht belegt. Keine Einstellung geändert, keine BNB gekauft; keine ausführungsfähige Echtgeld-API-Anbindung daraus ableiten. |
| Coinbase Advanced | Authentifiziert gespeicherter Maker 0,09 %, Taker 0,10 % | Produktausnahmen und aktuelle persönliche Paarfreigabe offen. Kostenvergleich auf Binance-Historie ist keine Coinbase-Fill-Reproduktion. |
| CHF/PostFinance | Historische ECB-Kreuzkurse und 0,5/1-%-Wechselkostenszenarien | Keine persönliche Bankquote; Kartenakzeptanz/3DS und vollständiger CHF→Handelswährung→CHF-Pfad nicht belegt. Keine Zahlung oder Karteneinrichtung. |

32 öffentliche Orderbuchantworten aus acht Runden auf vier Binance-/Coinbase-Märkten deckten nur wenige Sekunden ab. Teilweise identische Binance-Quotes/fehlende Eventzeit; keine belastbare historische Spreadverteilung oder echte Orderlatenz. Nicht als Ersatz für Stresskosten verwenden. Belege: `outputs/btc-binance-coinbase-comparison-20261022/BERICHT.txt`, `outputs/btc-venue-spreads-chf-20261022/BERICHT.txt`.

### Getrennter BTC-Forward-Runner

`outputs/btc-paper30-chf-preparation-20261022/` bleibt als eingefrorene Vorlage `PREPARED_NOT_STARTED`. Danach wurde separat `outputs/btc-forward-runtime-20261022/` implementiert und nach damaliger ausdrücklicher Freigabe ein neuer Lauf begonnen: `artifacts/btc-forward-demo-1792700571962/`. Die ungestartete Vorlage darf nicht mit dem späteren Lauf verwechselt werden.

Gespeicherter Startnachweis vom 22.10.: sechs hypothetische 10.000-CHF-Konten; Paper beobachtete und wartete auf gültiges neues Signal, null Strategie-Fills, ein passiver Benchmark-Fill. Admirals-Demo-Adapter: null Orderintents und null gesendete Orders, Status blockiert. Blocker: Broker-Kommission/Swap unbestätigt, Tages-Eigenkapitalhistorie ungeprüft, unabhängiger Nachweis der Historienzeit fehlt, Zürich-Zeitzonendaten fehlen. Quote-Zeitkonsens ist keine Historienzeit-Attestation.

Am 31.10. ausschließlich gespeicherte Statusdateien gelesen: `paper-status.json` meldet `stopped-no-auto-resume`; `admirals-demo-status.json` meldet `blocked`. Das ist keine neue Prozess-/Verbindungsprüfung und kein Nachweis einer vollständigen späteren Tradebilanz. Nicht neu starten. Eine vollständige Auswertung der bestehenden Journale/SQLite-Ledger wäre eine gesonderte spätere, zunächst lesende Aufgabe.

Der Runner handelt nur BTC: Spot BTCUSDT, getrennt Admirals BTCUSD-CFD. Kein ETH-/Aktien-/Mehrmarkt-Rollout. Native Broker-Schutzorders und strikte Demo-/Identitätsprüfung sind vorgesehen; unbekannte oder teilweise Orderantworten nie blind wiederholen. Altes Breakout-System und fremde Positionen nicht als eigene Runner-Trades behandeln. Keine automatische Live-Promotion.

Admirals-BTC ist wirtschaftlich kein Spot-Ersatz: historische Kostenstudie fand Konflikte zwischen öffentlicher täglicher und Vierstunden-Finanzierungsangabe; typische Spreadanzeige hatte Einheitenkonflikt. Kein getestetes Szenario belegte 50 % CAGR; Standardkosten-Stress wurde im jüngeren Zeitraum negativ, Vierstunden-Finanzierung machte auch das Gesamtfenster negativ. Persönliche heutige BTC-Konditionen bleiben ungeklärt. Beleg: `outputs/btc-admirals-cost-test-20261021/BERICHT.txt`.

## Offene Punkte und Umgang mit den Nachweisen

1. **Keine neuen Arbeitsstarts unter HOLD.** Diese Liste ist eine Übergabe, kein Arbeitsauftrag. Claude beginnt lesend; Budget-, Power-, Wartungs- und Ordergrenzen bleiben bestehen. Alter Startauftrag für einen inzwischen gestoppten Run ist keine Wiederanlaufgenehmigung.
2. **Produkt und Kapital zuerst unterscheiden.** Cash-ETF-Ergebnisse sind keine CFD-Ergebnisse; 10.000-USD- und 500-CHF-Studien sind nicht austauschbar. Ein breiterer FX-/ETF-Ansatz unter geänderten Mindestgrößen/Risikolimits wäre eine neue menschliche Entscheidung, keine Adapterreparatur.
3. **Persönliche Livekosten offen.** Invest.MT5 fehlt in letzter authentifizierter Übersicht; keine Eröffnung. Freitrade-Aktion, aktuelle Symbolfreigaben, kleine-Order-Minima, historische Swaps und PostFinance-FX nicht durch Annahmen als bestätigt ausgeben.
4. **Ausführung bleibt modelliert.** Tages-/Stunden-OHLC liefert keine Tickreihenfolge, Warteschlange, Liquidität oder garantierten Stopfill. Drawdowns aus Schlussmarken unterschätzen mögliche Intraday-Verluste. Kein Rendite-/Drawdownversprechen.
5. **Zeittrennung ist kein neuer Holdout.** Historien wurden wiederholt angesehen. Keine der Quellen belegt einen frischen prospektiven Erfolg; Teilperioden nicht addieren, verwandte Kostenszenarien nicht als unabhängige Stichproben zählen.
6. **Korrigierte Belege vorziehen, Fehler erhalten.** Admirals Runde 2 korrigierte das Verschieben vorgemerkter Orders durch wiederholte Signale; `initial-invalid-delay` bleibt ungültig archiviert. Frühere Zwei-Sitzungs-Delay-Fälle der Vorgängerstudien sind daher nicht gleichwertig bestätigte Robustheitsbelege. Runde 3 nutzt den korrigierten Stand. `chf500-strategy-search-20261023/audited-results.json`, `audited-summary.csv` und `reporting-corrections.json` vor Rohberichtsmetadaten verwenden. Bei CFD-Auswahl ist `audited-selection.json` maßgeblich gegenüber inaktiven Rohfällen. R2-Stop-Ergebnisse aus dem `-verified`-Ordner verwenden.
7. **Keine allgemeine Optimalität behaupten.** Geprüft wurde ein endliches Universum fester Kandidaten. Keine Strategie ist als weltweit profitabelste oder für alle Admirals-Produkte validiert. Die jüngsten Nicht-Krypto-Runden endeten ohne Freigabekandidaten.

## Einstiegspunkte im Code und Artefakten

Für spätere rein lesende Orientierung: `scripts/founder-trading.mjs`, `scripts/founder-trading-history.mjs`, `scripts/trading-strategies.mjs`, `scripts/trading-cost-model.mjs`, `scripts/trading-execution.mjs`, `scripts/trading-risk.mjs`, `scripts/trading-mt5.mjs`, `scripts/mt5-trading-adapter.py`. Die separaten Forschungs-/Forward-Implementierungen liegen in den genannten `outputs/`-Ordnern. Vorhandensein ist kein Beleg heutiger Produktionsintegration oder Freigabe. Keine importierenden Diagnosebefehle verwenden, die nebenbei Runtime, Broker oder Provider initialisieren.

Quellberichte, Protokolle, Ergebnisdateien, Hashmanifest und Journale unverändert erhalten. Keine Schlüssel, Kontonummern oder privaten Konfigurationsinhalte sind in diese Übergabe übernommen worden. Der begleitende `TRADING-EVIDENCE-INDEX.json` pinnt die für diese Zusammenfassung benutzten Hauptbelege; seine Hashes sind Dokumentationsnachweise, keine neue Strategieprüfung.
