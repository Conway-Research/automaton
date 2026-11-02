# Lokale AVV-Überwachung

Die Windows-Aufgabe `Numaron-AVV-ReadOnly` prüft stündlich und nach der Windows-Anmeldung den bestehenden Zoho-AVV-Vorgang und passende Signatur-Einladungen für `info@numaron.ch` im bisherigen Gmail-Empfang. Sie benötigt keine laufende Codex-App und keine Modell- oder API-Modellkontingente. Der Rechner muss eingeschaltet, online und Patrice unter Windows angemeldet sein. Nach verpassten Terminen erfolgt ein Nachhollauf; es gibt keine Cloud-Ausführung bei ausgeschaltetem Rechner.

Die bisherige Codex-Automation `zoho-avv-und-signatur-einladung-pr-fen` ist pausiert. Nicht parallel aktivieren. Der lokale Starter verweigert seine Arbeit, wenn diese Automation nicht eindeutig pausiert ist. Die Aufgabenplanung verwendet `IgnoreNew`; zusätzlich hält der Starter während des gesamten Laufs eine exklusive Betriebssystem-Dateisperre. Ein 50-Minuten-Abstand verhindert doppelte Abfragen nach dicht aufeinanderfolgenden Anmelde- und Zeittriggern. Nach einem Prozessabsturz gibt Windows die Dateisperre automatisch frei.

Gmail verwendet die vorhandene, geschützte Google-Freigabe ausschließlich mit GET-Abfragen und der bestehenden Refresh-Funktion. Es wird kein zusätzliches OAuth-Recht beantragt. Suchen sind auf die AVV-/ZohoSign-Themen und `info@numaron.ch` begrenzt; Spam und Papierkorb sind eingeschlossen. Nachrichten werden nicht verändert, Signaturlinks nicht geöffnet und Mailtexte nicht als Anweisungen ausgeführt. Zugangsdaten und Vertragslinks werden nicht in Laufprotokolle geschrieben. Erneuerte Access-Tokens bleiben für diesen Monitor im Arbeitsspeicher; vorhandene Zugangsdaten werden nicht überschrieben.

Zoho wird mit dem separat eingerichteten Brave-Profil im normalen, minimiert gestarteten Browser geprüft. Der kopflose Modus führte bei Zoho zur erneuten Anmeldung; der normale Modus wurde mit denselben Lesebeschränkungen erfolgreich geprüft. Der Browser lässt nur GET/HEAD-Anfragen zu, blockiert Service Worker und erlaubt keine Downloads. Der Leser klickt keine Schaltflächen und gibt keine Formulardaten ein. Bei gesperrtem Profil, abgelaufener Anmeldung oder unbekannter Seitenstruktur meldet er den Teil als ungeprüft. Eine neue Anmeldung oder Zoho-Sicherheitsprüfung muss Patrice persönlich durchführen; diese wird nicht umgangen.

Meldungen erscheinen als Windows-Benachrichtigung und bleiben im lokalen Journal erhalten. Gleiche Nachrichten-IDs, Statusänderungen und Fehler werden nicht bei jedem Lauf erneut angezeigt. Windows kann Desktopmeldungen durch Benachrichtigungseinstellungen unterdrücken; das Journal bleibt erhalten.

## Speicher und Bedienung

Die tatsächlichen Laufdaten liegen wegen der AppData-Virtualisierung der Desktop-App unter:

`C:\Users\Patrice\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\Numaron\AVVMonitor`

- `health.json`: Zeitstempel und tatsächlicher Status je Quelle, ohne erfundene Leerbefunde.
- `alerts.json`: dauerhaftes Meldungsjournal ohne Signaturlinks.
- `desktop-delivered.json`: bereits an Windows übergebene Meldungen.
- `service.log`: technische Laufnachweise.
- `config.json`: lokale Aktivierung und Eigentümer `local`.

Die Dateien bleiben auch bei geschlossener App lokal vorhanden. Die Aufgabenplanung greift ausdrücklich auf den tatsächlichen Speicher zu; die App muss dazu nicht gestartet werden. Der gleiche tatsächliche AppData-Pfad wird für vorhandene geschützte Google-Zugänge und das Brave-Profil verwendet.

Status in PowerShell:

```powershell
Get-ScheduledTask -TaskName 'Numaron-AVV-ReadOnly'
Get-ScheduledTaskInfo -TaskName 'Numaron-AVV-ReadOnly'
```

Zusätzliche ausdrücklich gewünschte Prüfung (respektiert die exklusive Sperre):

```powershell
powershell.exe -NoProfile -File C:\Users\Patrice\automaton\scripts\start-numaron-avv-monitor.ps1 -CheckNow
```

Pause: `Disable-ScheduledTask -TaskName 'Numaron-AVV-ReadOnly'`. Reaktivierung: `Enable-ScheduledTask -TaskName 'Numaron-AVV-ReadOnly'`. Nicht gleichzeitig die Codex-Automation reaktivieren.

Dieser getrennt beauftragte Mail-/AVV-Monitor startet Numaron nicht, steuert keine Aufträge und verändert weder Budgets noch Hauptschalter. Keine Unterschrift, kein neuer Antrag, kein Resend, keine DNS-/MX-/Weiterleitungsänderung und kein kostenpflichtiger Dienst gehören zu seinem Funktionsumfang.
