# Numaron: Betrieb unabhängig von Codex

Status: Von Patrice am 17. Oktober 2026 freigegeben; Umsetzung ausdrücklich ohne weitere Freigaberunden beauftragt. Vorhandenen API-Zugang wiederverwenden, laufende ON-Sitzung erhalten. Aktivierungsnachweise und Einschränkungen stehen in `docs/numaron-independent-operation.md` und `artifacts/numaron-independent-runtime-20261017/`.

## Ziel und Grenzen

Numaron, Founder-Dashboard und Auftragsüberwachung funktionieren auf diesem Windows-Rechner bei geschlossener Codex-App oder ausgeschöpftem Codex-Kontingent. Der Rechner muss laufen und für externe Arbeit eine Netzwerkverbindung haben. Betrieb vor Windows-Anmeldung oder auf einem anderen Server gehört nicht zu dieser Änderung.

Vorhandenen API-Zugang wiederverwenden, keine neuen kostenpflichtigen Dienste, Schlüssel oder Rechte. Eigene API-Kontingente, Dienstverfügbarkeit und das bestehende Founder-Budget bleiben notwendige Voraussetzungen für KI-Arbeit. Kein Versprechen unbegrenzter KI-Nutzung.

Die bestehende ON-Sitzung darf nicht gestoppt, neu gestartet oder durch einen zweiten Founder-Runtime-Prozess ersetzt werden. Keine automatisierte Einschaltung. Jeder neue Founder-Prozess startet weiterhin OFF und benötigt Patrices persönlichen Dashboard-Klick.

Unverändert: CHF20/Tag, CHF2.50/Aufgabe, CHF150/30Tage, höchstens vier bestehende Worker, soweit tatsächliche aktive Konfiguration diese Werte bestätigt. Keine Trades, Zahlungen, Wallet-Signaturen, Vorabkosten, neuen Vertragsbindungen oder Erweiterung der bisherigen Auftragsbefugnisse.

## Geprüfter Bestand

- `scripts/founder-supervisor.mjs` startet und überwacht den eigenen Node-Dienst `scripts/founder-mt5.mjs`; die Laufzeit hängt nicht an einem Codex-Chat.
- Windows-Startup enthält bereits `Numaron Founder.lnk`, das den bestehenden Launcher aufruft. Nicht ungeprüft einen zweiten Autostart einrichten.
- `scripts/founder-runtime.mjs` enthält bereits Planung, Controller, Budget, direkte Dienstadapter und eine lokale Schleife.
- `scripts/founder-worker.mjs` nutzt den vorhandenen API-Zugang; seine Sicherheits-, Preis- und Budgetprüfungen bleiben erhalten.
- Die zusätzliche manuelle Zehn-Minuten-Auftragsüberwachung ist aktuell ein Codex-Heartbeat. Sie muss kontrolliert durch einen lokalen Monitor ersetzt werden.
- `scripts/founder-dashboard.mjs` setzt eine feste Acht-Stunden-Frist pro Prozessstart. Die Anmeldung ist deshalb abgelaufen, obwohl der Dienst arbeitet.
- Eine rein lesende lokale Zustandsabfrage existiert unter `artifacts/order-monitor-20261017-1856/local-status.mjs`. Sie prüft Hauptschalter, Prozessidentität, Port, Controller und frische lokale Betriebsbelege, ohne Produktionskonstruktoren zu initialisieren.
- Viele fremde Änderungen liegen im Checkout. Nur gezielt eigene Dateien bearbeiten; nichts verwerfen oder pauschal committen.

## Architektur

### 1. Gemeinsame lokale Ausführungssperre

Ein lokales Koordinationsregister vergibt exklusiven Besitz des Auftragsmonitors und eine prozessgebundene Laufsperre. Standard vor Übergabe ist `codex`; nach bestätigter Übergabe `local`. Jede lokale Runde prüft Besitzer, aktuelle Powerfreigabe und Sperre vor jedem externen Abruf. Ein zweiter Prozess darf weder über Zeitablauf allein einen lebenden Besitzer verdrängen noch eine laufende Runde doppelt beginnen. Nach einem Absturz wird nur ein eindeutig beendeter Besitzer freigegeben; bei unklarer Identität bleibt der Monitor gesperrt und meldet Handlungsbedarf.

Die Prozesssperre ersetzt nicht die Auftragsdeduplizierung: Plattform+Auftrags-ID, bisherige Versuche, gespeicherte Bewerbungen, Reservierungen und unbekannte Submit-Ergebnisse bleiben maßgeblich. Kein Submit-Retry bei ungewissem Ausgang. Der lokale Monitor führt zunächst ausschließlich lesende Prüfung, Discovery und private Vorprüfung aus. Bereits vorhandene abgesicherte Auftragsausführung bleibt beim existierenden Controller, statt einen zweiten KI-Worker oder ungesicherten Submit-Pfad einzuführen.

### 2. Lokaler Monitor als unabhängig gestarteter Begleitprozess

Ein eigener kleiner Node-Prozess führt die bisherige Auftragsüberwachung alle zehn Minuten aus, mit einer einzigen aktiven Runde und gespeichertem nächsten Termin. Er kann neben dem laufenden Founder-Prozess starten, ohne dessen Initialisierung oder Steuerfunktionen aufzurufen. Keine zusätzliche KI-Ausführung außerhalb des vorhandenen Budgetcontrollers.

Direkte, bereits berechtigte Schnittstellen für GitHub, Dealwork und Synmerco verwenden; bestehende Zugangsdaten nur über vorhandene lokale Zugangsmethoden lesen und niemals protokollieren. Eine Codex-Connector- oder Browsersitzung ist keine automatisch übertragbare lokale Berechtigung. Quellen ohne bereits geeigneten eigenständigen Zugang bleiben ausdrücklich `Zugang erforderlich`, mit letztem tatsächlichem Prüftermin und ohne fingierten Leerbefund. Keine Cookies aus Browserprofilen auslesen, keine zusätzlichen Konten oder Zugriffe einrichten.

Persistierte Quellencursor, 24h-Pausen, Retry-After, Quoten und letzte erfolgreiche Prüfzeiten übernehmen. Vor allem GitHub Seite10 nicht wiederholen, sofern jüngere Belege keinen anderen Cursor zeigen. Quellenregister vor jeder Runde erneut lesen; kein fest eingebauter historischer Cursor.

Fehler einzelner Quellen isolieren, begrenzte Timeouts und Backoff nutzen. Keine Secret-Ausgaben oder unbeschränkten Rohdatenprotokolle. Bei OFF oder unklarem Zustand keine externen Abrufe oder KI-Arbeit. Lokaler Status und Dashboard bleiben erreichbar.

### 3. Autostart und Prozesslebensdauer

Bestehenden Windows-Startup und Launcher prüfen und gezielt um den lokalen Monitor ergänzen. Der Start muss von der Lebensdauer der aufrufenden Shell und Codex unabhängig sein. Bereits laufende Founder- und Monitorprozesse erkennen, statt zweite Instanzen zu starten. Protokolle und Zustand lokal ablegen.

Ein fehlgeschlagener Monitorstart darf den Founder-Dienst nicht stoppen. Ein Dienstneustart bleibt durch die bestehende ON-/unklar-Wartungssperre geschützt. Während dieser Umsetzung keine geplante Windows-Neuanmeldung und kein produktiver Absturztest.

### 4. Dauerhaft bedienbare Dashboard-Anmeldung

Anmeldelebensdauer von der festen Prozesslaufzeit entkoppeln und einen expliziten lokalen Wiederanmeldeweg vorbereiten. Gleiche-Origin-, Host-, HttpOnly-, SameSite-, CSRF- und Loopback-Schutz behalten. Keine unbegrenzt wiederverwendbaren Bootstrap-Tokens, öffentlichen Statusendpunkte oder pauschale Abschaltung von Authentifizierung einführen. Eine Anmeldung oder Erneuerung darf keine Power-/Controller-Aktion auslösen.

Da die Route im laufenden Prozess geladen ist, bleibt diese Serveränderung während der aktuellen ON-Sitzung nur vorbereitet. Aktivierung erst bei einem später erlaubten Dienststart in OFF. Der unabhängige lokale Statusweg steht bis dahin zur Verfügung. Kein Hot-Patching oder Debugger-Eingriff in den laufenden Prozess.

## Kontrollierte Übergabe ohne doppelte Läufe

1. Implementierung und isolierte Tests abschließen; lokale Ausführung bleibt zunächst deaktiviert.
2. Bestehenden Codex-Heartbeat und Folgechat auf laufende Runde prüfen, Folgechat zur Übergabe koordinieren und eine gestartete Runde abschließen lassen.
3. Ausschließlich bestehenden ausführenden Auftrags-Heartbeat pausieren; keinen zweiten Heartbeat oder Scheduler erstellen. Pause verhindert neue Ticks, beendet aber nicht automatisch eine bereits laufende Runde.
4. Erst nach nachgewiesenem Ende der laufenden Codex-Runde exklusiven lokalen Besitz setzen und lokalen Monitor starten. Ist der Abschluss nicht sicher nachweisbar, lokale Sammlung nicht starten.
5. Lokale Sperre, erste zulässige Runde, Prozesslebensdauer, unveränderte Founder-PID und Powerrevision prüfen. Ohne neue Erkenntnisse keine Routinebenachrichtigung.
6. Übergabenachweis mit Besitz, Cursor, Sperrstatus, verwendeten Zugängen und verbleibenden Quellengrenzen speichern. Codex darf später lesend helfen; operative Runden nur nach expliziter, ebenfalls exklusiver Rückübergabe.

## Nachweise und Abnahme

- Temporäre Dateien/DBs und Fakeadapter: parallele Starts ergeben genau eine Runde; lebenden Besitzer nicht übernehmen; abgestürzten Prozess sicher erkennen; unklare Identität sperrt.
- OFF/unklar: null externe Aufrufe und null KI-Aufrufe; OFF-Wechsel während einer Runde verhindert weitere Aufrufe.
- Quoten, Timeout, fehlender Zugang und unbekannter früherer Submit erzeugen keine falschen Erfolgseinträge oder Wiederholungen.
- Bestehende eigene Bewerbungen bleiben genau einmal registriert; Zahlungsvoraussetzungen werden nicht gelockert.
- Autostart-/Launcherprüfung startet keinen zweiten Founder; ON-Wartungsneustart wird weiterhin abgewiesen.
- Dashboard-Authentifizierung mit Testserver und Fakepower testen: Anmeldungserneuerung nach Zeitablauf ohne Neustart; fremder Ursprung/CSRF/Tokenwiederverwendung abgewiesen; keine Poweränderung.
- Live ausschließlich lesend prüfen: gleiche Founder-PID, gleiche ON-Revision, neue lokale Statusbelege, ein lokaler Monitor und pausierter ausführender Codex-Heartbeat. Kein absichtliches Stoppen, Ausloggen von Windows oder Einschalten zum Testen.

## Bewusste Einschränkungen bei Abschluss

Eine gestartete lokale Überwachung ist kein Beleg, dass jede Codex-Integration direkt erreichbar ist. Fehlende Quellenzugänge einzeln ausweisen. Das Dashboard-Serverupdate bleibt bis zum nächsten ausdrücklich zulässigen Neustart ausstehend. Diese Grenzen im Abschlussbericht nennen; nicht als vollständig aktiviert darstellen.
