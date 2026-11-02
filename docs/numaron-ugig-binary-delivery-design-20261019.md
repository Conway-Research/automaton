# Entwurf: Binäre uGig-Lieferungen

Status: Zur Prüfung durch Patrice. Noch keine Implementierung oder produktive Freigabe. Numaron bleibt OFF; keine Kundenkontakte, Uploads oder Zahlungen. Dieser Entwurf ersetzt keine Kundenzusage und erlaubt keine öffentliche Veröffentlichung von Kundendaten.

## Ziel und vorhandene Lücken

Excel-, Word-, Bild- und Modelldateien sollen als echte Dateien aus einem isolierten Arbeitslauf bis zur nachgewiesenen Lieferung verarbeitet werden. Der bestehende Textlieferweg bleibt erhalten. Die neue Kette muss dieselben Vertrags-, Finanzierungs-, Produktprüfungs- und OFF-Grenzen einhalten.

Der bisherige Produktpfad nimmt Textfelder entgegen. Dateiprofile, Produktspeicherung, Sandbox-Ergebnis und Lieferadapter unterstützen noch keinen durchgehenden binären Export. Nur weitere Dateiendungen zuzulassen würde weder die Bytes erfassen noch deren erfolgreiche Lieferung belegen.

## Geprüfter Plattformweg

Öffentlicher uGig-Quellcode, gelesen am 19.10.2026; kein Nachweis der tatsächlich ausgerollten Version oder unserer Kontoberechtigungen:

- Upload: `POST /api/attachments/upload`, multipart mit `file` und `conversationId`; Teilnehmerprüfung; maximal 10 MiB je Datei. Antwort enthält URL, Dateiname, Größe und MIME-Typ.
- Nachrichten können bis zu fünf Anhänge enthalten. Die Metadaten werden mit einer Nachricht in der bestehenden Unterhaltung gespeichert.
- Der Upload liefert eine öffentliche Speicher-URL. Eine Migration stellt den Anhänge-Speicher auf öffentlich. Eine private Unterhaltung macht den Download damit nicht privat.
- XLSX, DOCX, JPEG, PNG, GIF, WebP und ZIP stehen in der Upload-MIME-Liste. Ein eigenständiger Modell-MIME-Typ ist dort nicht enthalten.

Quellen:

- https://raw.githubusercontent.com/profullstack/ugig.net/master/src/app/api/attachments/upload/route.ts
- https://raw.githubusercontent.com/profullstack/ugig.net/master/src/lib/validations.ts
- https://raw.githubusercontent.com/profullstack/ugig.net/master/src/app/api/conversations/%5Bid%5D/messages/route.ts
- https://raw.githubusercontent.com/profullstack/ugig.net/master/supabase/migrations/20260320101900_make_attachments_bucket_public.sql

## Vorgeschlagene Ausgestaltung

### 1. Binäre Artefakte und Auftragsbindung

Dateibytes werden in einem eigenen lokalen, inhaltsadressierten Artefaktspeicher gespeichert. Produkt-JSON enthält ausschließlich relative Artefaktkennung, Liefername, MIME-Typ, Bytezahl und SHA-256 der tatsächlichen Bytes. Kein Base64 im Modellprompt oder in der bisherigen Textdateiliste. Die Produktidentität umfasst Textdateien und das Binärmanifest; bestehende Textidentitäten bleiben unverändert.

Artefaktzugriff erfolgt ausschließlich innerhalb des vorgesehenen Speichers, ohne Symlinks, freie Hostpfade oder URL-Importe. Bytezahl und Hash werden beim Import, vor Prüfung und unmittelbar vor dem Upload erneut kontrolliert. Artefakte sind unveränderlich; Änderungen erzeugen ein neues Produkt und benötigen neue Prüfung.

### 2. Export aus isolierter Arbeit

Nur vertraglich benannte Ausgabedateien dürfen aus einem begrenzten Ausgabeverzeichnis der zertifizierten Offline-Laufzeit übernommen werden. Größen-, Mengen- und Pfadgrenzen gelten schon beim Export. Kein Durchreichen beliebiger Sandbox- oder Hostdateien. Ein lokal importiertes, unabhängig geprüftes Artefakt kann denselben Lieferpfad verwenden; der Import muss Herkunft und exakten Auftrag belegen und zählt nicht als automatisch erzeugte Arbeit.

Neue Dateiformate dürfen erst als ausführbar gelten, wenn der Erzeuger und sein Export tatsächlich angebunden sind. Fehlende Bibliotheken oder nicht unterstützte Modellexporte führen zu einem konkreten Blocker. Die Erweiterung verspricht keinen beliebigen vollständigen Modelltrainer oder Dokumentgenerator.

### 3. Format- und Fachprüfung

- XLSX: Dateistruktur, Referenzmappen, Tabellen, Werte, Formeln und Typen nach dem bestehenden Aufgabenvertrag.
- DOCX: Dateistruktur, Text-/Abschnittserhalt und vereinbarte Dokumentstruktur; Layoutqualität benötigt eine zusätzliche Sichtprüfung.
- Bilder: tatsächliche Dekodierbarkeit, vereinbarte Abmessungen und Format; fachliche Bild-/Diagrammprüfung bleibt getrennt.
- Modelle: zunächst ausdrücklich vereinbarte nicht ausführbare Austauschformate, etwa ONNX oder Safetensors, in einem ZIP mit Manifest, Modellbeschreibung und Evaluationsbelegen. Kein automatisches Laden von Pickle-/Joblib-Dateien. Ein gültiger Container beweist keine Modellgüte.

Dateiendung und MIME-Typ allein reichen nicht. Parser laufen ohne Netzwerk in der isolierten Laufzeit mit festen Ressourcenlimits. Office-/ZIP-Container benötigen Schutz gegen Pfadtraversal, mehrfach belegte Namen und übermäßige Entpackgrößen. Fachprüfnachweise werden an den Hash des vollständigen Produkts einschließlich Binärdateien gebunden.

### 4. Speicherfreigabe

Der native uGig-Upload wird nur zulässig, wenn ein überprüfter Kundenvertrag ausdrücklich öffentlich erreichbare Anhänge für genau diese Lieferdateien erlaubt. Die allgemeine Erlaubnis zur Datenverarbeitung oder zur Zustellung in einer Unterhaltung genügt nicht. Diese Freigabe ist Teil des Vertragsumfangs und kann widerrufen werden.

Für vertrauliche Lieferungen bleibt der Upload gesperrt, bis ein geeigneter privater, vom Kunden akzeptierter Transport eingerichtet und überprüft ist. Diese Umsetzung richtet keinen neuen Cloudspeicher ein und erstellt keine Konten. Ein pauschaler Anbieterhinweis oder eine zufällige Download-URL ersetzt keinen bestätigten Zugriffsschutz.

### 5. Upload, Versand und Rücklesen

Feste Plattformroute, vorhandene berechtigte uGig-Authentifizierung, keine Weiterleitungen. Der Rücklese-Download darf nur vom unabhängig konfigurierten offiziellen Speicherursprung erfolgen, ohne uGig-Schlüssel an diesen Speicher zu senden. Eigentümer-/Unterhaltungspfad, Dateiname, MIME-Typ, Größe und Hash werden kontrolliert. Keine beliebigen URLs aus Modell- oder Nachrichteninhalt abrufen.

Uploads und Nachrichten sind getrennte Schritte mit dauerhaftem Versuchs- und Ergebnisjournal. Ein unklarer Uploadausgang wird nicht blind wiederholt. Höchstens fünf Anhänge pro Nachricht; große Pakete bekommen geordnete Teilnachrichten mit gemeinsamem Manifest. Dateien über der Plattformgrenze werden abgelehnt, nicht heimlich abgeschnitten oder umbenannt.

Vor jedem Upload und jeder Nachricht: OFF-/Abbruchprüfung, frischer Vertrag, Finanzierung, zulässige Speicherart und aktuelle Fachprüfung. Danach: exakt eine eigene Nachricht in der richtigen Unterhaltung und erneuter Download mit identischen Bytes. Ein HTTP-Erfolg oder eine gespeicherte URL allein gilt nicht als Lieferung. Abnahme und Zahlung bleiben unabhängig von der Lieferung.

## Isolierte Abnahmefälle

1. Echte kleine XLSX-, DOCX-, PNG-/JPEG- und Modell-ZIP-Testdateien erzeugen, parsen, speichern, per Fake-Upload übertragen und byteidentisch zurücklesen.
2. Den vollständigen Produktions-Auftragsweg mit temporären Datenbanken bis zur simulierten Abnahme und Zahlung durchlaufen; bestehende Text- und Pilotregressionen behalten.
3. Manipulierte oder fehlende Bytes, falscher Hash/Typ/Größe, Traversal, Symlink, übergroße und schädliche Archive ablehnen.
4. Fremder Auftrag, anderer Kunde, falsche Unterhaltung, unzulässiger Speicherursprung, Weiterleitung und veränderter Download blockieren.
5. Fehlende öffentliche Speicherfreigabe blockiert bereits den Upload. Privater Auftrag bleibt ohne privaten Adapter gesperrt.
6. OFF vor Beginn und während jedes asynchronen Schritts verhindert weitere Zugriffe; nur temporäre ON-Testzustände und Fake-Transporte.
7. Fehlende/abgelaufene Fachprüfung, Vertragsänderung und Widerruf zwischen Dateien stoppen die Fortsetzung.
8. Timeout nach Upload/Nachrichtenannahme, doppelte Nachrichten und unklare Journalzustände lösen keinen automatischen Doppelversand aus.
9. Ausschließlich synthetische Daten, keine echten API-Schlüssel, keine realen Kundenkontakte oder Zahlungsaufrufe.

## Entscheidung und Übergabe

Empfehlung: nativen uGig-Anhangsweg mit zwingender auftragsbezogener Freigabe der öffentlichen Speicherart implementieren; vertrauliche Lieferungen bis zu einem gesondert bestätigten privaten Transport gesperrt lassen. Modelle nur im ausdrücklich vereinbarten, geprüften Paketformat.

Alternative: zuerst einen privaten Speicheranbieter anbinden. Das benötigt einen konkreten Anbieter, Zugriffskonzept, Kundenakzeptanz und gegebenenfalls persönliche Einrichtung; dafür fehlen derzeit die Angaben und Freigaben.

Nach Entwurfsfreigabe folgt der konkrete Implementierungsplan mit betroffenen Schnittstellen und Tests. Keine Dienstladung in diesem Entwicklungsauftrag. Der aktuelle Dienst bleibt unverändert und OFF.
