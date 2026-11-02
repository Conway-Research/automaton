# Unabhängiger Review der Handelsbausteine, v1

Stand 2.11.2026. Nur Technik, keine Anlageberatung. Numaron blieb OFF (`power-state.jsonl`: `enabled:false`, unverändert). Kein Broker, kein MT5-Terminal, kein Netzwerk, keine Order. Quellen im Repo unverändert; `mt5-demo-profile.json` und `demo-opening-balance-proof.json` nicht geöffnet.

## Urteil

**Demo: Vor Echtgeld gut geschützt, aber nicht freigabekonform.** Der Produktivpfad kann ein Echtkonto nach allem, was hier prüfbar war, nicht bedienen. Die Freigabe vom 2.11. gilt aber „innerhalb der dokumentierten Limits“, und diese Limits stehen großenteils nicht im Code (B1). Die 18 abgeschlossenen und 1 offene Order im Journal belegen das: bis rund das Fünffache des Kapitals als Nominal, und Krypto. Ein Demo-Lauf im heutigen Stand testet Mechanik, ist aber kein Nachweis für Stufe 4. Vor dem nächsten Einschalten sollten B1, H1 und H2 behoben oder von Patrice ausdrücklich anders entschieden sein.

**Späterer Echtgeld-Anschluss: Nein, derzeit nicht sicher anschließbar.** Ein Blocker und sechs hohe Befunde stehen offen. Der vorgesehene Live-Pfad (`trading-execution`, `trading-mt5`, `mt5-trading-adapter`) lief nie an einem Broker, ist bei Admirals nicht funktionsfähig (H5) und seine Lebenszyklus-Funktionen haben keine Tests (H6). Reparieren genügt nicht: Danach sind die Prüfstufen 3 und 4 aus dem Stufenplan weiter nötig.

| Schwere | Anzahl |
|---|---|
| blocker | 1 |
| hoch | 6 |
| mittel | 5 |
| niedrig | 2 |

## Antworten auf die sechs Fragen

1. **Echtgeld versehentlich?** Im Produktivpfad nein. `DemoOnly._check` prüft vor und nach jedem Aufruf Login, Server, `trade_mode==0`, verbunden, Terminal- und Datenpfad (`mt5-demo-readonly.py:13-20`). Falsches Profil oder Konto führt zu Ausnahme und keiner Order. Das halten Tests (Mutationen P18, P19, P20 getötet). Der Live-Adapter hat diese Sperre nicht (H4), ist aber nicht verdrahtet: `executionConfig` wird in `founder-mt5.mjs:136` nicht übergeben, `mt5Command` wird nur mit `mt5-demo-execution.py` benutzt, `createMt5TradingAdapter` nur in Tests.
2. **Limits?** Nur 0,5 % je Zyklus ist wirksam, und nur in der Demo-Größenrechnung. 2 %, 3 %, 15 %-Drawdown, 50 CHF, 500 CHF und kein Hebel fehlen (B1). Rundung und fehlende Daten sind dagegen sauber: Volumen wird abgerundet, Mindestlot nie erzwungen, fehlende oder nicht endliche Werte sperren, Teil-Fills sperren neue Einstiege.
3. **Fail-closed?** Im Demo-Pfad gut: siehe „Was hält“. Keine blinde Wiederholung gefunden.
4. **Schutz?** Der Stop geht mit der Einstiegsorder mit. Abgelehnt heißt keine Position. Eine Position ohne belegten Stop wird sofort geschlossen, aber nur solange Numaron ON ist. OFF und Stopp lassen Positionen offen und sperren den Ausstieg (H3). Der Founder-Stopp überlebt für die Demo kein OFF/ON (H2).
5. **Bewertung?** Kein Pfad gefunden, auf dem Demo-Gewinn als Echtgeld erscheint. Das Demo-Konto misst aber ein anderes Konto (M5), und die Strategievalidierung akzeptiert erfundene Zeilen (M4).
6. **Tests?** 44 von 52 Mutationen blieben grün (H6).

## Was hält (kein Befund; ausgeführt, wo nicht anders vermerkt)

- Absturz nach Broker-Fill vor dem Journal-Abschluss: Journal `pending`; nach Neustart `accepted`, keine zweite Order, auch nicht mit neuer Signal-ID (X6).
- Absturz ohne Brokerorder: `unknown`, dauerhaft gesperrt, 0 Orders (X7).
- Abgelehnter Stop (Retcode 10016): `rejected`, keine Position, keine Wiederholung (X8).
- Teil-Fill: `partial`, Status `blocked`, keine weitere Order (X10).
- Stop-out mit Broker-Kommentar `[sl ...]`: sauber `closed` (X9). Das Journal bestätigt 18 abgeschlossene Vorgänge am Demo-Broker.
- Das Journal wird vor `order_send` geschrieben; eine zweite Ausführung schützt der Lock (`mt5-demo-execution.py:216`, `:254-259`; der Lock nur gelesen).
- Demo-Ergebnis zählt Kommission, Swap und Gebühr (`:158`), `profitabilityProven` und `liveAuthorized` sind fest `false` (`founder-demo-execution.mjs:42`). `realizedDemoProfit` kommt in Dashboard, Finance und Ledger nicht vor (grep); die Historie trennt Demo und Live und sagt, dass Demo nicht als Echtgeld zählt.
- Broker-Uhr: `quote` rechnet den Versatz ein (`:128`; nur gelesen, `quote` selbst hat keinen Test mit +3 h).

## Blocker

### B1. Die dokumentierten Limits sind nicht implementiert; zwei Limitsätze widersprechen sich

- **Dateien:** `trading-risk.mjs:1`, `mt5-demo-execution.py:204-211` und `:226`, `founder-demo-execution.mjs:36`, `mt5-trading-adapter.py:241` und `:259`, `web/founder/trading.mjs:51`, `docs/trading/live-readiness.md:3` gegen `TRADING-HANDOFF.md:76`.
- **Soll gegen Ist:**

| Limit (Handoff, Stufenplan) | Im Code | Wirkung |
|---|---|---|
| 500 CHF Kapital | fehlt; Basis ist die Konto-Equity | Risiko wächst mit dem Konto; Demo rechnet mit rund 49.750 EUR |
| 50 CHF Nominal | fehlt | bis 247.000 EUR Nominal im Journal |
| kein Hebel, volle Nominalreserve | fehlt; nur `margin > margin_free`, also Brokermarge | bis 4,97-fach |
| 0,5 % je Zyklus inkl. Kosten | hart `.005` nur im Demo-Sizing (`:204`); Grenze selbst 5 % (`:211`); Live-Pfad 5 % | Demo wirksam, Kosten nur als „2x Stop“ angenommen (siehe M5) |
| 3 % gesamt | 15 % | Demo faktisch durch „eine Position“ enger; Live-Pfad 15 % |
| 2 % Tagesverlust | 30 % | Einstieg noch bei 25 % Tagesverlust |
| 15 % Drawdown-Sperre | fehlt, kein Höchststand gespeichert | Einstieg bei 40 % Drawdown |

  Außerdem pinnt `cycle` die Werte 5/15/30 (`:226`), und das Dashboard zeigt „5 % je Trade · 15 % gesamt · 30 %“. `live-readiness.md` nennt 5/15/30 „bestätigt“ (13.10.), der Handoff nennt 0,5/3/2 „unverändert“. Der Stufenplan führt 0,5/3/2 als heute dokumentiert.
- **Szenario, ausgeführt mit Fake-Broker:** Kapital 500, Stopabstand 0,11 bei Kurs 100,1 und Kontraktgröße 100: 0,11 Lots, Nominal 1.101, also 2,2-fach und das 22-fache von 50 CHF, Order gesendet (X1). Equity 375 bei Tagesstart 500 (25 % Tagesverlust): Order gesendet (X2). Tagesstart 300 nach ursprünglich 500 (40 % Drawdown): Order gesendet (X3).
- **Beleg am echten Journal (nur lesend, Demo-Konto, Konto-Kennung nicht ausgegeben):** Nominal abgeleitet aus Reserve, Einstieg und Stop, also unabhängig von der Kontraktgröße; Bezug rund 49.750 EUR Tagesstart aus dem Journal.

| Order | Lots | Nominal ca. | Vielfaches Kapital |
|---|---|---|---|
| EURUSD | 2,47 | 247.000 EUR | 4,97 |
| AUDUSD | 3,73 | 232.000 EUR | 4,67 |
| EURCHF | 2,30 | 230.000 EUR | 4,62 |
| AUDJPY | 3,01 | 188.000 EUR | 3,77 |

  Am 20.10. liefen 12 Trades. Überschlägig hätte die 2-%-Regel einschließlich Reserve den zwölften Einstieg gesperrt (806 EUR realisiert plus 245 EUR Reserve, Grenze rund 995 EUR); die 30-%-Grenze griff nicht. Die höchste Reserve lag bei 0,524 % des Tagesstarts, das 0,5-%-Sizing wirkt also.
- **Korrektur:** Patrice bestätigt schriftlich einen Limitsatz. Ein einziges unveränderliches Limitobjekt, das beide Pfade verwenden. Vor jeder Order prüfen: Nominal in CHF, Hebel, Tagesverlust, Gesamtrisiko, Kapitalobergrenze. Dauerhafte Sperre mit gespeichertem Höchststand. Tests auf die neuen Werte umstellen; Dashboard liest aus demselben Objekt.

## Hoch

### H1. Keine Symbol-Freigabeliste; Krypto wird bevorzugt

- **Dateien:** `mt5-trading-adapter.py:147-173`, `founder-demo-execution.mjs:36`.
- **Szenario:** Auf `AdmiralsGroup-Demo` stehen handelbare Krypto-Symbole in der Abfrage zuerst. `.slice(0,1)` nimmt das erste Signal. Jedes Produkt mit `capability` ist handelbar: Krypto, Forex, Indizes, Rohstoffe. Im Stufenplan steht „keine Krypto“ als letzter Stand, eine Antwort dazu fehlt, und Stufe 5 verlangt eine Freigabeliste.
- **Beleg:** Ausgeführt: `BTCUSD` wird gesendet (X4). Journal: BCHUSD (4 Vorgänge), BTCUSD, dazu US100, [DJI30], _COCOA_Z6.
- **Korrektur:** Harte Freigabeliste vor `enter`, unabhängig von der Strategie, leer heißt nichts handeln. Krypto-Vorrang entfernen, falls Krypto nicht ausdrücklich erlaubt wird.

### H2. Founder-Stopp gilt für die Demo nicht dauerhaft

- **Dateien:** `founder-demo-execution.mjs:9`, `:46`, `founder-trading.mjs:26`.
- **Szenario:** Patrice stoppt im Dashboard. Research speichert `halted`, die Demo pausiert nur im Speicher und liest die Sperre nie. Nach OFF/ON oder Dienstneustart handelt die Demo wieder, während die Anzeige weiter „Trading gestoppt“ zeigt.
- **Beleg:** Ausgeführt (S-A): Nach Stopp und OFF/ON meldet Research `halted`, die Demo `observing` mit 1 Transportaufruf. Der Fake lieferte keine Signale, aber der Weg bis zur Orderstufe ist offen. Mutation D6 blieb grün: Der Stopp könnte ganz wegfallen.
- **Korrektur:** Dauerhafte Sperre im Demo-Journal, die `enter` prüft und nur eine ausdrückliche Handlung von Patrice löst.

### H3. Bei OFF und Stopp bleiben Positionen offen, und der Ausstieg ist gesperrt

- **Dateien:** `mt5-demo-execution.py:28`, `:217-221`, `:229`, `:266`, `founder-demo-execution.mjs:21`, `founder-mt5.mjs:145`, `founder-trading.mjs:25`.
- **Szenario:** Bei OFF laufen keine Zyklen, `main` bricht ab, und auch die Schließorder geht durch `order_send` mit Power-Prüfung. Es wirkt nur noch der Stop und das Ziel beim Broker. Kommt OFF zwischen einem Fill ohne bestätigten Stop und dessen Schließung, bleibt die Position ohne Schutz. Es gibt keine Regel „schließen oder halten“ und keinen Alarm; der Stufenplan verlangt die Festlegung.
- **Beleg:** Ausgeführt (X5): Status `unknown`, Position `sl=0`, 1 Order, weiterer Zyklus wirft `Manual power is OFF`. Journal: Eine BCHUSD-Absicht vom 23.10. um 01:04Z steht weiter auf `accepted` (Stop belegt), 33 Minuten vor dem OFF um 01:37:43Z, und wurde seither nicht abgeglichen. **Das ist der naheliegende Ursprung der „ungeklärten Demo-Position“ aus Punkt 14.** Bestätigen lässt es sich nur am Broker. Beim nächsten ON wird sie abgeglichen und kann sofort zu Markt geschlossen werden.
- **Korrektur:** Regel festlegen. Schutzabgleich und Schließen von der Einstiegsperre trennen, sodass sie nach OFF auslaufen, bis keine ungeschützte Position mehr besteht, ohne neue Einstiege zu erlauben. Das berührt die OFF-Regeln in AGENTS.md und braucht deshalb Patrices Entscheidung. Offene Positionen bei OFF sichtbar melden.

### H4. Die Adapter-CLI kann ein Echtkonto bedienen; die Freigabe stellt sich der Aufrufer selbst aus

- **Dateien:** `mt5-trading-adapter.py:1`, `:32`, `:223`, `:330`, `:337-348`.
- **Szenario:** Die Kopfzeile sagt „CLI exposes readonly collection only“. Tatsächlich gibt es `--operation submit`, ohne `trade_mode`-Prüfung, ohne `DemoOnly`, ohne Power-Prüfung, ohne Journal. Die Freigabe ist JSON über stdin mit `riskAuthorized:true`.
- **Beleg:** Ausgeführt mit Fake-`MetaTrader5` und `trade_mode=2` (`exp/fake/`): `order_send` wurde gerufen, Rückgabe `accepted` (X12). Im Produktivpfad nicht erreichbar; es bräuchte zudem ein echtes angemeldetes Terminal.
- **Korrektur:** Mutierende Operationen aus der CLI entfernen, bis eine echte Bindung existiert (außerhalb des Prozesses signierte, kontogebundene, befristete Freigabe plus Power-Prüfung). Kopfzeile berichtigen.

### H5. Live-Adapter kann bei Broker-Uhrversatz nicht aussteigen

- **Dateien:** `mt5-trading-adapter.py:226`, `:318`, `:273`, `trading-mt5.mjs:5`.
- **Szenario:** Der Demo-Pfad rechnet den Versatz ein, der Adapter nicht. `AdmiralsGroup-Live` steht in `BROKER_CLOCK_SERVERS`; die Doku nennt UTC+3. `manage_exit` gilt dann immer als „Kurs veraltet“ und liefert `unknown`, auch wenn der Stop längst durchbrochen ist. `submit_once` lehnt ab (fail-closed), die Historiensuche in `:273` endet bei UTC-jetzt und dürfte neue Deals verfehlen.
- **Beleg:** Ausgeführt für `manage_exit` (X11): `{'status':'unknown'}`, 0 Orders. `submit_once` und `:273` nur gelesen. Der Test „entry halt does not prevent a precommitted protective exit“ bleibt grün, weil der Adapter dort ein Stub ist.
- **Korrektur:** Bewiesenen Versatz in den Adapter übernehmen und wie im Demo-Pfad weiten; Tests mit +3 h.

### H6. Die Tests beweisen die Sicherheitslogik größtenteils nicht

- **Beleg:** Ausgeführt in eigener Temp-Kopie: 52 Mutationen, 8 getötet, 44 grün. Einige Überlebende sind durch zweite Schutzschichten abgedeckt (D1–D3, E2, P17), aber Abdeckung ist dort auch nicht getestet. Einzelheiten unten.
- **Ungetestet:** `reconcile_intent`, `cancel_own_entries`, `manage_exit`, `mt5Command` (Timeout, Kill, Abbruch) und `main()` von `mt5-demo-execution.py` (Lock, Binding, Power) haben keinen Test. Mutation R9 zeigt: Tests zementieren 5/15/30.
- **Korrektur:** Für jede Sperre ein Test, in dem nur diese Sperre auslöst. Fehlerfälle für `main` und Adapter ergänzen. Mutationen in der Abnahme wiederholen.

## Mittel

### M1. Exakter Float-Vergleich schließt Live-Positionen grundlos

- **Dateien:** `mt5-trading-adapter.py:283`, `:320`.
- **Szenario:** Ziel 276,91+2·2,12 ergibt `281.15000000000003` (genau dieser Wert steht im Journal). Der Broker meldet 281,15. `p.tp!=intent['target']` führt zu `protection-invalid`, und die Position wird zu Markt geschlossen.
- **Beleg:** Ausgeführt (X11): `exit-submitted`, Grund `protection-invalid`; `reconcile_intent` meldet `protectionVerified:false`. Der Demo-Pfad hat eine Toleranz (`mt5-demo-execution.py:155`).
- **Korrektur:** Preise auf Tickgröße normalisieren, dann Toleranz.

### M2. Live-Pfad stoppt nach jeder Order endgültig

- **Dateien:** `mt5-trading-adapter.py:264`, `trading-execution.mjs:7`, `:9`, `trading-state.mjs:7`.
- **Szenario:** `submit_once` meldet immer `protectionVerified:false`, also folgt `halt`. `trading-state` hat keine Aufhebung. Fail-closed, aber nach der ersten Order läuft nichts mehr; das verleitet zu manuellen DB-Eingriffen.
- **Beleg:** Ausgeführt (E-A), Methodenliste enthält keine Aufhebung. Mutation E1 grün.
- **Korrektur:** Halt bei `submit` erst nach Abgleich; bewusste, protokollierte Aufhebung nur durch Patrice.

### M3. `assessRisk` glaubt der Verlustzahl und kennt keine Währung

- **Dateien:** `trading-risk.mjs:7-10`, `trading-execution.mjs:5`.
- **Szenario:** `lots:100000, plannedLoss:0.01` wird `allowed:true`. Fehlt die Währung überall, ebenfalls `allowed:true`; `sizing` darf gar keine Währung tragen. Kein Abgleich von Lots, Einstieg und Stop. `submit_once` rechnet nach, aber mit 5/15 %.
- **Beleg:** Ausgeführt (R-A, R-B). Mutationen R1 bis R6 und R8 grün.
- **Korrektur:** Verlust und Nominal aus Brokerdaten ableiten, Währung als Pflichtfeld binden.

### M4. Strategievalidierung akzeptiert erfundene Zahlen

- **Dateien:** `trading-validation.mjs:6-8`, `trading-learning.mjs:2`, `trading-execution.mjs:5`.
- **Szenario:** 100 plus 30 frei erfundene Zeilen mit `costsVerified:true` und Quelle `demo-journal` ergeben `approved:true`. Kein Feld trennt simuliert, Demo oder echt. Dass `liveAuthorized` und `evidenceAuthenticated` `false` bleiben, schützt nur, solange niemand diese Felder setzt: `executeSignal` vertraut einem übergebenen Objekt mit eigener `verify`-Funktion. Es ist deklariert und derzeit nicht produktiv verdrahtet.
- **Beleg:** Ausgeführt (V-A). Mutationen E5, E6 grün.
- **Korrektur:** Herkunft je Zeile mit Quelle und Prüfsumme des Rohbelegs; Demo und Simulation können nie live freigeben. Freigabe außerhalb des Prozesses prüfbar machen.

### M5. Demo-Ergebnisse sind nicht auf 500 CHF übertragbar; CHF fehlt

- **Dateien:** `mt5-demo-execution.py:158`, `:203-205`, `trading-cost-model.mjs:9`.
- **Szenario:** Demo läuft in EUR mit rund 49.750 EUR, 100-mal so groß wie vorgesehen; Kurs CHF, PostFinance-Kurs und CHF-Drawdown kommen nirgends im Handelspfad vor. Bei 500 CHF sind 0,5 % = 2,50 CHF, Stop also rund 1,25 CHF. Mindestkommission je Runde laut Kostenmodell 2 Einheiten Profitwährung bei Aktien-CFDs: Die „2x Stop“-Reserve deckt das nicht, das tatsächliche Risiko überschreitet 0,5 % dann. Journal insgesamt: 18 abgeschlossene Vorgänge, Summe −625,46 EUR, was nichts Verlässliches über eine Strategie aussagt.
- **Beleg:** Journal ausgeführt gelesen; Kostenrechnung eigene Rechnung, nicht am Broker geprüft.
- **Korrektur:** Demo auf 500-CHF-Rechenkapital mit CHF-Bewertung begrenzen oder Ergebnis ausdrücklich als „nur Mechanik“ führen; Kostenmodell je Produkt statt pauschaler Reserve.

## Niedrig

### N1. `unknown` bleibt ohne Klärweg gesperrt

`mt5-demo-execution.py:44`, `:159`, `:237`. Wurde die Order nie ausgeführt, findet der Abgleich nichts, und neue Einstiege bleiben dauerhaft aus. Richtig fail-closed, aber der einzige Ausweg wäre ein DB-Eingriff. Ausgeführt (X7). **Korrektur:** Geführte Klärung durch Patrice mit Protokoll, kein automatisches Löschen.

### N2. Irreführende Anzeigen und Marker

- `founder-mt5.mjs:197`: `runtime-health.json` schreibt `executionEnabled:true` mit Scope „readonly-reports“, obwohl die Demo Orders sendet.
- `mt5-demo-readonly.py:68`: `accountBinding.demo` ist eine feste Konstante, kein Beleg. Die JS-Prüfung darauf (`founder-demo-execution.mjs:30`, `founder-mt5-demo.mjs:28`) prüft nichts Eigenes; die echte Sperre sitzt in `DemoOnly`.
- `founder-demo-execution.mjs:17`: `source.verified:true` ist fest gesetzt.
- `web/founder/trading.mjs:51` und `live-readiness.md`: „Reale Trades entscheidest du selbst“ und „Dienst arbeitet lesend“ passen nicht zum Demo-Handel.

Nur gelesen. **Korrektur:** Texte und Felder an den tatsächlichen Zustand anpassen.

## Frage 6 im Einzelnen: Tests, die bei kaputter Logik grün blieben

| Test oder Datei | Mutation (grün) | Fehlende Aussage |
|---|---|---|
| `founder-demo-execution.test`: „account switch and altered pinned profile block execution“ | Login- (D2), Server- (D3), Kontoart- (D1), Frischeprüfung (D4), Profil-Recheck (D5) entfernt | Die Marktattrappe ist ohnehin ungültig, also löst immer eine andere Prüfung aus |
| `founder-demo-execution.test`: „combined runtime...“ | Stopp entfernt (D6), Antwortprüfung entfernt (D7), ON-Recheck vor Transport entfernt (D8) | `control` wird nie gerufen |
| `founder-mt5-demo.test` | `trade_mode` (F1) und `accountBinding` (F2) entfernt | Attrappe liefert immer gültig; kein Fall mit `trade_mode=2` |
| `mt5-demo-execution.test`: „foreign_positions...“ | Eine-Position-Regel entfernt (P3) | Fall `foreign` scheitert schon am Tagesabgleich |
| `mt5-demo-execution.test` allgemein | 0,5 % auf 5 % (P1), Teil-Fill als `accepted` (P5), falscher Stop gilt als Schutz (P6), Magic-Pflicht (P8), Margin (P9), eingeschränktes Symbol (P10), Mindest-Stopabstand (P11), Signalalter (P12), Saldoabgleich (P13), Kursfrische (P15), Konto-Recheck (P17), Ablehnungscodes (P22) | Kein isolierter Fall |
| `trading-risk.test` | Währung (R1), Konto (R2), Margin (R3), Zukunftszeit (R4), Stop-Geometrie (R5), Signalablauf (R6), Tagesbudget mit offenem Risiko (R8) | Keine Einzelprüfung |
| `trading-execution.test`, `founder-trading.test`, `trading-state.test` | Halt bei partial/ungeschützt (E1), Hold-Sperre (E2), Reconcile-Halt (E3), Kontobindung der Freigabe (E5), Strategie-Digest (E6) | `reconcileOutstanding` und echte Adapterantworten fehlen |
| `trading-mt5.test` | Aktionsbindung (A1), `unknown`-Exit (A2) | Nur der Fall ohne Autorisierung |
| `mt5-trading-adapter.test` | 15 %/Tagesrest (T1), Preisabweichung (T2), Besitzprüfung Exit (T4), Reconcile immer `closed` (T5), Storno fremder Orders (T6), Ablauf der Freigabe (T7), Strategie- und Risikoflag (T8) | Exit, Reconcile und Storno gar nicht getestet |

Getötet: costsVerified (R7), Tagesverlustsperre (P2), Reservierung (P4), offene Absichten (P21), DemoOnly trade_mode, Login/Server, Terminal (P18–P20), dazu die Gegenprobe R9 mit den dokumentierten Limits. Mutation P16 ließ sich nicht anwenden (Zeilenende) und zählt nicht mit. Ein erster Durchlauf der E-Mutanten war durch fehlende Dateien in der Kopie falsch rot; gezählt ist der Lauf mit grüner Baseline.

## Ausgeführte Tests

Alle Node-Tests mit `verification-network-guard-v2.cjs`, alle mit `PYTHONDONTWRITEBYTECODE=1`, aus dem Repo.

| Datei | Ausgang |
|---|---|
| `trading-risk.test.mjs` | 5/5 |
| `trading-execution.test.mjs` | 5/5 |
| `trading-mt5.test.mjs` | 2/2 |
| `founder-demo-execution.test.mjs` | 6/6 |
| `founder-mt5-demo.test.mjs` | 5/5 |
| `trading-state.test.mjs` | 2/2 |
| `trading-day.test.mjs` | 4/4 |
| `founder-trading.test.mjs` | 8/8 |
| `trade-radar.test.mjs` | 10/10 |
| `trading-strategies.test.mjs` | 3/3 |
| `trading-validation.test.mjs` | 4/4 |
| `trading-cost-model.test.mjs` | 3/3 |
| `mt5-trading-adapter.test.py` | 12 OK |
| `mt5-demo-execution.test.py` | 20 OK |
| `mt5-demo-readonly.test.py` | 7 OK |
| `mt5-demo-clock.test.py` | 4 OK |
| `mt5-day-history-retry.test.py` | 6 OK |
| `mt5-demo-credit-proof.test.py` | 4 OK |
| `mt5-signal-audit.test.py` | 5 OK |

Alle grün. Das sagt angesichts von H6 wenig über die Sicherheit aus.

**Gegenproben und Mutationen:** Temp-Kopie unter `C:\Users\Patrice\AppData\Local\Temp\claude\C--Users-Patrice-automaton\1dbd6454-ecd5-4e80-8ee9-3b620dcdf198\scratchpad\trading-review-20261102` (`exp/pyexp.py`, `exp/jsexp.mjs`, `mut.py`, `mut2.py`, Protokolle `mut.log`, `mut2.log`). Fake-Broker, keine echte Anbindung.

**Journal:** `demo-execution-20261017.db.orders.db` nur mit `mode=ro&immutable=1` und nur aggregiert gelesen. Das ist eine lokale Datei, keine Kontoabfrage.

**Nebenwirkung, die ich offenlege:** Zu Beginn kopierte ich Dateien versehentlich auch in den bereits vorhandenen Scratchpad-Ordner `...\scratchpad\copy` einer anderen Arbeit und überschrieb dort `scripts/*` und `package.json` mit dem aktuellen Repo-Stand. Das liegt außerhalb des Repos; falls jemand dort eigene Änderungen hielt, sind sie überschrieben.

## Nicht prüfbar oder nicht geprüft

- Echtes Brokerverhalten: Retcodes, Fill-Reihenfolge, Verhalten bei Verbindungsabbruch, Gap am Stop, tatsächliche Kommission. Alle Fehlerfälle liefen gegen Fakes; das Journal belegt nur den Normalablauf.
- Aktueller Terminal- und Kontostand, also auch, ob die BCHUSD-Position noch offen ist. Punkt 14 bleibt eine Broker-Frage für Patrice.
- Ob der 10-Sekunden-Timeout von `mt5Command` im echten Zyklus reicht; Prozess-Kill unter Windows wurde nicht ausgeführt.
- End-to-End-Lauf `founder-mt5.mjs` und Power-Modul: nur gelesen, nicht gestartet (Vorgabe).
- `trading-forward`, `trading-optimization`, `trading-context-study`, `trading-replay`: nur soweit für die Verdrahtung nötig gelesen.
- Tauglichkeit der Strategie, Steuern, Recht, Eignung von CFDs.

## Reihenfolge der Korrekturen

1. Patrice legt den gültigen Limitsatz, die Märkte und die OFF-Regel für offene Positionen fest (B1, H1, H3).
2. B1, H1 und H2 im Demo-Pfad umsetzen, Tests nach H6 dazu. Erst dann ist ein Demo-Lauf freigabekonform. Änderungen brauchen ein Apply mit Numaron OFF.
3. Live-Pfad (H4, H5, M1 bis M4) nur angehen, wenn die Stufen 2 und 3 je einen Kandidaten ergeben. Danach neuer unabhängiger Review.
