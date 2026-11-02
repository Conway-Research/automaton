# Numaron adaptive Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Keine Delegation oder Produktionsaktivierung durch dieses Dokument.

**Goal:** Zielgerichtete Forschung mit nachgewiesener Anwendung, Qualitätssteigerung und wirtschaftlich sinnvoller Selbstoptimierung innerhalb bestehender Grenzen.

**Architecture:** Additiver Lernkern unter `src/research/`, angebunden an den vorhandenen Founder-Controller und die bestehende Langzeitforschung. Vorhandene Budgets, Quellen-/Code-Schutzprüfungen, Qualitätsregeln und Optimierungsnachweise wiederverwenden. Änderungen zunächst ausschließlich isoliert vorbereiten.

**Tech Stack:** Bestehendes TypeScript/Node.js, better-sqlite3, Vitest, node:test und vorhandenes Vanilla-JavaScript-Dashboard. Keine neue externe Abhängigkeit oder neuer Anbieter als Voraussetzung.

**Spec:** [Verbindlicher Entwurf](../specs/2026-10-17-numaron-adaptive-research-design.md). Status: zur Dokumentprüfung; Umsetzung noch nicht begonnen. Patrice hat ausdrücklich sowohl Spezifikation als auch Umsetzungsschritte angefordert; dieser Plan wird gemeinsam damit zur Prüfung vorgelegt.

## Global Constraints

- Bestehende ON-Sitzungen nicht stoppen, pausieren, neu starten oder durch einen zweiten produktiven Worker ergänzen. Entwicklungs- und Abnahmearbeit ausschließlich isoliert.
- Keine Produktions-Start-/Resume-Aktion, kein Umschreiben des Power-Zustands. Bei OFF keine Forschung, Anbieterabfrage oder bezahlte AI-Arbeit. Der persönliche Dashboard-Klick bleibt die Startkontrolle.
- Bestehende Founder-Obergrenzen bleiben CHF 150 / 30 Tage, CHF 20 / Zürich-Kalendertag, CHF 2.50 / Aufgabenfamilie und vier Controller-Worker. Tatsächlich verbleibende, niedrigere Limits und alle weiteren einschlägigen Gates haben Vorrang. Keine automatische Verlängerung oder zweite Budgetperiode.
- Keine Produktionsmigration, neue Credentials oder externe Abnahmearbeit. Bestehende Handels-, Kommunikations-, Code- und Freigabegates bleiben erhalten.
- Ein Lernprozess nutzt einen vorhandenen Slot, dieselbe Root-Kostenfamilie und vorhandene Reservierungs-/Settlement-Belege. Keine parallele unabhängige Forschungskapazität.
- Quellen-/Archivgrenzen 100 MiB je Download, 2 GiB gemeinsam berücksichtigtes Rohdatenarchiv, 60 Sekunden Abruf. Ein Lernzyklus höchstens 10 Minuten Auswertung, höchstens eine aktive Familie und ein CPU-intensiver Test gleichzeitig.

## Review Focus

1. Zieländerung während eines Versuchs: frühere Nachweise bleiben historisch; eine veraltete Ziel-/Policyversion darf keine Anwendung freigeben (Tasks 2, 6).
2. Dieselbe Frage mit neu formuliertem Text: Fingerprint/Evidenz verhindern Doppelarbeit und ein Zurücksetzen der Root-Kostenfamilie (Tasks 1, 2, 7).
3. Günstigerer Ansatz mit mehr Nacharbeit oder schlechterer Qualität: Gesamtkosten und Pflichtprüfungen verhindern eine falsche Promotion (Tasks 5, 6).
4. Unklarer Lizenztext, Redirect oder defekter Parser: keine automatische Zulassung, kein privater Zugriff und kein generierter Produktivcode (Task 3).
5. Neustart zwischen Reservierung und Ergebnis: unklare Kosten bleiben gebunden, Trial wird nicht doppelt ausgeführt, kein automatischer Power-Start (Tasks 1, 7).

## Dateien und Zuständigkeiten

Neu: `src/research/{types,store,relevance,sources,experiments,improvement,application}.ts`, `scripts/founder-learning.mjs`, `web/founder/learning.mjs` und zugehörige Tests. Typen/Verträge stehen ausschließlich in `types.ts`; keine konkurrierenden Varianten in den Adaptern.

Gezielt ändern: `src/revenue/long-history/{runner,normalize,types}.ts`, `scripts/founder-{runtime,knowledge,planner,mt5,dashboard}.mjs`, `web/founder/{app.js,long-history.mjs,style.css}` nur an Integrationspunkten. `scripts/founder-budget.mjs`, Powersteuerung und Tradinggates werden nicht funktional erweitert. Keine vollständige Umstrukturierung der großen bestehenden Dateien.

Ausführung bevorzugt in isoliertem Checkout mit den für diese Funktion benötigten bestehenden Änderungen. Die aktuelle Arbeitskopie enthält umfangreiche fremde Änderungen: vorab Basis inventarisieren und gezielt übertragen; nichts zurücksetzen oder pauschal committen. Jeder Commit enthält ausschließlich die expliziten Dateien/Hunks dieser Etappe. Notwendige Basiskonflikte vor Codeänderung klären.

## Verifikation

Neue TS-Tests liegen unter `src/__tests__/adaptive-research-*.test.ts`; isolierte Integrations-/UI-Tests unter `scripts/founder-learning*.test.mjs`. Tests verwenden `os.tmpdir()`/In-Memory-Datenbanken, Fake-Uhr, Fake-Adapter und deterministische Fixtures. Testprozesse bekommen `scripts/verification-network-guard.cjs` über ein nur für diesen Prozess gesetztes `NODE_OPTIONS`; den vorherigen Wert anschließend wiederherstellen. Keine Produktionsverzeichnisse oder Umgebungs-Credentials an Fixtures übergeben.

TS-Kommando je Task: `pnpm exec vitest run src/__tests__/adaptive-research-<task>.test.ts`. Node-Kommando je Task: `node --require ./scripts/verification-network-guard.cjs --test scripts/<test>.mjs`. Vor neuem Code jeweiligen Test ROT prüfen (fehlende Funktion/konkrete Assertion), minimal implementieren, anschließend GRÜN. Parser-/Syntaxfehler sind kein hinreichender roter Verhaltenstest. Nach grünem Task gezielten Diff prüfen und nur dessen Änderungen committen.

### Task 1: Lernverträge und reproduzierbarer Speicher

**Files:** Create `src/research/types.ts`, `src/research/store.ts`; Test `src/__tests__/adaptive-research-store.test.ts`.

**Interfaces:** Definiert sämtliche Typen aus Spec §10 und `openLearningStore({directory:string,clock:()=>number})`. Produziert die dort benannten Record-/Snapshot-/Lease-/Checkpoint-Methoden; typisierter Store-Return ist `LearningStore`. Externe Adapter erhalten IDs/Digests, keine DB-Verbindung.

- [ ] Schema-v1-Tests schreiben: doppelte identische ID idempotent, andere Evidenz bei gleicher ID Fehler, Historie unverändert, beschädigter Digest unbestätigt, Application ohne Result-Referenz abgelehnt, Lease exklusiv und per Fake-Uhr erneuerbar.
- [ ] TS-Kommando für `store` ausführen und erwartete fehlende Store-Implementierung bestätigen.
- [ ] Typen und SQLite-Transaktionen implementieren; alle zehn Tabellen aus Spec §10, Migration ausschließlich beim expliziten Öffnen des übergebenen Test-/später autorisierten Speicherpfads. Snapshot read-only und größenbegrenzt.
- [ ] Checkpoint-/Crash-Tests ergänzen: gespeicherter ungeklärter Kostenbeleg bleibt ungeklärt; Wiederaufnahme vervielfacht keinen Versuch. Tests GRÜN, gezielter Commit.

### Task 2: Zielbezug, Lücken und lernende Priorisierung

**Files:** Create `src/research/relevance.ts`; Test `src/__tests__/adaptive-research-relevance.test.ts`. Modify später nur Übergabepunkte in `scripts/founder-knowledge.mjs` und `founder-planner.mjs` über Task 7.

**Interfaces:** `deriveKnowledgeGaps(observations:LearningObservation[],goals:LearningGoal[]):KnowledgeGap[]`; `rankLearningWork(gaps:KnowledgeGap[],context:LearningContext):LearningDecision[]`. Beide rein; `LearningDecision` enthält eligibility, Teilwerte, Score, Begründung, rootTaskId, nextEligibleAt und Evidence-Fingerprint.

- [ ] Tests schreiben: Zielbeitrag 4/Engpass 4/Informationsgewinn 4/Evidenz 4/Wiederverwendung 4/Kosten 1/Dauer 1 ergibt Score 37; gesperrte Befugnis gewinnt auch mit Score 37 nicht. Veraltetes Wissen, fehlende Fähigkeit und Nacharbeitsfehler erzeugen konkrete unterschiedliche Lücken.
- [ ] Relevance-Test ROT ausführen, dann feste Formel aus Spec §4 implementieren. Höherer Score zuerst, bei Gleichstand ältere unbearbeitete Lücke, danach stabile ID.
- [ ] Tests für identische Evidenz trotz Umformulierung, neue Zielversion, drei erfolglose Versuche → 24 Stunden und neue Evidenz erforderlich; „mehr Forschung“ ohne Anwendungskriterium abweisen.
- [ ] Tests GRÜN und Commit. Meta-Optimierung produziert nur einen Experimentkandidaten; sie verändert keine eigene aktuelle Bewertungsregel.

### Task 3: Kostenlose Quellen entdecken und qualifizieren

**Files:** Create `src/research/sources.ts`; Modify `src/revenue/long-history/normalize.ts`, `types.ts` nur für deklarierte Parser-/Metadatenübergabe; Test `src/__tests__/adaptive-research-sources.test.ts`.

**Interfaces:** `assessSource(candidate:SourceCandidate,evidence:SourceEvidence,purpose:LearningPurpose):SourceAssessment`; `probeSource(candidate:SourceCandidate,adapters:SourceProbeAdapters,signal:AbortSignal):Promise<SourceProbe>`. Adapter kapseln bestehende freie Discovery, geschützten Fetch und deterministische Formatprobe. Keine direkte Nutzung privater Connector-Daten als öffentliche Suchanfrage.

- [ ] Tests schreiben: Originalbedingungen erlauben konkreten Zweck → allowed; nur „free download“ → pending; NC für Geschäftszweck → restricted; fehlender freier Connector → unavailable ohne Ersatzaufruf.
- [ ] ROT ausführen; Originalbeleg-/Formatprüfung und begrenzte Text-/CSV-/JSON-Proben implementieren. Geschützten Transport aus `long-history/download.ts` wiederverwenden; keine Lizenzfreigabe aus Modellbehauptungen.
- [ ] Negativtests: private IPv4/IPv6, öffentliche URL mit privatem Redirect/DNS-Rebinding, riesiges/defektes Archiv, eingebettete Instruktion, erfundene Symbolmetadaten, unbekannter Parser, bereits geprüfter unveränderter Inhalt. Maximal zwei neue Proben pro Zyklus und gemeinsames Bytebudget prüfen.
- [ ] GRÜN, bestehende `long-history-download`, `normalize`, `archive`-Tests ausführen und gezielt committen. Produktionsquellen bleiben unverändert.

### Task 4: Registrierte Versuche und praktische Fähigkeitsnachweise

**Files:** Create `src/research/experiments.ts`; Modify `src/revenue/long-history/runner.ts` für expliziten zulässigen Datensatz-/Experimentpfad; Test `src/__tests__/adaptive-research-experiments.test.ts`.

**Interfaces:** `registerLearningExperiment(input:ExperimentSpec,store:LearningStore):ExperimentSpec`; `assessLearningExperiment(spec:ExperimentSpec,results:ExperimentResult[],replication:ExperimentResult[]):ExperimentAssessment`. `ExperimentAssessment` liefert unsupported/insufficient-evidence/rejected/verified, Gründe und Nachweis-IDs; keine Ausführung oder Befugnisänderung.

- [ ] Tests schreiben: Prüfregeln/Daten nach Registrierung geändert → neuer Versuch erforderlich; unpassende Kursdaten → kein Strategietest; erwartete Datei-/Schema-/Funktionsausgabe wird maschinell geprüft; Selbsteinschätzung reicht nicht.
- [ ] ROT, Register/Prüfung implementieren; vorhandene Strategieauswertung nur für geeignete freigegebene Daten delegieren. Sämtliche negativen und fehlgeschlagenen Resultate speichern.
- [ ] Kontaminierte Zeitabschnitte, fehlende Kosten, unbekannte Preisadjustierung und erfolgreiche Übung ohne Transferprüfung bleiben begrenzt. Daten-/Regelhash bestimmt Identität, kein neuer Erfolg aus neuem Rundenetikett.
- [ ] GRÜN, bestehende `long-history-registry`, `evaluate`, `lessons`, `trading-context`-Tests ausführen und committen.

### Task 5: Effizienz, Qualität, Kreativität und wirtschaftlicher Nutzen

**Files:** Create `src/research/improvement.ts`; Test `src/__tests__/adaptive-research-improvement.test.ts`. Bestehende `src/revenue/optimization-payback.ts`, `optimization-trials.ts`, `src/inference/efficiency.ts` nur lesend als Vorbilder/enge delegierte Prüfer nutzen; keine Aufweichung ihrer Gates.

**Interfaces:** `assessImprovement(spec:ExperimentSpec,baseline:ExperimentResult[],candidate:ExperimentResult[],replication:ExperimentResult[],workload:WorkloadEvidence):ImprovementAssessment`; `selectCreativeCandidate(candidates:CreativeCandidate[],gap:KnowledgeGap):CreativeSelection`. Sämtliche Typen in Task-1-Vertrag ergänzen, falls nötig, bevor Verbraucher geschrieben werden.

- [ ] Tests schreiben: 9 Paare → insufficient-evidence; 10 plus 10 getrennte Replikationsfälle und 10 % geringere Gesamtkosten bei unveränderter bestandener Qualität → Kandidat; billiger mit mehr Nacharbeit/zusätzlichem kritischem Fehler → abgelehnt.
- [ ] ROT, Mess-/Qualitätsvergleich implementieren. P95: sortierte vollständige Dauern, Index `ceil(0.95*n)-1`; fehlende Messungen ergeben keine Zeitverbesserung. Strengere bestehende Fachgates bleiben vorrangig.
- [ ] Tests für unbekannte Kosten, Fremdwährungen ohne Kurs, negative Amortisation, unbelegte Nachfrage/Forecast, selbst vergebene Kreativitätspunkte und bloße Umformulierungen. Höchstens drei unterschiedliche Kandidaten, nur ein ausgewählter aktiver Test.
- [ ] Lernerfolg/Marktnachfrage/Umsatz/Gewinn getrennt projizieren. GRÜN und bestehende Effizienz-/Payback-/Qualitätstests ausführen; Commit.

### Task 6: Anwendung, Wirkungsmessung und Rücknahme

**Files:** Create `src/research/application.ts`; Test `src/__tests__/adaptive-research-application.test.ts`.

**Interfaces:** `assessRecipePromotion(recipe:RecipeRecord,evidence:PromotionEvidence,context:LearningContext):PromotionDecision`; `matchRecipe(task:LearningTask,recipes:RecipeRecord[],context:LearningContext):RecipeRecord|null`; Anwendung über Store-`recordApplication(receipt:ApplicationReceipt)`. `PromotionDecision` = blocked/prepared/eligible plus reasons. Keine neue ausführbare Sprache.

- [ ] Tests schreiben: gültige Replikation + bestehende Befugnis + passende Aufgabe → eligible; geschützte ON-Sitzung/ausstehende Aktivierung → prepared; fehlende aktuelle Ziel-/Policyversion, Rechte oder Budget → blocked.
- [ ] ROT, Rezeptzuordnung für Checklisten, Vorlagen, erlaubte Quellenpräferenz und Abruf-Deduplizierung implementieren. Externe Effekte führt ausschließlich der vorhandene geprüfte Adapter aus.
- [ ] Tests: Wissen ohne Anwendungsevidenz zählt nicht als Anwendung; maximal fünf passende bestehende Aufgaben pro Rollout; fehlgeschlagene Pflichtprüfung entzieht das Rezept für künftige Arbeit, stoppt keine fremde Aufgabe und verändert kein globales Powerflag.
- [ ] Neue Shell-/Plugin-/Routing-/Policyänderung wird nur vorbereitet. Versions-/Outcome-Kette und Wiederverwendung prüfen. GRÜN, Commit.

### Task 7: Gemeinsamer Dispatcher, Budgets und Wiederaufnahme

**Files:** Create `scripts/founder-learning.mjs`; Modify `scripts/founder-runtime.mjs`, `founder-knowledge.mjs`, `founder-planner.mjs`, `founder-mt5.mjs`, `src/revenue/long-history/runner.ts`; Test `scripts/founder-learning.test.mjs`, `scripts/founder-learning-lifecycle.test.mjs`.

**Interfaces:** `createFounderLearning({store,controller,budget,adapters,getContext})` liefert `plan()`, `tick()`, `snapshot()`, `close()`. Context stammt aus vorhandener Power-/Controller-/Budget-/Kapazitätsabfrage. Ein Kontroll-/Reservierungsadapter übergibt neue Lernaufgaben an bestehendes enqueue, keine eigene bezahlte Queue. Lern-/Langzeitauswertung teilen einen vorhandenen Slot und eine Lease.

- [ ] Tests schreiben: OFF/unlesbare Power, Budget inaktiv/abgelaufen/erschöpft, Familienlimit und belegte Slots → null Aufrufe. Auch 0-CHF-Aufgaben dürfen bei OFF keine Provider lesen.
- [ ] ROT, ausschließlich additive Anbindung implementieren. Takt 15 Minuten, eine Familie/CPU-Auswertung gleichzeitig, zwei Proben/drei Ideen, Zehn-Minuten-Auswertung mit Checkpoint; vorhandene engere Grenzen beachten.
- [ ] Fake-Clock-/Crash-Tests: Reserve vor jedem bezahlten Aufruf; Settlement nur Beleg; Eltern-/Kind-/Retry-/Tageswechsel behalten Root-ID; neue Formulierung erneuert Budget nicht; Quelle ohne Änderung keine Doppelarbeit.
- [ ] Bestehende `founder-budget`, `founder-power`, `founder-power-intent`, `founder-maintenance-restart`, `founder-controller`, `founder-runtime`-Tests mit temporären Daten ausführen. Keine Produktivdatei öffnen; nach GRÜN gezielter Commit. Keine Aktivierung.

### Task 8: Research-Lab-Anzeige für Entscheidung, Lernen und Anwendung

**Files:** Create `web/founder/learning.mjs`; Modify `scripts/founder-dashboard.mjs`, `web/founder/app.js`, `long-history.mjs`, `style.css`; Test `scripts/founder-learning-ui.test.mjs`.

**Interfaces:** `renderLearningLab(host:HTMLElement,snapshot:LearningSnapshot,actions:LearningReadActions):void` und gespeicherte Projektion im vorhandenen authentifizierten Snapshot. Neue Lesepfade, falls nötig, folgen dessen Zugriffsschutz; keine neue produktive Steuerungs- oder Resume-API.

- [ ] Tests schreiben: planning/active-wait/blocked/off/unavailable unterscheiden; Quelle lesen ist keine Fähigkeit; verified ohne Application zeigt noch keinen Nutzennachweis; fehlende Zahlen bleiben unbekannt.
- [ ] ROT, kleine Renderfunktion implementieren. Vorhandene Marktgeschichte, Quellen, Berichte, Erkenntnisse und Kontrollen bleiben erreichbar; bestehende Dashboard-Anordnung respektieren.
- [ ] Vollständige DOM-/Tastaturprüfung im isolierten Testserver mit synthetischen Daten, Desktop/Mobil und ohne externen Abruf. Anzeige von Quellenmaterial nur als Text, kein fremdes HTML.
- [ ] GRÜN, Screenshots und HTML-/Kontrollinventar sichern; bestehende UI-/Finanz-/Historytests ausführen. Commit ohne Neustart des aktuellen Diensts.

### Task 9: Ende-zu-Ende-Abnahme und vorbereitete Einführung

**Files:** Create `src/__tests__/adaptive-research-scenarios.test.ts`, `docs/research/adaptive-learning-acceptance.md`; Modify dieses Plans nur für nachgewiesene Checkboxen. Produktive Zustandsdateien bleiben unberührt.

**Interfaces:** Verwendet ausschließlich die APIs Tasks 1–8. Akzeptanzbericht benennt Code-/Policy-/Fixture-Digests, Testkommandos, Ergebnisse, Einschränkungen und ausstehende Aktivierung.

- [ ] Sechs vollständige Szenarien aus Spec §12 als Fake-Adapter-Ketten ausführen; lernen → verifizieren → vorbereitetes Rezept → isolierte Anwendung → Wirkung/Rücknahme nachweisen.
- [ ] Zwei aufeinanderfolgende Takte und simulierten Prozessabbruch ausführen: keine Doppelarbeit, keine Budgetverdoppelung, keine unbelegte Fähigkeit. Ungenügende Evidenz bleibt ungenügend.
- [ ] `pnpm exec tsc --noEmit` sowie gezielte neue und einschlägige bestehende Tests ausführen. Bestehende unabhängige Fehler separat benennen; keine unbeteiligten Änderungen zur bloßen Testbereinigung.
- [ ] Prüfen, dass keine Produktionseinführung, Providerabfrage, Budgetänderung, ON-/OFF-Aktion oder Wartungsunterbrechung stattgefunden hat. Finale gezielte Codeprüfung und Commit der Abnahmeunterlagen.
- [ ] Übergabe mit konkreter Migrations-/Aktivierungsanleitung vorbereiten: schreibgeschützte Bestandsprüfung, konsistentes Backup im später genehmigten Wartungsfenster, additive Schemaanlage, bisherige Quellen/Befunde unverändert, Start nur über menschliche Bedienung. Bei aktiver oder unlesbarer Power verweigert Wartungslauncher die Unterbrechung.

## Fertigstellung versus Aktivierung

Dieser Plan ist mit vollständigen Dokumenten fertig; Software erst nach Task 9 und bestätigten Tests. „Vorbereitet“ bedeutet nicht „läuft produktiv“. Ein späteres OK zur Implementierung erlaubt isolierte Entwicklung, nicht die Unterbrechung einer ON-Sitzung oder den produktiven Start. Die aktuellen Anforderungen an Effizienz, Qualität, Kreativität, wirtschaftliche Fähigkeiten, Zielrelevanz und praktische Anwendung werden durch Tasks 2, 4, 5 und 6 gemeinsam abgedeckt.

## Ausfuehrungsstand 17. Oktober 2026

Lernkern, Relevanzplanung, Quellenpruefung, registrierte Experimente, wirtschaftliche Bewertung, begrenzte Anwendung mit Ruecknahme, additive Laufzeitanbindung und Anzeige sind im isolierten Worktree implementiert. Die Abnahme samt Einschraenkungen und Einfuehrungsschritten steht in `docs/research/adaptive-learning-acceptance.md`; frische Testzahlen und Hashes in `outputs/adaptive-research/verification-results.json`. Die gemischten Test-und-Commit-Checkboxen oben werden nicht pauschal abgehakt: mangels Git-Identitaet wird ein Patch statt eines Commits geliefert. Produktive Migration und Aktivierung sind ausdruecklich nicht ausgefuehrt.
