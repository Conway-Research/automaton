# Lokale Verwaltung von Referenzfreigaben

## Oberfläche

Der Link „Referenzverwaltung“ im Founder Studio öffnet `/reference-admin`. Die Seite verwendet die bestehende lokale Dashboard-Sitzung. Ohne Anmeldung werden keine Verwaltungsdaten ausgeliefert; ohne ausdrücklich eingerichtete Verwaltung erscheint ein Hinweis statt einer Schreibmöglichkeit.

Die Seite zeigt serverseitig bereitgestellte Auftragskandidaten, Freigaben mit Ablauf und Widerrufen sowie gespeicherte lokale Abnahmeprotokolle. Dynamische Daten werden als Text dargestellt, nicht als HTML. Rohreferenzzeilen werden nicht an die Oberfläche übertragen.

Eine Freigabe beginnt mit „Freigabe prüfen“. Die Vorschau zeigt Quelle, Eigentümer, Auftrag, Aufgabenfamilie, Revision, Umfang und Fingerabdrücke. Der Mensch prüft die Daten anhand seines unabhängigen Belegs, trägt dessen `contract:`-Referenz und das Ablaufdatum ein und bestätigt die Prüfung ausdrücklich. Erst „Referenzfreigabe speichern“ schreibt den Datensatz. Die Oberfläche kann die externe Herkunft der Daten nicht selbst bestätigen.

Widerrufe benötigen ebenfalls einen Beleg und eine ausdrückliche Bestätigung. Protokolle dokumentieren den lokalen Prüfstand; Käuferabnahme und Ausführungsfreigabe bleiben stets false. Historische Protokolle werden nicht nachträglich verändert. Die Anzeige prüft zusätzlich, ob Referenzfreigabe und Dateien aktuell noch zugeordnet sind.

## Sicherheitsgrenzen

- Bestehende Loopback-/Host-, Origin-, Session-, CSRF-, Größen- und CSP-Kontrollen des Dashboards gelten auch für die neuen Routen.
- Schreibaktionen erfordern einen lesbar bestätigten OFF-Zustand. Unbekannter oder eingeschalteter Zustand blockiert auch Widerruf und Protokollerstellung.
- Vorschauen sind fünf Minuten gültig, an die Sitzung gebunden, zahlenmäßig begrenzt und nur einmal nutzbar. Veränderte Produkte oder Nachweisstände blockieren die Speicherung.
- Der Server bestimmt Scope, Prüferidentität und Prüfzeit. Der Client darf keine freien Scope-Objekte, Datenbankpfade oder Reviewer-Identitäten schreiben. Freigaben sind höchstens 30 Tage gültig.
- Die konfigurierte Identität bezeichnet den lokalen Dashboard-Betreiber. Sie ist keine zusätzliche Mehrbenutzeranmeldung oder kryptografische Identitätsprüfung.
- Freigaben, Widerrufe und Protokolle werden in der vorhandenen validierten Hashkette gespeichert. Neue Widerrufe enthalten die konfigurierte Prüferidentität; ältere Datensätze bleiben lesbar.
- Die Verwaltungsfunktionen starten keine Aufträge, Provider, Controller oder Hintergrundsammler.

## Explizite Einbindung

`createReferenceAdmin({store, readProducts, readPower, reviewerId, now})` erzeugt den Verwaltungsdienst. Er wird als `referenceAdmin` an `startFounderDashboard` übergeben. `readProducts` muss ein geprüfter, synchroner lokaler Leser sein und höchstens 100 Kandidaten `{id, product}` liefern. Er darf weder externe Provider lesen noch fremdbestimmte Dateien öffnen. `readPower` liefert den bestehenden lokalen Betriebszustand; kein fehlender Wert wird als OFF interpretiert. `store` ist die ausdrücklich gewählte Nachweisablage.

Die Standardkomposition öffnet absichtlich keine Datenbank und sucht keine Produktionsaufträge auf eigene Faust. Für die bestehende laufende Installation wurde diese Option nicht aktiviert und kein Dienst neu gestartet. Die Oberfläche und API sind implementiert; die produktive Bereitstellung des geprüften lokalen Lesers und der Ablage bleibt eine explizite Konfiguration.

## Offline-Abnahme

Tests verwenden temporäre Datenbanken, einen ausschließlich lokalen Testserver und synthetische Aufträge. Geprüft werden Authentifizierung, Fremd-Origin, CSRF, Sitzungstausch, Vorschau-Replay, Ablauf, geänderte Produkte, veraltete Nachweisstände, ON/unklarer Power-Zustand, sichere Textdarstellung und ausdrückliche Bestätigung sowie Persistenz/read-only und Zurückweisung erfundener Käuferabnahmen. UI-Ereignisse werden mit einem isolierten DOM-Modell geprüft; dies ist kein visueller Browsertest.

Nachweise: `outputs/founder-reference-admin-20261019/REPORT.md` und `certificate-snapshot.json`. Numaron bleibt OFF; echte Freigaben wurden nicht erteilt.
