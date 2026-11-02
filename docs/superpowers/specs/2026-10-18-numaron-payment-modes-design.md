# Numaron: Plattform-Escrow und begrenzte Vorleistung

Datum: 18. Oktober 2026. Status: Konkrete Regel von Patrice bestätigt und lokal implementiert; Numaron bleibt OFF, produktive Anbieter- und Kontoeinrichtung nicht vorgenommen.

## Ziel und feste Grenzen

Patrice möchte reale Aufträge selbstständig finden, bearbeiten und einreichen lassen. Unterstützt werden sollen Plattform-Escrow und begrenzte Vorleistung mit Zahlung nach Abnahme. Nur Trades bleiben Demo. Numaron bleibt bis zum persönlichen Dashboard-Klick OFF. Dieser Entwicklungsauftrag erlaubt keine Provider-Aufrufe. Budgets und die zehn offenen Reservierungen von insgesamt CHF 5 bleiben unverändert.

Die allgemeine Zustimmung zu sicher geprüften Quellen ersetzt keinen Beleg für einen konkreten Auftrag, eine Plattformoperation oder einen Zahlungseingang. Historische Lieferungen werden nicht erneut ausgeführt. Ein neu eingerichtetes Escrow-Konto kann fremde Plattformen nicht automatisch absichern.

## Vorhandene Ausgangslage

- `founder-order-funding.mjs` prüft aktuell ausschließlich gehaltenes Escrow mit exakter Auftrags-, Betrags-, Währungs- und Empfängerbindung.
- `founder-production-github-funding.mjs` ist in den produktiven Startweg verdrahtet, aber ohne echten GitHub-Escrow-Datenlieferanten gesperrt.
- `founder-opportunity-store.mjs`, `founder-native-work.mjs` und `founder-order-lifecycle.mjs` verlangen ebenfalls Finanzierungsbelege vor Kundenarbeit.
- Dealwork besitzt einen eigenen nativen Escrow-/Vertragsadapter. Dieser darf nicht auf GitHub-Empfänger umgedeutet werden.
- Synmerco besitzt historische Liefer- und Zahlungsbelege sowie dokumentierte Zustimmung zu Bedingungen vom 16. Oktober 2026. Das sind keine aktuellen Freigaben für neue Aufträge.
- Bereits vorhandene Offline-Sandbox, unabhängige Produktprüfung, Lieferjournal und Budgetcontroller werden weiterverwendet.

## Entwurf: zwei explizite, unverwechselbare Zahlungsarten

### Plattform-Escrow

`paymentMode = platform-escrow`. Eine Freigabe erfordert weiterhin den aktuellen authentifizierten Beleg der tatsächlich zuständigen Plattform: konkreter gehaltener Betrag, Währung, Auftrag und eigener Empfänger. Geänderte oder widerrufene Bindung sperrt weitere Arbeit. Die bestehenden Frischeprüfungen bleiben erhalten. Kundenarbeit, Abnahme und Auszahlung bleiben getrennt; gehaltenes Escrow garantiert keinen erfolgreichen Abschluss eines Streits.

Fehlt der Plattformleser, bleibt ausschließlich dieser Weg blockiert. Es gibt keine automatische Umstellung auf Vorleistung.

### Begrenzte Vorleistung

`paymentMode = postpaid-limited`. Dieser Weg erzeugt ausdrücklich keinen Escrow- oder Zahlungsnachweis. Er benötigt eine dauerhaft versionierte lokale Vorleistungsregel und unabhängig belegte Auftragsbedingungen: eigener zulässiger Auftrag beziehungsweise ausdrücklich offener Bounty-Beitragsweg, Anbieter-/Auftraggeberidentität, präziser Umfang, Abnahmekriterien, Preis und Währung, Gebühren/Umrechnung, Zahlungsempfänger, Zahlungsweg und Zahlungsfrist beziehungsweise objektiver Auslöser samt Frist. Unbekannte materielle Gebühren oder widersprüchliche Bedingungen sperren die Annahme.

Vorgeschlagene zusätzliche Obergrenze: höchstens ein offener Vorleistungsauftrag und insgesamt höchstens CHF 2.50 angefallene oder reservierte interne Kosten für unbezahlte Vorleistung. Diese Grenze gilt zusätzlich zu unverändert CHF 150/30 Tage, CHF 20/Tag und CHF 2.50/Auftragsfamilie. Sie ist kein zusätzliches Budget. Bereits geleistete Vorleistung bleibt bis zur bestätigten Zahlung oder einer ausdrücklichen lokalen Verlust-/Abschlussentscheidung als Exposition erfasst; ein Timeout, ein Neustart oder eine neue Aufgaben-ID setzt sie nicht zurück. Eine solche Abschlussentscheidung ist nicht automatisch implementiert.

Zur Vermeidung einer Lücke bei kostenlosen Aufgaben bleibt auch ein Auftrag mit CHF 0 Kosten bis zur Zahlung oder ausdrücklichen Entscheidung als offener Auftrag gezählt. Korrekturen gehören zur selben Auftragsfamilie. Keine Kaution, Kundenzahlung, eigene Einzahlung, neue Wallet-Transaktion, bezahlte Registrierung oder zusätzlich eingegangene Haftungs-/Vertragsbedingung entsteht aus dieser Regel.

## Persistenz und Ausführung

Eine gemeinsame Zahlungsautorisierung bindet Zahlungsart, Auftrag, Empfänger, Quellrevision, Leistungsumfang, Regelversion und Nachweise. Escrow-Belege und Vorleistungsautorisierungen bleiben getrennte Typen. Ein früheres `funding.verified=true` wird nicht pauschal durch ein lockeres Boolean ersetzt.

Beide Wege verwenden dieselbe Folge: qualifizieren, zulässig bewerben/zuweisen, vorbereiten, arbeiten, unabhängig prüfen, einmalig einreichen, Abnahme abgleichen, Zahlung authentisch abgleichen. Jede relevante Grenze prüft OFF, aktuelle Auftragsrechte, Budget und die jeweilige Zahlungsautorisierung erneut. Bereits übermittelte Vorgänge mit unklarer Antwort werden gelesen und abgeglichen, nicht blind wiederholt.

Vorleistungsexposition wird dauerhaft und atomar vor der ersten Freigabe angelegt und mit der Auftragsfamilie sowie realen Budgetreservierungen abgeglichen. Parallele Controller, Neustarts oder unvollständige Kostenbelege dürfen die Grenze nicht umgehen. Die CHF 5 ungeklärter vorhandener Kostenreservierungen bleiben unverändert und werden nicht als freie Vorleistungskapazität behandelt.

Bestehende Daten ohne explizite neue Zahlungsart bleiben beim bisherigen strengen Verhalten. Historische Aufträge und alte Zahlungsbelege werden nicht in neue Vorleistungsfreigaben umgewandelt. Der produktive Vorleistungsmodus wird durch das Speichern dieses Entwurfs nicht aktiviert.

## Escrow-Konto und Kontoverknüpfungen

Ein echtes Konto wird in diesem Offline-Auftrag nicht angelegt. Vorher fehlen Anbieterwahl, Prüfung der Unterstützung für Patrice und seine Auftraggeber, Gebühren, erforderliche Identitätsdaten und ein konkreter Integrationsweg. Ein Konto darf nicht mit beliebigen Plattformkonten verbunden werden, die diesen Dienst nicht unterstützen.

Nach gesonderter Freigabe von Anbieterzugriffen kann die konkrete Einrichtung vorbereitet werden. Nichts wird als erfolgreich verbunden gemeldet, bevor ein echter authentifizierter Lesepfad und die Empfängerbindung bestätigt wurden. Keine Einzahlung oder Wallet-/Bankaktion ist durch die technische Anbindung impliziert.

## Isolierte Abnahme

Alle Prüfungen mit temporären Datenbanken, Fake-Auftraggebern, Fake-Escrows und Fake-Auszahlungsbelegen; keine produktiven Zugangsdaten oder Provider.

- Beide vollständigen Abläufe bis zu einer exakt zugeordneten bestätigten Fake-Zahlung.
- Escrow widerrufen, abgelaufen oder falscher Betrag/Empfänger/Auftrag: keine weitere Arbeit.
- Vorleistung ohne vollständige Bedingungen oder passende Regelversion: blockiert.
- Zweiter offener Auftrag, paralleler Anspruch und Überschreitung von CHF 2.50 Exposition: blockiert.
- Nullkostenauftrag zählt als offen; Reviewkorrekturen erzeugen keinen neuen Spielraum.
- Neustart, neue Task-ID, unklare Kosten und verspätete Providerantwort umgehen keine Grenze.
- Einreichung/Abnahme ohne Zahlung bleiben unbezahlt; kein doppelter Versand nach Antwortverlust.
- OFF verhindert Planung, Provideraufrufe und Ausführung; Demo-Trading-Grenzen bleiben unverändert.
- Produktive Budget-, Controller- und Powerdateien sowie CHF 5 Reservierungen werden vor/nach der isolierten Prüfung verglichen.

## Noch erforderliche Entscheidung

Patrice prüft den konkreten Entwurf, insbesondere die zusätzliche Vorleistungsgrenze. Nach Zustimmung folgt ein prüfbarer Implementierungsplan. Die separate Frage zu erlaubten Anbieterzugriffen für ein echtes Escrow-Konto bleibt offen; ohne Antwort gelten weiterhin keine Provider-Aufrufe.
