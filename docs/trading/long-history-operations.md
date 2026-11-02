# Numaron Langzeitforschung – Betrieb und Abnahme

Der bestätigte Forschungsplan ist technisch umgesetzt: Quellenarchiv, begrenzter Download, Qualitätsprüfung, chronologische Versuchsanmeldung, Cash-Simulation mit Kostenstress und gemeinsamem Block-Bootstrap, versionierte Erkenntnisse, persistenter Runner, CLI und Dashboard. Stand: 14.10.2026. Die Datenabdeckung aller Märkte und eine profitable Strategie sind damit noch nicht nachgewiesen.

Der lokale Founder-Dienst betreibt die Forschung automatisch, solange er läuft und der gespeicherte Status aktiv ist. Alle 15 Minuten wird auf neue Datenstände geprüft, je Quelle höchstens ein Abrufversuch pro Zürcher Kalendertag. Neue tägliche Runden erhalten eigene Budgets; bekannte Schlussprüfdaten bleiben bekannt. Pause beginnt keine neue Quellen-/Datensatzarbeit. Stop bricht laufende Berechnungen ab. Alle drei Zustände bleiben nach einem Neustart erhalten. Forschung aktiviert keine Brokerorders und verändert keine Finanzbuchungen.

## Echter Datenstand

Direktquelle: Board of Governors of the Federal Reserve System, H.15. Datei `https://www.federalreserve.gov/releases/h15/data/FRB_h15_xml.zip`, Serie `RIFSGFSM03_N.M` (annualisierter 3-Monats-Treasury-Bill-Diskontzinssatz). Quelle ist gemäß geprüftem Board-Hinweis freigegeben; Attribution bleibt erhalten. Kein Abruf über FRED.

- Rohdatei: 4 285 179 Bytes; SHA256 `2e21d42196e89ae153fe681670cea76c351d55d9c1d08efa7ab09ccc5f3bc427`.
- Dataset-ID: `697d903f13ca8becb1f5a72931b9ff9197f01d104b3c179de2a44be1357ea044`.
- Archiv: 1 113 Monatswerte, 31.01.1934–30.09.2026; Qualitätsprüfung gültig, Monatsfolge vollständig.
- Gewünschter Zeitraum: 13.10.1946–13.10.2026. Tatsächlich darin ausgewertet: 960 Monatswerte, 31.10.1946–30.09.2026.
- Annualisierter Zinssatz: Minimum 0,01 %, Maximum 16,30 %, letzter Wert 3,94 %. Das sind Zinsquotierungen, keine Anlagerenditen oder Gewinne.
- Befund: Finanzierungskosten müssen je Zinsphase untersucht werden. Das ist eine rückblickende Hypothese, kein kausaler Handelsvorteil.

Kenneth French bleibt wegen nicht abschließend belegter Nutzungsrechte `pending`. JST bleibt wegen CC BY-NC-SA `restricted`. Ein geeigneter zulässiger Cash-Produktdatensatz fehlt. Deshalb erzeugt der echte Durchlauf ausdrücklich einen Bericht „nicht prüfbar“ für Strategietests. Versionsänderungen am Forschungscode behalten alte Berichte/Erkenntnisse als Revisionen; sie gelten nicht als neue unabhängige Marktbelege. Unveränderte Wiederholungen erzeugen keine zusätzlichen Berichte.

## Bedienung

Auf der Startseite steht „Numaron lernt aus Marktgeschichte“. Erkenntnisse, Berichte, Datenabdeckung und Quellenlücken lassen sich öffnen. Pause, Fortsetzen und Forschung stoppen betreffen diesen Forschungsrunner. Details verwenden die vorhandenen Dialoge: innen klicken lässt offen, Hintergrund/Escape/Schließen schließt. Die Forschung hat einen separaten schnellen authentifizierten Abruf, damit langsame Kontoabfragen sie nicht blockieren.

CLI im Projektverzeichnis:

```powershell
node --import tsx scripts/numaron-long-history.mjs status
node --import tsx scripts/numaron-long-history.mjs sources
node --import tsx scripts/numaron-long-history.mjs import --source fed-h15
node --import tsx scripts/numaron-long-history.mjs run
node --import tsx scripts/numaron-long-history.mjs report --id <Bericht-ID-aus-status>
node --import tsx scripts/numaron-long-history.mjs pause
node --import tsx scripts/numaron-long-history.mjs resume
node --import tsx scripts/numaron-long-history.mjs stop
```

Archiv `artifacts/numaron-long-history/research.db`, Rohdateien `raw/<SHA256>`. Keine freien URL-/Codeargumente. Ein CLI-Befehl führt keine dauerhaft geöffnete Schleife aus; diese gehört zum Founder-Dienst.

## Reproduzierbarkeit und Grenzen

Ein Worker mit exklusivem erneuertem Lease; sequenzielle Downloads (innerhalb der Obergrenze zwei); 100 MiB je Datei, 2 GiB Archiv, maximal drei Datensätze/24 Varianten/72 Variante-Datensatz-Versuche je Runde. Sechs Stunden gelten konservativ als vergangene Rundenzeit, inklusive Pause. Einzelabrufe und CPU-Berechnungen sind zusätzlich auf 60 Sekunden begrenzt. Derselbe finale Abschnitt wird bei neuer Runde/Revision nicht unberührt. Bereits erzeugte Phasenergebnisse und Fehler werden sofort dauerhaft gespeichert und bei Wiederanlauf verwendet.

Cash-Simulation: zwölf eingefrorene Varianten, virtuell 10 000 native Währung, 1 % Forschungsrisiko, Long/eine Position. Kostenmodell 10 bps Gebühr plus 10 bps Slippage/minimum 1 je Seite; Stress 20/20/minimum 2. Kein historischer Tarifnachweis. Fehlende Kalender-, Dividenden-, Universums-, Delisting- oder damalige Veröffentlichungsstände bleiben Einschränkungen. Familienstatistik verwendet gleiche Zeitachsen, 2 000 gemeinsame zeitabhängige Bootstrap-Replikationen, Blocklänge ceil(sqrt(n)), Seed 42 und maximale gemeinsame Statistik. Fehlende/zu kurze Familien ergeben keinen positiven Intervallbefund. Modellkosten allein geben keine Strategie frei.

Neue Erkenntnisse sind versionierte lokale Evidenz und werden mit dem vorhandenen Wissenskontext verbunden. Literaturübersichten bleiben Übersichten; das OpenAI-Basismodell wird nicht trainiert. Es entstehen keine neuen bezahlten Modellaufrufe, Datenkäufe oder Zugangsschlüssel.

## Prüfungen

Gezielte Forschungs-, Worker-, Wiederanlauf- und Integritätsprüfungen: 41/41 in zwölf Dateien. Zwei zusätzliche Node-Integrationen prüfen Session/CSRF, GET ohne Forschungsausführung und verständliche UI ohne Verwechslung von Zinsen mit CHF-Gewinn. TypeScript-Prüfung bestanden. Unabhängige Gesamtprüfung durchgeführt; Wiederanlauf- und Verlust-von-Zwischenergebnissen behoben. Erfolgreicher Import bleibt bei nachfolgendem Forschungsfehler abgeschlossen.

Browserprüfung am echten Dienst: Datenabdeckung, 960-Werte-Bericht und Einschränkungen angezeigt; Pause/Stop/Fortsetzen geprüft; innen offen, Escape/Hintergrund schließen. Forschung anschließend aktiv. Screenshots und vollständige Testausgaben unter `outputs/long-history-*` bzw. `outputs/numaron-long-history-*`.

Die vollständige Projektprüfung hat zwei bereits bekannte fremde Fehler (`online.test.ts`, `v1-dashboard.test.ts`). Die eigenen Tests bleiben grün; fremde Tests wurden nicht abgeschwächt. Letzte Zahlen stehen in `outputs/long-history-full-suite-final.txt`.

## Erweiterung: Analystenwissen für Daytrading, 14.10.2026

Der Nutzer hat den konkreten fünfteiligen Entwurf bestätigt. Der aktuelle gewünschte Zeitraum lautet 14.10.1926–14.10.2026. Der echte neue Durchlauf umfasst alle 1 113 verfügbaren H.15-Monatswerte von 31.01.1934–30.09.2026. Die fehlenden Jahre und der fehlende neuere Monatsstand sind sichtbar. Alte 80-Jahres-Berichte bleiben als Versionen erhalten, keine zusätzliche unabhängige Evidenz. Die Statistik bleibt 0,01 % / 16,30 % / zuletzt 3,94 %; jährliche Zinsquotierungen, keine Monatsrenditen.

Wissensversion 15 enthält acht ursprüngliche knappe Analysten-Prüfideen aus gelesenen Primärquellen, mit Zeitraum, Marktumfang, Anwendung und Gegenbelegen. Das ist keine lückenlose hundertjährige Börsendatenbank. Quellenberichte sind keine ausführbaren Intraday-Kurse:

- 1929–1932: Kreditfinanzierte Spekulation und dauerhafte Verluste. Anwendung: Erholung und Liquidität nicht voraussetzen. Quelle: https://www.federalreservehistory.org/essays/stock-market-crash-of-1929
- 1965–1982: Inflation, Zinsen und damalige Informationsstände. Anwendung: Finanzierung produktspezifisch prüfen, keine M5-Richtung aus Monatszinsen ableiten. Quelle: https://www.federalreservehistory.org/essays/great-inflation
- 1987: Stress, Marktverflechtung und Rückkopplungen. Anwendung: ungewöhnliche Volatilität gesondert testen; ein Filter kann auch profitable Erholungen verpassen. Quelle: https://www.federalreservehistory.org/essays/stock-market-crash-of-1987
- 2007–2009: Finanzierungsstress. Anwendung: Kosten-/Liquiditätsszenarien nicht aus ruhigen Perioden verallgemeinern. Quelle: https://www.federalreservehistory.org/essays/great-recession-and-its-aftermath
- 2015: Ende des EUR/CHF-Mindestkurses. Anwendung: politische Kursregeln nicht als garantierten Schutz behandeln; Ereignisse sind nicht vorhersagbar. Quelle: https://www.snb.ch/en/publications/communication/press-releases/2015/pre_20150115
- 2020: Zeitlich stark schwankende Spreads und Markttiefe. Anwendung: aktuelle ausführbare Preise messen; ein enger Spread allein belegt keine verfügbare Positionsgröße. Quelle: https://www.federalreserve.gov/econres/notes/feds-notes/what-do-quoted-spreads-tell-us-about-machine-trading-market-stress-march-2020-20200925.html
- BIS-Marktstressanalyse: Mehrere Bedingungen zusammen prüfen. Quelle: https://www.bis.org/publications/qr-202209/under-pressure-market-conditions-and-stress
- CME-Methodik: Spread, Tiefe und Mengenabhängigkeit unterscheiden; Methodenwechsel 2024 berücksichtigen. Quelle: https://www.cmegroup.com/education/articles-and-reports/understanding-the-cme-liquidity-tool-methodology

`trading-context.ts` misst aus den letzten 61 abgeschlossenen, aktuellen und lückenlosen M5-Kerzen Trend (10 gegen 40 Kerzen), aktuelle Bewegung/Volatilität (20 gegen vorherige 20) und Spread/ATR. Zukunftsdaten, veraltete Quotes und Lücken liefern keine auswählbare Marktphase. Die eingefrorenen Schwellen 0,5 ATR Trend, 1,75 Volatilitätsverhältnis und 0,1 Spread/ATR sind Numaron-Forschungshypothesen, keine empirisch bewiesenen Parameter aus den Quellen. Makro-Erkenntnisse liefern ausschließlich Finanzierungshinweise; produktbezogene negative Tests bleiben auf ihrem Datensatz beschränkt.

`founder-trading.mjs` liest die gespeicherten Lessons bei jeder gültigen Marktaufnahme und liefert die Anwendungshinweise sowie aktuellen Kontext an das Dashboard. „Historisches Wissen für heutige Trades“ zeigt wenige aktuelle Befunde und einen aufklappbaren Vergleich. Details zur hundertjährigen Abdeckung und den acht Quellen liegen in der bestehenden Datenabdeckung; Erkenntnisdetails zeigen Anwendung, Prüfung und Grenzen.

`trading-context-study.mjs` speichert einen neuen prospektiven paarweisen Vergleich: gleiche frische Signale und identische Entry-/Stop-/Target- und Kostenannahmen. Kontext darf ein Signal auslassen; nur bei bekanntem gemeinsamen Ausgang bedeutet Nichtstun 0 R. Kurslücken und fehlende Kosten schließen beide Seiten aus den Summen aus. Unbekannte Ausgänge bleiben separat, negative Ergebnisse bleiben erhalten. Die Summen sind hypothetische R-Szenarien, kein Portfolioertrag, keine Broker-Fills oder CHF-Buchungen. Überlappende Signale sind keine unabhängigen Beobachtungen. Die Studie optimiert keine Parameter automatisch und erteilt keine Livefreigabe.

Aktuelle Studienversion: century-context-4. Manifest friert Konstanten, Berechnungs-/Basissignal-/Kostenmodell-Code und Tarifdigest ein. Neue Änderungen benötigen eine neue Version; alte Beobachtungen bleiben in der SQLite-Ablage. Einzelbelege speichern Modell-/Tarifdigest, Kontextmerkmale und die begrenzten zugrunde liegenden M5-Kerzen/Quotes. Konto und Server isolieren die Auswertung; im Snapshot erscheinen keine privaten Identitäten. Maximum 2 000 Belege/100 offene Beobachtungen; bisherige Beobachtungs-Watchlisten behalten Vorrang. Neue Kohorten verwerfen keine früheren Ergebnisse; noch offene alte hypothetische Beobachtungen erhalten den Status retired, ohne erfundenen Abschluss.

Verifikation: 90 gezielte Vitest-Prüfungen in 15 Dateien und 21 Node-Trading/API/UI-Prüfungen bestanden; TypeScript bestanden. Die unabhängige Review fand eine unvollständige Manifest-Versionierung; Tarifwechsel-Regression RED→GREEN, Code-/Tarifdigests ergänzt. Frische Browseranzeige und tatsächliche Wissensrückführung geprüft. Ergebnisverbesserung bleibt bis zu ausreichend neuen Beobachtungen unbewiesen. Vollständige Projektprüfung: 4 304 bestanden, dieselben zwei bekannten fremden Fehler online.test.ts/v1-dashboard.test.ts. Ausgaben unter outputs/century-*. Keine bezahlten Modellaufrufe, Datenkäufe oder neuen Zugangsschlüssel.
