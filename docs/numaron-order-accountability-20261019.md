# Verbindliche Auftragsprüfung und Auftragsabrechnung

Umgesetzt am 19. Oktober 2026 auf ausdrücklichen Auftrag von Patrice. Numaron bleibt OFF. Keine Plattformabrufe, Nachrichten, neuen Aufträge, Produktionsdatenbankänderungen oder Dienstneustarts durch diese Arbeit.

## Bestehende Grundlagen

Die Marktplatzadapter prüfen bereits eigene Zuteilung, Auftraggeber, KI-Erlaubnis, aktuelle Finanzierung, Lieferumfang, Abnahme und Zahlung. Der Zahlungsdienst begrenzt Vorleistung auf CHF 1 und einen offenen Auftrag. Der Budgetdienst führt Reservierungen und tatsächliche Kosten unter einer gemeinsamen Auftragsfamilie. Diese Grenzen wurden nicht geändert.

## Ergänzungen

- `founder-native-work.mjs`: gemeinsamer Auftragscheck verlangt zusätzlich Auftraggeberidentität, bestätigte Bedingungen, KI-Erlaubnis, positiven Preis und Nettoerlös, Währung und Empfänger. Die vorhandenen Prüfungen für Zuteilung, Finanzierung, Umfang, Eingaben, Abnahmekriterien und private Daten bleiben bestehen.
- `founder-order-execution.mjs`: prüft den Vertrag bei Vorbereitung sowie erneut vor Arbeit, Prüfung und Lieferung. Bereits gespeicherte unvollständige Arbeitsprodukte können den neuen Check nicht umgehen. Die quellspezifischen Frische- und Berechtigungsprüfungen bleiben zusätzlich erforderlich.
- `founder-opportunity-store.mjs`: vor dem Status bezahlt müssen Betrag, Währung, Empfänger und Auftragsidentität zum Vertrag passen. Ein Beleg darf nicht mehrfach verwendet werden. Prüfung und Speicherung erfolgen in einer SQLite-Transaktion. Bezahlte Aufträge können nicht über einen gewöhnlichen Statuswechsel zurückgesetzt werden. Der Zahlungscheck erfolgt auch vor Freigabe einer Vorleistungsreservierung.
- `founder-order-accountability.mjs`: rein lesende Zuordnung vorhandener Budgeteinträge nach `rootTaskId` und bestätigter Zahlung nach Auftragsidentität. Doppelte Kostenbelege werden nicht doppelt summiert; widersprüchliche Einträge und mehrfach verwendete Wurzeln blockieren ein Ergebnis. Vereinbarter Brutto-/Nettoerlös und Abzüge, tatsächliche CHF-Kosten und offene Reservierungen sind getrennt.
- Der Laufzeitstatus enthält `orderAccounts`. Fehlende Kostenbelege, offene Reservierungen, unvollständige Budgetabdeckung, unbestätigte Zahlungen und fremde Abrechnungswährungen ergeben keinen numerischen CHF-Auftragsbeitrag. Nicht zugeordnete Kosten bleiben separat sichtbar. Es wird kein Gesamtgewinn behauptet und kein neuer Zahlungsbeleg aus einem Kontostand erzeugt.
- `founder-order-selection.mjs`: große Aufträge werden nicht mehr pauschal auf einen kleinen ersten Meilenstein verwiesen. Nachgewiesene technische Eignung, klarer Umfang und vorhandene Berechtigungen sind maßgeblich. Es gibt keine neue Beschränkung auf zwei Angebote oder eine Plattform.

## Grenzen und Aktivierung

Diese Änderung erweitert keine technischen Ausführungsprofile, Sandboxgrenzen oder Budgets. Große Aufträge sind nicht allein aufgrund ihrer Größe ausgeschlossen; ihre tatsächliche Ausführbarkeit muss weiterhin nachgewiesen sein. Neue Profile erfordern passende geprüfte Ausführungs- und Abnahmeverfahren.

Quellenadapter müssen die geforderten Vertragsfelder authentifiziert liefern. Fehlende Angaben werden nicht aus Bewerbungstext oder Modellannahmen erfunden. Bestehende unvollständige Datensätze bleiben erhalten und blockieren betroffene neue Ausführungsschritte.

Die Auftragsabrechnung umfasst den gemeinsamen Quellenablauf (`orderRestoration`) und dessen Budgetwurzeln. Historische/gesonderte Zahlungsberichte, insbesondere der separate USDC-Eingangsbericht, werden nicht automatisch nachträglich Aufträgen zugeordnet. Fremdwährungsumrechnung, Erstattungsworkflow, Betreiberzeit und ein vollständiger betrieblicher Gewinnabschluss sind nicht Teil dieser Änderung.

Der Quellcode ist ergänzt, der laufende Dienst wurde nicht neu geladen. Die Änderungen müssen bei einer späteren kontrollierten Wartung im Zustand OFF geladen werden. Ein Neustart darf Numaron nicht einschalten. Der operative Start bleibt ausschließlich Patrice persönlich vorbehalten.

## Prüfung

Regressionstests mit temporären Datenbanken, simulierten Quellen und extern gesperrtem Node-Netzwerk. Protokoll: `artifacts/order-accountability-tests.tap`.

```powershell
node --require ./scripts/verification-network-guard.cjs --import ./scripts/founder-offline-test-guard.mjs --import tsx --test scripts/founder-order-accountability.test.mjs scripts/founder-order-execution.test.mjs scripts/founder-order-selection.test.mjs scripts/founder-marketplace-work-source.test.mjs scripts/founder-order-payment.test.mjs scripts/founder-production-order-bindings.test.mjs scripts/founder-order-selection.integration.test.mjs scripts/founder-opportunity-store.test.mjs scripts/founder-payment-runtime.test.mjs scripts/founder-restoration-runtime.test.mjs scripts/founder-restoration-core.test.mjs scripts/founder-restoration-boundaries.test.mjs
```

## Kontrolliertes Laden am 19. Oktober 2026

Auf ausdrücklichen Folgeauftrag über den geschützten Wartungsstarter neu geladen. Authentifizierter lokaler Nachher-Status: OFF Revision 79, Controller stopped, null aktive Worker, kein Schedulerfehler. Auftragsabrechnung für alle 19 registrierten Aufträge vorhanden. Alle 3.470 Budgeteinträge einschließlich Kosten und Reservierungen unverändert; Anbieterleser melden powered-off. Fünf Wartungsschutztests und erneut 123 Regressionstests bestanden.

Zwischen Vorher-Aufnahme und Prozessstart wurde founder-order-execution.mjs parallel geändert (optionale paymentTerms nur bei Vorhandensein übernehmen). Änderung geprüft; Dateizeit liegt vor Prozessstart, erwarteter Hash in after.json festgehalten. Keine weitere Neustartschleife nötig.

Beleg: artifacts/order-accountability-activation-20261019/after.json; Tests: artifacts/order-accountability-activation-20261019/tests.tap. Der vorherige Abschnitt zum ausstehenden Laden ist damit überholt. Kein operativer Start und kein bezahlter Liveauftrag zum Testen ausgelöst.
