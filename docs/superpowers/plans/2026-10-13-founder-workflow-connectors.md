# Founder Workflow Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Den bestätigten Genesis-Auftrag mit selbstständiger Arbeitsauswahl, überprüfbaren Ergebnissen und fünf direkten Dienstadaptern im Founder-Betrieb umsetzen.

**Architecture:** Vorhandenen Budgetcontroller, Scheduler und SQLite-Persistenz erweitern. Neue Adapter liefern normalisierte Belege an ein gemeinsames Auftragsjournal; nur freigegebene Fähigkeiten werden ausgeführt. Zugangseinrichtung und echte Laufzeitprüfung bleiben pro Dienst getrennt vom Bestehen lokaler Tests.

**Tech Stack:** Node.js, vorhandenes tsx, better-sqlite3, node:test, Windows DPAPI, offizielle HTTPS-APIs. Keine neue kostenpflichtige Infrastruktur.

**Spec:** ../specs/2026-10-13-founder-workflow-connectors-design.md, einschließlich Genesis-Präzisierung; durch Patrice am 13.10.2026 bestätigt.

## Global Constraints

CHF 150 für die autorisierte 30-Tage-Periode, CHF 7.50 pro Zürcher Kalendertag, CHF 2 je Aufgabenfamilie, vier Worker.
Genesis unverändert vollständig weitergeben; keine Budgetneustarts oder eigenständige Rechteausweitung.
Keine Codex-OAuth-Tokens übernehmen. Private Mail nicht an öffentliche Rechercheanbieter senden.
Nur ausgewählte Konten, Labels, Ordner, Kalender und Projekte; fehlende Zugänge bleiben sichtbar blockiert.
Keine neuen GitHub-Veröffentlichungen, Mailversendungen, Termineinladungen oder Finanzaktionen in diesem Entwurf.
Unabhängige Workspace-Änderungen und Betriebsdaten erhalten. Änderungen zunächst im vorhandenen isolierten Founder-Worktree prüfen; vor Übernahme Drift vergleichen und nur zugehörige Dateien kopieren.

## Review Focus

Genesis größer als bisherige 8-KB-Grenze: vollständig zulassen oder vor kostenpflichtigem Aufruf nachvollziehbar blockieren (Task 1).
Antwortverlust nach Cloud-Dateierstellung: Abgleich statt doppelter Lieferung (Task 4).
Gleichnamige/fremde Aufträge: Zuordnung nur mit Herkunftsnachweis, nie nur Titel (Task 2).
Sommerzeitwechsel und Parallelität: gemeinsames CHF-Tageslimit bleibt korrekt (Task 1/5).
Abgelaufene Zugänge und Prozessabbruch: andere Arbeit läuft weiter; unklare Kosten bleiben reserviert (Task 3/5).

## Task 1: Vollständige Genesis und Kostenobergrenze

**Files:** Modify scripts/founder-worker.mjs, founder-runtime.mjs, founder-mt5.mjs; create scripts/founder-mission.mjs und founder-mission.test.mjs; extend founder-worker.test.mjs. Reuse src/agent/genesis.ts.
**Interfaces:** loadFounderMission() -> {directive,digest,bytes}; createFounderWorker erhält mission zusätzlich zu bisherigen Optionen. Kostenaufnahme erfolgt vor dem Aufruf über den vorhandenen grant.

- [ ] Tests zuerst: eine Genesis über 8 KB erreicht Modellinstruktionen vollständig; fehlende/unlesbare Genesis erzeugt keinen Modellaufruf; untrusted Quellen ersetzen sie nicht; Output und Logs enthalten nur Digest und Größenmetadaten.
- [ ] Tests mit node --import tsx --test scripts/founder-mission.test.mjs scripts/founder-worker.test.mjs ausführen und ursprüngliches Scheitern festhalten.
- [ ] Aus geschützter Konfiguration ausschließlich genesisPrompt lesen; buildGenesisSection/inspectGenesisDelivery wiederverwenden. Eingabeobergrenze und konservativen maximalen Preis gemeinsam berechnen; bei Preis-/Kontextunsicherheit vor Netzaufruf stoppen. Limits nicht erhöhen. Modell-/Preisquelle vor Aktivierung aktuell offiziell prüfen.
- [ ] Tests bestehen lassen; zusätzlich CHF-Limit unter parallelen Reservierungen und Zürcher Tageswechsel prüfen. Geänderte Dateien isoliert prüfen und gezielt committen, sofern der Index keine fremden Änderungen einschließt.

## Task 2: Gemeinsames Auftrags- und Belegjournal

**Files:** Create scripts/founder-orders.mjs und founder-orders.test.mjs; modify founder-operations.mjs und dessen Tests.
**Interfaces:** openFounderOrders(file) -> ingest(evidence), snapshot(), close(). Evidence: {provider,externalId,revision,observedAt,ownOrderId,kind,payload}; kind trennt assignment, delivery, acceptance, compensation, payment, deadline, observation. normalizeOrderReport(report) -> {at,prs,failures}.

- [ ] Tests zuerst: prs/pr_states liefern dasselbe Ergebnis; fehlgeschlagene Abrufe bleiben Fehler; gleiche Revision ist idempotent; fremde Autorenschaft und unbestätigte Zahlung werden nicht übernommen; widersprüchliche Belege bleiben getrennt.
- [ ] Tests ausführen, Fehlschlag bestätigen, SQLite-Journal mit eindeutiger Provider/ID/Revision-Kombination implementieren. Auftragsregister ausschließlich aus geprüften eigenen Einreichungsberichten importieren.
- [ ] Neustarttest und Integritätsprüfung bestehen lassen; keine direkten Mutationen des alten Aufgabenjournals. Auftragsanzeige über den Normalisierer korrigieren.

## Task 3: Direkte Zugänge und lesende Adapter

**Files:** Create scripts/founder-service-access.mjs, founder-service-readers.mjs und zugehörige Tests; modify founder-runtime.mjs.
**Interfaces:** readServiceAccess(provider) -> {available,reason,credential,scope}; createServiceReaders({access,request,now,registry}) -> adapters für github-orders, gmail-orders, calendar-deadlines, amplitude-metrics. credential niemals in snapshot oder Logs.

- [ ] Vor Adapterimplementation aktuelle offizielle API-/OAuth-/Preisbedingungen lesen. Vorhandene Konten lesend über installierte Connectoren ermitteln; noch fehlende Runtime-Zugänge als konkrete Einrichtungsliste festhalten.
- [ ] Tests zuerst: 401 stoppt Adapter; 429 verwendet begrenzte Wiedervorlage; fehlende Freigabe erzeugt keinen Aufruf; nur registrierte eigene GitHub-Aufträge, gewähltes Gmail-Label, Kalender und Amplitude-Projekt werden gelesen; Pagination hat feste Seiten-/Größenlimits.
- [ ] Fehlende DPAPI-gesicherte Dienstzugänge über offiziellen Einrichtungsablauf anfordern. Google-OAuth nur über dafür registrierten Client; persönliche Zustimmung bleibt beim Nutzer. Keine vorhandenen Codex-Sitzungsdaten kopieren.
- [ ] Reader implementieren: normalisierte Evidence aus Task 2, feste erlaubte API-Ziele, keine willkürlichen URLs aus Nachrichten, keine öffentliche Weitergabe privater Inhalte. Rate-Limits und Cursor persistent speichern.
- [ ] Tests bestehen lassen; je tatsächlich freigegebenem Dienst einen begrenzten Leseabruf mit Zeitstempel und redigiertem Nachweis durchführen. Keine Verbindung ohne erfolgreiche Authentifizierung als aktiv melden.

## Task 4: Geprüfte Ergebnisse und Drive-Ablage

**Files:** Create scripts/founder-delivery.mjs und founder-delivery.test.mjs; extend founder-worker.mjs und founder-runtime.mjs.
**Interfaces:** createDeliveryAdapter({access,request,store}) -> budgetfähiger Adapter; prepareDelivery({orderId,resultId,digest,format,content,checks}) -> persistente operationId. Unterstützte Formate: Markdown-Datei, natives Dokument, native Tabelle über jeweils offiziell geprüfte API.

- [ ] Tests zuerst: Ausgabe nur im freigegebenen Ordner; kein automatisches Sharing; fehlerhafte Akzeptanzprüfung verhindert Ablage als geprüft; Timeout nach Schreiben führt zum Abgleich über operationId; mehrfacher Aufruf erstellt nicht mehrfach dieselbe Version.
- [ ] Lokale Versionierung und Validierungsnachweise implementieren. Remote-ID vor Abschluss persistieren; bei unbekanntem Ausgang read-before-retry. Andere Dateien unverändert lassen.
- [ ] Nach Freigabe des Ordners ein klar bezeichnetes Testdokument erstellen, erneut lesen und Inhalt/Version prüfen. Keine automatische Löschung des Testdokuments.

## Task 5: Selbstständige Auswahl, Fortsetzung und Lernen

**Files:** Create scripts/founder-planner.mjs und founder-planner.test.mjs; modify founder-runtime.mjs, founder-knowledge.mjs, founder-controller.mjs, founder-supervisor.mjs und zugehörige Tests.
**Interfaces:** createFounderPlanner({mission,request}) -> budgetfähiger Planner-Adapter; validatePlan({candidates,capabilities,budget,evidence}) -> zulässige Aufgaben oder begründete Wiedervorlage. Kandidaten besitzen evidenceIds, kind, dependencies, rootTaskId, expectedBenefit, uncertainty, maxCostRappen und nextReviewAt.

- [ ] Tests zuerst: leere Liste erzeugt begründete Recherche; Abschluss führt zu nächster Auswahl; Lücke erzeugt begrenzte Recherche; unbelegte Nachfrage wird nicht Auftrag; vier parallele Jobs teilen Limits; fehlender Connector stoppt nicht andere Jobs; gleiche Erkenntnis erzeugt keine Endlosschleife.
- [ ] Genesis aus Task 1 an Modellplaner und Worker geben. Modellvorschläge nur gegen feste Fähigkeits-/Budgetprüfung ausführen; keine vom Modell erteilten Rechte. Kandidaten, Ablehnungen, Kosten und Ergebnisse dauerhaft verbinden.
- [ ] Persistente Wiedervorlage, Kalenderkonflikte, Lernbelege und Erfolgskriterien implementieren. Wissensstatus bleibt reported bis unabhängiger Prüfung; realisierte Zahlung nur mit geeignetem Beleg.
- [ ] Neustart/Prozessabbruch und parallele Reservierungen testen; keine neuen Ausgaben bei unbekanntem vorherigem Ergebnis. Betrieb unabhängig von Codex-Prozess testen; Windows-Neustart/Anmeldung gesondert dokumentieren und nur mit tatsächlich eingerichteter Startmethode als unterstützt ausweisen.

## Task 6: Anzeige, Migration und Abnahme

**Files:** Modify scripts/founder-dashboard.mjs, web/founder/app.js, founder-dashboard.test.mjs; create artifacts/founder-workflow-connectors-20261013/REPORT.md und completion.json.

- [ ] Anzeige für Dienstzugang, letzten erfolgreichen Abruf, Aktualität, blockierte Fähigkeiten, eigene Aufträge, Ergebnisse, Kosten und nächste autonome Arbeit testen. Fehlender Amplitude-Datensatz darf weder null Nutzer noch erfolgreiche Anbindung vortäuschen.
- [ ] Sämtliche Founder-Tests ausführen: node --import tsx --test scripts/founder-*.test.mjs scripts/stripe-account-check.test.mjs. Fehler beheben und passende Prüfungen wiederholen.
- [ ] Unabhängige Codeprüfung nach gewählter Ausführungsmethode; Änderungen mit Spec abgleichen. Vor Übernahme SQLite-Sicherung und Prüfung auf laufende Aufgaben, danach gezielter Dienstneustart.
- [ ] Echte Ende-zu-Ende-Nachweise: Quellenänderung -> eigenes Auftragsjournal -> selbst gewählte Arbeit -> geprüftes Ergebnis -> autorisierte Ablage -> Kostenbeleg -> nächste Entscheidung. Neustart darf keine Doppelarbeit erzeugen. Nicht eingerichtete Dienste ausdrücklich offen lassen.
- [ ] Abschlussbericht mit Testzahlen, Belegen, verbleibenden Nutzerfreigaben und tatsächlichem Autonomieumfang schreiben. Keine Aussage „100 Prozent autonom“, solange notwendige Fähigkeiten fehlen.

## Selbstprüfung und Ausführung

Alle Spec-Bereiche sind Tasks zugeordnet. Die öffentliche GitHub-Anbindung kann unabhängig von Google-/Amplitude-Einrichtung entstehen; personenbezogene Freigaben blockieren nur zugehörige Adapter. Ein erfolgreicher Mocktest ersetzt keinen Live-Nachweis. Der bisherige Code erfüllt Task 1 und Task 5 nicht vollständig.

Empfohlene Methode: Native Umsetzung hier im Chat in der obigen Reihenfolge, anschließend unabhängige Gesamtprüfung. Der Plan wartet auf die durch den writing-plans-Skill verlangte Prüfung und Auswahl der Ausführungsmethode; es wurde noch kein Produktcode für diesen Ausbau geändert.
