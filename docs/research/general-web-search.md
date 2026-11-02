# Allgemeine Websuche – vorbereitet, nicht aktiviert

Numaron erhält ergänzend zur Fachliteratur- und Datensatzsuche eine allgemeine Suche über einen eigenen lokalen SearXNG-Dienst. Damit können auch Unternehmensseiten, Angebote, Praxisartikel und Communitybeiträge als Rechercheziele gefunden werden. SearXNG ist freie Metasuchsoftware; seine [JSON-Suchschnittstelle](https://docs.searxng.org/dev/search_api.html) liefert die Links. Es wurde kein Suchkonto eingerichtet und kein kostenpflichtiger API-Zugang ergänzt.

Kostenlos bezieht sich auf Software und Such-API. Der Betrieb benötigt vorhandene Rechnerressourcen und Strom. Ein neues Cloud-Abonnement oder zusätzliche Infrastrukturkosten sind nicht freigegeben. Auf Windows kann eine Container-VM zusätzlichen Ressourcenbedarf verursachen; die vorbereiteten Containergrenzen begrenzen nicht die ganze VM. Eine vorhandene Podman-Programmdatei beweist keinen betriebsbereiten Containerdienst.

## Auswahl und Grenzen

Der Adapter verwendet ausschließlich `http://127.0.0.1:18888/search`, registrierte öffentliche Curriculum-Suchbegriffe, JSON, Kategorie `general`, Seite 1 und eine Suchmaschine (`duckduckgo`). Private Aufgabentexte und Zugangsdaten werden nicht übertragen. Es gibt keinen Wechsel zu fremden öffentlichen Instanzen, keinen kostenpflichtigen Ersatz und keine Umgehung von CAPTCHA oder Anbietersperren. Verfügbarkeit und dauerhaft kostenlose Zugänglichkeit eines vorgelagerten Suchdienstes sind nicht garantiert.

Allgemeine Suche und bisherige Discovery teilen exakt dieselbe persistierte Quote und Wartezeit: höchstens drei Versuche je sechs Stunden, nach Erfolg Warten bis zum nächsten Fenster. Bei ausdrücklich freigegebener allgemeiner Suche verwenden gerade UTC-Sechsstundenfenster SearXNG; ungerade Fenster verwenden vor dem Exa-Ablauf den bisherigen Pfad und danach Crossref/DataCite. Ohne Freigabe bleibt der bisher vorbereitete Katalogpfad erhalten. Es entstehen keine zusätzlichen Abruffenster. Ein Ausfall führt zu Wartezeit, nicht zu sofortigem Ausweichen.

Es bleiben höchstens zwei Treffer je Aufruf. Links und begrenzte Titel sind ausdrücklich ungeprüfte Rechercheverweise. Suchausschnitte und ungeklärte Seiteninhalte werden nicht als Wissen übernommen. Bestehende Zulassungsprüfungen gelten weiter; zugelassenes Originalmaterial erhält Vorrang vor einem bloßen Verweis. Ein Treffer belegt weder Nachfrage noch Zahlung, fachliche Kompetenz oder eine erfolgreiche Handelsstrategie.

## Vorbereitete Dateien

- `scripts/founder-general-web.mjs`: begrenzter Suchadapter; Anbindung an bestehende Discovery und Lernwarteschlange.
- `infra/general-web/compose.yaml`: offizielles Image mit festem SHA256-Digest, nur Loopback-Port, explizites Profil `prepared-general-web`, kein automatischer Neustart; maximal 0,5 CPU, 512 MiB RAM und 96 Prozesse.
- `infra/general-web/settings.yml`: eine Suchmaschine, eine ausgehende Verbindung, JSON und begrenzte Timeouts. Vorhandene Sperrzeiten bleiben wirksam.
- `infra/general-web/.env.example`: leerer Platzhalter für ein später lokal erzeugtes Geheimnis; kein echtes Geheimnis im Paket.
- `docs/research/general-web-activation-template.json`: `enabled: false`, `activationApproved: false`. Die Vorlage liegt nicht im produktiven Laufzeitverzeichnis.

Die [offizielle Container-Anleitung](https://docs.searxng.org/admin/installation-docker.html) ist Grundlage der Vorbereitung. Der Image-Digest wurde am 17. Oktober 2026 anhand öffentlicher Registry-Metadaten festgelegt. Es wurden keine Image-Schichten heruntergeladen und kein Container, keine VM und kein echter Suchdienst gestartet. Die tatsächlich laufende Kombination aus Image, Konfiguration und vorgeschaltetem Suchdienst bleibt bei einer später erlaubten Inbetriebnahme zu prüfen.

## Spätere manuelle Einführung

Diese Schritte wurden nicht ausgeführt. Änderungen zunächst mit dem zwischenzeitlichen Hauptstand zusammenführen. Eine laufende ON-Sitzung darf dafür weder gestoppt noch neu gestartet werden; bei ON oder unlesbarem Zustand bleibt die Übernahme ausstehend. Die vorhandene Wartungssperre gilt unverändert.

In einem später ausdrücklich zulässigen Wartungsfenster einen funktionsfähigen lokalen Containerdienst prüfen, Ressourcenbedarf einschließlich VM bewerten, im Infrastrukturordner eine lokale `.env` anhand der Vorlage anlegen und dort ein neues zufälliges Geheimnis mit 64 Hex-Zeichen hinterlegen. Geheimnisse nicht in Chat, Patch oder Versionsverwaltung übernehmen. Erst dann wäre aus diesem Ordner beispielsweise `podman compose --profile prepared-general-web up -d` auszuführen, alternativ die entsprechende Docker-Compose-Variante. Kein solcher Befehl ist Bestandteil des Numaron-Starts.

Vor Aktivierung die private Bindung und JSON-Antworten mit dem vorbereiteten Image prüfen. Die Freigabe wird erst später in `artifacts/founder-web-search-config.json` mit beiden booleschen Freigaben gesetzt und beim nächsten erlaubten Laufzeitstart gelesen. Sie verändert den Powerzustand nicht. Lernaktivierung und alle anderen Anbieterfreigaben bleiben unabhängig erforderlich. Numaron darf weiterhin nur Patrice persönlich über „Numaron einschalten“ starten. Auch eine spätere Rücknahme erfolgt im zulässigen Wartungsfenster ohne Unterbrechung einer ON-Sitzung.

## Isolierte Abnahme

13 neue Tests prüfen Konfiguration, feste öffentliche Suchanfragen, sichere Linkauswahl, fehlende Rechte, Vorrang zugelassener Originale, gemeinsame Discovery-Quoten, OFF- und Budgetgrenzen sowie HTML/CAPTCHA, ungültiges JSON, Redirects und HTTP 429. Ein echter lokaler HTTP-Testserver mit ausschließlich künstlichen Antworten prüft die Verbindung bis zur Lernwarteschlange. Er ist kein SearXNG-Livetest. Die YAML-Dateien werden ebenfalls auf Profil, Ressourcen, Loopback-Bindung und feste Image-Version geprüft.

Die betroffene Regression umfasst 139 bestandene Node-Tests und 101 bestandene Vitest-Tests in 23 Dateien, insgesamt 240. Die reguläre TypeScript-Prüfung besteht. Die Node-Tests sperren externe TCP-/DNS-Verbindungen; temporäre Datenbanken und Fake-Adapter ersetzen den Produktionsbetrieb. Fünf bereits dokumentierte Fehler der zusätzlichen Typprüfung älterer Testdateien bleiben außerhalb dieses Auftrags unverändert.

Weder Produktivbetrieb noch Powerzustand, Budgets, Handelsfreigaben oder Risikolimits wurden verändert. Die allgemeine Suche ist implementiert und paketiert, aber noch nicht im Produktivbetrieb verfügbar.
