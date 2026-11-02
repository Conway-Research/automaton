# Autonome Fehlerbehandlung – Implementierung vorbereitet

Patrice hat den Entwurf ausdrücklich freigegeben: bekannte Ursachen autonom beheben,
Korrektur prüfen, gleiche Aufgabe fortsetzen; keine weiteren Freigaberunden für diese Umsetzung.

Implementiert im bestehenden Controller:
- Gesonderte persistierte Reparaturhistorie pro Aufgabe und registrierter Reparaturversion.
- Ausschließlich registrierte synchrone lokale Korrekturen, mit unabhängiger Ergebnisprüfung.
- Zulassung nur bei kostenfreiem, als reparatursicher markiertem Adapter und eindeutigem
  Nullkostenbeleg des bisherigen Versuchs. Keine Reparaturwiederholung ungeklärter Zahlungen.
- Datenbanktransaktion serialisiert Reparatur und Aufgabenübernahme gegen doppelte Ticks.
- Nach bestätigter Korrektur gleiche Aufgabenkennung und unveränderte Versuchshistorie;
  auch eine Aufgabe mit drei bisherigen Versuchen kann danach einmal weiterlaufen.
- Eine bestätigte Reparaturversion wird pro Aufgabe nicht nochmals ausgeführt. Erfolglose
  Prüfungen höchstens dreimal, mit 1/2/4 Stunden Pause. Unklar unterbrochene Reparaturen
  werden nicht blind erneut ausgeführt. Status ist über runtime.snapshot().repairs verfügbar.
- Bei eindeutig protokollierter Zugangssperre vor dem ersten Versuch wird die Aufgabe
  nach Wiederverfügbarkeit des vorhandenen Adapters automatisch wieder eingereiht.
- Pausierter/gestoppter Controller startet keine Reparaturen und wird nicht gestartet.

Konkreter korrigierter Fehler: readFounderReports konnte den aktuellen gespeicherten
Monitor-Unterbrechungsbericht nicht lesen. Dieser wird jetzt als Teilbericht mit dem
ursprünglichen lastCompletedAt und answersFreshSincePreviousReview=false ausgewiesen.
Keine ältere erfolgreiche Datei als frischen Abruf ausgeben. Der order-report-Adapter
registriert dafür eine lokale erneute Schema-/Lesbarkeitsprüfung vor Wiederaufnahme.

Grenzen: keine allgemeine autonome Quellcodeänderung, kein Neustartrecht, keine neuen
Konten oder Berechtigungen. Unbekannte Fehler besitzen noch keinen freigegebenen
Reparaturhandler; insbesondere sind Kommunikationsfehler und unklare Anbieterkosten
damit nicht pauschal behoben. Neue bekannte Ursachen benötigen gezielte Korrekturen.

Offlineprüfung: 69 Tests bestanden (Controller, Reparatur, Bericht, Budget, Arbeiter,
Operations, Discovery und Lern-/Rechercheintegration), mit Netzwerkguard und Fakeadaptern.
Produktiven Bericht zusätzlich ausschließlich lesend mit neuem Parser geprüft: partial,
Datenstand 2026-10-18T23:40:17.970Z, keine frischen Antworten behauptet.

Aktivierung ausstehend: laufende ON-Sitzung PID 18668, Powerrevision 59 und Controllerrevision
139 am 2026-10-19T00:42:23Z unverändert bestätigt. Kein Neustart, kein Stop, keine produktive
Controllerinstanz für Tests geöffnet. Neue Reparaturfunktionen und zehn Arbeiter werden
erst beim nächsten zulässigen Wartungsneustart geladen. Keine automatische Unterbrechung
der ON-Sitzung aus dieser Dokumentation ableiten. Geldbudgets unverändert.
