# Automatische Numaron-Forschung

Stand 13.10.2026: Automatische Marktbeobachtung und prospektive Signalbeobachtung sind im lokalen Founder-Dienst integriert. Keine realen Trades werden durch diese Erweiterung ausgeführt.

## Was automatisch geschieht

- Der bestehende kontogebundene MT5-Leser untersucht paginiert Brokerprodukte. Er liefert aktuelle Kurse, abgeschlossene M5-Kerzen und Kontraktdaten.
- Der dokumentierte Breakout-Kandidat erzeugt ausschließlich Forschungssignale. Neue Signale werden einmal pro Konto, Server und Signalidentität in SQLite gespeichert; ein Neustart löscht sie nicht.
- Bis zu 100 offene Beobachtungen erhalten bevorzugte Kursabfragen, unabhängig von der Produktpagination. Mehr Beobachtungen können gespeichert sein; nicht erfasste Kurse bleiben als Lücke markiert.
- Folgende aktuelle Kurse desselben Produkts werden mit dem ursprünglich festgelegten Stop und Ziel verglichen. Kaufideen verwenden den Bid, Verkaufsideen den Ask. Das Ergebnis zeigt die beobachtete Kursbewegung in Einheiten des ursprünglichen Stop-Abstands (R).
- Die Übersicht zeigt getrennte Gesamtzähler und begrenzte Detailansichten. Kontowechsel vermischen keine Beobachtungen. Veraltete oder ausgefallene Beobachtungen werden gekennzeichnet.
- Swap-Kauf/Verkauf, Berechnungsmodus, Dreifach-Swap-Tag und Kontraktwährungen werden aus `symbol_info` gelesen. Diese Rohwerte sind kein vollständiger Kostenbeleg und keine CHF-Kosten.

## Aussagegrenzen

Die Beobachtung ist kein ausgeführter Paper-Trade: Zwischen paginierten Aufnahmen können Stop und Ziel berührt worden sein. Deshalb kennzeichnet die Erfassung Kurslücken und berechnet weder Nettogewinn noch eine validierte Handelsrendite. Sie meldet keine Strategie als profitabel oder liveberechtigt.

Historische Strategietests, unabhängige prospektive Evidenz mit ausreichender Abdeckung, vollständige Kommission/Slippage/Finanzierung sowie authentifizierte Tagesstart-Equity und klassifizierte Geldbewegungen sind weiterhin nicht vollständig vorhanden. Fehlende Tageswerte werden nicht aus dem aktuellen Kontostand rekonstruiert.

Reale Trades entscheidet und führt der Nutzer selbst aus. Die Risikogrenzen von 5 % je Trade, 15 % gesamt und 30 % Tagesverlustschwelle sind Prüfregeln; sie sind keine garantierten Verlustobergrenzen.

## Verifikation

66 JavaScript-Tests der betroffenen Forschungs-, Risiko-, Status- und Dashboard-Module bestehen; sieben Python-Adaptertests bestehen. Die neuen Tests prüfen insbesondere persistente Deduplication, Kontotrennung, vollständige Zähler, Kauf-/Verkaufspreise und Kurslücken. Es wurden keine echten Orders gesendet.

## Fortsetzung: Tagesabgleich und historische Paper-Trades

Der Brokeradapter liest nun die Dealhistorie und gleicht die Zahl zurückgelieferter Datensätze mit `history_deals_total` ab. Tagesstartwerte werden dauerhaft nach Login, Server, Währung und Zürich-Kalendertag getrennt gespeichert; frühere Werte ohne Serverbindung werden nicht übernommen.

Der Tagesstart kann aus einem unveränderten positionslosen Konto abgeleitet werden, wenn Balance gleich Equity ist, Profit und Credit null sind und die vollständige Brokerhistorie im um 14 Stunden abgesicherten heutigen Zeitraum keine Buchung enthält. Es wird keine Mitternachtsmessung behauptet. Bei relevanten Buchungen, unbekannten Dealtypen oder fehlender Zeitzuordnung bleibt der Tagesabgleich offen. Für die tatsächlich lesend geprüfte Aufnahme am 13.10.2026 ließ sich diese unveränderte Ausgangslage bestätigen.

Historische Cash-Vergleichstests sind jetzt integriert: Long, ganze Einheiten, virtuelles Startkapital 10 000 in der jeweiligen Modellwährung, 1 % geplantes Risiko, feste Breakout-Regeln und getrennte historische Testfenster. Das vorhandene Paper-Modul simuliert Ein- und Ausstiege einschließlich konservativer Rundung. Gebühr 10 Basispunkte, Slippage 10 Basispunkte und Mindestgebühr 1 Währungseinheit sind ausdrücklich Forschungsannahmen. Ein zweiter Lauf verdoppelt diese Annahmen. Rohdaten und Berichte werden bis zur Archivgrenze von 1 000 Berichten je Konto/Server gespeichert. Dieses Cash-Modell bildet weder CFD-Margin noch Short- oder Overnight-Finanzierung ab und ist kein Brokerkostennachweis.

Der Nutzer bestätigte Trade.MT5; die Terminal-Firmenangabe lautet Admirals Group AS. Die Vertragsgesellschaft ist weiterhin nicht belegt. Der gespeicherte Kostenprofil-Entwurf verwendet deshalb keine unbestätigten Tarife als tatsächliche Kosten. Vollständige Brokerkosten und ein unabhängiger Strategienachweis bleiben offen. Aktuelle Verifikation: 71 JavaScript-Tests und acht Python-Tests bestanden, keine echten Orders gesendet.
# Tarifprüfung am 13.10.2026

Vertragsgesellschaft aus dem angemeldeten Kundenportal: Admirals Europe Ltd; Kontotyp laut Nutzer Trade.MT5. `account-cost-profile.json` enthält veröffentlichte Standardtarife und Quellen. `trading-tariff.mjs` berechnet Forschungsabschätzungen pro Handelsseite und für einzelne berechtigte Fremdwährungsabrechnungen. Keine automatische Produktklassifizierung, kein vollständiger Kostenbeleg, keine rückwirkende Anwendung heutiger Tarife auf frühere Jahrzehnte und keine Livefreigabe. Australien/Japan bleiben wegen widersprüchlicher öffentlicher Angaben ausgeschlossen.

Gezielte Suite: 74/74 bestanden; nach abschließender UI-Textänderung 8/8 Integration/Tariftests bestanden. Vollständiges `npm test`: 4259/4261 bestanden; Fehler in `online.test.ts` (browser script/control surface) und `v1-dashboard.test.ts` (alte OBOLUS-Überschrift erwartet). Diese fremden Bereiche wurden nicht verändert. Der lokale Dienst wurde ohne aktive Jobs neu gestartet; die Anzeigeprüfung im bisherigen Browser-Tab scheiterte an der lokalen Verbindung/Sitzung und ist noch nicht bestätigt.

