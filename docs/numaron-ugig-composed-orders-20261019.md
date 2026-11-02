# uGig: Vertragsleser, Finanzierung, Fachprüfung und Lieferung

Stand: 19. Oktober 2026. Implementiert und isoliert geprüft; kein Neustart des laufenden Dienstes, keine Kundenkontakte, keine echten Zahlungen. Die vorhandenen Aufträge erhalten dadurch noch keine Freigabe.

## Zusammengesetzter Ablauf

`scripts/founder-ugig-order-pipeline.mjs` verbindet den allgemeinen Vertragsleser mit den vorhandenen Rechnungs-, Escrow-, SOL-, Abnahme- und Lieferlesern. `founder-production-order-bindings.mjs` verwendet diese Kette für weitere uGig-Aufträge; der bisherige Content-Pilot behält seinen eigenen Vertragsweg.

1. Ein unabhängig geprüfter, exakt zu Auftrag, Kunde, Umfang und Revision passender Vertrag wird lokal gelesen und gegen die Plattformzuordnung geprüft.
2. Eine behauptete Finanzierung reicht nicht: Der bestehende Rechnungs- beziehungsweise Escrow-Leser prüft sie unabhängig. Bestehende begrenzte Zahlungsfreigaben bleiben ein eigener zulässiger Weg. Ein gehaltenes Escrow zählt nicht als erfolgter Zahlungseingang.
3. Die bestehenden Arbeitsprofile bereiten Daten-, Quellen-, Content- oder Code-Arbeit vor. Das Auftragsregister erlaubt jetzt auch die bereits vorhandenen Profile neben Content.
4. Ein zum konkreten Produkt und Vertrag gehörender Fachprüfnachweis muss vollständig und aktuell sein.
5. Textdateien werden als nummerierte Nachrichtenteile mit JSON-Dateimanifest geliefert und zurückgelesen. Vor jedem Versandteil wird die Fachprüfung erneut gelesen; ein Widerruf stoppt die weitere Übermittlung. Abnahme und Zahlung werden weiterhin getrennt geprüft und dem exakten Auftrag zugeordnet.

## Vertrag und Fachprüfnachweis

Der allgemeine Vertrag benötigt zusätzlich `workKind` und `deliveryRequirements`. Beide sind Teil des gebundenen Umfangs. Beispiel für die zusätzlichen Felder, **keine produktive Freigabe**:

```json
{
  "workKind": "data-cleaning",
  "deliveryProtocol": "numbered-messages-v1",
  "deliveryRequirements": {
    "format": "text-files-v1",
    "requiredFiles": ["delivery.csv"]
  }
}
```

Das vorhandene lokal geprüfte Nachweispaket benötigt nach der unabhängigen Produktprüfung ein `productReview` mit `reviewed: true`, `independentlyVerified: true`, nachvollziehbarer `reviewerId`, exaktem `agreementDigest`, `productDigest`, passendem `workKind`, zukünftigem `expiresAt` und `checks`. Jeder verlangte Prüfpunkt benötigt `passed: true` sowie nichtleere `evidenceRefs`. Die verbindlichen Namen stehen in `UGIG_WORK_CHECKS`. Diese Felder dürfen erst nach tatsächlich durchgeführter Prüfung gesetzt werden; Testfreigaben sind ausschließlich temporäre synthetische Daten.

| Aufgabenart | Fachlicher Prüfbereich |
| --- | --- |
| Dokumentbereinigung | Quellerhalt, Struktur, Änderungsbericht |
| Datenbereinigung | Referenzausgabe, Konflikte, Wiederholbarkeit, Zeilenabdeckung, Ressourcen |
| REST-API | API-Vertrag, Authentifizierung, negative Berechtigungstests, Persistenz, Eingaben |
| Recherchebericht | Quellenqualität, Bedeutung der Aussagen, Abdeckung, Nutzungsrechte |
| Kalendertexte | Terminidentität, unveränderte Zeiten und Teilnehmer, belegter Zweck |
| API-Automatisierung | API-Vertrag, Wiederholungen und Limits, Idempotenz, Teilfehler |
| Supportvorlagen | Richtlinien, Platzhalter, Eskalation, belegte Zusagen |
| Spam-Modell | Getrennte Evaluation, Precision/Recall, Fehlalarme, Datenleckage, Ressourcen |
| PDF-Extraktion | Referenzfelder, Seitenabdeckung, OCR-Fehler, Unsicherheit |
| Python-Diagramme | Aggregation, Achsen und Einheiten, Sichtprüfung, Ressourcen |
| Entscheidungsbrief | Quellentreue, Unsicherheit, Entscheidungsrelevanz, Länge |
| Python-GUI | Bedienung, Abbruch und Fehler, Reaktionsfähigkeit, Zielsystem |
| XLSX-Automatisierung | Referenzmappen, Formeln und Typen, ungültige Zeilen, Originalerhalt |

Die Anbindung erzwingt diese Prüfnachweise. Sie erzeugt **keine automatische unabhängige GUI-, OCR- oder Modellbewertung** und prüft nicht selbst den Inhalt beliebiger referenzierter Prüfberichte. Die lokale Ablage bleibt eine vertrauenswürdige, vom Betreiber verantwortete Nachweisquelle.

## Weiter bestehende Grenzen

- Der Lieferadapter unterstützt Textdateien, bis zu 100 Dateien und 100 Nachrichtenteile sowie maximal 128.000 Bytes für das serialisierte Lieferpaket. Binäre DOCX-, XLSX-, Bild-, Modell- und Installationsdateien benötigen einen weiteren Lieferadapter. Es wird kein vereinbarter Umfang stillschweigend verkleinert.
- Der bestehende Code-Arbeiter erstellt begrenzte Änderungen an bereitgestelltem Ausgangscode. Er ist noch kein allgemeiner Generator beliebiger vollständiger Anwendungen. Zertifizierte Laufzeiten und Abhängigkeiten müssen für echte Aufträge separat vorliegen.
- Content-Arbeit bleibt an die bereits unterstützten Content-Formate gebunden. Quellenberichte liefern strukturierte Berichtsdaten; eine Prüfung von Zitaten beweist keine inhaltliche Wahrheit. Die vorhandenen Größenlimits der Datenverarbeitung bleiben bestehen.
- Die Tests für alle 13 Aufgabenarten belegen die Auswahl und Durchsetzung der passenden Prüfpflichten mit synthetischen Produkten. Sie belegen nicht die erfolgreiche Ausführung aller 13 echten Kundenaufträge.
- Kundenzusagen, genaue Lieferanforderungen, Eingabedaten, Zugriffsrechte, Finanzierungsnachweise und die noch offenen CoinPay-Leseberechtigungen müssen weiterhin für den jeweiligen Auftrag vorliegen.

## Prüfung und Übergabe

Die temporären Integrationstests durchlaufen die reguläre Produktionszusammensetzung für Datenarbeit mit USD-Rechnung beziehungsweise SOL-Escrow, Code-Arbeit mit simulierter Sandbox und Quellenberichte. Negative Tests decken unter anderem OFF, fehlende oder abgelaufene Fachprüfung, falsches Produkt, falschen Vertrag, falsche Rechnungszuordnung, nicht finanzierte Aufträge, Binärdateien und Widerruf zwischen Versandteilen ab. Die bestehende Pilotsuite wird mitgeprüft.

Testergebnis und Quellfingerabdrücke: `outputs/ugig-composed-orders-20261019/evidence.json`; vollständiges Protokoll: `outputs/ugig-composed-orders-20261019/tests.tap`.

Die Änderungen sind noch nicht durch einen kontrollierten Neustart in den laufenden Dienst geladen. Numaron bleibt ausgeschaltet; eine spätere Wartung muss die bestehende Startkontrolle beachten.

## Kontrollierte Einbindung in den Dienst

Am 2026-10-19T20:45:20.290Z wurde die neue Zusammensetzung durch den vorhandenen OFF-geschützten Wartungsstarter geladen. Der neue Dienstprozess bestätigt Vertragsleser, unabhängige Rechnungs-/Escrow-Finanzierungsprüfung, produktgebundene Fachprüfnachweise und nummerierte Textdatei-Lieferung. 67 frische isolierte Integrations-, Vertrags-, Pipeline- und Wartungstests bestanden; die relevanten Quelldateien stimmen mit dem vorherigen Stand der 366 bestandenen Tests überein.

Numaron blieb OFF, Revision 79; Controller gestoppt, keine aktiven Arbeiter. Aufträge, Budget, Lieferjournal, Zahlungsansprüche und uGig-Monitorzeitpunkt blieben unverändert. Anbieterstatus weiterhin powered-off. Keine Kundenkontakte oder echten Zahlungen. Die zuvor beschriebene ausstehende Dienstladung ist damit erledigt; die fachlichen und externen Voraussetzungen bleiben bestehen, liveReady bleibt false.

Nachweise: `artifacts/ugig-composed-activation-20261019/before.json`, `artifacts/ugig-composed-activation-20261019/after.json` und `artifacts/ugig-composed-activation-20261019/tests.tap`.
