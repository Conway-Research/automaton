# Numaron Langzeitforschung – konkreter Entwurf

Status: zur Prüfung vor Umsetzung. Forschungsaufbau am 13.10.2026 vom Nutzer bestätigt; dieser konkrete Entwurf ist noch nicht freigegeben. Umsetzung direkt im bestehenden Projekt gewünscht. Keine neuen Konten, Datenkäufe, API-Schlüssel oder echten Orders Bestandteil dieses Entwurfs.

## 1. Ziel und überprüfbarer Erfolg

Numaron untersucht möglichst breite Marktgeschichte, leitet prüfbare Hypothesen ab, verbindet Ergebnisse mit seinem belegten Wissen und verbessert Strategiekandidaten anhand dokumentierter Evidenz. Ziel ist robuste Nettoprofitabilität; ein positives Ergebnis wird nicht vorausgesetzt. Eine sachlich begründete Ablehnung sämtlicher Kandidaten ist ein gültiges Forschungsergebnis.

Angefragter Zeitraum: 13.10.1946 bis 13.10.2026, jeweils inklusive. Das System zeigt tatsächliche Abdeckung und Datenstand separat. Es behauptet weder vollständige globale Börsenabdeckung noch 80 Jahre Geschichte für Produkte, die erst später entstanden. Erste Lieferung ist ein funktionierender Forschungsdurchlauf mit echten importierten, zulässig verwendbaren Daten, Prüfbericht und Wissenseinträgen – keine fertige Beherrschung aller Märkte.

## 2. Bestand, der weiterverwendet wird

- `src/revenue/trading-knowledge.ts`: versioniertes Wissen und Herkunft; Literaturstand unterscheidet Volltexte und Verlagsübersichten.
- `src/revenue/strategy-research.ts`: bestehende Familien und feste Varianten; ihre bisherigen Ergebnisse behalten den bestehenden Prüfstatus.
- `src/revenue/paper-trading.ts`: Cash-Paper-Simulation mit Kostenannahmen; unterstützt nicht automatisch sämtliche CFD-, Futures- oder Short-Mechaniken.
- `scripts/trading-replay.mjs`: kurze M5-Vergleichstests, getrennt von Langzeitforschung.
- `scripts/trading-forward.mjs`: Kursbeobachtungen, keine bestätigten Paper-Fills.
- `scripts/trading-validation.mjs`: bestehende konservative Prüfregeln; ein Langzeitbericht ersetzt deren nötige Evidenz nicht.
- `docs/trading/account-cost-profile.json`: Trade.MT5 bei Admirals Europe Ltd, heutige veröffentlichte Standardtarife; keine rückwirkende Bestätigung historischer Kosten.
- Founder-Dashboard und Controller: lokale Steuerung und Anzeige. Bestehende Aufgaben und Finanzbuchungen bleiben erhalten.

Neue Forschung wird über additive Module angebunden. Bestehende Replays, Risikoprüfungen und Broker-Adapter werden nicht als historische Universal-Simulatoren umgedeutet.

## 3. Zwei getrennte Arten von Forschung

**Marktgeschichte:** aggregierte Renditen, Inflation, Zinsen und andere zeitlich zuordenbare Kontextdaten. Ergebnis sind Beobachtungen und Hypothesen zu Marktphasen. Keine Ableitung intraday-genauer Einstiege, Stops oder tatsächlich handelbarer Portfolios aus bloßen Renditefaktoren.

**Handelbare Strategien:** geeignete instrumentbezogene Kursdaten plus Kontraktspezifikation, Handelstage, Verfügbarkeit und Kostenmodell. Eine Strategie wird nur in dem Umfang simuliert, den diese Daten und der Simulator nachweislich unterstützen. Aggregierte historische Erkenntnisse geben keine automatische Produktfreigabe.

## 4. Quellen und Aufnahmeentscheidung

Erste geprüfte Kandidaten:

| Quelle | Geeignete Verwendung | Stand vor Import |
|---|---|---|
| Kenneth French Data Library | US-Markt-/Faktorrenditen und Forschungsportfolios; lange Zeiträume | Lizenz/konkrete Verwendung prüfen, danach passende Dateien importieren; keine OHLC-Handelsdaten |
| Bestehende MT5-Lesefunktion | Brokerprodukte, Kursserien und aktuelle Symbolregeln | verfügbare Historie pro Produkt feststellen; kein Versprechen bis 1946 |
| Bereits vorhandene historische Archive | Instrumentbezogene Untersuchung | Herkunft, Prüfsummen, Lizenz, Zeitabdeckung und Datenqualität erneut prüfen |
| JST Macrohistory | Internationale jährliche Marktgeschichte | wegen CC BY-NC-SA nicht für geschäftliche Einbindung freigegeben; kein automatischer Import |
| Weitere Börsen-, Zentralbank- und Forschungsquellen | Erweiterung auf Regionen und Anlageklassen | erst nach eigener Quellen- und Nutzungsprüfung aufnehmen |

Quellenzulassung: `pending`, `allowed`, `restricted`, `blocked`. Nur `allowed` wird importiert. Ein öffentlich erreichbarer Download ist keine Lizenzbestätigung. Gebührenpflichtige oder neue geschützte Zugänge werden als konkrete fehlende Fähigkeit angezeigt, nicht automatisch gekauft oder eingerichtet. JST wird erst nach nachgewiesener passender Erlaubnis verwendet.

Abrufe verwenden eine konfigurierte Quellenliste, HTTPS, Größen-/Zeitlimits und prüfen Weiterleitungsziele. Kein Zugriff auf private Netzadressen oder vom Modell frei erfundene URLs. Quelldokumente sind Daten, keine Anweisungen an Numaron.

## 5. Abdeckung und Datenqualität

Abdeckung wird pro Quelle, Region, Produkt, Kontraktart, Frequenz und Zeitraum berechnet. Unterschiedliche Datensätze werden weder ohne dokumentierte Übergänge zusammengefügt noch zu einer vermeintlich lückenlosen Historie ergänzt. Fehlende Jahre sind sichtbar.

Pflichtprüfungen: eindeutige und steigende Zeitpunkte; definierte Zeitzone und Handelssitzung; endliche Werte; Prozent-/Dezimaleinheit; Fehlwertcodes; OHLC-Konsistenz dort, wo OHLC vorliegt; erwartete Frequenz und Lücken; Ausreißer; Quellenrevisionen. Korrekturen erstellen neue Versionen und bewahren Rohdaten.

Zusätzliche Voraussetzungen je Produkttyp:

- Aktien: Splits, Dividenden, ausgeschiedene Titel und historisches Anlageuniversum. Heute überlebende Titel allein werden als verzerrte Stichprobe markiert.
- Futures: Laufzeit, Kontraktwechsel, Multiplikator und Rollkosten. Kontinuierliche adjustierte Preise sind keine ausführbaren historischen Füllpreise.
- FX: historische Wechselkursregime und Quote-Konvention; Broker-CFD und Referenzwechselkurs bleiben getrennt.
- Fonds/ETFs: tatsächliches Auflagedatum; zugrunde liegender Index vor Fondsauflage ist ein Forschungsproxy.
- Krypto: tatsächlicher Beginn des Produkts, Börsenverfügbarkeit, Ausfälle und Gebühren. Keine fiktive Geschichte seit 1946.
- Makrodaten: Veröffentlichungsdatum und Revision. Fehlen damalige Datenstände, sind sie nur rückblickender Kontext und kein rückgetesteter handelbarer Signalinput.

## 6. Speicherung und Nachvollziehbarkeit

Eigenes Verzeichnis `artifacts/numaron-long-history/` mit unveränderlichen Rohdateien nach SHA256 und einer SQLite-Datenbank. Keine Vermischung mit der Founder-Finanzbuchhaltung.

Logische Tabellen:

- `sources`: Zulassung, Lizenznachweis, URLs, Quelle und Prüftermin.
- `datasets`: SHA256, Quelle, Version, Zeitraum, Frequenz, Einheit, Währung, Anpassungen und Qualitätsbericht.
- `runs`: Konfiguration, Codeversion/Codehash, Start/Ende, Grenzen, Status, verwendete Datensätze.
- `hypotheses`: Regelversion, Wissensquellen, vorab definierte Parameter, Gegenargumente, Splits und Kostenmodell.
- `trials`: alle Versuche einschließlich abgelehnter, fehlgeschlagener und negativer Ergebnisse.
- `reports`: Kennzahlen, Unsicherheit, Vergleich, Einschränkungen und Entscheidung.
- `lessons`: versionierte Erkenntnis, Evidenzbeziehungen, Geltungsbereich und frühere Version.
- `jobs`: dauerhafte Warteschlange und Wiederanlaufzustand.

Rohdatenhash, Regeln, Kosten, Datumsgrenzen und Prüfbericht reichen zusammen mit der gespeicherten Codeversion zur Reproduktion. Der Hash allein ist kein Wahrheitsnachweis.

## 7. Was selbstständiges Lernen konkret bedeutet

Ein Lernzyklus: geeignete Daten auswählen → vorhandene belegte Erkenntnisse lesen → begrenzte Hypothesen formulieren → Regeln vor dem Test einfrieren → deterministisch auswerten → Widerlegung und Stabilität prüfen → Ergebnis und Gegenbelege speichern → nächste Frage innerhalb des Budgets auswählen.

Zunächst vorhandene Familien: Momentum, Trend, Kanal-Ausbruch und Mean Reversion einschließlich bereits implementierter Unterfamilien. Start mit dem bestehenden Katalog von zwölf Varianten. Obergrenze je Forschungsrunde: 24 vorregistrierte Varianten und drei dafür geeignete Datensätze. Alle Konfigurationen zählen zum Versuchslimit; keine versteckten Neustarts oder Ergebnisfilter.

Ein vorhandenes Modell kann innerhalb der vorhandenen Freigabe Quellen zusammenfassen und Hypothesen vorschlagen. Fehlt der Zugang oder das Budget, laufen Import, Qualitätsprüfung und deterministische Tests weiter. Modellantworten müssen ein festes Schema erfüllen; es wird kein frei erzeugter Code ausgeführt. Neue Strategiefamilien außerhalb der implementierten Regeln sind zunächst Forschungsvorschläge.

Das ergibt höchstens 72 Variante-Datensatz-Auswertungen pro Runde (24 Varianten × drei Datensätze). Basiskosten- und Stressrechnung gehören jeweils zu derselben registrierten Auswertung. Zusätzliche Parameteränderungen zählen als neue Variante. Ein neues Rundenkennzeichen darf bekannte Schlussprüfdaten nicht erneut als unberührt ausweisen.

Wissen wird als `Hypothese`, `beobachteter Zusammenhang`, `widerlegt`, `in bestimmten Tests gestützt` oder `prospektiv gestützt` gespeichert. Eine Beobachtung wird nicht automatisch zur kausalen Erklärung. Lernen bedeutet hier aktualisierte Wissenseinträge und geprüfte Regelversionen, kein behauptetes Neutrainieren des Basismodells.

## 8. Entwicklung, Prüfung und Schutz vor Überanpassung

Für hinreichend lange Daten vorab festgelegte Aufteilung:

- Entwicklung: verfügbare Daten von 1946 bis Ende 1985.
- Validierung: 1986 bis Ende 2005.
- Abschließende historische Prüfung: 2006 bis zum belegten Datenende, höchstens 13.10.2026.

Der Prüfkern gibt abschließende Daten nicht an Regeloptimierung oder Auswahl zurück. Historische Ereignisse können dem Modell trotzdem bekannt sein: dies ist keine Behauptung weltweit unbekannter Daten oder unabhängiger externer Begutachtung. Eine echte prospektive Prüfung beginnt erst nach Fixierung des Kandidaten.

Kürzere Produktserien bekommen vor Start feste chronologische 60/20/20-Prozent-Abschnitte und den Vermerk `verkürzte Historie`. Mindestumfang, Warm-up und längste Haltedauer werden vorab festgelegt. Überlappende Positions-/Labelintervalle werden an Abschnittsgrenzen entfernt; nötige Warm-up-Daten dürfen nur rückwärts gelesen werden. Nachträglich geänderte Regeln erhalten eine neue Version und verbrauchen einen neuen Versuch.

Feste Walk-forward-Fenster innerhalb Entwicklung/Validierung; deterministische Baselines wie Buy-and-hold bei geeigneten Cash-Daten. Parameterwahl nur auf früheren Daten. Schlussprüfung pro Regelversion einmal; nach Einsicht keine erneute Optimierung unter derselben Prüfkennung. Nachträgliche Verbesserungen benötigen neue Evidenz; wiederholte Verwendung des bekannten historischen Prüfabschnitts wird als kontaminierte Forschung markiert.

Versuchszahl und Abhängigkeiten werden berichtet. Bei ausreichender Stichprobe zeitabhängige Block-Bootstrap-Intervalle mit gespeichertem Seed; kein IID-Intervall für zeitlich abhängige Renditen. Vergleich vieler Varianten wird explizit berücksichtigt. Fehlende Voraussetzungen verhindern eine positive Prüfeinstufung, nicht die Speicherung eines Forschungsberichts.

## 9. Kosten und Nettowerte

Jeder Test nennt Modus: `vor Kosten`, `nach Modellkosten` oder `nach belegten Kosten`. Kostenmodell umfasst die unterstützten Komponenten: Kommission/Mindestbetrag pro Seite, Spread, Slippage, Finanzierung, Umrechnung, Dividenden und gegebenenfalls Roll-/Leihkosten. Unbekannte Komponenten sind unbekannt und niemals implizit null.

Aktuelle Admirals-Tarife sind keine historischen Gebührenbelege. Historische Tests nutzen zeitlich passende Belege oder klar benannte Szenarien. Stress verdoppelt nichtnegative Gebühren und verschlechtert Spread/Slippage; Finanzierung wird in ungünstiger Richtung gestresst, positive Swap-Gutschriften werden nicht verdoppelt und dadurch als Vorteil gerechnet.

Cash-Simulator wird nur für seinen unterstützten Umfang verwendet. CFD-/Futures-/Short-Auswertung bleibt gesperrt, wenn passende Mechanik fehlt. Bei unbekannter Intrabar-Reihenfolge konservative Behandlung, etwa Stop vor Ziel, mit Kennzeichnung. Bid/Ask und Slippage werden so bilanziert, dass Spread nicht doppelt abgezogen wird.

Ergebnisse zunächst in nativer Währung; CHF-Vergleich nur mit zeitlich passenden Wechselkursen und belegter Umrechnungskonvention. Fehlender Kurs verhindert CHF-Ausweis. Paper-Ergebnisse sind keine Einnahmen im Founder-Dashboard und verändern den Geschäftsgewinn nicht.

## 10. Kennzahlen und Entscheidung

Bericht: Zeitabdeckung, Stichprobe/Trades, Brutto- und Nettoergebnis, Kostenanteil, Benchmarkdifferenz, maximaler Equity-Drawdown einschließlich offener Positionen soweit Daten ausreichend, Volatilität, Exposure, Turnover und Verlustserien. Annualisierte Größen nur für geeignete ausreichend lange Perioden; keine irreführende Hochrechnung kurzer M5-Tests.

Entscheidungen: `nicht prüfbar`, `verworfen`, `weiter untersuchen`, `für Paper-Vorwärtstest geeignet`. Voraussetzungen für letzte Stufe: Datenqualität und erforderliche Kosten vollständig prüfbar; getrennte Prüfphasen; bestandener Kostenstress; vorab festgelegte Stichproben- und Drawdown-Kriterien; kein einzelnes positives Gesamtergebnis, das wesentliche Teilperiodenverluste verdeckt. Bestehende strengere Validierungsregeln werden nicht abgeschwächt.

Ein positives Forschungsresultat ist keine Live-Freigabe. Keine erfundenen Gewinne, keine Umbenennung offener Kursbeobachtungen in ausgeführte Paper-Trades. Prospektive Paper-Ausführungen benötigen ein eigenes nachvollziehbares Fill-Modell mit Quote, Zeit, Größe und Kosten.

Startwerte für handelbare Kandidaten: mindestens 100 abgeschlossene historische Prüf-Trades, höchstens 15 % simulierter Equity-Drawdown und positive konservative Nettowert-Schätzung im normalen sowie ungünstigen Kostenszenario. Die Schätzung muss zeitliche Abhängigkeit und die registrierte Versuchsauswahl berücksichtigen; reicht die Datenmenge dafür nicht, bleibt der Kandidat `weiter untersuchen`. Mindestens 30 spätere prospektive Trades sind weiterhin Voraussetzung der bestehenden weiterführenden Validierung, keine automatische Freigabe nach 30 Trades. Renditefaktor- oder Makrostudien unterliegen nicht einem erfundenen Tradezähler.

## 11. Autonomie und Ressourcen

Numaron darf zugelassene öffentliche Quellen abrufen, Daten prüfen, geplante Tests ausführen, Erkenntnisse speichern und innerhalb des freigegebenen Katalogs Folgefragen wählen. Es ändert weder reale Handelsregeln noch Risikogrenzen oder Kontozugänge.

Anfangsgrenzen: ein Forschungsworker, zwei parallele Downloads, 100 MiB je Datei, 2 GiB gesamtes Rohdatenarchiv, sechs Stunden Rechenzeit je Runde, 60 Sekunden je Quellenabruf und 24 Varianten je Runde. Grenzen sind konservative Startwerte, keine Leistungszusage. Ein Import wird vor Überschreiten des Archivbudgets abgelehnt; vorhandene Belege werden nicht automatisch gelöscht. Große Quellen benötigen später eine ausdrücklich geplante Erweiterung.

Keine zusätzlichen bezahlten Daten oder Modellaufrufe durch den neuen Forschungsdienst. Bereits vorhandene bezahlte Modellfähigkeiten nur über den bestehenden Budget-Controller; keine eigene Budgetumgehung. Wenn ein Forschungszyklus nicht weiterkommt, lautet der Status konkret `Daten fehlen`, `Lizenz ungeklärt`, `Kostenmodell fehlt` oder `Budget erreicht`.

Pause beginnt keine neuen Jobs und wartet auf laufende begrenzte Arbeit. Stop beendet lokale Forschung, speichert den letzten konsistenten Stand und erzeugt keine Brokeraktion. Wiederanlauf ohne Doppelimport/-test anhand stabiler Jobkennung; abgebrochene Ergebnisse werden nicht als vollständig markiert. Automatisches Fortsetzen nur bei weiterhin aktivem gespeicherten Forschungsstatus und erfüllten Grenzen.

## 12. Dashboard: verständlich und knapp

Karte `Numaron lernt aus Marktgeschichte` im bestehenden Forschungslabor:

- aktuelle Tätigkeit und einfacher Status;
- tatsächlich belegter Zeitraum und Märkte, kein künstlicher 80-Jahre-Fortschrittsbalken;
- letzte Erkenntnis in einem Satz mit Geltungsgrenze;
- Anzahl geprüfter, verworfener und weiterzuprüfender Kandidaten;
- Buttons `Erkenntnisse`, `Strategietests`, `Datenabdeckung`, `Pause/Fortsetzen` und `Forschung stoppen`.

Details erst nach Klick: Quellen, Datenlücken, Regeln, Kosten, Kennzahlen und Gegenbelege. Erfolg bedeutet bestandene Prüfschritte, nicht vermeintliche Gewinne durch Aktivität. Darkmode und bestehender Dialogmechanismus bleiben erhalten; Hintergrundklick, Escape und Schließen schließen Dialoge. Steuerung nutzt die vorhandene Sitzung und CSRF-Prüfung.

## 13. Schnittstellen und Umsetzungseinheiten

Additive Module unter `src/revenue/long-history/`: Quellenmanifest/Import, Normalisierung/Qualität, persistenter Store, Versuchsanmeldung, Evaluatoradapter, Erkenntnisablage und begrenzter Runner. Separate CLI für reproduzierbare lokale Läufe; Founder-Anbindung liefert einen kompakten Snapshot und Forschungssteuerung. Externe Abrufe laufen außerhalb der Dashboard-Snapshot-Anfrage.

Snapshot enthält Status, Tätigkeit, Abdeckung, Zähler, letzte Erkenntnis, Grenzen und Blocker. Berichtabruf nach ID liefert paginierte Details. Kein Rohdatenarchiv, Zugangsschlüssel oder private Kontoidentität im Browser-Snapshot. Die Implementierungsplanung legt konkrete Dateien und endgültige Schemas fest, bevor Code verändert wird.

## 14. Abnahme

1. Mindestens ein zulässiger echter Datensatz wird importiert, mit Rohdatenhash und tatsächlichem Zeitraum. Ist keine Quelle zulässig/erreichbar, schlägt die funktionale Abnahme ausdrücklich fehl; ein synthetischer Test ersetzt sie nicht.
2. Fehlerhafte Einheiten, Reihenfolge, Duplikate und Lücken werden erkannt; blockierte Lizenz verhindert Import.
3. Gleicher Datenhash, Code und Konfiguration erzeugen dieselben deterministischen Ergebnisse.
4. Vorregistrierte Regeln und Abschnitte sind unveränderlich; spätere Daten gelangen nicht in frühere Signale; mehrfacher Zugang zur Schlussprüfung wird protokolliert und eingeschränkt.
5. Unbekannte Kosten/CHF-Kurse erzeugen keinen vollständigen Nettogewinn; historische Tarife werden nicht durch heutige Gebühren ersetzt.
6. Negative und fehlgeschlagene Versuche bleiben gespeichert; Wissenseinträge nennen Grenzen und Gegenbelege.
7. Grenzen, Pause, Stop und Wiederanlauf funktionieren ohne doppelte Arbeit oder Datenverlust.
8. Dashboard zeigt reale Abdeckung und Ergebnisse verständlich; Dialoge schließen über alle drei Wege.
9. Forschung erzeugt keine echten Orders und bucht keine Paper-Gewinne als Geschäftseinnahmen.

## 15. Reihenfolge nach Entwurfsfreigabe

Quellen/Store und echte Datenaufnahme → Marktgeschichtsbericht → vorhandene Regeln auf geeigneten Daten → Kosten-/Robustheitsprüfung → versionierte Erkenntnisse → begrenzter automatischer Lernzyklus → Dashboard und durchgängige Abnahme. Jede Stufe hat konkrete Belege; fehlende Daten werden nicht durch weitere Strategievarianten kaschiert.

Nächste notwendige Freigabe: diesen schriftlichen Entwurf prüfen, danach den konkreten Implementierungsplan erstellen und direkt hier ausführen. Bereits bestätigte Forschungsziele bleiben gültig.

## Quellen und bereits geprüfte Grundlagen

- https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
- https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html
- https://www.macrohistory.net/database/
- https://admiralmarkets.com/products/fees-and-charges
- https://admirals.freshdesk.com/en/support/solutions/articles/201000071638-how-the-currency-conversion-fee-is-applying-
- Lokaler Quellenprüfbericht: `docs/trading/long-history-source-review-20261013.md`.

Quellenprüfung Stand 13.10.2026. Import und Lizenzfreigabe sind gesonderte Abnahmen, noch nicht durchgeführt.

## Entwurfsprüfung

Selbstprüfung am 13.10.2026: Datenarten und Simulatorumfang getrennt; bestehender Code berücksichtigt; Lizenz- und Tariflücken ausdrücklich offen; Budget und Versuchszahl begrenzt; bekannte historische Daten nicht als vollständig blind bezeichnet; Stop/Wiederanlauf definiert; keine Änderung realer Risikolimits oder Orderausführung; durchgängige Abnahme setzt echte Daten voraus. Keine Produktimplementierung oder Datenkäufe im Entwurfsstadium.
