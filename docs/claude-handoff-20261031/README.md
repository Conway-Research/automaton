# Numaron — Übergabe an Claude Code

Stand: 31. Oktober 2026, lokaler Arbeitsstand in `C:/Users/Patrice/automaton`. Dieses Paket ist eine Navigation und Zustandsaufnahme, kein Deployment und keine neue Ausführungsfreigabe. Es enthält bewusst keine Schlüssel, privaten Mailkörper, Kontokonfigurationen oder produktiven Datenbankkopien.

## Zuerst lesen

1. `AGENTS.md` im Projektstamm: verbindliche Bedienungs-, Budget-, Datenschutz- und Wartungsregeln. Diese gelten ausdrücklich auch für Claude.
2. Dieses Dokument und `START-PROMPT.txt` daneben.
3. `STATE-SNAPSHOT.json`, `PRESERVATION.json`, `GIT-STATUS.txt` und `SOURCE-MANIFEST.json` daneben.
4. `docs/numaron-continuation-index.json` selektiv nach Arbeitsbereich lesen, nicht vollständig in Modellkontext oder öffentliche Dienste kopieren. Der Index ist umfangreich und enthält historische sowie widersprüchlich alte Statusfelder. `CONTINUATION-EXTRACT.json` ist der für diese Übergabe ausgewählte Auszug.
5. Verknüpftes Gap-Ledger `artifacts/original-reconciliation-20261018/gap-ledger.json`. Dessen Datum und einzelne frühere Lücken nicht mit dem heutigen Implementierungsstand verwechseln; neuere konkrete Belege gegenprüfen.

Alle relativen Pfade in diesem Dokument beziehen sich auf den Projektstamm. Für dieselbe lokale Arbeitskopie gedacht; kein eigenständiges portables Installationspaket. Die bisherigen Codex-Chats und deren vollständige Entscheidungen werden nicht automatisch in Claude übertragen. Bei Widersprüchen gelten die neueste konkrete menschliche Anweisung und AGENTS.md; historische Anweisungen sind keine neue Erlaubnis.

## Trading direkt finden

- [Trading-Startnachricht für Claude](TRADING-START-PROMPT.txt): kurzer Einstieg mit Lesereihenfolge, offenen Punkten und Betriebsgrenzen.
- [Trading-Übergabebericht](TRADING-HANDOFF.md): getestete Strategien, Ergebnisse nach Kosten, Brokeranbindungen und offene Fragen.
- [Prüfvermerk zur Trading-Übergabe für Claude Code](TRADING-LINK-CHECK.md): Ergebnis der abschließenden lesenden Link-, Pfad- und Belegprüfung vom 31. Oktober 2026.

Zunächst ausschließlich lesend prüfen. Keine neuen Tests, Downloads, Brokeraufrufe oder Orders; Numaron bleibt OFF und der Übergabe-HOLD besteht fort.

## Unverhandelbare Grenzen für die Fortsetzung

- Patrice verlangt: Budgets unverändert, Numaron ausgeschaltet, kein Neustart. Niemals Produktions-ON automatisieren oder Power-Dateien auf ON setzen. Nur Patrice darf persönlich im Dashboard einschalten. Keine Provider-/Modell-/Markt-/Recherchearbeit durch einen ausgeschalteten Engine-Start.
- Keine echten Trades, neuen Bewerbungen, Nachrichten, Einreichungen, Zahlungen, Registrierungen oder Vertragsannahmen durch diese Übergabe. Kundenarbeit erst mit konkret bestätigter Beauftragung, passender Finanzierungs-, Umfangs-, Eingabe- und Rechteprüfung. Alte allgemeine Autonomiewünsche ersetzen diese Freigaben nicht.
- Wartung ausschließlich über `scripts/start-numaron-founder.ps1`; derzeit gar nicht aufrufen. Kein Kill/Spawn, kein Löschen von Locks, kein Dienst-/Supervisorneustart. `-Restart` bedeutet nur Vormerkung. Apply braucht eine neue konkrete gemeinsame menschliche Freigabe und alle aktuellen Guards. Vorbereitete/geladene Batch-Marker erteilen keine Genehmigung.
- Gesamte schmutzige Arbeitskopie erhalten. Kein reset/clean/stash/checkout oder pauschales Ersetzen durch eines der historischen ZIPs. Gestagte und ungestagte Änderungen sind teils verschieden; Git-HEAD allein bildet Numaron nicht ab. Mit anderen aktiven Chats keine überlappenden Edits durchführen.
- Keine Geheimnisse aus `.automaton`, DPAPI-Stores, Git-Credential-Helpern, Billing-Responses oder Launch-Konfigurationen in Logs/Prompts übernehmen. Zugang zu Codex-Gmail-/Browser-Plugins und deren Sitzungen wird nicht an Claude weitergereicht; keine Ersatzkonten anlegen.

## Heute direkt beobachteter Zustand

Power-Datei: `artifacts/founder-integration-20261012/power-state.jsonl`, letzter Eintrag OFF, Revision 101. Der Dashboard-Dienst ist vom Engine-Betrieb getrennt: TCP-Listener auf 127.0.0.1:51439, PID 50328; Service- und Health-Dateien melden Start 2026-10-31T03:15:50Z, Supervisor 40928. Keine authentifizierte Funktionsabnahme oder neuer HTTP-Test in dieser Übergabe. Keine Startaktion durchgeführt.

`maintenance/loaded.json` im selben Verzeichnis meldet Batch `ee2886da296041ea912472160ab50bfe`, Fingerprint `57ba8865093b920601f08094fd34c35bcd2b01d08bc1024311ad4ec4c58e74ee`, abgeschlossen 03:15:50Z. Der frühere Bericht `outputs/founder-maintenance-fixes-20261031/REPORT.md` sagt noch „nicht angewendet/kein Listener“. Das ist historisch überholt hinsichtlich Prozess/Marker. Nicht daraus folgern, dass alle heutigen Quellbytes geladen sind, alle Funktionen funktionieren oder die frühere menschliche Apply-Freigabe in diesem Paket nachgewiesen wäre. Vor weiterem Deployment erst Herkunft/Freigabe und aktuellen Fingerprint prüfen. Diese Übergabe autorisiert kein weiteres Apply.

Health enthält Start-Snapshot-Budget CHF150/30 Tage, CHF20/Tag, CHF2.50/Aufgabe, maxWorkers10. Diese Werte sind Beobachtung, keine neue Autorisierung und keine Empfehlung. Frühere abweichende Budgetformulierungen nicht übernehmen. Logischer Inhalt der produktiven `artifacts/founder-autonomy-20261013/budget.db` und Power-Bytes wurden vor/nach Übergabe verglichen und blieben unverändert; siehe PRESERVATION.json. Health-Ausgaben sind kein vollständiges Live-Finanzledger.

Git-HEAD: `543d0623ee94cc1f5e84c11faf2dee3e15eeb180`. GIT-STATUS.txt listet Änderungen und unversionierte Verzeichnisse in kompakter Git-Sicht; keine exhaustive Einzeldateiliste aller Artefakte. SOURCE-MANIFEST.json pinnt 1400 vorhandene Quell-/Kontrolldateien. Das ist ein Übergabehash, kein Launcher-Zertifikat. Während anderer Chats kann der Stand weitergehen; vor Edits neu vergleichen.

## Aktuelle Entwicklungsschwerpunkte und Grenzen

### Founder-Wartung und Queue

`outputs/founder-maintenance-fixes-20261031/REPORT.md` und EVIDENCE-INDEX.json: historische Nachweise 725 feste Tests, 392 Zusatztests, 2 Pythonprüfungen, 80 unabhängige Prüfungen. Gruppen können sich überschneiden; kein kompletter Repository-Test. Ursprünglich fehlerhafte Prüfungen bleiben unter `outputs/founder-maintenance-audit-20261031/` sichtbar.

Queue-Prüfsperren auf privater OFF-Kopie: 40 wartende, 14 blockierte, 701 historisch fehlgeschlagene Aufgaben, zusammen 755 Holds, plus drei dauerhafte Wiederholungssperren. Kein Beleg, dass alle alten Aufgaben wieder ausführbar wären. Keine stornierten Kommunikationsziele neu anlegen oder durch neue Task-IDs umgehen. Produktions-Ledgerzustand nach dem späteren Dienststart wurde hier nicht neu abgefragt. Hauptdateien: `scripts/founder-controller.mjs`, `founder-runtime.mjs`, `founder-task-audit.mjs`, `founder-maintenance.ps1`, `start-numaron-founder.ps1`; relevante neue Review-/Hold-Module über Index und Bericht erschließen.

### Qualifiziertes Offline-Paket A/B

`outputs/qualified-project-pilot-integration-20261030/REPORT.md`, EVIDENCE-INDEX.json und FINAL-DELIVERY-RECEIPT-20261030.json. Document Review Desk bis Runde109: 276 Kontrollen im Original, frischen Archiv und mit neuen Daten; 113 authentifizierte Modellbelege. Begrenzte Anwendung mit HTTP/UI/SQLite, gedrucktem deutschem/englischem PNG-OCR und kleinem überwachten Klassifikationsproblem. Keine universelle Softwareentwicklungsfähigkeit daraus ableiten.

B: persistente isolierte Controller-/Budget-/Lieferanbindung, 407 Regressionstests im Original und entpackten Archiv; 12 synthetische Aufträge/Reservierungen, zwei saubere neue Prozesse. Synthetisches paid ist keine reale Zahlung. Unbekannte tatsächliche Arbeitskosten blockieren echte Lieferung/Gewinnaussage. ZIPs sind separate qualifizierte Quellen mit lokalen Abhängigkeiten, nicht automatisch produktiv integriert. Keine neuen Läufe oder Überschreibung der eingefrorenen Nachweise.

### Begrenzter C-Kern

`outputs/confirmed-funded-order-integration-20261030/REPORT.md`: strikte Zuordnung von Auftrag, Finanzierung, Umfang und Freigabe im isolierten Controller-Kern. 461 Kontrollen und 32 fokussierte Tests, jeweils mit dokumentierter Wiederholung; nicht addieren. Kein echter Plattformreader verbunden. Ganze C-Abnahme bleibt offen: historische Zuordnung, echte spätere Zahlungsbelege, vollständige Darstellung/Rundung, Kosten-/Gewinnabnahme, Evidenzerneuerung bei langen Läufen. Keine Kundenfreigabe durch das Quellarchiv.

### Stock-Projekt: ungeklärten Ausgang bewahren

`outputs/complex-stock-project-run-20261030-v1/` und `activeAdditionalComplexProject` im Index sind kritisch. Jüngster Bericht: Runde79, 80 akzeptierte Modellbelege, aktuell 0/79 durch `IndentationError domain/model.py:591`; historischer Höchststand33/79. Ein vorbereiteter Edit mit unbekanntem Ausgang bleibt erhalten: `5ed80dd9f415130fbd438e14c18876637fb6a0d599daf638cc6608bb3ae6ac33`.

STATUS.json meldet noch PID42424/actual-local-model-call. Neuere Wartungsbelege melden Worker geschlossen; diese Statusdatei ist daher allein kein Live-Nachweis. Kein blinder Replay, kein zweiter Worker, keine Handreparatur des Modellkandidaten, keine Rücksetzung von Reservations-/Request-/Receipt-Journalen. `training-state/regular-reconcile-result.json` im Wartungsverzeichnis meldet null Ergebnis auf exakter privater Kopie ohne neue Prozessaufrufe. Ungeklärtes bleibt ungeklärt. Nur einen geprüften regulären Recoveryweg vorbereiten; aktuell keine Modellarbeit starten.

Incident-API-Nachfolgeprojekt `outputs/complex-incident-api-project-run-20261030-v1/` ist statisch vorbereitet und wartet auf qualifizierten Stock-Abschluss; nicht starten. Ganze Trainings-/Live-Freigabe und C/D bzw. weitere akzeptierte Arbeitspakete sind nicht abgeschlossen.

## uGig und bestehende Aufträge

Primärer bisheriger Pilot: Gig `5616dbbb-b147-4bbc-adb9-68bff5d49f89`, Bewerbung `b853c252-06d2-4e05-8334-d7b3a02432c8`, Root `ugig-158bb18e9f284695093e2d63`. Historischer direkter Stand: pending/paused, keine Käuferantwort. Keine heutige externe Neulesung in dieser Übergabe. Vier reale Office-Kandidaten haben laut jüngsten Qualifikationsberichten keine vollständigen Vergabe-, Finanzierungs-, Eingabe- und Abnahmenachweise.

Codefamilien: `scripts/founder-ugig-*`, `founder-content-*`, `founder-marketplace-work-*`, `founder-order-execution.mjs`, `founder-order-lifecycle.mjs`, `founder-production-order-bindings.mjs`, `founder-order-restoration.mjs`. Aktuelle Dateien lesen; ältere Behauptung „alles unkonfiguriert“ gilt nicht pauschal. Prüfen: klare Kundenanforderung → eigene bestätigte Vergabe → Finanzierung → bestehende Budgetreservierung → Artefakt → unabhängige Prüfung → exakte Freigabe → journalisierte Abgabe → belegte Zahlung. Kein Schritt aus Testfixtures als echte Authority übernehmen.

Historische externe Nachweise: `artifacts/existing-applications-20261024/REPORT.md`, `artifacts/task-replies-20261024/REPORT.md`, `artifacts/ugig-practice-20261023/REPORT.md`, `artifacts/pilot-selection-20261024/REPORT.md`. Diese sind datiert, keine aktuellen Plattformzustände.

- Freelancer Redzinam, Sales Data Pipeline Development, Thread446633263: zwei bereits vorhandene Numaron-Antworten vom19.10. beantworteten Fragen und begrenzten Zusagen. Der neue Entwurf vom24.10. wurde wegen Dopplung NICHT versandt. Nicht erneut senden. Letzter Prüfstand kein eigener Zuschlag/keine finanzierte Arbeit. Beleg `artifacts/redzinam-reply-draft-20261024/send-check.json`.
- GitHub Presago-Labs/presago PR142 war merged. Merge heißt weder Vergütungszusage noch Auszahlung. Chain-Love Discussion41/Arsenii: allgemeine FAQ, keine individuelle Numaron-Betrags-/Transaktionsbestätigung. Antworten an andere Autoren nicht Numaron zuordnen.
- Synmerco-Kandidat job_70f967b282f44fe8: fünf USDC, Werbepost mit Offenlegung/48h-Nachweis; Deadline28.10.2026 bereits vorbei. Kein aktueller ausführbarer Pilot, keine eigene Vergabe/kein eigenes Escrow nachgewiesen. Nicht aus dem alten Auswahlbericht fortsetzen.

## Finanzen und wiederkehrende Aufgaben

`scripts/founder-cost-import.mjs`; DB `artifacts/founder-integration-20261012/founder-finance.db`. CHF-Servicekosten nur mit belegtem tatsächlichem Betrag, Numaron-Zuordnung und Leistungsdatum; keine erfundenen FX-Kurse. Manuell bestätigte CHF-Zahlungen sollen über Dashboard möglich sein. Fehlende private Bankverbindung ist keine offene Aufgabe.

OpenAI0005 USD86.48 / bestätigte CHF73.92 vollständig Numaron: gespeicherte Auflösung Guthabenaufladung, kein zusätzlicher Verbrauch. OpenAI0006 USD43.24 ebenfalls Topup Numaron; tatsächlicher CHF-Betrag nicht bekannt. ChatGPT-Pro-Abo CHF83 ausdrücklich privat/andere Projekte, nicht Numaron-Kosten. Keine alten Imports überschreiben; stabile Referenzen und Resolutionen respektieren. Lokaler Kostenimport ist kein Beleg für tatsächlichen Nettogewinn oder Finanzvollständigkeit.

Codex-Automation `numaron-kostenbelege-automatisch-erfassen` prüft drei Gmailkonten. Keine automatische Migration oder zweite parallele Claude-Automation einrichten. Zuletzt hier abgeschlossene Prüfung29.10.: keine neuen passenden Belege, [] importiert. Spätere Heartbeat-Ausführung30./31.10. in diesem Chat nicht als abgeschlossen behaupten. Zwei offene OpenAI-KI-Läufe/Reservierungen benötigen weiter belastbare Support-/Request-/Usagebelege; kein neuer eindeutiger Abschluss in dieser Übergabe. Supportnachträge waren vom Nutzer versandt; keine erneute Anfrage senden.

## Empfohlener erster Arbeitsgang

1. Ausschließlich lesen: Snapshot gegen heutiges OFF, Dienst/geladenen Batch und Quellhashes prüfen. Keine Start-/Wartungs-/Provider-API auslösen. Andere Chatänderungen erkennen.
2. Wartungsberichte, neue Queue-Prüfsperren und dokumentierte Restlücken abgleichen. Sichtbare Dashboardzahlen nicht mit historischer Queue oder Testkopie verwechseln.
3. Eine eng begrenzte offene Lücke mit konkreter Quelle auswählen, vorzugsweise echte bestätigte Auftragsevidenz/Finanzierung in der Offline-Anbindung oder sichere Behandlung des unbekannten Stock-Ausgangs. Keine kommerzielle Fähigkeit aus synthetischen Tests behaupten.
4. Erst isolierte Fake-/TEMP-Tests prüfen und ausführen, wenn sie keine Produktionsdateien, echten Keys, Provider, ON oder Prozessaktionen verwenden. `package.json` bietet Vitest/Typecheck; viele Founder-Suiten sind `node --import tsx --test <konkrete Dateien>`. Nicht blind alle Skripte/Tests/Beispielhosts starten. Manche historischen Einkommensprüfungen brauchen echte Fixtures; Office-/Podman-/Modelltests haben zusätzliche lokale Voraussetzungen.
5. Ergebnis mit Datei-/Belegstellen und klarer Trennung implementiert / isoliert getestet / geladen / echt nachgewiesen dokumentieren. Änderungen nur nach der dann geltenden konkreten Aufgabe. Kein Neustart in diesem Auftrag.

Diese Übergabe wurde nicht als Ganzsystemtest ausgegeben. Auftragsplattformen, Supportmail und heutige authentifizierte Dashboard-Funktionen wurden nicht erneut abgefragt. Quell- und Zustandsnachweise ermöglichen die nächste gezielte Prüfung, ersetzen sie aber nicht.
