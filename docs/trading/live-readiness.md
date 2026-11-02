# Numaron: Stand der Live-Vorbereitung, 13.10.2026

**Nicht livebereit; keine echten Orders gesendet.** Bestätigte Grenzwerte: 5 % je Trade, 15 % gesamt, 30 % Tagesverlustschwelle für neue Einstiege. Strategiekonforme Schutz- und Ausstiegsregeln bleiben maßgeblich.

## Implementiert und lokal geprüft

- Mehrprodukt-Inventar und lesender, kontogebundener MT5-Adapter mit paginierter Beobachtung und expliziten Datenlücken.
- Deterministische Risikoaufnahme, Zürich-Kalendertage einschließlich Sommerzeit, kostenabhängige Lot-Berechnung über Broker-Rechenfunktionen.
- SQLite-Orderreservierung, dauerhafte Sperre, keine Wiederholung unklarer Orders, Timeouts und Strategie-/Kontobindung der internen Ausführungsgrenze.
- Strategiekandidat aus Numarons dokumentiertem Trendwissen; getrennte Test-/Vorwärtsdaten, konservative Nettoauswertung und doppelter Kostenstress. Diese Auswertung authentifiziert keine frei übergebenen P&L-Daten und erlaubt allein keinen Livebetrieb.
- Separate Trading-Anzeige und session-/CSRF-geschützte Einstiegssperre im Founder Dashboard. Der tatsächlich gestartete Dienst arbeitet lesend und hat keinen installierten Live-Ausführungsadapter.

## Tatsächlicher Brokerbefund

Lesende Abfrage: 2466 Produkte, erste 50 untersucht, EUR-Konto, keine offenen Positionen. Nach Wiederverwendung der pro Scan geprüften Brokerzeit (fünf fortlaufende Kursquellen, UTC+3 für diese Aufnahme) bestehen 35 der ersten 50 Produkte die aktuelle Quote-/Historien-Grundprüfung. Rohzeiten bleiben erhalten; eine eingefrorene Quote genügt nicht für diese Korrektur. Vollständige instrumentbezogene Kostenbelege und der bestätigte Zürich-Tagesstart fehlen.

## Nicht abgeschlossen – vor Livefreigabe erforderlich

1. Brokerzeit wird pro Aufnahme anhand fortlaufender unabhängiger Kursquellen geprüft; erfolgreiche Grunddatenaufnahme liegt vor. Produktbezogene Ausführungs- und Kostenprüfung über alle verwendeten Kontrakttypen bleibt erforderlich.
2. Kommission, Slippage-Reserve, Finanzierung und mögliche Währungsumrechnung je Kontrakttyp bestätigen; auch bestehende Positionen und Pending Orders vollständig bewerten.
3. Der persistente Tagesbaseline-Baustein ist lokal getestet; vollständige Kontohistorie/Geldbewegungen müssen noch als authentifizierte Quelle integriert werden. Ein beliebig als verified markierter Datensatz reicht nicht.
4. Kontogebundenen MT5-Ausführungsadapter vollständig integrieren und dessen Teilfüllung, Netting/Hedging, Abgleich, Pending-Stornierung und strategiegebundene Schutzverwaltung nachweisen. Python- und Node-Bausteine für Einstieg, Abgleich, Stornierung und strategiegebundene Ausstiege sind vorhanden; sie sind noch nicht mit verifizierten Konto-/Kosten-/Strategiebelegen im produktiven Dienst installiert und nicht am Broker abgenommen.
5. Reproduzierbare Strategie-Replays aus belegten Rohdaten, unabhängige Vorwärtsbeobachtung und verifizierte Promotion/Rollback im Dienst integrieren. Die vorhandene Wissenssammlung und lokale synthetische Tests sind kein Profitabilitätsnachweis.
6. Aktivierung erst nach diesen Nachweisen, gebunden an Konto, Server, Strategieversion und Limits. Kein Neustart darf eine Sperre entfernen.

Der laufende Dienst weist diese Gründe aus und kann nicht per Dashboard in einen ungeprüften Livebetrieb umgeschaltet werden. Der bestätigte Plan ist noch nicht vollständig umgesetzt; fehlende Module und fehlende externe Evidenz sind oben getrennt beschrieben.
