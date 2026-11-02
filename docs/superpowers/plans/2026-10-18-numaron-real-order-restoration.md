# Numaron Real Order Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Keine Subagenten ohne ausdrücklich gewählte Ausführungsmethode; bis dahin gilt direkte Umsetzung durch den Hauptagenten als Empfehlung, nicht als erteilte Ausführungswahl.

**Goal:** Den belegten realen Auftragsbetrieb für sämtliche inventarisierten Quellen wiederherstellen und um selbstständige Quellenverknüpfung, Adapterentwicklung, vollständige Bearbeitung und nachweisbare Einreichung erweitern; nur Trades bleiben Demo.

**Architecture:** Vorhandener Quellenmonitor und Founder-Controller teilen ein idempotentes lokales Chancen-/Auftragsregister. Geprüfte Adapter liefern getrennte Fähigkeiten für Lesen, Bewerbung, finanzierte Bearbeitung, Prüfung und Einreichung. Neue Verbindungen entstehen durch einen budgetierten Entwicklungs- und unabhängigen Prüfablauf, nicht durch ungeprüftes Laden von Modellcode in der Produktionslaufzeit.

**Tech Stack:** Vorhandenes Node.js/ESM, TypeScript über tsx, better-sqlite3, node:test, Vitest, bestehendes WSL/Podman-Offlinebackend; keine neue Produktionsabhängigkeit voraussetzen.

**Spec:** `docs/superpowers/specs/2026-10-18-numaron-real-order-restoration-design.md` (von Patrice bestätigt).

**Vollständiger Umfang:** `docs/superpowers/specs/2026-10-18-numaron-source-inventory.json` und `docs/superpowers/plans/2026-10-18-numaron-source-work-packages.json`. Die Matrix enthält nach dem Vierfach-Chatabgleich 256 Beleg-/Arbeitszeilen (einschließlich 35 zusätzlicher historischer Quellen-/Diensthinweise), keine Behauptung von 256 verschiedenen Plattformen. Jede Zeile braucht eine nachvollziehbare kanonische Zuordnung und ein Ergebnis; kein Name darf durch eine verkürzte Kernliste verschwinden.

**Nachtrag von Patrice, 18. Oktober:** Fehlende Adapter soll Numaron selbst zu entwickeln lernen. Task 10 konkretisiert diese Ergänzung zur bestätigten Architektur. Der Plan einschließlich dieses Nachtrags steht vor Umsetzung zur Prüfung.

## Global Constraints

- Numaron bleibt OFF, bis Patrice persönlich den Dashboard-Schalter benutzt. Kein produktiver Start-/Resume-Aufruf, kein externer Quellen-/Providerlauf während OFF.
- CHF 150 innerhalb der bestehenden 30-Tage-Periode, CHF 20 pro Zürcher Kalendertag, CHF 2.50 pro Aufgabenfamilie, maximal vier Worker. Kein zusätzlicher Quellen-/Entwicklungsbudgettopf, keine Budgetreaktivierung.
- Die zehn ungeklärten Reservierungen über insgesamt CHF 5 bleiben gehalten; keine automatische Freigabe oder Wiederholung dieser Aufträge.
- Bestehende Konten, Schlüssel, Quoten, Cursor, Bewerbungen, Einreichungen, Berechtigungen und Preisfristen erhalten. Keine Geheimnisse in Logs, Fixtures, Modellkontext oder Dokumenten.
- Nur Trades Demo. Demoexecutor und Risikogrenzen unverändert; keine Live-Trading-Aktivierung und keine automatische Strategie-Promotion durch diesen Plan.
- Fremder Code ausschließlich im nachgewiesenen Offlinebackend. Produktivdaten werden weder als Testfixture verändert noch in Tests kopiert.
- Jede Mutation vor Ausführung erneut gegen Power, Controller, Quellberechtigung und konkreten Auftrag prüfen. Ein ON beim Start ersetzt diese spätere Prüfung nicht.
- Nicht unterstützte oder extern gesperrte Quellen bleiben im Register mit konkretem Grund. Das ist keine erfolgreiche Wiederherstellung ihrer Ausführung.
- Unverwandte lokale/stagierte Änderungen erhalten. Vor einem Commit ausschließlich eigene Änderungen prüfen und gezielt aufnehmen; keine Sammelcommits mit fremder Arbeit.

## Review Focus

1. Mehrere Plattformen verwenden dieselbe Job-ID oder denselben Titel: niemals fremde Aufträge/Empfänger verschmelzen (Tasks 1–3).
2. Eine Lieferung war erfolgreich, aber die Antwort ging verloren: erst authentisch abgleichen, niemals blind erneut senden (Tasks 4, 6–8).
3. Ein zulässiger öffentlicher Endpunkt leitet intern weiter oder liefert eine manipulierte Folge-URL: kein Zugriff auf lokale/private Adressen oder Weitergabe von Kontodaten (Tasks 5, 9–10).
4. OFF, Rechteentzug oder geänderter Auftrag zwischen Prüfung und Senden: keine externe Aktion mit veraltetem Beleg (Tasks 4–8, 12).
5. Umfangreicher Auftrag oder Adapterentwicklung überschreitet CHF 2.50: keine verdeckte Aufteilung in neue Aufgabenfamilien, kein zusätzlicher Budgettopf (Tasks 4, 6, 10, 12).

## Dateistruktur und Verträge

Neue fokussierte Module unter `scripts/`: `founder-source-registry.mjs` (Quellen/Fähigkeiten), `founder-opportunity-store.mjs` (Funde/eigene Aufträge), `founder-monitor-handoff.mjs` (lokale Übernahme), `founder-order-lifecycle.mjs` (Aktionszustände), `founder-order-delivery.mjs` (Einreichungsjournal), `founder-source-transport.mjs` (begrenzte Verbindung), `founder-adapter-learning.mjs` (Verbindungsentwicklung). Jeweils gleichnamige `.test.mjs`.

Quelladapter: `scripts/order-sources/<sourceId>.mjs` und `<sourceId>.test.mjs`; konkrete vorläufige Pfade für alle zusätzlichen Quellen stehen in der Arbeitsmatrix. Nach belegter Aliasauflösung werden mehrere Zeilen auf denselben Adapter abgebildet, ohne Belege zu verlieren. Bestehende Adapter werden wiederverwendet, nicht daneben dupliziert.

Gemeinsame Begriffe:

- `SourceRecord`: `{id, aliases, kind, provenance, endpoints, capabilities, blockers, reviewedAt, expiresAt}`; `kind` ist `marketplace|index|context|program|specific-order`.
- `Capability`: `read|apply|work|verify|submit|reconcile`; pro Fähigkeit `{state, evidenceRefs, expiresAt, blocker}`. `state` ist `candidate|historical|offline-verified|live-verified|blocked|expired`.
- `Observation`: `{sourceId, externalId, revision, observedAt, evidenceRef, digest, kind, data}`; `kind` ist `listing|own-application|assignment|delivery|acceptance|payment`.
- `OrderKey`: `{sourceId, externalId, ownerId}`; Bewerbungseigentum und Zuteilung kommen aus authentischen Belegen, niemals aus einer Fundseite.
- `ActionContext`: bestehender Controller-Kontext `{task, dependencies, signal, assertActive, grant}`; keine parallele Budgetlogik.
- `Adapter`: `{sourceId, capabilities, read(ctx), apply(order,ctx), prepare(order,ctx), work(prepared,ctx), verify(result,ctx), submit(deliverable,ctx), reconcile(intent,ctx)}`. Nur tatsächlich geprüfte Methoden exportieren; fehlende Fähigkeiten liefern einen typisierten Blocker.
- `Blocker`: `{code, capability, evidenceRefs, nextCheck, requiresHuman}`; keine Credentials oder ungekürzten Anbieterfehlermeldungen.

## Task 1: Inventar verlustfrei kanonisieren und Fähigkeiten registrieren

**Files:** Create `scripts/founder-source-registry.mjs`, `.test.mjs`; read beide Inventardateien; späterer Import in `scripts/founder-runtime.mjs`.

**Interfaces:** `normalizeInventory(inventory, workPackages) -> {sources, mappings}`; `openSourceRegistry(file) -> {import(records,mappings), setCapability(sourceId,capability,evidence), snapshot(now), close()}`. `mappings` ordnet jede Matrix-ID genau einer kanonischen Quelle zu.

- [ ] Tests zuerst: Alle 256 Matrixzeilen bleiben erreichbar; `ArcBounty`/`arcbounty` teilen nach belegter Aliasentscheidung eine Quelle; `OpenBounty` und `Openbounty.ai` bleiben getrennt; ein Index-/Kontexttreffer erteilt nie `submit`. Abgelaufene Evidenz sperrt die betroffene Fähigkeit, nicht unabhängige Quellen.
- [ ] `node --import tsx --test scripts/founder-source-registry.test.mjs`: erwarteter erster Lauf FAIL wegen fehlendem Modul; kleinste Umsetzung mit neuen Tabellen in temporärer DB, danach PASS.
- [ ] Vor Produktionsmigration trockenen Import gegen temporäre DB und Zuordnungsbericht prüfen; Originalinventar und Herkunft unverändert lassen. Eigene Änderungen separat prüfen/committen.

## Task 2: Chancen und eigene Aufträge sauber getrennt speichern

**Files:** Create `scripts/founder-opportunity-store.mjs`, `.test.mjs`; Modify `scripts/founder-orders.mjs`, `scripts/founder-order-registry.mjs`; Test bestehende `.test.mjs`.

**Interfaces:** `openOpportunityStore(file) -> {observe(observation), bindOwner(key,evidence), link(a,b,evidence), pending(), get(key), close()}`. Verwendet `SourceRecord` aus Task 1. Neue Tabellen additiv, vorhandene `own_orders` und Eigentumsregeln nicht pauschal lockern.

- [ ] Tests zuerst: gleicher Titel/ID bei zwei Quellen bleibt getrennt; Fund erzeugt keine eigene Zuteilung; wiederholte Revision ist idempotent; bestehende Bewerbungen/PRs bleiben unverändert; keine fremde Zahlung wird einem eigenen Auftrag zugeordnet.
- [ ] `node --import tsx --test scripts/founder-opportunity-store.test.mjs scripts/founder-orders.test.mjs`: RED -> additive Implementierung -> GREEN.
- [ ] Bestehende GitHub-Eigentumsprüfung `owner==='tricebr'` durch quellspezifische geprüfte Identitätsbindungen ergänzen, nicht durch einen beliebigen Modellwert ersetzen. Migrations-/Integritätsbericht und eigener Commit.
- [ ] Historischen Bestand vollständig gegen `artifacts/chat-handover-20261017/task-register.json` abgleichen: alle 39 Einträge einschließlich zehn ugig-Bewerbungen, Synmerco 129/130/174, überholtem Synmerco 131, acht einzelnen Dealwork-Strängen, GitHub-Threads, Specula-Zahlungsfrage, Scaffold-/Salt-Restumfang, OpenLance-Registrierung und OphirPay 1378 erhalten. Historisch erledigt/überholt/blockiert nicht als neuen Auftrag reaktivieren; die alte Zusammenfassung ersetzt keine aktuelle Zuteilungs- oder Zahlungsevidenz.

## Task 3: Vorhandenen Monitor idempotent an die Arbeitssteuerung anschließen

**Files:** Create `scripts/founder-monitor-handoff.mjs`, `.test.mjs`; Modify `scripts/numaron-monitor.mjs`, `scripts/numaron-monitor-daemon.mjs`, `scripts/founder-runtime.mjs`; Test `scripts/numaron-monitor.test.mjs`, `scripts/founder-runtime.test.mjs`.

**Interfaces:** `publishObservations({state, registry, round}) -> {published, cursor}`; `ingestMonitorObservations({store, observations, assertActive}) -> {inserted, duplicates, rejected}`. Produziert ausschließlich Beobachtungen aus Task 2; Controllerjob-Erzeugung erfolgt in Task 4.

- [ ] Tests zuerst: gleicher abgeschlossener Monitorlauf vor/nach Neustart erzeugt genau einen Fund; beschädigter Digest, Symlink oder unvollständiger Lauf erzeugt keine Zuteilung; zwei Besitzer umgehen die bestehende Lease nicht; bei OFF keine externen Abrufe und keine Auftragsausführung.
- [ ] RED/GREEN mit `node --import tsx --test scripts/founder-monitor-handoff.test.mjs scripts/numaron-monitor.test.mjs scripts/founder-runtime.test.mjs`.
- [ ] Vorhandene Suchcursor und GitHub-Bereichsabdeckung erhalten; kein neuer Timer/Monitor. Handoff besitzt keine Produktions-Startfunktion. Eigener Commit.

## Task 4: Vollständigen echten Auftragslebenszyklus und Aktionsjournal bauen

**Files:** Create `scripts/founder-order-lifecycle.mjs`, `.test.mjs`; Modify `scripts/founder-runtime.mjs`, `scripts/founder-controller.mjs`, `scripts/founder-task-wait.mjs`, `scripts/founder-planner.mjs`.

**Interfaces:** `planOrderActions({order,source,budget,now}) -> Action[]`; `guardOrderAction(action,ctx) -> {allowed,blocker}`; `advanceOrderActions({controller,store,registry})`. `Action` enthält `id,kind,orderKey,rootTaskId,sourceRevision`; mögliche Schritte: `qualify,apply,reconcile-application,prepare,work,verify,submit,reconcile-delivery,acceptance,payment`.

- [ ] Tests zuerst: kostenlose zulässige Bewerbung ohne Escrow erlaubt, Kundenarbeit ohne Zuteilung/Finanzierung gesperrt; OFF direkt vor `submit` verhindert Sendung; fremde/abgelaufene Finanzierungsbelege abgelehnt; alle Schritte behalten dieselbe Aufgabenfamilie und CHF-2.50-Grenze.
- [ ] Tests für fehlende Details: unklarer Lieferumfang löst begrenzte Recherche aus, keine eigenmächtige Verpflichtung. Unbekannter Schreibausgang führt zu Abgleich, nicht generischem Auto-Retry.
- [ ] RED/GREEN: `node --import tsx --test scripts/founder-order-lifecycle.test.mjs scripts/founder-controller.test.mjs scripts/founder-runtime.test.mjs`; vorhandene Planerkinds nur um explizite geprüfte Aktionskinds erweitern. Eigener Commit.

## Task 5: Gemeinsamen begrenzten Quelltransport implementieren

**Files:** Create `scripts/founder-source-transport.mjs`, `.test.mjs`; Modify `src/online/sources.ts` nur an der freigegebenen Adaptergrenze; vorhandene `SOURCE_LIMITS` erhalten.

**Interfaces:** `createSourceTransport({policy,request,resolve,now,isEnabled}) -> {read(path,ctx), mutate(action,path,body,ctx)}`. `policy` stammt aus geprüftem `SourceRecord`, nicht aus Task-/Modelltext. Konkrete Host-/Pfad-/Methodenmengen, Credentialbindung und Größenlimits sind Teil des einzelnen Adaptervertrags.

- [ ] Tests zuerst: localhost/private IPv4/IPv6, DNS-Neuauflösung auf private Adresse, Redirect, URL-Credentials, fremder Host, unendlicher Body, Timeout, 401/429 und OFF verhindern unzulässigen Abruf; Secrets erscheinen weder im Ergebnis noch im Log.
- [ ] RED/GREEN: `node --import tsx --test scripts/founder-source-transport.test.mjs`; keine Ausweitung der globalen Allowlist auf freie Modell-URLs. Die tatsächliche Verbindung muss an die geprüfte Auflösung gebunden sein, nicht nur vorher einen DNS-Check durchführen.
- [ ] Vorhandene Anbieterquoten bleiben gemeinsam wirksam; neue Quellen teilen die vorhandenen Abrufgrenzen. Eigener Commit.

## Task 6: Arbeitsprodukte unabhängig prüfen und genau einmal liefern

**Files:** Create `scripts/founder-order-delivery.mjs`, `.test.mjs`; Modify `scripts/founder-order-code.mjs`, `scripts/founder-code-sandbox.mjs`, `scripts/founder-order-flow.mjs`, `scripts/founder-dealwork-code.mjs`.

**Interfaces:** `verifyDeliverable({order,result,verifier},ctx) -> {passed,digest,evidenceRefs}`; `openDeliveryJournal(file) -> {prepare(key,digest), markSent(id,outcome), reconcile(id,remoteEvidence), snapshot(), close()}`. Typen zunächst `code,structured-data,document`; jeder Typ benötigt einen konkreten unabhängigen Verifier, sonst `unsupported-deliverable`.

- [ ] Tests zuerst: Code-Baseline besteht, neuer Regressionstest scheitert am Original und besteht an Änderung; beschädigtes/unvollständiges Arbeitsprodukt darf nicht eingereicht werden. Dokument-/Datenlieferungen gegen vereinbarte Felder, Quellen und Akzeptanzkriterien prüfen, nicht mit Modellselbstaussage.
- [ ] Timeout nach erfolgreicher Fake-Einreichung plus Neustart: Remote-Abgleich erkennt dieselbe Lieferung; insgesamt nur eine Mutation. Vorhandene Lieferung/Übernahme ist keine Zahlungsbestätigung.
- [ ] RED/GREEN: `node --import tsx --test scripts/founder-order-delivery.test.mjs scripts/founder-order-code.test.mjs scripts/founder-dealwork-code.test.mjs`. Keine automatische Veröffentlichung anderer Dateien oder Daten als der zertifizierten Version; alle Teilaufrufe unter bestehender Familiengrenze. Eigener Commit.
- [ ] Bestehende Lieferbausteine ausdrücklich wiederverwenden: `prepareServiceData` und `prepareSourceReport` aus `src/commerce/service-delivery.ts`, `recordsToCsv` und `documentApi` aus `src/agent/coding-delivery.ts`, `writeNativeOutput` aus `scripts/founder-native-output.mjs` sowie `openFounderDelivery` aus `scripts/founder-delivery.mjs`. Kein Verlust bereits erarbeiteter Datenbereinigung, Quellenberichte, CSV/API-Dokumentation oder nativer Sheets-/Dokumentausgaben. Bestehende Größen-/Datenverträge erhalten; übergroße Lieferungen konkret blockieren oder innerhalb derselben Aufgabenfamilie nachvollziehbar teilen, niemals still kürzen.
- [ ] `runBoundedProductCheck` aus `src/commerce/bounded-product-check.ts` als vorhandene, aber im geprüften Hauptimportgraph nicht angebundene Prüffähigkeit gesondert übernehmen. Nur mit ihrer bestehenden geprüften Laufzeitbindung, Aktionsfreigabe und Budgetreservierung verwenden. Test: fehlende/abweichende Bindung verhindert die Prüfung; eine Quellen- oder Modellantwort kann keine Bindung ersetzen. Keine pauschale Freischaltung dieses Legacy-Pfads.
- [ ] Historische Formatkompatibilität ausdrücklich herstellen. Die aktuelle JS-only-Hülle ist kein vollständiger Ersatz der bereits gelieferten Python-/TypeScript-/Workflow-Aufgaben. Neue Dateien `scripts/founder-work-profiles.mjs` und `.test.mjs`: `selectWorkProfile({order,files,runtimes}) -> {profileId,admittedFiles,blockers}` und `verifyWorkProfile({profileId,binding,files,checks}) -> {passed,evidenceRefs}`. Profile zunächst `node-js`, `python`, `typescript`, `workflow-metadata`, `structured-data`, `source-report`; pro Profil feste Dateitypen, geprüfte unveränderliche Laufzeit und unabhängige Testbefehle. Keine globale Freigabe beliebiger Dateitypen oder Modell-Shellbefehle.
- [ ] Tests zuerst mit minimierten synthetischen Entsprechungen der historischen Lieferformen: `tests/test_config.py`/`requirements.txt`, `scripts/record_wasm_sizes.py`, `src/utils/serialization.test.ts`, `.github/workflows/ci.yml` und JS-Frontendvalidierung. Diese werden vom bestehenden Validator abgewiesen; ein neues Profil darf sie erst nach bestandener Isolation und formatbezogener Prüfung aufnehmen. RED/GREEN: `node --import tsx --test scripts/founder-work-profiles.test.mjs scripts/founder-order-code.test.mjs scripts/founder-code-sandbox.test.mjs` plus profilbezogene isolierte Python-/TypeScript-Prüfungen.
- [ ] `validateCodeFiles`, `applyCodeChanges`, `createOrderGithub.prepare` und `prepareDealworkSource` gemeinsam an Profile binden, damit der neue Umfang nicht vor dem Prüflauf aussortiert wird oder nur im Prompt existiert. Vorhandene Originaltests und Konfiguration bleiben geschützt; ausdrücklich beauftragte Dependency-/Workflow-Änderungen brauchen eigene deterministische Scope-Prüfung. Abhängigkeiten nur aus einem vorab geprüften Offlinebestand, keine jobgesteuerten Downloads oder Installation auf dem Host.
- [ ] Workflowprofile dürfen keine Secretzugriffe, Rechteerweiterungen, Releases, Deployments oder nicht geprüfte Codeausführung einschleusen. Offline-YAML-/Kontraktprüfung ist nicht gleich gehostete CI-Abnahme. Bei Signpost bleiben bisher nicht durchgeführte vollständige Rust-/WASM-Builds als fehlende Prüffähigkeit sichtbar; kein Bedarf darf durch gefälschten grünen Status geschlossen werden.

## Task 7: Acht bestehende Kernquellen wiederherstellen

**Files:** Modify `scripts/numaron-monitor-sources.mjs`, `scripts/founder-order-github.mjs`, `scripts/founder-order-flow.mjs`, `scripts/founder-dealwork-escrow.mjs`, `scripts/founder-dealwork-code.mjs`, `scripts/founder-runtime.mjs`; Create `scripts/order-sources/{ugig,synmerco,guru,gmail,arcbounty,bidpostloop}.mjs` mit gleichnamigen Tests, soweit kein bestehender Adapter diese Fähigkeit bereits erfüllt.

**Interfaces:** Quelladapter implementieren den gemeinsamen `Adapter`-Vertrag. Verbindungen/Fundübergabe aus Tasks 1–5; geprüfte Lieferung aus Task 6.

| Quelle | Konkrete Arbeit und Abnahme |
|---|---|
| GitHub | Vorhandene Suche/Eigentumsbelege übernehmen. Offiziellen quellspezifischen Zuteilungs-/Finanzierungsleser nachprüfen und injizieren, nur wenn wirklich verfügbar. Ohne diesen Leser Suche/Bewerbungsprüfung weiter nutzbar, bezahlte Lieferung sichtbar gesperrt. Fake-Ende-zu-Ende bis genau einem Draft-PR; vorhandene PRs nie erneut erstellen. |
| ugig | Bestehenden DPAPI-Zugang und GET-Monitor erhalten; eigene Bewerbungen/Antworten an Register anbinden. Bewerbungs-/Lieferaktionen nur nach belegtem offiziellen Vertrag ergänzen; vorhandener technisch umfassender Schlüssel allein ist keine neue fachliche Freigabe. Zehn bestehende Bewerbungen bleiben unverändert. |
| Dealwork | Eigene Vertragszuteilung und Escrow an native Arbeits-/Lieferkette binden; `START_WORK`, `DELIVER`, `SUBMIT_WORK` mit vorhandener Mehrdeutigkeitsbehandlung. Kein Übertragen eines nativen Escrows auf beliebige GitHub-Issues. |
| Synmerco | Vorhandene eigene Angebote, Inbox und Escrows übernehmen; nur belegte eigene Zuteilung zum Ausführungspfad führen. Neue Wallet-/Signaturaktionen nicht automatisch zulassen. |
| Guru | Bestehende Browser-/Profilbelege importieren. Offizielle unabhängige API oder bestätigten eingeschränkten Benachrichtigungsweg feststellen; bestehenden Platzhalter erst nach erfolgreicher authentischer Identitäts-/Transportprüfung ersetzen. Falls persönliche Anmeldung fehlt, exakten Schritt anzeigen. |
| Gmail | Bestehendes Konto/Label nutzen, Kundenbezug/Eigentum eindeutig zuordnen. Eingegangene Mail erteilt keine neue Finanz-/Ausführungsberechtigung. Keine Kontobereichsausweitung. |
| ArcBounty / BidPostLoop | Vorhandene Leser in Register/Handoff übernehmen. Offiziellen Bewerbungs-/Liefervertrag prüfen; leere Liste korrekt behandeln. Kein Auftrag, Anspruch oder Zahlung aus Pool-/Creditlabel ableiten. |

- [ ] Je Tabellenzeile zuerst Tests für Fund -> zulässige Bewerbung -> eigene Zuteilung -> Prüfung -> Fake-Einreichung; bei fehlendem Vertrag stattdessen konkreten Blocker testen. Jeder externe Schritt hat OFF-/Identitäts-/Doppelaktionsprüfung.
- [ ] RED/GREEN je Quelle: `node --import tsx --test scripts/order-sources/<sourceId>.test.mjs` plus bestehende betreffende Monitor-/Auftragstests.
- [ ] Quellweise isoliert fertigstellen und eigene Änderungen committen; keine externen Produktivprüfungen während OFF. Kein „alle Quellen funktionieren“, solange eine erforderliche Fähigkeit nicht belegt ist.
- [ ] Historische Synmerco-Lieferformen 129 (Datenbereinigung), 130 (Chicago-Quellenbericht) und 174 (Philadelphia-Quellenbericht) als separate synthetische Vertragsfixtures prüfen. Bereits eingereichte Lieferungen bleiben historische eigene Arbeit und werden nicht erneut versendet. Für neue entsprechende Aufgaben muss der Adapter das geprüfte Arbeitsprodukt im erlaubten Lieferkanal veröffentlichen, Inhaltsdigest und Remote-ID zurücklesen und erst dann die plattformspezifische Einreichung bestätigen. Ein bereitgestellter lokaler Bericht oder Gist allein ist keine bestätigte Plattformeinreichung; bestehende Funding-/Empfängerbindung bleibt Pflicht.
- [ ] Native Nicht-Code-Aufgaben explizit verbinden. `scripts/founder-native-work.mjs` und `.test.mjs` neu: `normalizeNativeWork(binding,sourcePolicy) -> {orderKey,profileId,scopeDigest,inputs,acceptanceCriteria,blockers}`. Der aktuelle `prepareDealworkSource`-Pfad unterstützt ausschließlich exakt delegierte öffentliche JS-Issues; ihn nicht zum universellen Ersatz für CSV-/Dokument-/Rechercheaufträge erklären. Getrennte Profile aus Task 6 übernehmen. Private Kundendaten nur mit ausdrücklich zulässigem Daten-/Modellverwendungsrahmen verarbeiten; keine automatische Weitergabe an OpenAI oder öffentliche Gists. Tests: zusätzliche private Kriterien werden nicht ignoriert, Ausgabe bleibt im erlaubten Kanal, fehlende Einwilligung blockiert nur den betroffenen Verarbeitungsschritt.
- [ ] Nachlauf und Reviewkorrekturen implementieren: neue Dateien `scripts/founder-order-followup.mjs`, `.test.mjs`; `planOrderFollowup({order,remoteEvidence,budget,now}) -> Action[]` an Tasks 3/4 anbinden. Nur authentische auftragsbezogene Änderungsanforderungen in bestehendem Umfang bearbeiten; originalen Root-/Kostenrahmen, eigene PR-/Liefer-ID und unabhängige Prüfung erhalten. Derselbe Auftrag darf weder einen zweiten PR noch automatisch eine neue Budgetfamilie erzeugen. Tests für neue Reviewanforderung, doppelte Nachricht, veralteten/geschlossenen Auftrag, fremden Reviewer, geänderten Umfang, ausgeschöpftes Budget und verlorene Änderungsantwort. Abnahme-/Zahlungsnachfragen nicht automatisch wiederholen; akzeptiert/bezahlt bleiben belegpflichtige eigene Zustände.

## Task 8: Jede weitere inventarisierte Auftragsquelle implementieren

**Files:** Alle `adapterModule`-/`adapterTest`-Pfade der Matrix mit `implementationTask:8`; neue `scripts/order-sources/index.mjs`, `.test.mjs` als explizites Register geprüfter Adapter. Keine freie dynamische Modulpfadangabe aus Modelltext.

**Interfaces:** Gemeinsamer `Adapter`-Vertrag und vorhandener Quelltransport. `loadReviewedAdapters({registry,dependencies}) -> Map<sourceId,Adapter>` lädt ausschließlich freigegebene Module. Aliaszuordnungen aus Task 1 sind verbindlich.

- [ ] Für **jede** Matrixzeile: kanonische Plattform und Primärquelle belegen, offizielle Schnittstelle/aktuelle Bedingungen recherchieren, vorhandenen Zugang feststellen. Historische Endpunkte sind Hinweise, keine aktuelle API-Garantie. Dokumentation erst bei erlaubter externer Recherche prüfen; sonst konkrete ausstehende Prüfung speichern.
- [ ] Für jeden tatsächlich unterstützbaren Adapter einen versionierten, minimierten synthetischen Antwortvertrag plus Parser- und Eigentumstests zuerst schreiben. Indexlabels wie `escrowed` müssen ohne authentischen eigenen Nachweis `funding-unverified` ergeben.
- [ ] RED/GREEN pro `adapterTest`; Reader und zulässige Aktionsmethoden getrennt implementieren. Fehlende Endpunkte, Gebühren, CAPTCHA, erforderliche neue Identität, Vorabzahlung und nicht ausführbare physische Arbeit jeweils mit spezifischem Blocker; kein Umgehen und kein allgemeines Erfolgslabel.
- [ ] Bounded Pagination, Frische, Quoten und deduplizierte Einreichung testen. Quelle mit verschiedenen Fähigkeiten nicht komplett deaktivieren, wenn lediglich die Lieferung fehlt. Pro Quelle/kleiner kohärenter Gruppe eigener Commit.

## Task 9: Kontext-, Programm- und Sekundärquellen zweckgerecht anbinden

**Files:** Matrixzeilen mit `implementationTask:9`, `src/online/source-catalog.ts`, `src/online/source-diversity.ts`, `scripts/founder-discovery.mjs`, `scripts/founder-learning-adapters.mjs`; Tests gleichnamig bzw. `src/__tests__/source-diversity.test.ts`.

**Interfaces:** Diese Adapter liefern `Observation.kind:'listing'` mit `sourceKind` und explizitem `primarySourceId`; sie erteilen keine Auftragseigentümerschaft. Katalogkandidaten durchlaufen Task 8, wenn sie selbst Auftragsanbieter sind.

- [ ] Tests zuerst: Datensatz, Fachartikel, Bug-Bounty-Programm, Ausschreibung und Jobbi-Indexeintrag werden nicht als zugeteilter bezahlter Auftrag verbucht. Programmscope und Teilnahmevoraussetzungen bleiben erhalten; kein Zieltest allein wegen einer Programmfundstelle.
- [ ] RED/GREEN: `node --import tsx --test scripts/founder-discovery.test.mjs scripts/founder-learning-adapters.test.mjs`; `npm test -- --run src/__tests__/source-diversity.test.ts`.
- [ ] Metadata-/Nutzungs-/Aktualitätsbelege erhalten; Quellen werden mit eigenständigem konkretem Kundenbedarf verknüpft. Eigener Commit.

## Task 10: Fehlende Adapter selbstständig entwickeln lernen

**Files:** Create `scripts/founder-adapter-learning.mjs`, `.test.mjs`, `scripts/founder-adapter-certification.mjs`, `.test.mjs`; Modify `scripts/founder-learning.mjs`, `scripts/founder-planner.mjs`, `scripts/founder-runtime.mjs`; reuse `scripts/founder-code-sandbox.mjs` und bestehenden budgetierten Codeworker.

**Interfaces:** `planAdapterWork({source,blocker,capabilities,budget}) -> Action[]`; `certifyAdapter({sourceId,baseDigest,codeDigest,contractTests,transportTests,permissionEvidence}) -> Certificate`; `admitCertifiedAdapter(certificate,registry) -> {admittedCapabilities,blockers}`. Entwicklungsschritte: `research-interface -> specify-contract -> implement-isolated -> test-independent -> certify -> admit-scoped -> observe-result`.

- [ ] Tests zuerst: fehlender Adapter erzeugt einen konkreten Entwicklungsauftrag mit derselben Root-Aufgabenfamilie, belegtem offiziellen Dokumentationsbedarf und messbaren Akzeptanzkriterien; nicht bloß „Adapter fehlt“. Fehlende Kosten-/Zugangsevidenz wird gezielt recherchiert, sofern ON und erlaubter Transport vorhanden.
- [ ] Das Modell implementiert ausschließlich in isoliertem Entwicklungszustand; unabhängige fest registrierte Tests prüfen Transport, Credentialbindung, OFF, Parser, Eigentum, Idempotenz und Mutationsumfang. Selbst erzeugte Tests allein können kein Zertifikat erteilen.
- [ ] Tests: Modellcode darf keine Allowlist, Budgets, Zertifizierer, Powerregeln oder Credential-Speicherung ändern. Nachträglicher Code-/Schemawechsel invalidiert das Zertifikat. Kein Hostimport ungeprüfter Module. Fehlende Test-/Buildabhängigkeiten nicht im Host installieren.
- [ ] Aufnahme vorhandener Adapterfamilien erfolgt nur unter bestehender gültiger Berechtigung; neuer Auth-/Finanz-/Veröffentlichungsumfang bleibt blockiert und nennt die erforderliche menschliche Entscheidung. Kein pauschales `available=true` nach Modellantwort.
- [ ] RED/GREEN: `node --import tsx --test scripts/founder-adapter-learning.test.mjs scripts/founder-adapter-certification.test.mjs scripts/founder-learning.test.mjs scripts/founder-budget.test.mjs`. CHF 2.50 je Familie gilt inklusive Recherche und Entwicklung; bei Erschöpfung Fortschritt sichern, nicht in neue Familien flüchten. Eigener Commit.
- [ ] Vorhandene `taskEducationPlan`/`continuingEducation` aus `src/revenue/continuing-education.ts`, `proactiveResearchAgenda`/`improvementResearchSchedule` aus `src/revenue/proactive-research.ts` und die adaptive Forschung als vorhandene Lern-/Recherchebausteine zuordnen. Lernen beseitigt keine Berechtigungsgrenze und darf weder Budget noch geprüfte Laufzeitbindung selbst bestätigen. Bestehende Tests `src/__tests__/continuing-education.test.ts`, `src/__tests__/proactive-research.test.ts` und `src/__tests__/service-delivery.test.ts` in die Abnahme aufnehmen.

## Task 11: Vollständigen Quellen-/Auftragsstatus im Dashboard anzeigen

**Files:** Modify `scripts/founder-dashboard.mjs`, `scripts/founder-runtime.mjs`, `web/founder/model.mjs`, `web/founder/app.js`, `web/founder/interaction.mjs`; Create `scripts/founder-source-restoration-ui.test.mjs`.

**Interfaces:** `sourceRestorationSnapshot({registry,orders,deliveries}) -> {sources,coverage,orders,blockers}`. Lokaler GET-Status, keine Probe-/Bewerbungs-/Startaktion durch das Lesen der Anzeige.

- [ ] Tests zuerst: alle zugeordneten Inventareinträge sichtbar; Quellen nach Lesen/Bewerbung/Arbeit/Einreichung unterscheiden. „Eingereicht“, „angenommen“ und „bezahlt“ benötigen verschiedene Belege. Historische Erfolge sind als alt erkennbar. Entwickleraufgaben und externe Blockaden mit nächstem Schritt anzeigen.
- [ ] RED/GREEN: `node --import tsx --test scripts/founder-source-restoration-ui.test.mjs scripts/founder-source-overview.test.mjs`; bestehende Bedienung und manuellen Hauptschalter erhalten. Eigener Commit.

## Task 12: Isolierte Gesamtabnahme und Erhalt des bisherigen Betriebs

**Files:** Create `scripts/founder-real-order-e2e.test.mjs`, `scripts/founder-restoration-invariants.test.mjs`; Modify `docs/numaron-independent-operation.md` mit tatsächlich implementiertem Stand.

**Interfaces:** Verwendet ausschließlich zuvor definierte Interfaces mit Fake-Providern und temporären DBs. Produktive Status-/Budgetvergleiche nur lesend.

- [ ] Tests zuerst: zwei reale Auftragstypen synthetisch vollständig bis zur einmaligen Fake-Einreichung abbilden; zwei Plattformen mit identischer ID, Timeout nach Lieferung, Neustart, OFF direkt vor Schreiben, Credentialsentzug, unklare alte Reservierung und ausgeschöpfte CHF-2.50-Familie.
- [ ] Automatischer neuer Quellenfund -> Verknüpfung -> fehlender Adapter -> isolierte Entwicklung -> unabhängige Zertifizierung -> zulässige Fake-Auftragsbearbeitung -> Fake-Lieferung; fehlende persönliche Freigabe stoppt genau die betroffene Fähigkeit.
- [ ] Bestehende Demo-only-Bindung und Schutzregeln unverändert testen; keinen Broker starten. Bestehende Code-/Monitor-/Budgettests und vollständiges `npm test` ausführen. Für die neuen Skripte `node --import tsx --test scripts/founder-real-order-e2e.test.mjs scripts/founder-restoration-invariants.test.mjs` plus jede Adapter-Testdatei der kanonisierten Matrix.
- [ ] Produktionsreservierungen und Budgetdaten vor/nach Wartung vergleichen; zehn ungeklärte Reservierungen/CHF 5 bleiben identisch, Power OFF. Tatsächliche Fehler separat benennen. Nur eigene Änderungen committen.
- [ ] Zusätzlicher Erhaltungsabgleich mit `artifacts/chat-preservation-audit-20261018/`: bestehende eigene GitHub-Lieferungen und Reviewkorrekturen, bekannte ugig-/Dealwork-/Synmerco-Bewerbungen, Zahlungsnachfragen, Quoten/Cursor/Monitorübergabe, Einnahmen-/FX-Abgleich, Dashboard-Anmeldung/Bedienung, Name/Logo/Domains/E-Mail, Forschungsaufzeichnung und Lern-/Priorisierungsreparaturen erhalten. Änderungen nur am Auftragsweg; kein Zurücksetzen dieser unabhängigen Ergebnisse. Für jede betroffene Fähigkeit vorhandene Regressionstests und deren Grenzen aufführen.
- [ ] Vertiefte Einzelzuordnung aus `complete-preservation-register.json` anwenden: jede referenzierte Arbeitseinheit und jeder zusätzlich gefundene Abschluss-/Prüfbericht bekommt einen konkreten Erhaltungseintrag; Hashmanifest `protected-project-files.json` zum Schutz unverwandter Dateien verwenden. Geplante Änderungen benötigen ein begründetes Diff plus passende Regressionsevidenz, kein blindes Zurückspielen historischer Dateien.
- [ ] Bereits bezahlte gespeicherte Ergebnisse und Wiederherstellung erhalten: `scripts/founder-saved-compact-recovery.mjs` und `.test.mjs`, private Aufteilung/Assemblierung und Ergebnisdigests. Keine erneute Providerrechnung für vorhandene gültige Ergebnisse; unbekannte Kosten bleiben reserviert. Zusätzlich `scripts/founder-native-output.test.mjs`, `scripts/founder-order-income-fx.test.mjs`, `scripts/numaron-monitor-overview.test.mjs` und vorhandene Langzeit-/Demo-Regressionen prüfen.
- [ ] Die gespeicherte Entwurfswiederherstellung ist ein separat aufzurufender Schutzpfad, kein aktuell nachgewiesener Hauptimport. Vor einer Controller-Anbindung ihre vollständigen Beleg-, Quellen-, Power- und Auftragstests erhalten. OFF, ungeklärte Reservierung oder fehlender Einzelbeleg verhindern die Anwendung; keine pauschale Rekonstruktion oder Freigabe der CHF 5.
- [ ] Historische Aussagen ohne lokalen Beleg aus `all-final-message-index.json` gesondert behandeln. Kein Beleg aus einem alten Chat wird automatisch zu frischer Abnahme, Zugang oder Ausführungsfreigabe. Neuere direkte Vorgaben (OFF, aktuelle Budgets, Demo-only-Trades) haben Vorrang vor überholten historischen Betriebsanweisungen.
- [ ] Zusätzliche Belege aus allen 208 komprimierten Verlaufseinträgen einschließlich `replacement_history` und `retained_context` sowie der archivierten Projektdatei erhalten. Die daraus ergänzten Einzelpunkte `scripts/founder-research-followup.mjs`, `web/founder/interaction.mjs`, `scripts/founder-order-income.mjs`, `scripts/founder-cost-import.mjs`, `sites/numaron/cloudflare-deployment-status.json` und `artifacts/founder-order-income-usdc-chf.json` nicht durch allgemeine Bereichslabels ersetzen. Dateiexistenz, statischer Importgraph, bestandene isolierte Tests und echte Betriebsabnahme bleiben getrennte Nachweisarten.

## Task 13: Aktivierung vorbereiten und echte Lieferungen nach persönlichem ON abnehmen

**Files:** Create dokumentarisch `artifacts/real-order-restoration-20261018/readiness.json` erst während Umsetzung; Update Quellenfähigkeiten erst durch echte Belege nach persönlichem ON.

**Interfaces:** Readiness `{offlineChecks,sourceCoverage,pendingExternalPrerequisites,power,budgetUnchanged,reservationsUnchanged}`; keine Startfunktion. Jede Quelle erhält `offline-tested|live-verified|externally-blocked|unsupported` je Fähigkeit.

- [ ] Wartungsneustart ausschließlich über vorhandenen OFF-Guard, falls zur Übernahme nötig und freigegeben; kein zweiter Monitor. Nach Neustart OFF und unveränderte Finanzdaten prüfen.
- [ ] Patrice schaltet persönlich ein. Erst dann bestehende reguläre Scheduler für aktuelle Zugangs-/Quellenprüfungen verwenden; keine parallele manuelle Suchrunde. Vorher keine automatische Einschaltempfehlung als Gesamtabnahme ausgeben.
- [ ] Beim ersten geeigneten tatsächlich eigenen, finanzierten Auftrag: bearbeiten, unabhängigen Verifier bestehen lassen, zertifizierte Version über zugelassenen Aktionsadapter einreichen, Remote-ID/Inhaltsdigest authentisch zurücklesen. Der Auftrag bleibt bis zur bestätigten Abnahme/Zahlung in den jeweils richtigen Zuständen. Reviewkorrekturen nur innerhalb des zugeteilten Umfangs und bestehenden Budgets.
- [ ] Quellweise echte Nachweise und verbleibende Blocker berichten. Kein pauschaler Vollständigkeitsclaim bei fehlendem Zugang, nicht existierendem API, unbelegter Finanzierung oder nicht geprüftem Lieferweg. Keine Einkommens-/Profitabilitätsgarantie.

## Abnahmeübersicht und Ausführungsreihenfolge

Reihenfolge: Tasks 1–6 als zusammenhängender Kern; danach Task 7 quellenweise, Tasks 8–9 anhand vollständiger Matrix; Task 10 für neue Verbindungen; Tasks 11–12 vor Freigabe zur produktiven Abnahme; Task 13 ausschließlich nach persönlichem ON. Gemeinsame Verträge werden zuerst stabilisiert, daher direkte Ausführung im bestehenden Chat empfohlen.

Vollständige Bearbeitung und Einreichung sind verbindliche Lieferziele für geeignete bestätigte echte Aufträge. Ein fehlender oder unzugänglicher Anbieter lässt sich nicht durch eine lokale Codeänderung funktionsfähig erklären; solche Quellen bleiben mit konkretem Arbeits-/Zugangsschritt im Umfang. Keine gesamte Quelle stillschweigend streichen, nur weil eine Fähigkeit fehlt.

## Selbstprüfung dieses Plans

- Entwurf abgedeckt: Inventar/Provenienz Tasks 1–2; Monitorübergabe 3; realer Lebenszyklus 4/6/7; Quelltransport 5; alle weiteren Quellen 8/9; neue Verbindungen/Adapterlernen 10; Dashboard 11; Grenzen und Tests 12; produktive Abnahme 13.
- Review Focus jeweils konkreten Tests zugeordnet; Signaturen oben sind die gemeinsame Schnittstelle aller Arbeitspakete.
- Die 256 Matrixzeilen sind ausdrücklich keine aktiven Adapter und keine neuen Berechtigungen. Keine Phase ist bereits als ausgeführt abgehakt.
- Dieser Plan erstellt noch keinen Produktivzugang, startet keine Aufgaben und verändert keine Budgets oder Reservierungen.

## Ergänzung: persönliche Daten und bedingte Auszahlungsangaben

Prüfbeleg: `artifacts/chat-preservation-audit-20261018/personal-data-preservation-audit.json`. Die bisherigen 33 Erhaltungsprüfungen ersetzen diese feldbezogene Prüfung nicht.

- [ ] Tasks 2, 6, 7 und 12 um eine quellenbezogene Datenzuordnung ergänzen: belegter Betreiber-/Profilname, GitHub-Identität, Kontaktkanal, gegebenenfalls rechtlich benötigte Rechnungsdaten, Empfängeradresse samt Netzwerk/Token, Zweck, Herkunft, letzte ausdrückliche Anweisung und erlaubter Sichtbarkeitskanal. Fehlende oder widersprüchliche Felder ausdrücklich offen halten; keine Daten erfinden. Keine Secrets in Arbeitskontext, öffentliche Texte oder Auditkopien übernehmen.
- [ ] Agentenwallet und persönliche Empfängeradresse strikt auseinanderhalten. Lokaler Abgleich: `creatorAddress` entspricht dem Empfänger im Einnahmenprüfer; `walletAddress` ist abweichend. Keine automatische Ersetzung oder Wallet-Neuanlage.
- [ ] Historische GitHub-Anweisung erhalten: USDC-Empfangsadresse auf Base nur bei Bedarf angeben. Specula PR #23 / Kommentar 6226748347 ist eine Vergütungsnachfrage, bei der die Adresse bewusst nicht veröffentlicht wurde. Kein pauschaler Wallet-Fußtext unter allen PRs und kein nachträgliches erneutes Senden bestehender Nachfragen.
- [ ] Vor produktiven Einreichungen die tatsächlich benötigten Daten deterministisch aus einer geprüften Quellenbindung übernehmen. Der jetzige Founder-Missionslader liest nur `genesisPrompt`; die Konfigurationsfelder sind dadurch nicht automatisch als Identitätsdaten verfügbar. Persönliche Angaben nur entsprechend belegter Freigabe und tatsächlichem Bedarf weitergeben.
- [ ] Isolierte Fake-Tests: korrekter Empfänger/Netzwerk/Token; keine Verwechslung mit Agentenwallet; fehlender Bedarf führt zu keiner Wallet-Veröffentlichung; falsches Netzwerk und widersprüchliche Empfänger blockieren den betroffenen Schritt; Kontaktdaten nur im vorgesehenen Kanal; bestehender Kommentar wird nicht erneut gesendet; Aufgaben-/Kosten-/Powerzustand bleiben unverändert. Vollständigkeit erst nach Feldvergleich und Nachweis am tatsächlichen Ausgabepfad bestätigen.

## Ergänzung: sämtliche Versionsvorarbeiten erhalten

- [ ] Task 12 umfasst auch die vollständige lokale Vorarbeit außerhalb bisher verlinkter Chat-Abschlüsse: alle in `artifacts/chat-preservation-audit-20261018/version-preparation-preservation.json` erfassten docs-/sites-/web-Dateien und Artefaktordner. 50 bislang nicht einzeln registrierte Artefaktordner wurden ergänzend ins Erhaltungsregister aufgenommen. Keine Auslassung nur wegen fehlendem Abschlussbericht. Das Register ist eine Erhaltungsvorgabe, keine abgeschlossene Migration.
- [ ] Versionsfamilien getrennt zuordnen: Produkteditionen Personal/Professional/Business, ältere V2-Zweitarifidee, V3-Editionskonzept, spätere Website-/Markenstände und Releases, Founder-/Lern-/Forschungs-/Demotrading-Vorarbeiten. Originale, zugehörige Tests, Nachweise, Einschränkungen und offene Punkte behalten. Überholte Preise und historische Betriebsfreigaben nicht reaktivieren.
- [ ] Persönliche Daten anhand `personal-work-context-field-audit.json` ausdrücklich zuordnen. Sieben konkret verglichene Angaben sind lokal belegt, aber nicht im geladenen Genesis-Text enthalten; separate Adapterprüfungen sind kein allgemeiner Arbeitskontext. Post-/Rechnungsanschrift und vollständige Plattformprofile bleiben bis zum belegten Feldvergleich ungeklärt. Keine pauschale Weitergabe privater Daten an jedes Modell oder jeden Auftrag.
- [ ] Vor Abschluss je Versionsfamilie Bestand, gewählten Zielstand, übernommene Funktion, bewahrte Historie und Testbeleg ausweisen. Eine veraltete Release-Datei oder ein historischer Screenshot bestätigt keinen aktuellen Live-Stand.

## Ergänzung: Websiteinformationen und spätere Weiterarbeit

- [ ] Task 12 erhält auch die Website-Fortsetzung aus `artifacts/chat-preservation-audit-20261018/website-continuation-handoff.json`: bearbeitbare Dateien, Assets, Vorgängervarianten, Editionskonzepte, QA, Domain-/DNSSEC-/Weiterleitungs-/Deploymentbelege und zugehörige Chats. Nicht nur Screenshots oder ZIP-Dateien aufbewahren.
- [ ] Fortsetzung am gewählten bestehenden Website-Quellstand. `design-v3.py` erzeugt laut QA ältere Inhalte; nicht über neuere Varianten laufen lassen. Alte Release-/Domainbelege als datierte Historie erhalten, nicht als frisch geprüften Live-Stand ausgeben.
- [ ] Websitekontakt und spätere Mail-Übergabe auf Widersprüche abgleichen; keine unbekannte Anschrift oder ungeprüfte Erreichbarkeit behaupten. Vorhandene Commerce-/Kunden-/Stripe-/Liefermodule und Tests bei künftiger Produktarbeit wiederverwenden. Statische Vorschau, implementierte Produktfunktion und buchbarer Normalbetrieb getrennt nachweisen.
- [ ] Weitere lokale Websiteentwicklung ist während OFF möglich; dadurch weder Numaron noch Veröffentlichung, Zahlung oder autonome Hintergrundarbeit starten.

## Originalabgleich und wiederhergestellte Vorarbeiten vom 18. Oktober

Verbindlicher Fortsetzungseinstieg: `docs/numaron-continuation-index.json`. Einzelbefunde und offene Voraussetzungen: `artifacts/original-reconciliation-20261018/gap-ledger.json`. Der erneute Originalabgleich ersetzt keine abgeschlossene Implementierung dieses Plans.

- [x] 41 lokale Originalchats erneut vollständig geparst und getrennte Nachrichten-/Kompaktions-/Dateiindizes angelegt. Verfügbare Originalantworten der vier ergänzenden ChatGPT-Chats im Browser nachgelesen; frühere Ladegrenzen und fehlender Anhang bleiben ausgewiesen.
- [x] 43 nur in der Forschungsarbeitskopie vorhandene Originaldateien nach `outputs/adaptive-research` zurückgeholt und Hashgleichheit verifiziert. Altes Wartungspaket nicht eingespielt: 50 Zielstände sind bereits vorhanden, fünf weichen aufgrund späterer Änderungen ab.
- [x] Historischen `scripts/founder-order-runtime.test.mjs` wiederhergestellt und isoliert bestanden. Zwei alte Google-Setupskripte als historische Quellkopien erhalten, nicht ausgeführt.
- [x] Wohnsitz und Steuersitz Schweiz mit genauer Originalreferenz im Fortsetzungskontext aufgenommen. Keine unbekannte Postanschrift, Steuer-ID oder Bankdaten ergänzt. Geschäftskonto ist bereits Bestandteil der Founder-Ergänzungen; Genesis-only-Prüfung durch tatsächlichen Fake-Request-Abgleich präzisiert.
- [x] Masterauftrag zu The $2 Experiment als separates Projekt identifiziert; keine Übernahme seiner Marketing-, Nullkosten- oder Zahlungsregeln als Numaron-Freigaben.
- [ ] Funktionale Restarbeiten und fehlende externe Fakten nach O01–O14 im Gap-Ledger abarbeiten. Insbesondere professionelle Kundenversion, Abonnements und vollständige Auftragsausführung sind durch Erhaltungsnachweise nicht fertig.
