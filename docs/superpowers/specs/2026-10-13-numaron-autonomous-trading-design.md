# Numaron: autonomes Trading – Entwurf zur Prüfung

Status: Entwurf, keine Live-Aktivierung. Nutzerwunsch: mehrere gleichzeitige Positionen, maximal 5 % geplantes Kontorisiko pro Trade, 15 % Gesamtrisikolimit und 30 % Tagesverlustschwelle für neue Einstiege, autonome Ausführung und fortlaufende Strategieverbesserung. Ziel: nachhaltige Profitabilität; keine Gewinnzusage.

## Bestand und Architektur

Der bestehende MT5-Adapter liest Konten, Positionen und Aufträge. Das Trade-Journal speichert Beobachtungen und Vorschläge; die aktuelle Prüfung erlaubt keine Orderausführung. Ein unabhängig validiertes Handelssignal fehlt im bestehenden Machbarkeitsbericht.

Ein separater lokaler Trading-Dienst erhält vier Komponenten: Marktbeobachtung, versionierte Strategieauswertung, feste Risikoprüfung und Broker-Ausführung mit dauerhafter Zustandsablage. Modellantworten sind Eingaben zur Analyse, keine direkt ausführbaren Broker-Anweisungen. Konto, Server und erlaubte Instrumente werden vor jedem Auftrag geprüft. Der Founder-Controller bleibt für Geschäftsaufgaben zuständig.

## Daten und Strategien

MT5 liefert Broker-Kurse, abgeschlossene historische Kerzen, Symbolregeln und Kontohistorie. Zeitstempel werden in UTC gespeichert. Veraltete, fehlende oder widersprüchliche Daten sperren neue Einstiege. Alle über die verbundenen Brokerkonten tatsächlich verfügbaren Tradingprodukte dürfen untersucht werden, einschließlich Währungen, Rohstoffen, Krypto, Aktien und Fonds. Verfügbarkeit ist keine Freigabe zur ungeprüften Ausführung: Für jedes Instrument müssen Handelsberechtigung, Kontraktart, Handelszeiten, Kosten, Mindestgröße, Margin, Stop-Unterstützung und ausreichende Daten bestätigt sein. Fehlt eine passende validierte Strategie oder technische Unterstützung, bleibt das Instrument gesperrt. Der bestehende MT5-Zugang eröffnet keinen Zugriff auf zusätzliche Börsen oder Konten. CFD und zugrunde liegendes Wertpapier werden ausdrücklich unterschieden.

Numarons Wissen wird mit Herkunft, Aktualität und Prüfstatus erfasst. Daraus entstehen versionierte Strategiekandidaten mit messbaren Ein- und Ausstiegsregeln. Ungeprüfte Quellenbehauptungen gelten nicht als belegter Handelsvorteil. Eine Strategie erhält vor Einsatz chronologisch getrennte Entwicklungs- und Testdaten, Kosten- und Slippageannahmen sowie eine Vorwärtsprüfung ohne echte Orders. Ergebnisberichte dokumentieren Stichprobe, Drawdown, Nettoertrag und Unsicherheit. Ohne ausreichenden Nachweis lautet die Entscheidung Warten.

Fortlaufendes Lernen wertet reale Ausführungen und Strategieabweichungen aus. Neue Parameter werden separat geprüft. Die aktive Strategie wird nur durch eine nachvollziehbare Promotion mit gespeichertem Prüfbericht ersetzt; Rückkehr zur vorherigen Version ist möglich. Risikogrenzen werden niemals durch das Modell angehoben. Keine Ausführung von vom Modell erzeugtem beliebigem Code.

## Risiko – vorgeschlagene genaue Bedeutung

5 % sind eine Obergrenze, keine Zielgröße: geplanter Verlust vom ausführbaren Einstieg bis zum Stop einschließlich belastbarer Kostenreserve, geteilt durch aktuelle Kontoequity. Lotgröße wird nach Broker-Schritt abgerundet. Ist selbst die Mindestlotgröße zu groß, erfolgt kein Trade. Stop-Loss und Gewinnziel sind Pflicht. Stops werden nicht zur Verlustvergrößerung erweitert; kein unkontrolliertes Nachkaufen.

Mehrere Positionen sind möglich. Vom Nutzer festgelegtes gemeinsames Limit: 15 % der aktuellen Equity für die Summe des geplanten offenen Risikos einschließlich ausstehender Einstiegsorders; wirtschaftlich gleiche oder korrelierte Exposures werden zusätzlich begrenzt. Die Berechnung zählt jede risikobehaftete Order mit; fehlender Stop oder unbekannte Kosten sperren zusätzliche Einstiege. Korrelation darf nicht als vermeintliche Risikoreduktion abgezogen werden.

Tagesverlust: Rückgang der gesamten Kontoequity gegenüber dem gespeicherten Stand um 00:00 Europe/Zurich, bereinigt um Ein- und Auszahlungen, einschließlich unrealisierter Verluste und Gebühren. Fehlender Tagesstart oder unklare Geldbewegungen sperren neue Trades. Vor jeder Order muss das bereits verlorene Tagesbudget plus offenes und neu geplantes Risiko unter 30 % bleiben. Tagesgewinne erhöhen das Startbudget nicht.

Bei Erreichen der Tagesverlustschwelle: keine neuen Einstiege und Numaron-Einstiegsorders stornieren. Keine pauschale Schließung bestehender Positionen wegen der Schwelle. Positionen werden nach den vor Einstieg versionierten Ausstiegs- und Schutzregeln der Strategie weiter betreut. Stop-Loss und Gewinnziel bleiben wirksam. Ein späteres Modellurteil darf keinen Stop entfernen oder eine vorgesehene Schutzschließung verhindern. Automatische Schließungen erfordern eine dokumentierte, zur aktiven Strategie passende Ausstiegsbedingung; die Begründung wird im Journal gespeichert und im Dashboard angezeigt. Die tatsächliche Ausführung wird abgeglichen. Fremde Positionen werden nicht automatisch verändert, beeinflussen aber Kontoequity und verfügbaren Spielraum. Gaps, Slippage, Broker-Ausfälle und fremde Trades können das tatsächliche Limit überschreiten; Die 30-%-Schwelle ist eine Einstiegssperre, keine harte Verlustobergrenze. Insbesondere beim strategiekonformen Offenhalten kann der Tagesverlust weiter steigen. Nach einer Verletzung bleibt eine persistente Sperre bis zum bewussten Entsperren bestehen.

## Ausführung und Wiederanlauf

Durable Orderabsicht vor dem Senden speichern, eindeutige Signalidentität, exklusiver Ausführungs-Lock und Numaron-Kennung. Nach Timeout keine blinde Wiederholung: Orders, Positionen und Dealhistorie abgleichen. Teilfüllungen, Netting/Hedging, abweichende Füllpreise und Broker-Rückgaben explizit behandeln. Bei ungeklärtem Zustand keine weiteren Einstiege. Broker-Vorprüfung ersetzt weder Strategieprüfung noch Ausführungsbestätigung.

Notaus verhindert neue Einstiege, storniert Numaron-Einstiegsorders und erhält Schutzüberwachung offener Positionen. Eine getrennte Aktion schließt alle Numaron-Positionen. Bereits gesendete Orders werden nachträglich abgeglichen. Beide Zustände überstehen einen Prozessneustart. Automatischer Wiederanlauf darf eine Sperre nicht entfernen.

## Dashboard

Start zeigt Analysezustand, aktuelle Strategieversion, geprüfte Signale, Sperrgründe, offene Trades, Lotgröße, Stop, Ziel, geplantes Risiko in Kontowährung und Prozent sowie aktuellen Gewinn/Verlust. Tagesverlust und offenes Gesamtrisiko stehen neben den Limits. Die Oberfläche bezeichnet 30 % ausdrücklich als Tagesverlustschwelle für neue Einstiege und erklärt bei weiter offenen Positionen die aktive Ausstiegsregel. Geprüft bedeutet bestanden nach dokumentierten Regeln, nicht garantierter Gewinn. Handelsstatus bleibt getrennt vom Geschäfts-AI-Status. Finanzgewinn enthält keine unrealisierte Trading-Equity als Einnahme.

## Abnahme und Live-Bereitschaft

Prüfungen: Risikorechnung einschließlich Mindestlot, Kosten und Parallelorders; Tageswechsel Zürich und Sommerzeit; Neustart und Timeout ohne Doppelorder; fehlende Kurse; Konto-Wechsel; Teilfüllung; Schutzfehler; Notaus; Abgleich eigener und fremder Positionen; Strategieprüfung ohne Daten aus der Zukunft.

Live-fähiger Code kann vorbereitet werden. Vor Live-Aktivierung müssen Konto/Server, instrumentbezogene Handelsfähigkeit, Gesamtlimit und die geprüfte Strategieversion feststehen; Brokerzugriff, Ausführungsabgleich und Schutzverhalten müssen nachgewiesen sein. Vorbereitung ist keine Live-Aktivierung. Der konkrete schriftliche Entwurf und danach der Implementierungsplan werden vor Umsetzung geprüft.

## Vom Nutzer festgelegt und verbleibende Entwurfsprüfung

- Mehrere gleichzeitige Positionen; 5 % geplantes Risiko je Trade und 15 % geplantes Gesamtrisiko.
- Alle tatsächlich verfügbaren Produktarten, jeweils mit belegter Handelsfähigkeit und geprüfter Strategie.
- Keine pauschale automatische Schließung, die festgelegten Strategieausstiegen widerspricht.
- Zur Prüfung: Tagesverlustmessung nach obiger Definition; 30 % sperren neue Einstiege, während bestehende Positionen nach den vorher festgelegten Schutz- und Ausstiegsregeln weiterlaufen. Eine harte 30-%-Verlustobergrenze wird nicht zugesagt.

## Primärquellen

- https://www.mql5.com/en/docs/python_metatrader5/mt5ordercheck_py
- https://www.mql5.com/en/docs/python_metatrader5/mt5ordercalcprofit_py
