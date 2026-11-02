# Sicherheitsprotokollierung: Umsetzung vom 23. Oktober 2026

Die laufende Numaron-Sitzung wurde weder unterbrochen noch neu gestartet. Lokale Abschlusskontrolle: Prozess 55016, Power ON Revision 100, Controller running; frischer Betriebsnachweis. Keine Budgets, Berechtigungen, Schutzgrenzen oder Cloudflare-Routen wurden geändert. Keine externen Anbieterabfragen oder zusätzlichen Monitorläufe wurden gestartet.

## Founder-Dashboard

Vorbereitet: dauerhafte HTTP- und Anmeldeprotokollierung mit festen Metadatenfeldern. Enthalten sind Zeit, Methode, freigegebene Route, Ergebnis, feste Fehlerklasse sowie zufällige Anfrage- und Sitzungsreferenzen. Cookies, Bootstrap-Token, CSRF-Werte, Anfrageinhalte und Querystrings werden nicht gespeichert. Unbekannte Routen werden als `other` erfasst. Bestehende Anmeldung, CSRF-, Origin- und manuelle Schaltkontrollen bleiben bestehen.

Die Hauptstartdatei konfiguriert `artifacts/founder-integration-20261012/security-http.jsonl` für den nächsten autorisierten Start. Der bereits laufende Prozess lädt diese Änderung nicht nach. Das neue Produktionsprotokoll ist deshalb noch nicht aktiv. Ein direkter Start des Dashboard-Moduls ohne auditFile aktiviert es ebenfalls nicht.

Aufbewahrung: 2 MiB aktive Datei plus drei Archive, insgesamt ungefähr 8 MiB. SHA-256-Verkettung erkennt Änderungen innerhalb der verfügbaren Kette; sie ersetzt keine unabhängige, unveränderbare Aufbewahrung. Nach Rotation wird eine fehlende aktive Datei anhand der validierten Archive fortgesetzt. Bei Schreibfehlern bleiben bestehende HTTP-Sicherheitsprüfungen wirksam; ein fester, geheimnisfreier Hinweis erscheint einmal pro Fehlerphase auf stderr, zusätzlich zum lokalen Fehlerzähler. Ein abgebrochener Schreibvorgang kann manuelle Logreparatur erfordern; beschädigte Ketten werden nicht stillschweigend überschrieben.

## Numaron und Änderungsnachweis

`scripts/numaron-audit-capture.mjs` exportiert vorhandene Controller-, Betriebs- und Power-Metadaten ausschließlich lesend. SQLite-Dateien werden einzeln in Read-only-Transaktionen gelesen; der Export ist kein global atomarer Schnappschuss. HTTP-Archive werden bei Verfügbarkeit zusammen geprüft und als eingeschränkte Metadaten exportiert. Die Originalhashes beziehen sich auf die ursprünglichen Datensätze, nicht auf die Projektion. Fehlende oder unlesbare Quellen stehen ausdrücklich im Bericht.

Code und Website-Dateien erhalten einen aktuellen lokalen Hash-Baselineeintrag. Das beweist keine historische Unversehrtheit. Frühere Protokolllücken lassen sich nicht nachträglich rekonstruieren.

Ein neuer Export muss in einem neuen Verzeichnis unter outputs liegen:

```powershell
node scripts/numaron-audit-capture.mjs --out outputs/NEUES_VERZEICHNIS
node scripts/numaron-audit-capture.mjs --verify outputs/NEUES_VERZEICHNIS
```

Der verifizierte Abschluss-Export liegt unter `outputs/numaron-audit-implementation-20261023/capture-verified`. Er enthält 31.972 Controller-, 55 Betriebs-, 17 Power-Audit- und 208 Power-State-Datensätze. Das neue HTTP-Protokoll wird dort korrekt als fehlend ausgewiesen. Es wurde kein neuer Hintergrundprozess eingerichtet.

## Website

Die Cloudflare-Website liefert statische Assets über die bestehende Route. Die vorhandenen Sicherheitsereignisse sind weiterhin stichprobenartig und kein vollständiges HTTP-Zugriffsprotokoll. Es wurden weder kostenpflichtige Logs aktiviert noch statische Assets durch eine neue Worker-Route gezwungen. Vollständige Website-Zugriffsprotokolle bleiben unter den aktuellen Vorgaben offen. Vorhandene Cloudflare-Nachweise und der aktuelle lokale Dateiabgleich sind getrennte Belege.

## Prüfung

Isolierte Tests mit temporären Dateien, Fake-Adaptern und HTTP-Port 0 prüfen Anmeldung, Ablauf, CSRF/Origin, Geheimnisausschluss, Rotation, Wiederaufnahme, beschädigte Logs, Schreibfehler sowie Exportintegrität. Produktionskonten und Produktions-Schaltfunktionen werden dafür nicht verwendet. Zwei zusätzlich geprüfte Fehlerfälle waren die unterbrochene Rotation und ein leeres Exportmanifest; beide sind korrigiert.
