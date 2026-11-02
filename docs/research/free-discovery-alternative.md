# Kostenlose Discovery nach dem 20. Oktober 2026

Stand: 17. Oktober 2026. Umsetzung ausschließlich im isolierten Arbeitsstand; produktiver Dienst und Powerzustand bleiben unberührt.

## Auswahl und geprüfte Quellen

Als kostenloser Ersatz sind die öffentlichen Metadaten-APIs von Crossref und DataCite angebunden. Beide funktionieren ohne Anmeldung oder API-Schlüssel. Es werden keine persönlichen E-Mail-Adressen übertragen, keine Konten eröffnet und keine kostenpflichtigen Zugänge als Ersatz verwendet.

| Dienst | Nutzen | Entscheidende Grenze | Offizielle Grundlage |
| --- | --- | --- | --- |
| Crossref Public REST API | Fachliteratur und bibliografische Hinweise zu den registrierten Forschungsthemen finden. | Bibliografische Metadaten sind frei nutzbar; Abstracts können urheberrechtlich geschützt sein und werden deshalb nicht übernommen. | [Zugang ohne Anmeldung](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/), [Metadaten und Lizenzumfang](https://www.crossref.org/documentation/retrieve-metadata/) |
| DataCite Public REST API | Forschungsdaten und andere Forschungsobjekte sowie deren öffentliche Beschreibungen finden. | Die CC0-Freigabe der Katalogmetadaten erteilt keine Nutzungsrechte an einem verlinkten Datensatz oder Volltext. | [Öffentliche API ohne Authentifizierung](https://support.datacite.org/docs/rest-api), [CC0-Metadaten](https://datacite.org/blog/announcing-datacites-first-public-data-file/), [API-Limits](https://support.datacite.org/docs/rate-limit) |

Diese beiden Kataloge decken Fachliteratur und Datensätze ab. Ergänzend ist jetzt eine deaktivierte allgemeine Websuche über lokales SearXNG vorbereitet; Details stehen in `docs/research/general-web-search.md`. Aktuelle Unternehmensseiten, lokale Angebote oder beliebige Internetinhalte sind damit nicht gleichermaßen abgedeckt. Die Quellenzulassung und alle übrigen Fach- und Anbietergrenzen bleiben bestehen.

## Verhalten des vorbereiteten Stands

- Ohne zusätzliche Webfreigabe bleibt bis zum bisherigen Ablaufzeitpunkt der alte Discovery-Pfad unverändert. Bei später ausdrücklich aktivierter allgemeiner Websuche wechseln die vorhandenen Sechsstundenfenster zwischen Websuche und diesem Pfad; die gemeinsame Quote bleibt unverändert.
- Ab dem 20. Oktober 2026 um 02:00 Uhr Schweizer Zeit verwendet der Discovery-Pfad die beiden Kataloge. Die alte Exa-Freigabe wird dadurch nicht verlängert.
- Kataloge wechseln anhand des vorhandenen Zeitfensters und der Versuchsnummer. Ein fehlgeschlagener Versuch löst keinen zusätzlichen sofortigen Anbieteraufruf aus. Ein später zulässiger Wiederholungsversuch kann den anderen Katalog verwenden.
- Alte und neue Discovery teilen das vorhandene persistierte Abruffenster, Backoff und den Deckel von höchstens drei Suchversuchen pro sechs Stunden. Ein erfolgreicher Versuch wartet weiterhin bis zum nächsten Fenster. Quoten werden weder beim Stichtag noch beim Neustart zurückgesetzt.
- Es bleiben höchstens zwei Suchtreffer pro Aufruf, begrenzte Antworten, registrierte öffentliche Suchthemen, ein vorhandener Controller-Grant und die bestehenden OFF-, Budget- und Kapazitätssperren verbindlich. Private Aufgabentexte werden nicht in Suchanfragen übernommen.
- Ein Katalogtreffer bleibt zunächst ungeprüft. Ein später abgerufener Metadatensatz muss zum angefragten DOI und zum exakten offiziellen API-Ursprung passen.
- Verwendete Katalogeinträge werden ausdrücklich als Metadaten gekennzeichnet. Verlinkte Inhalte erhalten keine automatische Rechtefreigabe. Katalogmetadaten bestehen die Cash-OHLC-Prüfung nicht und werden nicht als handelbare Kursdaten aufgenommen.
- Die allgemeine Lernplanung hängt jetzt an der bestehenden Fähigkeit `adaptive-learning`. Ein gesperrter alter `exa-research`-Adapter blockiert dadurch die neue Lernwarteschlange nicht mehr. Andere Exa-Aufgaben bleiben bei abgelaufener Freigabe gesperrt.

## Isolierte Abnahme

Die sechs neuen Tests prüfen den Zeitpunkt nach dem Ablauf, gemeinsame Quoten über Ablauf und Wiederöffnung hinweg, Grant-/OFF-Prüfungen, HTTP-429-Wartezeiten, begrenzte Anbieterwechsel, fehlerhafte Antworten, DOI-Herkunft und die Trennung von Metadaten- und Inhaltsrechten. Ein temporärer Laufzeittest mit gefälschten Adaptern simuliert den 21. Oktober und ein weiteres Abruffenster: Der alte Exa-Adapter bleibt gesperrt, die Lernwarteschlange arbeitet weiter und speichert verwendbare Katalogmetadaten. Die bestehenden Budgetbeträge und vier Worker bleiben erhalten.

Alle Anbieterantworten in diesen Tests sind Fakes. Externe TCP-/DNS-Aufrufe sind im Node-Testprozess gesperrt. Die aktuellen Zugangsaussagen wurden anhand der oben verlinkten offiziellen Dokumentation geprüft; damit wird kein erfolgreicher Livebetrieb der APIs behauptet.

Nach der ergänzenden allgemeinen Websuche umfasst die betroffene Testsammlung 139 bestandene Node-Tests und 101 bestandene Vitest-Tests, insgesamt 240. Die reguläre TypeScript-Prüfung besteht. Die zusätzliche Typprüfung sämtlicher älterer Testdateien war bereits in der vorausgegangenen Abnahme wegen fünf unabhängiger Langzeitforschungsfehler offen; diese Dateien werden hier nicht verändert.

Die zusätzliche Codeprüfung des neuen Pfads hat keine umsetzungsrelevanten Befunde ergeben. Der prüfende Agent hat keine Produktivdaten geöffnet, Anbieter aufgerufen oder Dateien geändert.

## Übernahme bleibt ausstehend

Die Umschaltung gehört zum vorbereiteten Quellstand. Damit sie im tatsächlichen Betrieb nach dem Stichtag verfügbar ist, muss dieser Stand vorab in einem ausdrücklich zulässigen Wartungsfenster übernommen werden. Eine laufende ON-Sitzung darf dafür nicht unterbrochen werden. Bei ON oder unlesbarem Zustand bleibt die Übernahme ausstehend; die Wartungssperre darf nicht umgangen werden.

Die Lernerweiterung bleibt in der Aktivierungsvorlage deaktiviert. Dieser Auftrag hat weder eine Aktivierung noch einen Neustart, eine Budgetänderung oder eine ON-/OFF-Aktion ausgelöst. Eine kostenfreie öffentliche API garantiert zudem keine ständige Verfügbarkeit; bei Sperren oder geänderten Bedingungen wird gewartet, ohne auf kostenpflichtige Angebote auszuweichen.
