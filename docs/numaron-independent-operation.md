# Numaron ohne Codex betreiben

Stand: 17. Oktober 2026. Vorhandener API-Zugang und vorhandene Windows-Anmeldung; keine neuen kostenpflichtigen Dienste.

## Start und Betrieb

Der bestehende Windows-Autostart `Numaron Founder.lnk` ruft `scripts/start-numaron-founder.ps1` auf. Der Launcher startet den Founder-Supervisor und den unabhängigen Monitor, sofern sie nicht bereits laufen. Die Prozesse benötigen keine offene Codex-App. Windows muss angemeldet, der Rechner eingeschaltet und für externe Abfragen online sein.

Nach jedem neuen Founder-Prozess bleibt Numaron OFF. Erst Patrice persönlich darf im Dashboard **Numaron einschalten** klicken. OFF oder ein unklarer Zustand verhindern externe Abfragen des lokalen Monitors. Bestehende Budgets, Preisfreigaben, API-Kontingente und Auftrags-/Zahlungsgates bleiben bindend. Codex-Kontingent und eigener API-Zugang sind getrennte Voraussetzungen; ein ausgeschöpftes eigenes API-Kontingent wird nicht umgangen.

## Monitor und Doppelstarts

Der neue Begleitprozess besteht aus `numaron-monitor-host.mjs` und genau einem aktiven `numaron-monitor-daemon.mjs`. Sein exklusiver Besitz und seine Prozesssperre liegen in `artifacts/numaron-local-monitor/coordination.db`. Eine zweite gestartete Instanz erhält keine Sperre und führt keine Runde aus. Ein lebender oder unklarer Besitzer wird nicht allein wegen abgelaufener Zeit übernommen. Der Host überwacht ausschließlich diesen neuen Monitor; er steuert niemals den Founder-Dienst.

Der frühere ausführende Codex-Heartbeat `obolus-auftr-ge-berwachen` ist pausiert. Der Folgechat hat seine letzte Runde beendet und weitere externe Auftragsläufe eingestellt. Den Heartbeat nicht parallel reaktivieren. Eine eventuelle Rückübergabe braucht einen abgeschlossenen lokalen Lauf, einen beendeten lokalen Monitor und einen ausdrücklich koordinierten Besitzwechsel. Keine fremden Prozess- oder Sperrdateien löschen, um einen zweiten Lauf zu erzwingen.

Die erste Übergabe übernahm GitHub-Suchseite 12 als nächste Seite. Die neue Suche beginnt ausdrücklich wieder bei Seite 1. Der Cursor `github-time-partitions-v1` in `sources.db` enthält eine feste obere Erstellungszeit, die verbleibenden disjunkten Zeitbereiche, deren Seitenstand und bereits ausgegebene Issue-URLs. Mehr als 1.000 Treffer oder unvollständige GitHub-Ergebnisse teilen einen Bereich in zwei nicht überlappende Zeitbereiche. Innerhalb eines ausreichend kleinen Bereichs werden alle Seiten mit höchstens 100 Einträgen gelesen. Pro regulärem Monitor-Schritt erfolgt ein Suchabruf; ein anderer Monitor oder zusätzlicher Zeitplan wird nicht gestartet.

Veränderte Trefferzahlen, doppelte Seiten oder unerwartet kurze Ergebnisse lassen den betroffenen Bereich offen und starten ihn erneut. Fehler und Quoten verändern seinen Cursor nicht. Ein nicht weiter teilbarer Sekundenbereich mit zu vielen oder unvollständigen Ergebnissen wird als konkrete Lücke gespeichert; dann wird keine vollständige Abdeckung behauptet. Die Ergebnisse gelten für die konfigurierte Abfrage (derzeit offene Issues mit `label:bounty` und den bestehenden Ausschlüssen), nicht für sämtliche GitHub-Inhalte. Änderungen des Offen-/Geschlossen-Status während des Durchlaufs verhindern eine transaktionale Momentaufnahme. Nach einem abgeschlossenen Durchlauf beginnt frühestens nach 24 Stunden ein neuer. Bekannte Lücken bleiben sichtbar, statt automatisch als erledigt zu gelten.

Der Monitor liest vor jeder Runde das jüngste Quellenregister. Ältere numerische Seitenstände dürfen die neue Bereichswarteschlange nicht überschreiben; gespeicherte Wartefristen bleiben bindend. GitHub-Quotensperren gelten für alle GitHub-Quellen des Monitors. Projektmetadaten werden höchstens täglich neu gelesen; Kommentare/Reviews haben eigene aktuelle Abrufe. Treffer-Deduplizierung ersetzt niemals die separate Prüfung eigener Bewerbungen, Reservierungen und unklarer früherer Einreichungen.

Alle Auftrags- und Quellenabfragen des Monitors verwenden GET. Einzige Authentifizierungs-Ausnahme ist die normale Erneuerung des schon freigegebenen Google-OAuth-Tokens mit demselben Refresh-Token, Konto und Umfang. Keine neue Anmeldung oder zusätzliche Berechtigung wird angefordert. Der Monitor bewirbt sich nicht, akzeptiert keine Bedingungen, verspricht keine Vergütung und liefert keine Kundenarbeit. Vorhandene abgesicherte KI- und Auftragsausführung bleibt beim bestehenden Budgetcontroller. Plattformmeldungen und neue Escrow-Daten sind Belege zur Prüfung, keine automatisch bestätigte Zahlungsfreigabe.

## Status lesen

Im Projektordner:

```powershell
node scripts/numaron-local-status.mjs
node scripts/numaron-monitor-setup.mjs --status
Get-Content artifacts/numaron-local-monitor/health.json
Get-Content artifacts/numaron-local-monitor/status.json
```

`confirmedOn: true` setzt konsistente Powerdaten, passende lebende Founder-PID/Port, laufenden Controller und frische lokale Beobachtungen voraus. Fehler bleiben geschlossen; dieser Statusweg schaltet nichts ein und benötigt keine Dashboard-Sitzung.

`health.json` beschreibt Prozess, Wartezustand und nächsten Termin. `status.json` enthält den letzten Monitorlauf und je Quelle den letzten tatsächlichen Erfolg, den nächsten zulässigen Abruf und Fehler. Rohbelege liegen unter `artifacts/numaron-local-monitor/runs/`. Ein Timeout oder fehlender Zugang erneuert keinen erfolgreichen Quellenzeitpunkt. Monitorstatus wird zusätzlich im Datenkommentar der Founder-Quellenübersicht aktualisiert; fremder Code und die ugig-/Guru-Zeiten bleiben dabei erhalten.

## Zugänge und Einschränkungen

GitHub verwendet den vorhandenen Credential-Manager, Dealwork und Synmerco die vorhandenen lokalen geschützten Agentenzugänge. Der Synmerco-Zugang liegt weiterhin am bisherigen Speicherort unter `.codex/secrets`; die Datei ist unabhängig von einer laufenden Codex-App lesbar. Kein Schlüssel wurde neu erstellt, kopiert oder im Protokoll ausgegeben.

Der lokale Gmail-Monitor nutzt nur den bereits freigegebenen Numaron-Account und dessen festgelegtes Label. Abgelaufene Tokens werden über den vorhandenen Refresh-Zugang erneuert; bei Ablehnung bleibt die Quelle gesperrt. Er speichert die Nachrichtenliste; die vorhandene Runtime hat zusätzlich ihre bisherigen Detail-Leser. Er übernimmt keine anderswo angemeldete persönliche Codex-Gmail-Verbindung.

ugig verwendet nach Patrices konkreter Freigabe genau einen Schlüssel des bestehenden Obolus-Kontos. Er liegt mit Windows-DPAPI verschlüsselt und mit benutzergebundener Dateiberechtigung unter `.codex/secrets/numaron-ugig-api-key.dpapi`. Der Schlüssel hat technisch Full Access; der Monitor verwendet ausschließlich GET und bindet die private Abfrage an das Konto Obolus. Er liest eigene Bewerbungen, Gespräche und jeweils eine Seite öffentlicher Käufergesuche. Der Schlüssel wird nicht an öffentliche Gesuche weitergegeben. Kein Bewerben, Senden, Auszahlen oder Akzeptieren von Bedingungen erfolgt über diesen Adapter. Fehlende Authentifizierung, abweichende Konten und unvollständige Listen bleiben als Fehler sichtbar.

Guru benötigt weiterhin einen geeigneten eigenständigen Zugang und bleibt bis dahin auf `access-required`. Browsercookies werden nicht extrahiert. Die letzten belegten Guru-Daten bleiben sichtbar und gelten nicht als frisch geprüft. Auch bei einzelnen Quellenausfällen laufen die übrigen Quellen weiter.

## Dashboard-Anmeldung und aktuelle ON-Sitzung

Die vorhandene ON-Sitzung wurde für diese Einrichtung nicht neu gestartet. Der Founder-Dienst und sein Supervisor behalten ihre ursprünglichen Prozesse. Die bestehende abgelaufene Dashboard-Sitzung kann deshalb noch nicht den vorbereiteten neuen Servercode verwenden.

Für den **nächsten ausdrücklich zulässigen Founder-Dienststart** ist eine gleitende Sitzung mit privatem, rotierendem Einmallink vorbereitet. Der normale Launcher öffnet diesen Link aus `%LOCALAPPDATA%/Numaron/dashboard/login.json`, wenn dessen PID zum laufenden Dienst passt. Erneute Anmeldung erfordert dann keinen Dienstneustart. Herkunfts-, Host-, CSRF-, HttpOnly- und SameSite-Prüfungen bleiben bestehen. Anmeldung führt keine Poweraktion aus.

Keinen laufenden ON-Dienst für diese Aktivierung stoppen. Der Wartungslauncher verweigert `-Restart` bei ON oder unlesbarem Powerstatus weiterhin. Das Schließen von Codex ist kein Auftrag, Numaron auszuschalten; ein Windows-/Founder-Neustart schaltet Numaron seinerseits nicht automatisch wieder ein.

## Prüfung bei Einrichtung

Isolierte Tests prüfen Prozessbesitz, PID-Wiederverwendung, OFF-Wechsel, persistierte Quoten/Cursor, Quellenregisteränderungen, Windows-Zeitstempel, DPAPI-Lesen mit Fakezugang, Anmeldungserneuerung und unveränderte Wartungssperren. Die produktive Prüfung beschränkt sich auf lesende Abrufe und Kontinuität der ursprünglichen Founder-PID/Powerrevision.

Nachweise: `artifacts/numaron-independent-runtime-20261017/` sowie `artifacts/numaron-local-monitor/handoff.json`.

GitHub-Bereichssuche: Pro regulärer Runde höchstens vier sequenzielle Suchabrufe, mindestens 6,5 Sekunden Abstand und 45 Sekunden Zeitbudget. Jeder erfolgreiche Schritt erhält einen eigenen lokalen Checkpoint. Fehler, OFF, unklare Berechtigung und Quoten stoppen weitere Abrufe; Retry-After und Reset-Zeit bleiben wirksam. Bei höchstens zwei verbleibenden Suchabrufen wird bis zum Reset pausiert. Der bestehende Zehn-Minuten-Takt, die einzelne Monitor-Lease und die Founder-ON-Sitzung bleiben erhalten. Neue Treffer sind keine bestätigten Zuteilungen oder Zahlungsgarantien.
