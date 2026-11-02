# DOCX-/XLSX-Erzeugung für vier uGig-Kandidaten

Stand: 20. Oktober 2026. Lokale Implementierung und synthetische Tests. Kein Versand, Upload, Anbieteraufruf, Dienstneustart oder Eingriff in die laufende Sitzung. Zuletzt lokal beobachtet: ON, Revision 84; unverändert gelassen.

## Implementierung

- `scripts/ugig_office.py`: begrenzter vertrauenswürdiger Formatter mit python-docx 1.2.0 und openpyxl 3.1.5, im vorhandenen gebündelten Python getestet. Keine neuen Pakete installiert. Kein Netzwerkcode, keine Makros, keine Ausführung von Kundenprogrammen.
- `scripts/founder-ugig-office.mjs`: explizit aufzurufender Vorbereitungsadapter. Eingaben vor dem ersten asynchronen Schritt kopieren; Arbeitsberechtigung vor Verarbeitung und erneut vor Import prüfen; temporäres Arbeitsverzeichnis bereinigen; Byte-/Dateigrenzen prüfen und unveränderliche Binärdateien über den vorhandenen Store importieren. Python-Prozess erhält keine geerbten API-Schlüssel, keinen Shell-Befehl und ein Zeitlimit.
- Ausgabe: `binaryArtifacts`, `files`, `packageDigest`, technische Nachweise und offene Abnahmen. Diese Felder passen zum bestehenden Mischpaket. Es werden weder Vertragspakete noch Grants, unabhängige Reviews oder Versandfreigaben angelegt.

`createUgigOfficeGenerator({base, python, isEnabled, authorize})` benötigt einen absoluten Python-Pfad und eine explizite Autoritätsfunktion. `generate({spec, reference}, ctx)` prüft `authorize({workKind,inputDigest,referenceDigest}, ctx)` mehrfach. Der Aufrufer muss die konkrete Vertrags-, Daten- und Arbeitsberechtigung für genau diese Digests belegen. Ein bloßes `true` aus einem Testadapter ist ausschließlich für temporäre synthetische Tests geeignet. Die Produktionsverdrahtung wurde nicht umgestellt und der Adapter nicht automatisch an den laufenden Dienst angeschlossen.

## Unterstützte Kandidaten und genaue Grenzen

| Auftrag | Erzeugung | Technische Gegenprüfung |
|---|---|---|
| Dokumentorganisation, Gig `1d754c51-8a44-4a56-b004-e874117f5c48` | DOCX, Markdown, Änderungsübersicht, README aus Quellblöcken und ausdrücklich vorgegebener Gliederung | Jeder Block genau einmal, unveränderter Originaltext, exakte Absatzreferenz, Überschriftenstile und Änderungsbericht erneut prüfen |
| Supportvorlagen, Gig `4ed05909-cba1-48d0-903e-7b7b25b3ddfc` | Bis zu zehn Vorlagen mit Betreff, Haupt-/Kurzfassung, Eskalation, Platzhaltern, Sprachleitfaden und Checkliste als DOCX/Markdown | Vollständige Referenzabsätze, Platzhalter, Abdeckung aller vereinbarten Fall-IDs und Vorlagen, erforderliche/verbotene Referenzformulierungen; Test mit 20 Fällen |
| Recherchetabelle, Gig `6ba3dca1-f288-4600-a97b-722bdee28871` | XLSX, CSV, Markdown-Fazit und README aus bereitgestellten Daten, Quellen und Abrufdaten | Maximal 20 Zeilen, zehn Spalten einschließlich Quellenmetadaten; exakter typisierter Zellvergleich, Quellen-URL-/Datumsformat und Fazitreferenz. Kein neuer Quellenabruf |
| Excel-Automation, Gig `2cc65a54-dd93-49b0-9297-dbd05457f5cc` | XLSX, CSV, Python-Skript, BAT-Starter, Rezept, Referenz und README | Ein bis drei XLSX-Dateien mit identischen Spalten, je einem Blatt, höchstens 50.000 Datenzeilen und 32 Spalten; höchstens zwei explizite `trim`-/`lowercase`-Regeln; Originalhashes, Typen und Referenzwerte |

Keine implizite Typumwandlung oder stilles Entfernen fehlerhafter Zeilen. Excel-Eingabeformeln, mehrere Blätter, andere Regeln und nicht unterstützte Zelltypen werden abgewiesen. Formelauswertung ist **nicht implementiert**. Die verfügbaren Regeln begrenzen diese erste Implementierung; sie belegen nicht die Ausführbarkeit beliebiger späterer Kundenregeln.

Recherche liefert hier strukturierte bereits bereitgestellte Ergebnisse. Die Software erfindet keine Fakten, führt aber auch keine neue Recherche durch. Die Dokumentorganisation ordnet unveränderte Abschnitte; eine freie redaktionelle Überarbeitung ist nicht Teil dieses Formatters.

Formelähnliche Zeichenfolgen werden im erzeugten XLSX ausdrücklich als Text gespeichert; CSV schützt sie durch einen führenden Apostroph. Diese absichtliche CSV-Darstellung ist im README erläutert. Externe Office-Verknüpfungen und aktive Inhalte werden blockiert. Keine neuen Format-Ausnahmen im bestehenden Binärvalidator.

## Nachweis und Freigabe bleiben getrennt

`technical-report.json` enthält SHA-256 der Eingaben, Referenzen und Ausgabedateien, `technicalPassed: true`, **`independentlyVerified: false`** und `pendingReviews`. Der Vorbereitungsadapter meldet stets **`deliveryReady: false`**.

Automatischer Text-/Referenzvergleich beweist weder die Wahrheit einer Quelle noch die Angemessenheit einer Unternehmensregel. Quellenrechte, inhaltliche Aussagen, fachliche Abdeckung, Datenschutz und visuelles DOCX-Seitenlayout bleiben unabhängig zu prüfen. DOCX wurde mit python-docx zurückgelesen, nicht mit Word/LibreOffice gerendert. Die bestehenden Fachprüfungssperren verlangen weiterhin ein unabhängiges, aktuelles Review gegen den konkreten Vertrags- und Produktdigest.

Vor Erzeugung müssen öffentliche Daten und eine Kundenberechtigung erklärt und durch den Aufrufer geprüft sein. Explizit vertrauliche oder unbekannt klassifizierte verschachtelte Eingaben/Referenzen werden ebenfalls gesperrt. Nach Erzeugung benötigt der vorhandene Lieferweg zusätzlich die Zustimmung zum **exakten** Paketdigest und zur öffentlichen Speicherung/Textübergabe. Ein vorangestelltes `customerApproved`-Feld erzeugt diesen Nachweis nicht.

Gemischte Pakete bleiben auf 96.000 Bytes Text-JSON begrenzt. Große CSV-, Referenz- oder Quelltexte können deshalb trotz erfolgreicher XLSX-Erzeugung nicht importiert werden. Kein stilles Kürzen. Verträge, Finanzierung, Kundenzusage und echte Produktabnahmen für die vier Bewerbungen werden durch synthetische Tests nicht ersetzt.

## Reproduktion der isolierten Tests

PowerShell im Projektverzeichnis:

```powershell
$officePython = 'C:/Users/Patrice/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $officePython -I scripts/test_ugig_office.py
$env:NUMARON_OFFICE_TEST_PYTHON = $officePython
node --import tsx --test --test-concurrency=1 scripts/founder-ugig-office.test.mjs scripts/founder-binary-artifacts.test.mjs scripts/founder-binary-archive.test.mjs scripts/founder-ugig-order-pipeline.test.mjs scripts/founder-ugig-binary-delivery.test.mjs scripts/founder-ugig-production.integration.test.mjs
```

Tests verwenden ausschließlich synthetische Eingaben, temporäre Stores und Fake-Plattformadapter. Der Windows-BAT-Starter wird tatsächlich in einem temporären Verzeichnis ausgeführt; Originalbytes und CSV-Ergebnis werden danach verglichen. Das ist ein Test des vertrauenswürdigen Formatters, keine Container-Zertifizierung für fremden Kundencode.

Logs: `outputs/ugig-office-20261020/python-tests.txt` und `node-tests.tap`. Der Testlauf umfasst fehlende Freigabe, OFF, entfallene Arbeitsberechtigung, Vertraulichkeit, manipulierte Dateien/Referenzen, Quelltextverlust, nicht erfüllte Supportfälle, Formeln, externe Verknüpfungen, Binärimport und bestehende Vertrags-/Lieferprüfungen.
