# Founder Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, if the user selects native execution. Steps use checkbox syntax.

**Goal:** Selbstständige Arbeitsauswahl, Recherche, parallele Bearbeitung und geprüfte Ergebnisse im privaten Founder-Dashboard.

**Architecture:** Dauerhafte Founder-Warteschlange mit exklusiven Ressourcenreservierungen, gemeinsamem Kostenjournal und begrenzten Adaptern für bestehende Recherche und Worker. Finanz- und Ergebnisbelege werden getrennt gespeichert. Die Oberfläche liest reale Controller-Telemetrie.

**Tech Stack:** Bestehendes Node.js/TypeScript, better-sqlite3, lokaler HTTP-Dienst, bestehende Offline-Podman-Isolation; keine neue kostenpflichtige Infrastruktur.

**Spec:** ../specs/2026-10-13-founder-autonomy-design.md

## Global Constraints

- Bestätigt: 15000 Rappen für die ersten 30 Tage, 750 Rappen täglich, Europe/Zurich; keine automatische Verlängerung.
- Zeitraum beginnt erst beim tatsächlichen freigegebenen Betriebsstart, nicht beim Schreiben dieses Plans.
- Vier parallele Aufgaben als Startkonfiguration; Abhängigkeiten und gemeinsam veränderte Ressourcen werden gesperrt.
- Vorläufiger technischer Schutz: 200 Rappen pro Aufgabe inklusive Wiederholungen. Keine Umgehung durch Teilaufgaben; Elternaufgabe bleibt Kostenwurzel.
- Kein Handelskapital aus dem Betriebsbudget; keine implizite Freigabe von Abonnements, Vertragsbedingungen oder externen Nachrichten.
- Keine neuen Schlüssel oder erweiterten Kontorechte ohne konkrete Freigabe. Keine Geheimnisse in Browserantworten oder Protokollen.
- Bestehende manuelle Aufgaben erhalten keine automatische Ausführungsfreigabe. Fremde Änderungen im sehr umfangreichen Arbeitsstand erhalten.
- Die bestehende Git-Autorenidentität fehlt. Keine Identität erfinden; nur eigene Dateien für einen späteren Commit vormerken.

## Review Focus

- Gleichzeitige Reservierungen am Tages-/Periodenlimit dürfen niemals gemeinsam über das Limit gelangen: Aufgabe 1.
- Neustart nach unklarer Anbieterantwort darf Kosten nicht freigeben oder externe Aktionen wiederholen: Aufgaben 1 und 2.
- Veraltete, widersprüchliche oder manipulierte Quellen dürfen keine Rechte erweitern und kein bestätigtes Wissen werden: Aufgabe 3.
- Ein Worker mit spätem Ergebnis nach Stopp darf keine weiteren Werkzeuge ausführen: Aufgaben 2 und 4.
- Leere, unvollständige oder fremde Finanz-/Auftragsbelege dürfen nicht als eigene Einnahmen gelten: Aufgabe 5.

## 1. Gemeinsames Kostenjournal

**Files:** Create scripts/founder-budget.mjs and scripts/founder-budget.test.mjs.

**Interfaces:** `openFounderBudget(file)` liefert `activate({startAt,authorizationRef})`, `reserve({id,rootTaskId,maxCostRappen,now})`, `settle({id,actualCostRappen,evidenceRef})`, `snapshot(now)`, `close()`. Aktivierung ist einmalig; alle Geldwerte sind nichtnegative sichere ganze Zahlen.

- [ ] Tests schreiben: vier konkurrierende Reservierungen zu je 200 Rappen erlauben bei 750 Rappen Tageslimit nur drei; Wiederholung derselben Kennung erzeugt keine zweite Reservierung. Teilaufgaben teilen die 200-Rappen-Grenze ihrer Kostenwurzel.
- [ ] Tests mit `node --test scripts/founder-budget.test.mjs` ausführen und den erwarteten fehlenden Export nachweisen.
- [ ] Reservieren und Abgleichen in SQLite-Transaktionen implementieren; offener Betrag bleibt nach Neustart gebunden. Kostenobergrenze umfasst Anbieterpreis, Wechselkursreserve und gegebenenfalls Steuern; ohne belastbare Obergrenze ablehnen.
- [ ] Tests für Zürich-Mitternacht, Sommerzeitwechsel, 30-Tage-Ende, unklare Abrechnung, doppelte und widersprüchliche Abrechnung ergänzen und erfolgreich ausführen.

## 2. Dauerhafter Controller und parallele Warteschlange

**Files:** Create scripts/founder-controller.mjs and scripts/founder-controller.test.mjs; modify scripts/founder-operations.mjs.

**Interfaces:** `openFounderController({file,budget,adapters,maxWorkers:4})` liefert `enqueue({id,rootTaskId,kind,input,dependencies,resources})`, `control(action)`, `tick()`, `snapshot()`, `close()`. Adapter stellen `execute({task,signal})` und `verify({task,result})` bereit. Ergebnisse enthalten `artifacts`, `evidence`, `costReceipt` und `checks`.

- [ ] Tests schreiben: fünf unabhängige Aufgaben starten höchstens vier Bearbeiter; gleiche Ressourcen sperren sich; fehlgeschlagene Abhängigkeit verhindert Folgestart; manuelle Altaufgaben werden nicht übernommen.
- [ ] `node --test scripts/founder-controller.test.mjs` zunächst mit erwarteter fehlender Implementierung ausführen.
- [ ] Zustände queued/running/verifying/done/blocked/failed/cancelled, Lease, Versuchszähler und Laufkennung implementieren. Ergebnis erst nach bestandener Adapterprüfung abschließen.
- [ ] Pause/Stopp und Absturz testen: verspätete Ergebnisse dürfen keine weiteren Aktionen starten; unklare Läufe werden blockiert, idempotente lokale Schritte dürfen kontrolliert wiederholt werden. Sicherung vor Migration mit SQLite-Backup und integrity_check nachweisen.

## 3. Eigene Arbeitsauswahl, Recherche und Lernen

**Files:** Create scripts/founder-research.ts, scripts/founder-knowledge.mjs, src/__tests__/founder-research.test.ts and scripts/founder-knowledge.test.mjs; reuse src/online/runtime.ts and src/revenue/operational-learning.ts.

**Interfaces:** `planFounderWork({goal,observations,capabilities,budget})` liefert begrenzte Taskvorschläge mit Begründung, Quellenkennungen und Kostenwurzel. `recordKnowledge({id,claim,sources,observedAt,expiresAt,verification})` und `usableKnowledge(now)` verwalten belegtes Arbeitswissen.

- [ ] Tests schreiben: Wissenslücke erzeugt Rechercheaufgabe; doppelte Kandidaten erzeugen keine Doppelarbeit; unbelegte Profitbehauptung erhöht Priorität nicht; abgelaufenes oder widersprochenes Wissen ist nicht verwendbar.
- [ ] Relevante neue Tests zuerst mit erwarteter fehlender Implementierung ausführen.
- [ ] OnlineRuntime über einen eigenen Datenbestand anbinden; vorhandene Schemaabhängigkeiten vollständig initialisieren. Öffentliche Endpunkt- und Anfragelimits beibehalten. Bereits bestehende Berechtigungsprüfung nicht ersetzen.
- [ ] Quellen, technische Prüfergebnisse und gemessene Kosten für spätere Auswahl speichern. Kein Quelleninhalt darf Berechtigungen ändern. Mit künstlichen gegensätzlichen Quellen und einem begrenzten echten öffentlichen Recherchelauf prüfen.

## 4. Modell- und Ausführungsadapter

**Files:** Create scripts/founder-worker.ts and src/__tests__/founder-worker.test.ts; integrate src/orchestration/local-worker.ts without globally enabling the Automaton entrypoint.

**Interfaces:** `probeFounderCapabilities()` liefert pro Fähigkeit available/blocked mit prüfbarer Begründung. `createFounderWorker({inference,policy,budget,isolation,workspace})` implementiert das Adapterinterface aus Aufgabe 2.

- [ ] Tests schreiben: kein Modellaufruf ohne Reservierung; keine Host-Shell als Isolationsersatz; Stopp vor Toolaufruf verhindert Ausführung; fehlender Provider blockiert sichtbar.
- [ ] Neue Tests zuerst negativ ausführen, danach Adapter implementieren. Vorhandene Worker-Inferenz- und Policy-Prüfungen wiederverwenden; erlaubte Werkzeuge explizit konfigurieren.
- [ ] Begrenzten realen Text-/Analyseauftrag mit vorhandenem zugelassenem Provider durchführen, Kostenbeleg und gespeicherte Ausgabe prüfen. Fremden Code ausschließlich in der vorgesehenen Offline-Podman-Umgebung testen.
- [ ] Modellqualität anhand festgelegter Aufgabenkriterien prüfen. Keine pauschale Behauptung, dass beliebige Aufgaben damit unterstützt werden.

## 5. Belegte Auftragsübersicht und lesender Finanzabgleich

**Files:** Modify scripts/founder-operations.mjs, scripts/stripe-account-check.mjs; create scripts/founder-finance.mjs and scripts/founder-finance.test.mjs; extend scripts/founder-operations.test.mjs.

**Interfaces:** `readFounderReports(base,now)` akzeptiert bestehendes checked_at/at und normalisiert verschachtelte settled PR-Ergebnisse. `reconcileFounderFinance({transactions,coverage})` liefert pro Währung Einnahmen, Gebühren, Erstattungen, Abdeckungszeitraum und offene Nachweise; keine automatische Währungsumrechnung.

- [ ] Regressionstests mit anonymisierten echten Berichtsschemata schreiben: fehlgeschlagene Abrufe sind keine leeren erfolgreichen Auftragslisten.
- [ ] Tests für doppelte Transaktionen, Pagination, Rückerstattungen, fehlende Seiten und mehrere Währungen schreiben und zunächst negativ ausführen.
- [ ] Berichtsleser korrigieren und Finanzadapter implementieren. Stripe-Rechte nur prüfen, nicht erweitern. Kontostände, Anbieterzahlungen und Bankeingänge getrennt lassen.
- [ ] Tests ausführen und tatsächliche lesende Anbieterantworten auf Vollständigkeit prüfen; fehlende Rechte als Blocker dokumentieren.

## 6. Dashboard, Betriebsstart und Gesamtprüfung

**Files:** Modify scripts/founder-dashboard.mjs, scripts/founder-mt5.mjs, scripts/founder-supervisor.mjs, scripts/start-numaron-founder.ps1, web/founder/app.js and web/founder/index.html; extend scripts/founder-dashboard.test.mjs.

**Interfaces:** geschützte POST /api/control, GET /api/capabilities und GET /api/results/:id; Snapshot enthält Controllerzustand, Worker, belegte Ergebnisse, Budgets und Wissensnachweise. Ergebnisabruf nur anhand gespeicherter Kennungen, keine beliebigen Dateipfade.

- [ ] HTTP-Tests für Sitzung, CSRF, Versionskonflikte, fehlende Freigaben und Pfadausbruch schreiben und zunächst negativ ausführen.
- [ ] Tatsächliche Controller-Telemetrie und Steuerung anbinden. Wiederanmeldung und Neustart erhalten Aufgaben; Start einer Webseite wird nicht als Worker-Aktivität angezeigt.
- [ ] Gesamttests ausführen: `node --test scripts/founder-*.test.mjs`; neue TypeScript-Tests mit dem vorhandenen Vitest-Setup gezielt ausführen. Fehler aus eigenen Änderungen beheben, fremde Altfehler getrennt dokumentieren.
- [ ] Im Browser eigene Aufgabenauswahl, Recherche, zwei oder mehr unabhängige Arbeiten, Pause, Wiederanlauf, Ergebnisprüfung und Budgetanzeige nachweisen. Kein bezahlter Livebetrieb vor bestandener Kostenprüfung und eindeutigem Startzeitpunkt.
- [ ] Optimierung anhand gemessener Kosten, Laufzeiten, Prüferfolg und Wiederholungen; keine höhere Parallelität ohne freien Ressourcenrahmen. Abschlussbericht unterscheidet funktionierende Fähigkeiten von konkreten Blockern.

## Selbstprüfung und Ausführung

Alle Entwurfsbereiche sind Aufgaben zugeordnet. Aufgaben 1–4 sind sicherheitsrelevante Voraussetzungen für kostenpflichtige automatische Bearbeitung. Aufgabe 5 kann unabhängig vorbereitet werden; keine parallelen Änderungen an derselben Datei. Der Plan empfiehlt native Ausführung in diesem Chat, weil Controller, Budget und Worker enge gemeinsame Schnittstellen besitzen. Eine unabhängige Abschlussprüfung folgt nach der Implementierung gemäß dem gewählten Ausführungs-Skill.

Status: Plan gespeichert, noch nicht umgesetzt. Schriftliche Planprüfung und Wahl des Ausführungswegs stehen nach dem verwendeten Writing-Plans-Skill noch aus.
