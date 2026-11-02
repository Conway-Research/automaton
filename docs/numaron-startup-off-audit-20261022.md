# startup-off-Protokollierung

Stand: 22.10.2026. Quellcode korrigiert und offline geprüft; kein Dienststart,
Neustart oder Paper-Test zur Aktivierung ausgeführt.

`openFounderPower` schreibt weiterhin zuerst den sicheren OFF-Zustand. Der
Initialisierungseintrag enthält nun `startupAt`, `startupPid`, `startupCall`,
`startupCaller` und eine eindeutige `startupId`. Dieselbe Kennung verbindet ihn
mit dem neuen `startup-off`-Ereignis in `power-audit.jsonl`.

Das Audit enthält Ereigniszeit `at`, `pid`, den Funktionsaufruf `call`, die feste
Aufruferklasse `caller`, vorherigen Zustand und Revision sowie den neuen
OFF-Zustand und die neue Revision. `priorState` unterscheidet einen gültigen,
fehlenden oder nicht lesbaren Ausgangszustand. Fehlender/ungültiger Zustand
wird nicht als bewiesenes vorheriges ON ausgegeben.

Beim Übergang ON nach OFF erhält `changedAt` den tatsächlichen
Initialisierungszeitpunkt. War der Zustand schon OFF, bleiben letzter
Übergangszeitpunkt und Revision erhalten; `startupAt` und das Audit dokumentieren
trotzdem den neuen Initialisierungsaufruf. Alte `startRequestId` wird nicht als
aktueller Auslöser übernommen; originale historische Zeilen bleiben erhalten.

Der Dashboard-Einstiegspunkt kennzeichnet den Aufruf als `founder-dashboard`.
Zulässig sind außerdem `maintenance-off` und der Standard `direct-open`.
Freie Aufrufertexte, Kommandozeilen und Stacktraces werden nicht protokolliert.
Die Aufruferklasse ist eine Code-Kennzeichnung, kein Authentifizierungsnachweis
für einen Menschen. Die PID bezeichnet den schreibenden Prozess. Die Uhrzeit
stammt von dessen Systemuhr und wird nicht extern zertifiziert.

Scheitert die Audit-Schreibung, bleibt die bereits geschriebene OFF-Zeile mit
Initialisierungsbelegen erhalten; die Initialisierung bricht mit einer festen
Fehlermeldung ab. Ein Schreibfehler startet keine Module. Bereits vorhandene
Start-/Stopp-Schutzregeln bleiben bestehen.

28 gezielte Tests bestanden: vier neue Regressionstests für das Startup-Audit
und bestehende Power-Audit-, Power-, Runtime-Startup-, Wartungs-, Supervisor-
und lokale Statusprüfungen. Alle ON-Tests verwenden temporäre Zustandsdateien
und Fake-Adapter; Wartungsprozessaktionen sind simuliert. Externe Netzaufrufe
sind durch die Test-Preloads gesperrt.

Prüfbefehl:

```powershell
node --require ./scripts/verification-network-guard.cjs --import ./scripts/founder-offline-test-guard.mjs --import tsx --test --test-concurrency=1 --test-reporter=spec scripts/founder-power-startup-audit.test.mjs scripts/founder-power-audit.test.mjs scripts/founder-power.test.mjs scripts/founder-power-startup.test.mjs scripts/founder-maintenance-restart.test.mjs scripts/founder-supervisor-state.test.mjs scripts/numaron-local-status.test.mjs
```

Historische startup-off-Zeilen werden weder umgeschrieben noch nachträglich
mit vermuteten PIDs/Zeitpunkten ergänzt. Produktive Einbindung erst bei einem
separat autorisierten späteren Wartungsneustart prüfen. Keine Aktivierung in
dieser Arbeit und kein automatischer Paper- oder Numaron-Start.
