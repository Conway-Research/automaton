# Numaron: adaptive Forschung, angewandtes Lernen und Selbstoptimierung

Datum: 17.10.2026, Europe/Zurich. Status: konkreter Entwurf zur Dokumentprüfung; keine Implementierung oder Produktionsaktivierung durch dieses Dokument.

## 1. Auftrag und Erfolg

Patrice hat den konzeptionellen Ausbau bestätigt und die konkrete Spezifikation samt Umsetzungsschritten beauftragt. Ergänzungen: Effizienz, Qualitätsmanagement, Kreativität, neue wirtschaftliche Fähigkeiten, Auswahl des wichtigen Wissens und konsequente Anwendung des Gelernten. Ziel ist größtmögliche belegbare Effektivität in allen unterstützten Arbeitsbereichen innerhalb unveränderter Befugnisse und Ressourcen.

Der verbindliche Kreislauf lautet: Ziel verstehen → relevante Wissens-/Fähigkeitslücke erkennen → Nutzen der Untersuchung abschätzen → Quellen prüfen → Hypothese und Prüfung registrieren → lernen/üben → Verbesserung unabhängig prüfen → im zulässigen Umfang anwenden → Wirkung messen → beibehalten, korrigieren oder zurücknehmen. Lesen, Textproduktion und gespeicherte Erkenntniszahlen allein sind kein Erfolg.

Keine Allwissenheits-, Gewinn- oder Geschwindigkeitsgarantie. Höhere Ziele sind Anreiz für bessere Methoden, keine Erlaubnis, Unsicherheit zu verbergen, Prüfungen zu umgehen oder mehr Geld auszugeben. Ein widerlegter Kandidat oder begründetes Nichtstun kann das wirksamste Ergebnis sein.

## 2. Unveränderliche Betriebsbedingungen

- Bestehende ON-Sitzungen nicht stoppen, pausieren, neu starten oder durch einen zweiten produktiven Worker ergänzen. Entwicklungs- und Abnahmearbeit ausschließlich isoliert.
- Keine Produktions-Start-/Resume-Aktion, kein Umschreiben des Power-Zustands. Bei OFF keine Forschung, Anbieterabfrage oder bezahlte AI-Arbeit. Der persönliche Dashboard-Klick bleibt die Startkontrolle.
- Kein Produktionsimport, keine Migration einer geöffneten Produktionsdatenbank und kein Hot-Patching des laufenden Prozesses während der Entwicklung. Aktivierung mit nötiger Unterbrechung erst nach ausdrücklicher späterer Zustimmung; bei unlesbarem Power-Zustand ebenfalls keine Aktivierung.
- Bestehende Founder-Obergrenzen bleiben CHF 150 / 30 Tage, CHF 20 / Zürich-Kalendertag, CHF 2.50 / Aufgabenfamilie und vier Controller-Worker. Tatsächlich verbleibende, niedrigere Limits und alle weiteren einschlägigen Gates haben Vorrang. Keine automatische Verlängerung oder zweite Budgetperiode.
- Bestehende Grenzen für Handel, Kommunikation, Veröffentlichung, Konten, Kundeninformationen, Credentials und Code-Ausführung bleiben bestehen. Kein neuer Anbieter, Account, Key, Kauf oder Datentarif als Nebenwirkung.
- Kostenlose Daten können AI-, CPU-, Speicher- und Übertragungskosten verursachen. Keine unbudgetierten Modellaufrufe und kein kostenpflichtiger Ausweichzugang. Unbekannte Kosten werden nicht als null behandelt.
- Diese Anforderung erweitert das Lab gezielt um Lernfunktionen; die vorherige reine Dashboard-Umordnung bleibt erhalten. Vorhandene Inhalte und Evidenz werden nicht gelöscht oder zu höherer Qualität umetikettiert.

## 3. Bestand und Architekturentscheidung

`src/revenue/long-history/runner.ts` prüft einen festen Quellenkatalog im 15-Minuten-Takt, importiert zugelassene Quellen und überspringt bereits bearbeitete Inhalte. `sources.ts` enthält aktuell drei Quellenvorgaben; ein fehlender Kursadapter lässt sich nicht durch weitere Zinsdaten ersetzen. `lessons.ts` speichert berichtsgebundene Befunde, kein Modelltraining.

Wiederverwendung: `scripts/founder-knowledge.mjs`, `founder-planner.mjs`, `founder-runtime.mjs`, `founder-controller.mjs` und `founder-budget.mjs` für Wissen, Planung, Ausführung und Kosten. Bestehende Qualitäts- und Optimierungssysteme in `src/agent/work-quality.ts`, `src/commerce/`, `src/inference/efficiency.ts` und `src/revenue/optimization-*.ts` bleiben maßgebend. Vorhandene Optimierungsnachweise aus dem Inference-System gelten nicht automatisch für den Founder-Worker.

Ein gemeinsamer, additiver Lernkoordinator verbindet zwei Fachpfade: (a) Daten-/Marktforschung mit vorhandener Langzeitauswertung und (b) wirtschaftliche Fähigkeiten und Arbeitsprozessverbesserung. Gemeinsame Komponenten prüfen Relevanz, Quellen, Evidenz, Kosten und Anwendung. Keine zweite unabhängige autonome Plattform und kein neuer Budget-Controller.

Neue Module liegen unter `src/research/`; die Founder-Anbindung erfolgt durch ein kleines `scripts/founder-learning.mjs`. Die Marktengine behält ihre eigenen Berichte und Rohdaten. Ein neuer separater Lernspeicher verknüpft vorhandene IDs, kopiert aber weder private Rohinhalte noch Buchhaltungen.

## 4. Zielrelevanz und Lernen über das Lernen

Jede Lücke referenziert ein bestehendes Ziel, eine konkret fehlende Fähigkeit und beobachtbare Belege. Eingaben: fehlgeschlagene/teure/langsame Aufgaben, Abnahmefehler, wiederkehrende Nacharbeit, veraltete/widersprochene Erkenntnisse, nicht ausführbare Schritte, belegte Nachfrage und fehlende Prüfdatensätze. Ein Zieltext ist Motivation, kein Beweis für Nachfrage oder erwarteten Gewinn.

Priorisierung nach fünf transparenten Teilwerten von 0 bis 4: Zielbeitrag, Engpassrelevanz, erwarteter Erkenntnisgewinn, Evidenzstärke, Wiederverwendbarkeit. Kosten und erwartete Dauer ebenfalls von 0 bis 4, getrennt mit Rohmessungen/Unsicherheit. Auswahlscore = 3×Zielbeitrag + 3×Engpassrelevanz + 2×Erkenntnisgewinn + Evidenzstärke + Wiederverwendbarkeit − 2×Kosten − Dauer. Das ist eine anfängliche Reihenfolgeregel, keine kalibrierte Erfolgswahrscheinlichkeit. Fehlende Mindestbefugnis, Evidenz oder Kapazität sperrt vor der Bewertung.

Pflicht: Jede Auswahl beantwortet „Welche Zielentscheidung oder Aufgabe kann dieses Wissen verbessern?“, „Woran ist die Verbesserung erkennbar?“ und „Welches andere Lernen wird dafür zurückgestellt?“. Wissen ohne Zielbezug kommt in den Vorschlagsbestand, erzeugt aber keine automatische Abrufkette.

Metaforschung vergleicht Lernwege anhand späterer Anwendung: Kosten und Zeit bis zum bestandenen Fähigkeitsnachweis, Nacharbeitsquote, Wiederverwendung, tatsächliche Zielergebnisse und gescheiterte Versuche. Neue Priorisierungsregeln sind versionierte Experimentkandidaten. Keine Optimierung anhand eigener Zustimmung oder bloßer Aktivitätszahlen; bestehende Erfolgsdefinitionen bleiben für einen Vergleich eingefroren.

## 5. Lern- und Verbesserungsbereiche

| Bereich | Forschungsfrage | Praktischer Nachweis |
|---|---|---|
| Fachwissen/Marktdaten | Welche belegten Daten fehlen für die nächste Frage? | Datenprüfung und reproduzierbarer Test mit dokumentierter Abdeckung |
| Wirtschaftliche Fähigkeiten | Welche ausführbare Leistung löst belegte Nachfrage? | Prüfbare Lieferung an isolierten Aufgaben; Kundennutzen und reale Zahlung separat |
| Effizienz | Welche Methode senkt Gesamtkosten oder Durchlaufzeit? | Vergleich mit gleicher Mindestqualität, inklusive Fehlversuchen und Nacharbeit |
| Qualitätsmanagement | Welche Fehlerursache verhindert ein besseres Ergebnis? | Ursachenbefund, präventive Prüfroutine, verdeckte Regressionstests, weniger Fehler |
| Kreativität | Welche wesentlich andere Lösung könnte besser sein? | Unterschiedliche, nachvollziehbare Ansätze; Machbarkeit und Nutzen an zurückgehaltenen Aufgaben |
| Ziel-/Lernstrategie | Welches Wissen bringt jetzt den größten Fortschritt? | Späterer Anwendungsnutzen statt Anzahl recherchierter Themen |

Wirtschaftliche Erfolge getrennt erfassen: Übung bestanden, lieferfähige Leistung, Nachfragebeleg, Kundenabnahme, bestätigter Erlös, belegte Kosten, Gewinn. Keine Aufträge, Kontakte, Veröffentlichungen oder echten Trades allein aufgrund eines guten Forschungsergebnisses.

## 6. Quellenentdeckung und Aufnahme

Die Lücke erzeugt eine konkrete Suchanfrage. Adapter nutzen zunächst bestehende zugelassene Such-/Lesefähigkeiten oder bereits geprüfte öffentliche Kataloge. Kein unbekannter Fallback; fehlender freier Zugang ergibt `source-discovery-unavailable` mit Wiedervorlage. Neue Domains werden als Kandidaten behandelt und nur über den bestehenden geschützten Transport gelesen.

Pro Kandidat getrennte Entscheidungen: Herkunft/Originalquelle, Nutzungsnachweis für die konkrete geschäftliche Verwendung, kostenloser Zugang ohne neuen Vertrag, Datenformat, Abdeckung, Aktualität und technische Verarbeitbarkeit. Ein Modell darf Nachweise strukturieren, aber die Lizenz nicht durch eine eigene Behauptung freigeben. Zulassung nur anhand archivierter Originalbedingungen und konservativer nachvollziehbarer Regeln; Mehrdeutigkeit bleibt `pending`. Höher riskante oder eingeschränkte Fälle brauchen eine ausdrückliche Entscheidung und bleiben bis dahin außerhalb des Importpfads.

Metadatenprüfung und begrenzte Probe gehen vor großem Download. Für jede Probe: URL, Zeitpunkt, Inhaltshash, Bedingungsnachweis, Zweck, Abdeckungs-/Qualitätsbericht und Adapterversion. HTML/Quelldokumente sind untrusted Daten. Keine Befolgung eingebetteter Handlungsanweisungen, Skriptausführung, private Netzadressen, Weiterleitungsumgehung oder Datenübertragung aus privaten Arbeitsräumen. Der Schutz aus `long-history/download.ts` wird wiederverwendet, nicht abgeschwächt.

Generische v1-Adapter: UTF-8-Text und deklarierte CSV-/JSON-Tabellen; für Kursdaten nur mit eindeutigem Instrument, Zeitzone, Einheit und dokumentierten Preis-/Anpassungsmerkmalen. Fehlender geeigneter Adapter wird zur konkreten Fähigkeitslücke. Beliebiger vom Modell erzeugter Parser-/Strategiecode wird nicht im Produktivprozess geladen.

## 7. Experimente, Strategieprüfung und Qualitätsoptimierung

Vor der Ausführung werden Frage, Baseline, Kandidat, Prüfdaten, Qualitätsregeln, Messgrößen, Kosten-/Zeitmaximum, Stoppregel und Mindestverbesserung registriert. Änderungen an Regeln erzeugen einen neuen Versuch, bleiben derselben Aufgabenfamilie zugeordnet und machen bekannte Prüfdaten nicht wieder unabhängig.

Marktforschung: vorhandene Regeln für chronologische Splits, kontaminierte Prüfabschnitte, sämtliche Varianten, Modell-/Stresskosten, ungeklärte Positionen und Datenlücken übernehmen. Keine positive Handelseinstufung ohne geeignete Produktdaten und Kostenumfang; Forschung verändert keine Tradingfreigabe.

Fähigkeiten/Qualität: Baseline und Kandidat bearbeiten dieselben Entwicklungsfälle; getrennte zurückgehaltene Fälle werden erst nach Fixierung des Kandidaten ausgewertet. Jede Sammlung hat Fall-IDs, Herkunft, Prüffunktion und Digest. Bestehende maschinenprüfbare Qualitätsgates sind obligatorisch. Subjektive Kreativitäts-/Textbewertungen können Hinweise liefern, aber allein keinen Status `verified` oder eine produktive Einführung begründen.

Effizienz/Qualität: mindestens 10 vollständige gepaarte Fälle und anschließend 10 getrennte Replikationsfälle für eine automatische Empfehlung; zu kleine Bestände bleiben `insufficient-evidence`. Alle vorhandenen Qualitäts-/Sicherheitsgates müssen bestehen. Im Vergleich kein zusätzlicher kritischer Fehler, keine schlechtere bestandene Fallquote; mindestens eine vorregistrierte Verbesserung von 10 % bei Gesamtkosten oder p95-Durchlaufzeit oder mindestens ein zusätzlich bestandener Qualitätsfall ohne Verschlechterung der anderen bestätigten Kriterien. Das sind Start-Abnahmeregeln, keine statistische Garantie; Unsicherheit, kleine Stichprobe und Feldbestätigung bleiben sichtbar.

Gesamtkosten enthalten Recherche, Entwicklung, Baseline/Kandidat, Fehlläufe, Prüfung, wiederholte Modellaufrufe und Nacharbeit ohne Doppelzählung. Kosten nach ursprünglicher Währung getrennt; Umrechnung nur mit datiertem belegtem Kurs. Fehlende Kosten-/Zeitwerte verhindern eine entsprechende Verbesserungsaussage. Einsparung nach Einführungsaufwand und plausibler verbleibender Nutzung muss positiv sein. Wo anwendbar gilt `assessOptimizationPayback`; seine USD-Nachweise werden nicht als CHF-Budgetbeleg umgedeutet.

Kreativität: höchstens drei wesentlich verschiedene Kandidaten je Lücke, mit Herkunft der Idee, Unterschied zur Baseline, Annahmen und Widerlegungskriterium. Oberflächliche Umformulierungen zählen nicht als neue Methode. Ein Kandidat wird getestet; weitere Kandidaten warten auf Budget und eine begründete Auswahl.

## 8. Vom Wissen zur wirksamen Anwendung

Wissen: `reported → corroborated → test-supported → application-supported`, alternativ `contradicted`, `expired`. Befähigung: `proposed → practicing → verified → applicable → regressed`. Eine Quellenzusammenfassung ist kein bestandener Fähigkeitsnachweis.

Jede verwertbare Erkenntnis enthält einen Anwendungskontrakt: auslösender Aufgabentyp, Voraussetzungen, Handlungsschritte, Prüfroutine, Abbruchbedingungen, Grenzen, Evidenz-IDs, Version, Gültigkeit und Rücknahmeversion. `recordApplication` verknüpft konkrete Aufgabe, verwendete Version, Prüfergebnis, Kosten, Dauer und späteres Outcome. Kein Anwendungserfolg ohne Ausführungsnachweis.

Automatische Anwendung v1 ist auf deklarative, schema-validierte Arbeitsrezepte innerhalb bereits vorhandener Adapter beschränkt: passende Checkliste, geprüfte wiederverwendbare Vorlage, Abruf-Deduplizierung oder belegte Quellenpräferenz. Task-Text kann Anforderungen ergänzen, aber niemals Sicherheits-/Budgetregeln oder bestehende Pflichtprüfungen überschreiben. Keine beliebigen Plugins, Shellbefehle, Agenten, Accounts oder selbstgeschriebenen Produktionsmodule.

Promotion: `verified` und passende Replikation, Kosten-/Qualitätsbedingungen erfüllt, identischer erlaubter Aufgabenumfang, aktuelle Befugnis, freie Kapazität, kein neuer Datenempfänger. Danach begrenzter Versuch für höchstens fünf passende Aufgaben, nicht für fünf unbudgetierte Zusatzaufgaben. Jede Aufgabe behält sämtliche bestehenden Gates und ihr Root-Budget. Eine fehlgeschlagene Pflichtprüfung nimmt die Rezeptzuordnung für künftige Aufgaben zurück; der globale Controller und fremde laufende Aufgaben werden nicht gestoppt.

Während der ausdrücklich geschützten aktuellen ON-Sitzung bleiben auch neue produktive Rezeptzuordnungen vorbereitet. Nach einer später autorisierten Aktivierung darf der bestehende Dispatcher verifizierte Rezepte für neu beginnende passende Aufgaben anwenden. Code-, Modellrouting- und Infrastrukturänderungen werden als geprüfte Vorschläge bereitgestellt; bestehende engere Rollout-Gates gelten weiter. Selbstoptimierung ist damit praktisch, aber keine unbegrenzte Selbsterweiterungsberechtigung.

## 9. Grenzen, Terminierung und Wirtschaftlichkeit des Lernens

Lernkoordinator höchstens alle 15 Minuten; zwischen Zyklen kein Polling. Reine Planung ist lokal/deterministisch. Eine aktive Lernaufgabenfamilie gleichzeitig; sie belegt einen vorhandenen Controller-Slot. Bis zu zwei neue Quellenproben und drei Ideenkandidaten je Zyklus, maximal eine Experimentausführung gleichzeitig. Keine Erhöhung der bestehenden Quellen-/Archivgrenzen: 100 MiB je Download, 2 GiB Rohdatenarchiv, 60 Sekunden je Abruf; das Lab muss verbleibenden Platz mitberücksichtigen. Ein Lernzyklus nutzt höchstens 10 Minuten lokale Auswertung innerhalb des bestehenden Sechs-Stunden-Rundenlimits; längere Arbeit wird gespeichert und später fortgesetzt.

Der bisherige Langzeitworker und der Lernworker teilen einen Kapazitätsnachweis; keine parallelen CPU-intensiven Tests außerhalb eines vorhandenen Slots. Capability-Prüfung für jeden voraussichtlich bezahlten Schritt; Reserve vor Aufruf, Settlement aus tatsächlichem Beleg. Alle Kinder, Methodenwechsel und Wiederholungen behalten `rootTaskId`; Tages- oder Zykluswechsel setzt die Kostenfamilie nicht zurück. Weniger als benötigte Kapazität ergibt `waiting-budget`, keine neue Familie zur Umgehung.

Quellenrevision, Ziel und Lücke bilden stabile Fingerprints. Keine erneute Untersuchung identischer Evidenz. Nach drei erfolglosen Versuchen pro unveränderter Lücke mindestens 24 Stunden Cooldown; ohne neue Evidenz keine automatische Wiederholung danach. HTTP-Fehler: vorhandenes Retry-After und längere Anbieterlimits haben Vorrang. Lizenz- und Qualitätsmängel brauchen geänderte Evidenz, keine blinde Zeitwiederholung.

Vor jeder Untersuchung erwarteten Nutzen, Gesamtkostenobergrenze und Abbruchgrund speichern. Forschung über Forschung nutzt denselben Slot und dieselbe Budgetfamilie. Gute bestehende Methoden werden wiederverwendet; ein erreichter stabiler Zustand ist zulässiger Fortschritt, kein Zwang zur Änderung.

## 10. Datenvertrag und Schnittstellen

Neuer Speicher `artifacts/numaron-learning/learning.db`, Schema v1, während Entwicklung ausschließlich temporäre Testverzeichnisse. Tabellen: `learning_goals`, `learning_gaps`, `learning_sources`, `learning_experiments`, `learning_cases`, `learning_skills`, `learning_recipes`, `learning_applications`, `learning_events`, `learning_leases`. Artefakte referenzieren vorhandene Forschungs-/Kostenbelege und unveränderliche Digests. Kein zweites Finanzjournal.

`src/research/types.ts` definiert `LearningContext` (now, powerEnabled, controllerRunning, availableSlots, budgetRemainingRappen, dayRemainingRappen, rootRemainingRappen, limitsDigest, policyDigest), `KnowledgeGap`, `SourceCandidate`, `ExperimentSpec`, `ExperimentResult`, `SkillRecord`, `RecipeRecord`, `ApplicationReceipt`, `LearningSnapshot`. Alle Datensätze: schemaVersion, ID, Zeit, Herkunfts-IDs; Experimente zusätzlich rootTaskId, goalId, gapId, Baseline/Kandidat-/Prüfdigests, Status und Limitsnapshot. Geld als ganzzahlige Beträge mit Währung; unbekannt explizit null.

Vorgesehene öffentliche APIs:

- `openLearningStore({directory, clock})`: idempotente Einfügungen und versionierte Änderungen, `snapshot()`, `recordGap`, `recordSource`, `registerExperiment`, `recordResult`, `recordSkill`, `recordRecipe`, `recordApplication`, Lease-/Checkpoint-Operationen, `close()`; bei Konflikt gleicher ID/anderer Evidenz Fehler.
- `deriveKnowledgeGaps(observations, goals)` und `rankLearningWork(gaps, context)` sind reine Funktionen; Ergebnis enthält Teilwerte, Begründung, ausgeschlossene Alternativen und Sperrgründe.
- `assessSource(candidate, evidence, purpose)` und `probeSource(candidate, adapters, signal)` liefern Zulassungs-/Qualitätsentscheidungen ohne selbst einen Produktionsimport auszulösen.
- `registerLearningExperiment(input, store)` friert Prüfregeln ein; `assessLearningExperiment(spec, results, replication)` entscheidet ausschließlich anhand Nachweisen.
- `assessRecipePromotion(recipe, evidence, context)` liefert `blocked | prepared | eligible` mit Gründen; `recordApplication` benötigt Ausführungs-/Prüfnachweis.
- `createFounderLearning({store, controller, budget, adapters, getContext})`: `plan()`, `tick()`, `snapshot()`, `close()`; keine eigene Start-/Resume-API. Ein produktiver Tick wird ausschließlich vom bestehenden befugten Laufpfad angestoßen.

Events und Snapshot enthalten keine Credentials, Prompts, Kundendokumente oder fremde private Aufgaben. Belege nur als begrenzte freigegebene Referenzen. Defekte/fehlende Referenzen ergeben unbestätigt und keinen Erfolg. Audit wächst begrenzt; Archiv voll ergibt Wartezustand, kein automatisches Löschen von Nachweisen.

## 11. Dashboard und ehrliche Fortschrittsanzeige

Das bestehende Research Lab bekommt die gemeinsame Lernübersicht; vorhandene Marktgeschichte bleibt ein Fachbereich. Anzeige: aktuelles Ziel, priorisierte Lücke mit Begründung, Tätigkeit, letzter abgeschlossener Schritt, nächster geplanter Schritt, Datenstand, Fähigkeiten/Rezepte, Prüfung, tatsächliche Anwendungen und deren Nutzen. Bestehende Quellen, Berichte, Erkenntnisse, Grenzen und Bedienelemente bleiben erreichbar.

Status klar unterscheiden: `planning`, `discovering`, `checking-source`, `practicing`, `evaluating`, `prepared-for-application`, `applying`, `measuring`, `waiting-data`, `waiting-evidence`, `waiting-budget`, `waiting-capacity`, `cooldown`, `powered-off`, `unavailable`. „Forschung aktiv“ ohne konkrete Aktivität genügt nicht. Fortschritt nicht als Allwissenheitsprozent darstellen.

Reine Anzeige liest gespeicherte Projektionen. Sie startet keine Lernaufgaben oder externen Kostenabrufe. Ein erfolgreicher Dashboard-Neuladevorgang ist keine Aktivierung des neuen Backends.

## 12. Abnahme und Einführung

Offline-Szenarien mit Fakes: (1) fehlende geeignete Kurse → kostenlose Quelle entdecken → Qualität prüfen → registrierter Strategietest → begrenzter Befund; (2) fehlerhafte Datenlieferung → Wissenslücke → Übung → verdeckter Qualitätsnachweis → vorbereitetes Rezept → isolierte Anwendung und Messung; (3) teurer/langsamer Prozess → gepaarter Vergleich → Replikation → Amortisation oder Ablehnung; (4) kreative Alternativen → eine begründete Auswahl ohne Bevorzugung eigener Scores; (5) geändertes Ziel oder negative Anwendung → Repriorisierung/Widerruf; (6) keine neue Evidenz → kein wiederholter Aufwand.

Pflicht-Negativfälle: OFF/unlesbare Power, Budget abgelaufen/erschöpft, Familienlimit, unklare Lizenz, private/umgeleitete URL, bösartige Quellanweisung, fehlender Adapter, beschädigtes Artefakt, kontaminierter Test, unbekannte Kosten, Qualität schlechter trotz Kostenersparnis, Prozessabbruch und Wiederaufnahme. Kein externer Testaufruf und keine Produktions-Credentials.

Erfolg: jede Zustandsänderung reproduzierbar; gleiche Eingaben erzeugen keine Doppelarbeit; Lücken werden priorisiert; nachweislich ungeeignete Quellen/Kandidaten bleiben abgelehnt; gültige Rezepte verbessern isolierte Aufgaben; regressierende Rezepte werden für künftige Aufgaben zurückgenommen. Bestehende Budget-/Power-/Tradingtests bestehen unverändert.

Lieferung in vier Etappen: Lernkern, Quellen-/Experimentpfade, angewandte Qualitäts-/Effizienzoptimierung, Integration/Anzeige. Jede Etappe endet mit isolierter Abnahme. Produktionsmigration, Start und Rollout bilden einen getrennten späteren Vorgang. Es wird kein laufender Dienst zu Wartungszwecken beendet.

Regelmaessige Selbstpruefung (Patrice): "Wie kann ich besser werden?" Bei jedem zugelassenen Forschungszyklus Ergebnisse, Fehler, Aufwand und Engpaesse auswerten, den wirksamsten Verbesserungstest priorisieren, gegen die bisherige Methode pruefen und die Anwendung erneut messen. Bestehende Taktung, Budgets, Freigaben und manuelle Einschaltkontrolle gelten; OFF startet keinerlei Hintergrundarbeit. Isoliert vorbereitet, nicht aktiviert.

## Implementierte Ergaenzungen vom 17. Oktober 2026

Alle 25 Katalogeintraege einschliesslich Boersenwissen, neuer Vorgehensweisen und Geschaeftszweige sind im Abnahmebericht `docs/research/adaptive-learning-acceptance.md` abgebildet. Chancen werden als Hypothesen mit Quellenbezug erfasst und im vorhandenen budgetierten Planer vertieft. Jeder dritte zulaessige Lernauftrag bevorzugt offene Erkundung. Die taegliche lokale Selbstpruefung erhaelt einen neuen Evidenzstand bei gleichbleibender Root-Familie. Bestehende Providerquoten und Ablaufdaten gelten auch fuer die Discovery-Suche; Cooldowns verbrauchen keine Themenversuche. Der Standardpfad registriert eine reale Integritaetsverbesserung gegen den bisherigen Connector-Pruefer und protokolliert deren tatsaechliche Anwendung. Fachmethoden ohne unabhaengigen Pruefer bleiben unbestaetigt. Keine produktive Aktivierung.
