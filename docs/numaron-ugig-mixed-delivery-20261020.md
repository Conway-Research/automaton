# Gemischte uGig-Lieferungen

## Umfang und Betriebsgrenze

Freigegebener Entwurf im Chat: ein Gesamtprodukt aus Binärdateien, Quellcode, CSV und README; binäre öffentliche Anhänge nur mit ausdrücklicher Kundenfreigabe, Textdateien über nummerierte Nachrichten; vollständiger gemeinsamer Rücklesenachweis vor Lieferbestätigung. Implementierung lokal, keine Aktivierung oder Dienstneustarts.

Bei Arbeitsbeginn wurde ein bereits bestehendes ON mit Revision 82 beobachtet. Diese Arbeit hat Numaron weder eingeschaltet noch ausgeschaltet oder unterbrochen. Alle Tests verwenden temporäre Zustände und simulierte Adapter; keine echten Uploads, Kundenkontakte, Konto- oder Zahlungsabfragen.

## Vertrag und Gesamtprodukt

Der bestehende generische `reviewed-binary`-Pfad unterstützt zusätzlich `deliveryProtocol: "mixed-files-v1"` und `deliveryRequirements.format: "mixed-files-v1"`. Bestehende reine Binär- und Textverträge behalten ihr Verhalten.

`binaryArtifacts` enthält die bekannten binären Deskriptoren. `files` enthält die vollständigen Textdateien als `{path, content}`. Das Produkt umfasst `binary-manifest.json` und diese Textdateien. Das Manifest trägt das Schema `numaron-mixed-artifacts-v1`, die Binärdeskriptoren und für jede Textdatei Pfad, tatsächliche UTF-8-Bytezahl und SHA-256. Produktdigest, Vertragsumfang und Arbeitsbindung erfassen damit alle Lieferbestandteile.

`deliveryRequirements.requiredFiles` muss exakt die Liste aller Binärnamen und anschließend aller Textpfade enthalten. Doppelte Namen, reservierter Manifestname, unsichere Pfade und verbotene Formate blockieren. Es dürfen weder zugesagte Quelldateien noch README oder CSV stillschweigend weggelassen werden.

Zusätzlich zu den bisherigen öffentlichen Binärfreigaben benötigt `publicAccess`:

- `textDelivery: "numbered-messages-v1"`: bestätigte Textübergabeform.
- `packageDigest: digest({binaryArtifacts, files})`: Freigabe für das exakte Gesamtpaket.
- Weiterhin die überprüfte Kundennachricht, `buyerId`, `messageId`, `contentDigest`, `approved` und der exakte binäre `artifactDigest`.

`binaryProvenance.packageDigest` muss denselben Gesamtpaketdigest tragen. Herkunfts- und Kundenfreigaben werden nicht automatisch erzeugt. Vertragsprüfer müssen bestätigen, dass die belegte Kundennachricht tatsächlich öffentlich erreichbare Binäranhänge und die nummerierte Textübergabe dieses Pakets gestattet. Ein bloßer interner Haken ersetzt keine Zustimmung.

Vertrag und Eingaben müssen öffentlich zulässig sein. Vertrauliche Daten bleiben gesperrt. Bestehende Verbote externer Uploads, etwa im Plot-Angebot, benötigen zuerst eine ausdrückliche Vertragsänderung.

## Textgrenzen und Transport

Höchstens 50 Textdateien und 96.000 Bytes für deren JSON-Darstellung. Zulässige Textendungen: py, js, mjs, cjs, ts, tsx, sh, bat, csv, md, txt, json. Diese Zulassung ist ausschließlich für geprüfte Übergabedateien; sie führt keine Datei aus. Sichere Unterverzeichnisse bleiben erhalten. Keine EXE, allgemeinen Projekt-ZIPs, `.env`-Pfade, NUL-Zeichen oder Linkimporte.

Binärgrenzen bleiben unverändert: maximal 20 Dateien, 10 MiB je Datei, 40 MiB insgesamt, maximal fünf Anhänge pro Nachricht. Das Modell-ZIP ist weiterhin kein allgemeines Archivformat.

Die Binäranhänge verwenden den vorhandenen festen Upload- und Speicherpfad. Textdateien werden als JSON in nummerierten Nachrichten mit vollständigem Produkt- und Paketdigest übertragen. Unicode wird verlustfrei escaped, sodass Segmentgrenzen auch bei Umlauten und Emoji keine Zeichen beschädigen. Zur Rekonstruktion werden die Inhalte nach der Leerzeile in Teilreihenfolge zusammengefügt und als JSON gelesen; Pfade und Dateiinhalte sind darin enthalten.

## Gemeinsamer Abschluss und Fehlerverhalten

Ein gemeinsames Journal bindet Auftrag, Revision, Vertragsumfang, Produkt und Paket. Vor externen Schritten werden Betriebsfreigabe, aktuelle Vertrags-/Finanzierungsprüfung und unabhängige Produktprüfung erneut kontrolliert.

Eine bestätigte Lieferung verlangt:

1. Alle Binäruploads samt bytegenauem Rücklesen.
2. Eindeutig zugeordnete Nachrichten für sämtliche Anhänge und Textsegmente.
3. Erneute vollständige Nachrichtenprüfung und erneutes Rücklesen aller Binärbytes.
4. Weiter gültigen Vertrag und Fachprüfung sowie dauerhaften gemeinsamen Liefernachweis.

Die Transportfolge ist nicht atomar: Bereits veröffentlichte Dateien oder Nachrichten lassen sich durch einen späteren Widerruf nicht zurückholen. Ein Fehler verhindert weitere Übertragung bzw. die Gesamtbestätigung; er behauptet keine Rücknahme bereits erfolgter Veröffentlichung.

`readDelivery` sendet keine fehlenden Teile. Ein ausdrücklich erneut angestoßener `submitDelivery` kann eindeutig zurückgelesene Teile übernehmen und noch nicht versuchte Teile senden. Bereits versuchte, aber nicht eindeutig belegte Uploads/Nachrichten bleiben zur manuellen Klärung gesperrt. Doppelte oder verschwundene Teile verhindern den Abschluss. Kein neuer automatischer Wiederholungsauftrag wurde eingerichtet.

## Fachprüfung und verbleibende Grenzen

Neben den bisherigen auftragsabhängigen Prüfungen und den drei Binärchecks sind vier zusätzliche Nachweise zwingend:

- `mixed-package-completeness`
- `source-code-isolated-tests`
- `csv-reference-output`
- `readme-reproducibility`

Diese müssen unabhängig, aktuell und an den exakten Vertrag und Produktdigest gebunden sein. Wo ein Dateityp im konkreten Paket fehlt, muss die unabhängige Prüfung dessen begründete Nichtanwendbarkeit dokumentieren; bloße Selbstbestätigung genügt nicht.

Das Profil übernimmt bereits erzeugte, geprüfte Dateien. Es implementiert keinen allgemeinen Generator, Trainer oder automatischen Sandbox-Binärexport. Die zusätzliche Fachprüfsperre führt Quellcode auch nicht selbst aus. Die zugehörigen isolierten Prüfläufe und Belege müssen vorliegen.

Der feste Content-Pilot bleibt ein eigener Textpfad; er wird nicht durch eine neue Profilangabe umgeleitet. Noch fehlende Kundenverträge, Vergaben, Finanzierung und CoinPay-Berechtigungen werden durch diese Änderung nicht ersetzt.

## Nachweise

`outputs/ugig-mixed-delivery-20261020/red.tap` dokumentiert die zunächst fehlenden Mischlieferungen, `integration-red.tap` die zunächst fehlende zusätzliche Prüfsperre. `unit.tap` und `tests.tap` enthalten die anschließenden Prüfungen. `evidence.json` bindet Ergebnisse an die geänderten Quelldateien.

Prüfumfang: vollständiges Binär-/Code-/CSV-/README-Paket, Unicode-Rekonstruktion, Teilverlust, Paketfreigabe, Vertragsänderung, Vertraulichkeit, Widerruf, OFF, unsichere Dateien, unklarer Textversand, reiner Leseabgleich und explizite Wiederaufnahme ohne Doppelversand. Die Produktionszusammensetzung wird ausschließlich mit synthetischen Konten, Plattformantworten, Abnahme und Zahlung geprüft.
