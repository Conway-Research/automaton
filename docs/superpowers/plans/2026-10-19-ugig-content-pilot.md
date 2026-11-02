# uGig Content Praxistest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ausführung hier durch denselben Implementierer; keine automatische Delegation.

**Goal:** Den ausgewählten uGig-Textauftrag nach belegter Beauftragung bearbeiten, unabhängig prüfen und einmalig über den vereinbarten bestehenden Kanal abgeben können.

**Architecture:** Die vorhandenen Marketplace-Verträge, Produkte, Budgetadapter und das Abgabejournal bleiben erhalten. Ein auf diesen Gig beschränkter uGig-Vertrag verbindet frische eigene Plattformbelege mit einer geprüften Vereinbarung. Ein eigenes Content-Profil erzeugt begrenzte Textpakete; eine getrennte, budgetierte Review-Aufgabe liefert einen versionierten Prüfbeleg, den die vorhandene lokale Verifikation konsumiert.

**Tech Stack:** Node.js 22, ESM `.mjs`, vorhandene TypeScript-Module über `tsx`, `better-sqlite3`, `node:test`, bestehender OpenAI-Worker und bestehender geschützter uGig-Zugang. Keine neuen Pakete, Dienste oder Konten.

**Spec:** [Freigegebener Entwurf](../../../artifacts/founder-live-assessment-20261019/ugig-pilot-design.txt). Die Auswahl und Abnahmekette stehen zusätzlich in `artifacts/founder-live-assessment-20261019/pilot-plan.txt`.

## Global Constraints

- „Kundenarbeit beginnt ausschliesslich nach frisch belegter Beauftragung und vereinbarten Bedingungen.“
- „Bestehende Budgets, Zahlungsfreigaben, OFF-Sperren und Abgabejournal bleiben verbindlich.“
- „Keine neue Bewerbung, kein Kundenkontakt und keine Abgabe im Rahmen der Implementierungstests.“
- „Laufender Dienst bleibt eingeschaltet und wird nicht neu gestartet.“
- „Private Kundendaten bleiben fuer den bestehenden oeffentlichen Worker gesperrt; keine stillschweigende Lockerung.“
- „Eine erfolgreiche interne Pruefung ist keine Kundenabnahme.“
- „Keine Annahme serverseitiger Idempotenz ohne Nachweis.“
- „Neue serverseitige Module bleiben bis zu einem separat freigegebenen Wartungsneustart ausstehend.“
- Ziel-Gig ausschließlich `5616dbbb-b147-4bbc-adb9-68bff5d49f89`; vorhandene Budgetfamilie `ugig-158bb18e9f284695093e2d63`, keine neue Budgetfamilie zum Umgehen bestehender Ausgaben.
- Produktionsstart ausschließlich durch Patrice. Kein Test einer ON-Transition mit Produktionsdaten. Temporäre Datenbanken, Fake-Worker und Fake-HTTP verwenden.
- Keine Änderung der vorhandenen Geldlimits oder Workerzahl. Generierung und Review erhalten getrennte Reservierungen von jeweils höchstens 50 Rappen innerhalb der bestehenden Tages-, Perioden- und Auftragsgrenzen. Kein neuer Modellaufruf ohne eigene Reservierung.
- Keine automatischen Qualitätskorrekturschleifen in Version 1: ein Generierungsversuch und ein Review pro vereinbarter Revision. Fehler oder ungeklärte Kosten blockieren; vorhandene Produkte/Prüfbelege werden wiederverwendet. Keine automatischen bezahlten Wiederholungen dieser beiden neuen Worker.
- Keine Produktionsdatenbankmigration oder Änderung gespeicherter Berechtigungen während der Entwicklung. Neue Tabellen entstehen nur in isolierten Tests; Produktionsinitialisierung erst bei später autorisiertem Laden.

## Review Focus

1. Kunde ändert Originalmaterial oder widerruft die Beauftragung während eines Workeraufrufs: unmittelbar vor Speichern und Versand erneut prüfen; siehe Tasks 1, 3, 4.
2. Eine einzelne Quelle enthält widersprüchliche Zahlen, eingebettete Anweisungen oder unzureichende Nutzungsrechte: als Daten behandeln, unbelegte Ausgaben blockieren; siehe Tasks 1–3.
3. Unicode, kombinierte Zeichen, leere Betreffzeilen und Linkvarianten machen ein formal richtiges Paket unbrauchbar: feste Zeichenzählung und explizite Schemas; siehe Task 2.
4. Verkäufernachricht und Intent-Markierung werden vom Kunden zitiert oder derselbe Inhalt erscheint zweimal: Autor, Kanal, vollständigen Inhalt und Eindeutigkeit prüfen; siehe Task 4.
5. Prozessabbruch zwischen Providerantwort, Produktspeicherung und Abgabe: Kosten/Produkt/Review/Journal zuerst abgleichen, keine blinde Neugenerierung oder zweite Nachricht; siehe Tasks 3–6.

## Dateigrenzen und gemeinsame Daten

Neue Dateien:

| Datei | Verantwortung |
|---|---|
| `scripts/founder-ugig-pilot-contract.mjs` + `.test.mjs` | Gig-spezifische Vereinbarung, aktuelle Beauftragungsprüfung und offizielle Lesebelege |
| `scripts/founder-content-package.mjs` + `.test.mjs` | Reine Schema-, Umfangs-, Quellen- und Paketprüfungen |
| `scripts/founder-content-worker.mjs` + `.test.mjs` | Begrenzte Generierung und separater semantischer Review-Adapter |
| `scripts/founder-ugig-pilot-delivery.mjs` + `.test.mjs` | Einmalige Nachrichtenabgabe und exaktes Rücklesen |
| `scripts/founder-ugig-pilot.integration.test.mjs` | Gesamter Ablauf mit echtem lokalen Controller und Fake-Außenwelt |

Gezielte Änderungen: `founder-marketplace-work-source.mjs`, `founder-work-profiles.mjs`, `founder-order-execution.mjs`, `founder-profile-worker.mjs`, `founder-worker.mjs`, `founder-order-lifecycle.mjs`, `founder-order-restoration.mjs`, `founder-production-order-bindings.mjs` und zugehörige Tests. Keine Umstrukturierung anderer Plattformen.

Gemeinsame Begriffe:

- `OrderKey`: vorhandene `{sourceId, externalId, ownerId}`; externe Identität bleibt die registrierte `application:<gigId>`. Die konkrete Bewerbungs-ID wird zusätzlich in der Vereinbarung gebunden, nicht anstelle der bisherigen Identität verwendet.
- `ReviewedPilotAgreement`: vorhandene Marketplace-Bindung plus `gigId`, `applicationId`, `conversationId`, `buyerId`, `agreementEvidence`, `contentBrief`, `paymentAuthorization` oder `funding`. `scopeDigest` umfasst Originalinhalt, vereinbarte Formate, Rechte, KI-Erlaubnis, Preis, Gebühren, Kanal und Abnahme.
- `agreementEvidence`: geprüfte normalisierte Vereinbarung mit referenzierten Kundennachrichten und deren Digests. Nicht aus einem beliebigen Task-JSON, einer eigenen Nachricht oder einem Modell-Boolean als Berechtigung übernehmen. Fehlt die geprüfte Vereinbarung, lautet der Status `agreement-required`; keine Kundenarbeit.
- `ContentBrief`: `{source:{id,text,digest,privacy,reuseAllowed}, language,audience,tone,formats:[{id,kind,count,maxCharacters}],requiredPoints,allowedLinks}`. `kind` ist `social-post`, `email` oder `summary`. Mengen/Sprachen kommen aus der Vereinbarung, keine fest erfundenen Kundenvorgaben.
- `ContentPackage`: `{briefDigest,items:[{id,formatId,kind,subject?,text,evidence:[{sourceId,quote}]}]}`. Quoten belegen Bezug, nicht automatisch die Wahrheit oder inhaltliche Gleichwertigkeit einer Paraphrase.
- `ReviewProof`: `{agreementDigest,packageDigest,reviewRunId,verdict,checks,findings,evidenceRefs,costReceipt}`. `checks` enthält `factuality`, `meaning`, `tone`, `audience`, `completeness`. Nur `verdict:pass`, alle Checks bestanden und keine offenen Befunde erlauben interne Verifikation. Eigenbewertung des Generators ist kein Review.

## Task 1: uGig-Beauftragung und Vereinbarung verbindlich binden

**Files:** Create `scripts/founder-ugig-pilot-contract.mjs`, `scripts/founder-ugig-pilot-contract.test.mjs`; bestehende Marketplace-Checks zunächst unverändert lassen.

**Interfaces:**
- `validatePilotAgreement(agreement) -> {valid, blockers, agreementDigest}`; reine Funktion, kein Netzwerk.
- `createUgigPilotContract({isEnabled, request, credential, getReviewedAgreement, now}) -> {readAssignment(order,ctx), status()}`.
- `readAssignment` liefert genau den frischen Receipt mit `binding`, den `createMarketplaceWorkSource` erwartet; Nachweise maximal 60 Sekunden alt, keine Erweiterung der bisherigen Frischegrenze.
- `getReviewedAgreement(order)` ist ein vertrauenswürdiger Konfigurationsadapter. Default ohne geprüften Datensatz: keine Vereinbarung. Kein Modell darf diesen Adapter oder eine Berechtigungsdatei schreiben.

- [ ] Failing tests anlegen: `pending_never_assigns`, `shortlisted_never_assigns`, `accepted_without_agreement_blocks`, `wrong_buyer_gig_owner_or_application_blocks`, `revoked_or_changed_source_blocks`, `private_or_unlicensed_source_blocks`, `prompt_in_source_grants_no_rights`. Jeweils `assert.equal(workerCalls,0)` und `assert.equal(sendCalls,0)` prüfen. Positivtest verlangt akzeptierte eigene Bewerbung, exakten Gig/Buyer, vollständige Vereinbarung und unveränderte bestehende Zahlungsautorität.
- [ ] `node --require ./scripts/verification-network-guard.cjs --import tsx --test scripts/founder-ugig-pilot-contract.test.mjs` ausführen; zunächst fehlende Implementierung als Fehler erwarten.
- [ ] Funktionen implementieren. Existierende Auth-/Credential-Mechanismen wiederverwenden; nur feste `https://ugig.net`-Routen, Redirects ablehnen, Timeout/Abort und begrenzte Antworten. Offizielle `/api/applications/my`, `/api/gigs/:id` und bestehende Konversationsleser anhand aktueller Antwortschemas abgleichen. Keine Bewerbungsstatusänderung, keine neue Konversation, keine Zahlungsaktion.
- [ ] Vereinbarungsentnahme von Plattformrechten trennen: `accepted` ist notwendig, ersetzt aber weder KI-Erlaubnis noch geprüfte Bedingungen. Bestehende Funding-/CHF1-Postpaid-Policy weder ändern noch SOL als vorhandenes Escrow darstellen. Fehlende Daten bleiben konkrete Blocker.
- [ ] Tests erneut ausführen; alle müssen bestehen. Review-Diff ausschließlich dieser Dateien sichern; keine fremden Änderungen stagen.

## Task 2: Begrenztes Content-Profil und formale Prüfung

**Files:** Create `scripts/founder-content-package.mjs`, `.test.mjs`; Modify `scripts/founder-work-profiles.mjs` und dessen Tests.

**Interfaces:**
- `validateContentBrief(brief) -> {passed,issues,briefDigest}`.
- `checkContentPackage({brief,package:contentPackage}) -> {passed,issues,packageDigest}`.
- `contentPackageFiles(contentPackage) -> [{path:'content-package.json',content}]`; kanonisches JSON, Digest wie vorhandene Produktkonvention.
- Neues Profil `content-repurpose`; ausschließlich `.json`, `.txt`, `.md`, kein ausführbarer Code und kein Sandboxstart für Text.

- [ ] Failing tests: falsche Anzahl/Formate, doppelte IDs, leere/fehlende Email-Betreffzeile, Platzhalter, Duplikate nach Unicode-NFC/Whitespace-Normalisierung, fremde Links, fehlende Kernpunkte und unpassende Zitate. Grenzfälle mit Umlauten, Emoji und kombinierten Zeichen: `Array.from(text.normalize('NFC')).length` ist die festgelegte lokale Zeichenzählung.
- [ ] Testdatei mit dem Netzwerkguard ausführen und beabsichtigte Fehler bestätigen.
- [ ] Reine Funktionen implementieren: höchstens 20 Formatausgaben, Originaltext höchstens 40.000 UTF-8-Bytes, ContentPackage höchstens 16.000 UTF-8-Bytes. Dies sind lokale technische Obergrenzen, keine Kundenanforderungen. Größere vereinbarte Umfänge blockieren statt still kürzen. Keine zusätzlichen Links außerhalb der Vereinbarung.
- [ ] Quellenzitatprüfung als formalen Bezug kennzeichnen. Widersprüchliche oder unbelegte inhaltliche Aussagen nicht allein durch vorhandene Zitate freigeben; dafür Task 3 verlangen.
- [ ] Tests inklusive bestehender Profiltests ausführen. Kontrollieren, dass Code- und Quellenberichtprofile ihre bisherigen Regeln behalten.

## Task 3: Generierung und unabhängigen Review separat budgetieren

**Files:** Create `scripts/founder-content-worker.mjs`, `.test.mjs`; Modify `scripts/founder-worker.mjs`, `scripts/founder-profile-worker.mjs`, `scripts/founder-order-execution.mjs`, `scripts/founder-order-lifecycle.mjs`, `scripts/founder-order-restoration.mjs` und deren Tests.

**Interfaces:**
- `createContentGenerator(options) -> generate(ctx)` mit bestehender Worker-Metadatenkonvention: `maxCostRappen:50`, `providerTracked:true`, `costReceipt` und Provider-Event-Hooks. Ausgabe `{package,costReceipt,providerRunId}`.
- `createContentReviewer(options) -> reviewerAdapter`; neuer Controller-Kind `ugig-content-review`, `maxCostRappen:50`, `providerTracked:true`, `retrySafe:false`, `autoRetrySafe:false`.
- `openOrderExecution` ergänzen um `readContentProduct(order)` und `recordContentReview(order,proof,ctx)`; nur exakt gebundene vorbereitete/gearbeitete Produkte, keine beliebigen Dateipfade.
- `contentReviewTask(order,product) -> task`; stabile ID `content-review-` plus 32 Hexstellen aus OrderKey/Revision/Produktdigest, gleiche `rootTaskId`, Abhängigkeit von der erfolgreichen Work-Aufgabe.
- `advanceOrderActions` erhält optional `dependenciesForAction(action,order) -> string[]`. Nur beim Zielprofil verlangt `verify` die genaue Review-Aufgabe. Bestehende lokale `source-verify` bleibt ohne Modellaufruf und mit Kosten 0; sie konsumiert den gespeicherten ReviewProof.

- [ ] Failing tests: Generator bekommt ausschließlich freigegebene öffentliche Eingaben; Review ist ein eigener Aufruf mit eigenem Run/Receipt; fehlender Review, falscher Produktdigest, boolesche Selbstfreigabe und offene Befunde blockieren. Bei nur 49 Rappen freier Restkapazität startet kein 50-Rappen-Review. Ein Review mit unklarem Provider-Ausgang bleibt reserviert und wird nicht automatisch wiederholt.
- [ ] Failing Lifecycle-Test: Ein gearbeitetes Content-Produkt führt zuerst zur Review-Aufgabe; `source-verify` darf nicht vorher erfolgreich werden. Andere Profile behalten ihre bisherige Reihenfolge und Kosten.
- [ ] Betroffene Tests ausführen; beabsichtigte Fehler protokollieren.
- [ ] Neue Workerzwecke `content-generate` und `content-review` im bestehenden Worker ergänzen. Keine Tools oder fremden Anweisungen aus Quellmaterial. Review erhält Quelle, Vereinbarung und Produkt, aber kein angebliches Qualitätsurteil des Generators. Modellreview ist fehlbar; bei unklarer Bewertung blockieren und nicht Wahrheit behaupten.
- [ ] Speicherschritte und `costReceipt` über die vorhandene Controller-Abrechnung verbinden. Reviewkosten nicht als lokale Nullkosten abrechnen. Direkt vor Speichern Zustand, Revision und Abbruch erneut prüfen. Ein bereits gespeichertes Produkt oder Review wird ohne neuen Modellaufruf wiederverwendet.
- [ ] Erfolgreiche Tests einschließlich Wiederanlauf und Prozessunterbrechung nach Providerantwort nachweisen. Wenn eine Antwort nicht dauerhaft gesichert wurde, keinen kostenlosen oder bezahlten Erfolg erfinden.

## Task 4: Exakte Abgabe im vereinbarten bestehenden Gespräch

**Files:** Create `scripts/founder-ugig-pilot-delivery.mjs`, `.test.mjs`; Modify `scripts/founder-marketplace-work-source.mjs` und dessen Tests nur bei tatsächlich erforderlichen Zusatzbindungen.

**Interfaces:**
- `createUgigPilotDelivery({isEnabled,request,credential,readAssignment,now}) -> {submitDelivery(request,ctx),readDelivery(order,deliveryIntent,ctx)}`; gleiche Hook-Signaturen wie bestehender Marketplace-Vertrag.
- `renderPilotDelivery({agreement,product,deliveryIntent}) -> string`; deterministisch, inklusive Intent und Produktdigest. Kein externer Upload.
- `readDelivery` liefert vorhandene Delivery-Receipt-Struktur mit exaktem OrderKey, Revision, Scope, Root, remoteId, Digest und lokal gespeichertem Belegverweis.

- [ ] Failing tests: fehlende Kanalvereinbarung, Gruppen-/Broadcastgespräch, falscher Buyer/Gig/Sender, Widerruf zwischen Vorbereitung und POST, zu lange Abgabe und falscher Produktdigest führen zu `POST`-Zähler 0.
- [ ] Failing Tests für Timeout nach tatsächlich gespeichertem POST, doppelte Treffer, Zitat des Käufers, unvollständige Pagination und Abbruch vor Rücklesen: kein zweiter POST, kein behaupteter Erfolg.
- [ ] Tests zunächst mit fehlender Implementierung scheitern lassen.
- [ ] Aktuelles offizielles `messageSchema` aus dem uGig-Quellcode prüfen und dessen Grenze als versionierte Konstante samt Quellenreferenz festhalten; lokal zusätzlich höchstens 2.000 Unicode-Codepoints einschließlich Metadaten zulassen. Ein größeres Paket benötigt einen separat vereinbarten unterstützten Weg, keine automatische Aufteilung oder Veröffentlichung.
- [ ] Ausschließlich `POST /api/conversations/:id/messages` an die bereits gebundene Konversation implementieren; feste Origin, keine Redirects, bestehender Key, Abort und begrenzte Antworten. Persistenten Intent des bestehenden Journals verwenden. Kein eigenes zweites Versandjournal und keine Annahme, ein Idempotency-Header werde serverseitig beachtet.
- [ ] `GET` zum Rücklesen mit dokumentierter Cursor-Pagination verwenden, höchstens zehn Seiten à 100 Nachrichten. Nicht vollständig oder nicht eindeutig heißt `unknown`, nicht `unsent`. Exakter eigener Autor plus Gespräch, Intent, Produktdigest und vollständiger Nachrichteninhalt erforderlich. Nachrichten-GET kann Lesebestätigungen ändern; keine Live-GETs als völlig seiteneffektfreie Tests deklarieren.
- [ ] Alle Delivery- und Marketplace-Tests bestehen lassen, insbesondere Journal-Recovery und Revisionsbindung. Erfolgreiches Rücklesen bleibt getrennt von Kundenabnahme/Zahlung.

## Task 5: Sichere Einbindung in den bestehenden Produktionsaufbau

**Files:** Modify `scripts/founder-production-order-bindings.mjs`, `.test.mjs`, `scripts/founder-runtime.mjs`, `scripts/founder-order-restoration.mjs`, `scripts/founder-marketplace-work-source.mjs`, `scripts/founder-order-execution.mjs` und gezielte Tests.

**Interfaces:**
- `createProductionOrderBindings` ergänzt vertrauenswürdige Optionen `ugigPilotAgreementReader` und `ugigPilotAccessReader`; ohne Optionen ergibt sich ein konkreter gesperrter Zustand, kein erfundener Vertrag oder neues Recht.
- Zugangsevidenz ist getrennt von Kundenbeauftragung. `ugigPilotAccessReader` muss Quelle, Konto, Kanal, konkrete geprüfte Operationen und Ablaufzeit belegen. Offline-Tests oder Anzeigen erzeugen niemals Produktionsrechte.
- `productionStatus().marketplaceWork.ugig` ergänzt `pilotStage`, `blockers`, `targetGigId`, `activation:'loaded'|'pending-service-load'`. Status veröffentlicht keine Inhalte, Schlüssel oder privaten Kundeninformationen.

- [ ] Failing Tests: Default ohne Vereinbarung/Zugangsbeleg lässt alle neuen Work-/Submit-Rechte gesperrt; eine normale `pending`-Bewerbung bleibt unverändert. Akzeptierte Bewerbung plus vollständige gültige Nachweise darf nur den Zielauftrag weiterführen, keine anderen uGig-Aufträge oder Plattformen.
- [ ] Failing Test: Abgelaufene globale Quellenfähigkeit oder frischer Widerruf blockiert trotz früherem Produkt/Review. Globale Quellenfähigkeit allein berechtigt keinen fremden Auftrag; per-order Checks bleiben zwingend.
- [ ] Betroffene Tests ausführen, Fehler bestätigen.
- [ ] Bereits vorhandene `marketplaceHooks.ugig` verwenden und Task-1-/Task-4-Hooks sowie Content-Prüfung einbinden. Das bisherige Read/Reconcile-Verhalten für andere Bewerbungen erhalten. `assignmentConfirmed` nur mit der vollständigen vertrauenswürdigen Beauftragungsprüfung liefern; Store-Transition und SourceRevision unverändert binden und bestehende `confirmAssignment`-Prüfungen nicht lockern.
- [ ] Fehlende Vereinbarungen, ungeprüfte Schreibrechte, Zahlungsbedingungen, Datenschutz und Produktqualität jeweils als konkrete Blocker in bestehendem Runtime-Status zeigen. Kein Hot-Reload, keine Aktivierungsdatei mit erweiterten Rechten, keine Produktionszertifizierung durch Fake-Belege.
- [ ] Bereitschaft für Quelltextänderungen und tatsächliches Laden unterscheiden. Änderungen der laufenden Prozessinstanz bleiben ohne Neustart ausstehend; keine Änderung am Power- oder Startverhalten.
- [ ] Produktionsbindings-, Runtime-, Lifecycle- und Marketplace-Regressionen bestehen lassen; noch fehlende Plattformrechte schriftlich festhalten statt `liveReady:true` zu setzen.

## Task 6: Vollständiger isolierter Praxistest und Übergabe

**Files:** Create `scripts/founder-ugig-pilot.integration.test.mjs`; Update `artifacts/founder-live-assessment-20261019/implementation-status.json` und `pilot-plan.txt` nach tatsächlichen Ergebnissen.

**Interfaces:** Vorhandener `openFounderRuntime`/Controller, temporäre Produkte/Budgets/Journal, Fake-uGig-HTTP und zwei getrennte Fake-Modellaufrufe. Synthetischer Auftrag und Inhalte; niemals Produktion für ON-Tests verwenden.

- [ ] Failing Integrationstest als vollständige Kette schreiben: `pending -> bestätigte Beauftragung mit Vereinbarung -> prepare -> work -> ugig-content-review -> verify -> submit -> readback`. Zusätzliche Abnahme und Zahlung im Test nur als getrennte Zustände prüfen, nicht aus Abgabe ableiten.
- [ ] Tests für OFF, Widerruf, Originaltextwechsel, Budgetmangel, Reviewmängel, Teilpagination, Timeout, unbekannte Kosten und Neustart mit gespeichertem Produkt/Review/Intent hinzufügen. Erwartung: kein unautorisierter Worker-/Versandaufruf, genau ein POST im erfolgreichen Fall.
- [ ] Integration zunächst fehlschlagen lassen und dann ausschließlich die benötigten Verbindungen aus Tasks 1–5 vervollständigen.
- [ ] Ausführen: `node --require ./scripts/verification-network-guard.cjs --import tsx --test scripts/founder-ugig-pilot-contract.test.mjs scripts/founder-content-package.test.mjs scripts/founder-content-worker.test.mjs scripts/founder-ugig-pilot-delivery.test.mjs scripts/founder-ugig-pilot.integration.test.mjs`.
- [ ] Danach vorhandene Suites ausführen: `node --require ./scripts/verification-network-guard.cjs --import tsx --test scripts/founder-marketplace-work-source.test.mjs scripts/founder-order-execution.test.mjs scripts/founder-production-order-bindings.test.mjs scripts/founder-runtime.test.mjs scripts/founder-profile-worker.test.mjs scripts/founder-worker.test.mjs`. Bei geänderten TS-Schnittstellen zusätzlich vorhandenen Typecheck ausführen. Erfolg nur bei Exitcode 0 ohne fehlgeschlagene Tests behaupten.
- [ ] Gezielt Quelltextdiff gegen Spec prüfen: kein fehlender Kostenbeleg, keine Lockerung von Zahlungs-/Datenschutzrechten, keine ungebundenen Schreibziele, keine automatischen Neusendungen. Testprotokolle speichern. Nur aufgabenbezogene Änderungen für einen möglichen Commit auswählen; keine fremden WIP-Dateien mitnehmen und keinen Push/PR ableiten.
- [ ] Abschließend ausschließlich lesend den tatsächlichen Powerstatus, Serviceidentität und Budgetlimits prüfen. ON bleibt ON; eigene Prozesse starten/stoppen ist untersagt. Laufende autonome Ausgaben können sich ändern; Limits/Autorisierung statt gesamten laufenden DB-Hash vergleichen.
- [ ] Statusbericht mit `offlineImplemented`, `testsPassed`, `loadedInRunningService:false`, `customerAssignmentConfirmed:false` beziehungsweise den tatsächlich nachgewiesenen Werten erstellen. Kein echter Kunden- oder Versandtest in diesem Auftrag.

## Fertigstellung und spätere Aktivierung

Implementierung gilt als vorbereitet, wenn der isolierte Gesamtablauf samt Negativfällen besteht und keine bestehenden Schutzregeln verändert wurden. Dies ist noch kein Nachweis eines bezahlten Liveauftrags. Beim aktuellen Auftrag erfolgt kein Dienstneustart.

Für spätere Nutzung müssen die neue Version separat autorisiert geladen, die genaue Kundenbeauftragung samt Vereinbarung nachgewiesen und die tatsächlichen Plattformrechte bestätigt werden. Erst danach darf der echte Auftrag beginnen. Kundenabnahme, Zahlung und Gewinn bleiben spätere eigenständige Nachweise.

## Selbstprüfung des Plans

- Spec 1 Beauftragung/Vereinbarung/Identität: Tasks 1 und 5.
- Spec 2 begrenzte Arbeit, Datenschutz und Wiederverwendung: Tasks 2 und 3.
- Spec 3 formale/semantische Prüfung und Budgetnachweis: Tasks 2 und 3; Test der bezahlten Review-Abhängigkeit in Task 6.
- Spec 4 vereinbarter Kanal, Journal, Rücklesen und unbekannter Ausgang: Tasks 4–6.
- Spec 5 Abnahme/Zahlung getrennt: Tasks 4 und 6; bestehende Zahlungspolitik erhalten, keine neue Zahlungsintegration.
- Alle fünf Review-Focus-Fälle besitzen oben benannte Tests. Kein Implementierungsschritt und keine Testausführung ist mit der Erstellung dieses Plans bereits erledigt.
