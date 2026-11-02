# Aufräumvorschlag Laufwerk C:

Messung vom 2.11.2026, nur lesend, ohne Verknüpfungen mitzuzählen. Von 930 GB sind 12,6 GB frei. Gelöscht wurde dafür nichts.

**Korrektur:** Die früher genannten rund 350 GB je Prüfordner (`founder-code-worker-20261021` und ähnliche) waren ein Messfehler. `dir /s` lief durch Verknüpfungen auf `node_modules` mit. Diese Ordner belegen real unter 0,1 GB, dort ist nichts zu holen.

## Wo der Platz wirklich liegt

| GB | Was | Zuletzt |
|---:|---|---|
| 150,1 | Starfield (Steam) | gespielt 22.12.2025 |
| 132,5 | Diablo IV (Steam) | gespielt 18.12.2025 |
| 131,2 | Anno 117 (Steam) | Dateien zuletzt 25.10.2026 |
| 103,8 | **Abgebrochene Diablo-IV-Aktualisierung**, `steamapps/downloading/2344520` | Stand 19.12.2025 |
| 94,9 | Fortnite auf dem Desktop | Dateien 12.1.2026 |
| 71,8 | Podman, isolierte Testumgebung für Numaron | heute |
| 71,5 | Lokale Modelle in `outputs/` | 24.–25.10.2026 |
| 25,6 | Ruhezustandsdatei `hiberfil.sys` | System |
| 24,1 | App-Daten, davon 22,1 Codex | heute |
| 20,5 | `.git`, davon 18,8 lose Objekte | heute |
| 15,7 | MetaTrader (MetaQuotes) | heute |

## Vorschlag

Ziel sind mindestens 100 GB frei. Wie schnell Numaron im Betrieb Platz verbraucht, ist nicht gemessen; die Zahl ist ein Sicherheitsabstand, kein Beleg.

1. **Diablo-IV-Aktualisierung beenden: rund 104 GB.** Das reicht allein für das Ziel. Am einfachsten deinstallierst du Diablo IV in Steam, dann werden es rund 236 GB. Willst du es behalten, kannst du die Aktualisierung stattdessen in Steam zu Ende laufen lassen, was den Platz vermutlich auch freigibt; belegt ist das nicht.
2. **Was du sonst nicht mehr spielst: Starfield 150 GB, Fortnite 95 GB.** Deinstallation über Steam und den Epic Launcher, nicht von Hand löschen.
3. **Git packen: gestrichen.** Meine Schätzung von rund 15 GB war falsch. Der Großteil von `.git` sind lokale Modelle und Installationsdateien (`model.gguf`, `LibreOffice.msi`), die über eine andere Referenz in der Git-Historie erreichbar sind. Sie lassen sich kaum komprimieren; Packen bräuchte vorübergehend rund 19 GB und brächte wenig.

Die Spiele deinstallierst du selbst. Das ist dein Eigentum und endgültig, deshalb mache ich das nicht.

## Nicht anfassen

- **Podman und `obolus-isolation-test`:** Die Sandbox-Skripte von Numaron brauchen Podman.
- **Lokale Modelle:** Sie werden noch gebraucht, falls das Modelltraining weitergeht. Ob sie weg können, hängt an der offenen Entscheidung zu Stock.
- **MetaTrader:** Trading-Vorgabe, keine Änderungen.
- **Codex-Daten:** Der Übergabe-HOLD gilt, die Chats und ihr Verlauf bleiben erhalten.
- **`outputs/` und `artifacts/`:** Belege, und mit zusammen rund 18 GB ohne die Modelle ohnehin kein großer Hebel.

## Eher nicht

- **Ruhezustand abschalten (25,6 GB):** Das ändert eine Systemeinstellung und ist unnötig, wenn Schritt 1 erledigt ist.

## Entscheidung Patrice, 2.11.2026

Diablo IV bleibt, die Aktualisierung soll zu Ende laufen. Danach Platz neu messen. Git wird nicht gepackt (siehe Punkt 3).
