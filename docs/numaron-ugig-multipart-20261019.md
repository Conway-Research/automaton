# uGig: vollständige Lieferung und eindeutige Auftragszuordnung

Stand: 19. Oktober 2026. Implementiert, isoliert geprüft und anschließend kontrolliert in den laufenden Dienst geladen. Keine Kundennachricht und kein Plattformabruf. Numaron bleibt OFF, Revision 79.

## Vollständiges Content-Paket

Ein geprüfter Vertrag kann jetzt `deliveryProtocol: "numbered-messages-v1"` enthalten. Der Adapter zerlegt das vollständige, bereits geprüfte Produkt deterministisch in nummerierte Nachrichten. Jede enthält Lieferkennung, Produktkennung, Teilnummer/Gesamtzahl und Inhaltskennung. Die Nachrichten bleiben unter der bestehenden 2.000-Zeichen-Grenze. Unicode-Zeichen werden nicht zerschnitten, Inhalte nicht gekürzt oder normalisiert. Die Nutztexte aller Teile ergeben zusammen exakt die ursprüngliche Folge aus Dateipfaden und Dateiinhalten.

Grenzen: höchstens 100 Teile, 100 Dateien und 128.000 UTF-8-Bytes Nutzinhalt auf Transportebene. Die bestehenden engeren Grenzen des Content-Profils bleiben bestehen, insbesondere dessen Paketprüfung. Ohne ausdrücklich vereinbartes Protokoll bleibt der bisherige Einzelnachrichtenweg bestehen; zu große Pakete werden dort weiterhin abgewiesen.

Das vollständige Paket mit fünf Social Posts, einer E-Mail und drei Zusammenfassungen wurde über die normale Produktionsverdrahtung mit synthetischen Daten erstellt, unabhängig durch einen Fake-Prüfer geprüft und nach einer simulierten Unterbrechung geliefert. Tests rekonstruieren den gesamten Inhalt und vergleichen ihn exakt mit dem geprüften Produkt. Das ist ein Funktionsnachweis, keine Aussage über die fachliche Qualität echter Kundentexte.

## Unterbrechungen und Wiederanlauf

Vor jedem Versandversuch wird ein unveränderlicher, auf Datenträger synchronisierter Eintrag angelegt. Produktionspfad nach späterem Start:

`artifacts/founder-autonomy-20261013/ugig-delivery-journal/`

Die bloße Zusammensetzung der Anwendung legt dort nichts an. Ein Manifest bindet Lieferabsicht, Auftrag, Revision, Umfang, Vertrag, Gespräch und Produkt; jeder Teil hat eine eigene atomar erzeugte Versandmarkierung. Widersprüchliche Wiederverwendung einer Lieferkennung wird abgewiesen.

Nach einer Unterbrechung werden die tatsächlichen Nachrichten vollständig gelesen. Eindeutig vorhandene eigene Teile werden nicht erneut gesendet. Nur noch nie versuchte Teile dürfen ergänzt werden, und nur bei erneut bestätigter Vereinbarung sowie aktueller Versandberechtigung. Die Produktionsverdrahtung kontrolliert zusätzlich die aktuelle Submit-Fähigkeit und die bestandene Prüfung genau dieses Produkts.

Ein bereits versuchter, aber nicht auffindbarer Teil bleibt **unklar**. Der Adapter sendet ihn nicht automatisch erneut: Ohne plattformseitig belegte Idempotenz kann ein verzögerter Versand sonst zu Dubletten führen. Eine solche Situation benötigt gesonderte Klärung. Doppelte Teile oder veränderte Nachrichtenkennungen verhindern die Abschlussbestätigung. „Geliefert“ gilt erst nach vollständiger eindeutiger Rücklese und dauerhaftem Beleg für alle Teile.

## Sammelgespräche ohne Gig-Zuordnung

Ein bestehendes privates Zweiergespräch mit `gig_id: null` kann jetzt verwendet werden, wenn der geprüfte Vertrag Folgendes enthält:

```json
{
  "conversationBinding": {
    "mode": "reviewed-buyer-message",
    "messageId": "KENNUNG_DER_GEPRUEFTEN_KUNDENNACHRICHT"
  },
  "deliveryProtocol": "numbered-messages-v1"
}
```

Die referenzierte Nachricht muss bereits in `agreementEvidence` stehen, authentifiziert dem richtigen Kunden zugeordnet sein und sowohl die exakte Gig-Kennung als auch die exakte Bewerbungskennung im Text enthalten. Ihre ausdrückliche Zustimmung zur Auftrags-/Lieferzuordnung muss bei der Vertragsprüfung festgestellt werden; das Auftreten zweier Kennungen ersetzt diese inhaltliche Prüfung nicht.

Eigene Nachrichten, ein anderer Kunde, zusätzliche Gesprächsteilnehmer, ein Broadcast oder ein Gespräch mit einer anderen Gig-Kennung genügen nicht. Eine neue ungeprüfte Kundennachricht blockiert weiterhin. Normale direkt zur Gig gehörende Gespräche bleiben nutzbar.

Die neuen Felder sind Bestandteil der Umfangs- und Vertragskennungen. Änderungen erfordern erneut geprüfte Vereinbarung und dazu passende Freigabe. Es wurden keine echten Verträge oder Grants erzeugt.

## Für die spätere Kundenklärung vorbereitet

Die bestätigte Vereinbarung muss festhalten, dass das vollständige Paket als nummerierte Nachrichten im bezeichneten Gespräch geliefert werden darf. Für ein Sammelgespräch sollte die geprüfte Kundenbestätigung inhaltlich lauten: „Ich beauftrage Obolus/Numaron für Gig [exakte Gig-ID], Bewerbung [exakte Bewerbungs-ID], gemäß dem vereinbarten Umfang. Das vollständige Paket darf in diesem Gespräch als nummerierte Nachrichten geliefert werden.“ Dies ist nur ein Muster für die spätere Prüfung, keine versandte Nachricht und keine erzeugte Zustimmung.

Preis, Finanzierung, Nutzungsrechte, KI-Zustimmung, Frist und Abnahmekriterien bleiben eigenständige Voraussetzungen. Die Zahlungsschnittstelle wurde durch diese Änderung nicht erweitert; insbesondere wird Escrow/SOL dadurch nicht automatisch verifiziert. Andere Auftragsprofile sind ebenfalls nicht automatisch freigegeben.

## Prüfnachweise

Neue Tests: `scripts/founder-ugig-multipart.test.mjs`; erweiterte reguläre Ablaufprüfung: `scripts/founder-ugig-production.integration.test.mjs`. Breites Regressionsprotokoll: `artifacts/ugig-multipart-tests.tap`.

Alle Versand-, Kunden- und Zahlungsantworten sind simuliert. Journale und Datenbanken der Tests liegen in temporären Verzeichnissen. Produktionsschlüssel werden nicht verwendet.

## Kontrolliertes Laden bestätigt

Am 19. Oktober 2026 um 21:00 Uhr Europe/Zurich über den OFF-geschützten Wartungsstarter geladen. Neuer Dienstprozess 3272 mit passendem Gesundheitsnachweis. 58 aktuelle isolierte Wartungs-, Zuordnungs- und Lieferungstests bestanden. Dateiprüfsummen vor/nach Neustart unverändert; relevante Dateien lagen vor dem Startzeitpunkt. Authentifizierter Dienststatus: Arbeit, Lieferung, Abnahme und Zahlung konfiguriert; Controller gestoppt, null Worker, kein Schedulerfehler. Auftragsinhalte, 3.470 Budgeteinträge und Limits, leeres Versandjournal sowie letzter uGig-Monitorabruf unverändert. Kein echter Versandtest; `liveReady: false` bleibt ohne echte Vertrags-/Finanzierungsnachweise korrekt. Nachweis: `artifacts/ugig-multipart-activation-20261019/after.json`.
