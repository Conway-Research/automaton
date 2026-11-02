# Offline-Projektarbeiter: Schnittstelle und Nachweisgrenze

Dieser Arbeiter ergänzt den fehlenden Entwurfs-/Implementierungs-/Korrekturzyklus. Er enthält kein Sprachmodell und ersetzt keine Modellgewichte. Der reale Modellnachweis bleibt aktuell `offline-model-required`. Produktions-Numaron bleibt OFF; keine automatische Registrierung, keine Provider-Konfiguration und keine Einreichung.

## Ablauf

1. `openProjectAuthor({directory,model,sandbox,verifier,maxRounds})` benötigt ein ausdrücklich benanntes isoliertes Zustandsverzeichnis. Es hat keine produktiven Standardpfade und liest keine Zugangsdaten.
2. `run(scope, acceptance, context)` beginnt ohne Implementierungsdateien. Der öffentliche/synthetische Scope enthält eine Projekt-ID, ein Formatprofil, eindeutige textuelle Anforderungen und verlangte Lieferdateien. Akzeptanzdateien kommen aus der vertrauenswürdigen Komposition und bleiben unverändert.
3. Die erste Modellanfrage enthält Anforderungen und Liefergegenstände, keine vorbereitete Implementierung. Das Modell muss einen Entwurf mit Komponenten, Pfaden und vollständiger Anforderungszuordnung liefern.
4. Weitere Anfragen verlangen vollständige Implementierungsdateien beziehungsweise Korrekturen. Neue Dateien sind innerhalb des gebundenen Entwurfs erlaubt; Akzeptanzpfade, ungeprüfte Pfade, Geheimnisse und übergroße Antworten werden abgewiesen. Maximal 32 erzeugte Dateien/256 KB, 40 Anforderungen und 8 Implementierungsrunden; die übergeordnete Profilgrenze bleibt 100 Dateien/500 KB.
5. Jede Version muss die unveränderte Abnahmesuite im echten isolierten Interpreter sowie den separat im Host verglichenen JSON-Ein-/Ausgabe-Prüfer bestehen. Das Programm liefert nur Bytes; es kann keine maßgeblichen Test-Zähler melden. Der derzeit mitgelieferte unabhängige JSON-Prüfer unterstützt Python-CLI-Projekte. Andere Sprachen benötigen einen entsprechend implementierten Prüfer, obwohl die allgemeine Autoren-Schemaerkennung auch Node unterstützt.
6. Fehler liefern höchstens 8 KB tatsächliche Rückmeldung für die nächste Korrektur. Fehlgeschlagene oder erschöpfte Versuche ergeben kein Lieferpaket. Nur der exakt geprüfte Dateistand kann als ZIP mit Scope, Entwurf, Manifest und Quellen-/Prüferbindung ausgegeben werden.

## Lokales Modell — noch nicht vorhanden

Die Modellimplementierung wird ausschließlich durch vertrauenswürdige lokale Komposition bereitgestellt. Es gibt keinen OpenAI-/Cloud-Fallback und keine Downloads. Für eine echte Bindung werden `origin: local-model`, `available`, eine geprüfte Binding-Struktur mit Modell-SHA256, gepinntem Container-Image, `network: none`, `hostMounts: false`, sowie `infer(request, context)` und eine unabhängige `verifyReceipt(response, request)`-Prüfung benötigt. Diese Implementierung samt Modelllaufzeit/Modellgewichten ist hier noch nicht installiert oder praktisch verifiziert. Ein beliebig gesetztes Flag oder eine Modellantwort allein ist kein entsprechender Nachweis.

Anfragen besitzen eine an Scope, Modell, Prüfer, Phase, Runde und Eingabe gebundene Identität. Modell und Prüfer werden vor dem ersten Dispatch gespeichert. Antworten müssen Request-ID und Eingabedigest exakt zurückgeben; lokale Modellantworten benötigen zusätzlich die unabhängige Laufzeitquittung. Nach Timeout, Abbruch oder unklarem Ergebnis wird nicht blind erneut inferiert. `reconcile(request, context)` kann das bereits erzeugte Ergebnis unabhängig wiederfinden; fehlt es, bleibt der Zustand `awaiting-model-reconciliation`.

Ein `origin: fixture`-Modell lässt sich nur in ausdrücklicher Testkomposition verwenden. Es führt stets zu `fixture-controller-only` und niemals zu einem Nachweis echter Modellautorschaft. Der Task-Adapter lässt solche Modelle überhaupt nicht zu.

## Prüferbindung und Wiederaufnahme

Scope, unveränderliche Akzeptanzdateien, Modellbindung und Prüfervertrag sind dauerhaft gebunden. Der Prüfervertrag umfasst Typ, Image, Einstiegspunkt, Oracle-Digest, Akzeptanzdigest und die ausdrückliche Verknüpfung beider Prüfwege. Austausch des Prüfers oder Modells beim Wiederöffnen wird vor weiteren Aufrufen abgewiesen. Sowohl die Abnahmesuite als auch der Host-Prüfer müssen bestehen; eine grüne Teilprüfung darf die andere nicht überstimmen.

Zustandsänderungen sind in SQLite versioniert, durch Inhaltsdigests geprüft und mit erwarteter Vorversion geschrieben. Ungewisse erste Modellanfragen sind bereits vor ihrem Versand an das ursprüngliche Modell gebunden. Ein geänderter Scope verlangt eine neue Projektidentität. Abbruch, Timeout, Erschöpfung und fehlende Laufzeit bleiben sichtbar.

## Einbindung in Numaron

`createProjectTaskAdapter` in `scripts/founder-project-task.mjs` entspricht der vorhandenen `execute/verify`-Adapterschnittstelle und kann später ausdrücklich in einer vertrauenswürdigen Runtime-Komposition registriert werden. Hier wurde keine Produktionskomposition verändert. Der Adapter akzeptiert nur einen exakt an die Task-ID gebundenen Auftrag mit `authority: offline-development`, eine Nullkosten-Reservierung und ein tatsächlich gebundenes lokales Modell. Fehlendes oder geskriptetes Modell bleibt `available: false` und darf keinen erfolgreichen Auftrag vortäuschen.

Der Adapter erstellt ein lokales Lieferpaket, keinen Plattform-Submit. Bestehende Kunden-, Vergabe-, Finanzierungs-, Budget- und Kommunikationsregeln bleiben für reale Aufträge vollständig erforderlich. Die alte Patch-Schnittstelle für Änderungen an vorhandenen Dateien wurde nicht umgangen, um neue Projekte vorzutäuschen.

## Verifikation

```powershell
node --import tsx --test scripts/founder-project-author.test.mjs scripts/founder-project-blackbox.test.mjs scripts/founder-project-task.test.mjs
node --import tsx scripts/founder-project-author-check.mjs outputs/project-author-20261024
```

Der zweite Aufruf ist ausdrücklich ein Steuerungs-/Integrationsnachweis mit geskriptetem Modell und echtem Offline-Container. Er erzeugt kein autonomes-Modell-Zertifikat. Das Artefakt heißt deshalb `controller-fixture.zip`. Tatsächliche Modellautorschaft darf erst nach einem gesonderten erfolgreichen Lauf mit realer lokaler Inferenz und nachvollziehbaren Quittungen behauptet werden.
