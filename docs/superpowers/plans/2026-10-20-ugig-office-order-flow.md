# uGig-Office-Auftragsablauf — Implementierungsplan

> **Für ausführende Agenten:** Erforderlicher Folge-Skill: `superpowers:executing-plans` für Umsetzung in dieser Sitzung oder `superpowers:subagent-driven-development` bei ausdrücklich gewählter Delegation. Aufgaben einzeln bearbeiten; Fortschritt mit den Kontrollkästchen dokumentieren. Vor Beginn Planprüfung und Wahl der Ausführungsmethode durch Patrice abwarten.

**Ziel:** Die vorhandenen DOCX-/XLSX-Erzeuger mit dem Auftragsablauf verbinden, mit getrennter Arbeits- und Paketfreigabe und sicherer Wiederaufnahme.

**Architektur:** Ein versionierter Office-Arbeitsvertrag autorisiert ausschließlich die Erzeugung für unveränderliche Eingaben und Zahlungsbedingungen. Ein dauerhaftes Journal bindet die tatsächlich erzeugten Bytes an diesen Auftrag. Eine separate, unabhängig geprüfte Paketfreigabe erschließt anschließend den bestehenden Mischlieferweg.

**Technik:** Vorhandenes Node.js/ESM, `node:test`, `tsx`, `better-sqlite3`, SHA-256; vorhandener Python-Formatter mit python-docx 1.2.0 und openpyxl 3.1.5. Keine neue Bibliothek oder automatische Installation.

**Spezifikation:** [Bestätigter Entwurf](../specs/2026-10-20-ugig-office-order-flow-design.md), von Patrice am 20. Oktober 2026 bestätigt. Dieser Plan ist noch nicht ausgeführt.

## Globale Grenzen

- „Vertrauliche und unbekannt klassifizierte Eingaben bleiben gesperrt, auch in verschachtelten Referenzen.“
- „Die bestehende persönliche Einschaltkontrolle, Kostenbudgets, Vorleistungsgrenzen und Zahlungsnachweise bleiben unverändert.“
- „Keine zusätzlichen Office-Formate, Makros, freie Codeausführung oder Formelauswertung.“
- „Die vorhandenen Grenzen von 10 MiB je Binärdatei, 40 MiB Binärpaket und 96.000 Bytes Textdatei-JSON bleiben bestehen.“
- „Die 256.000-Byte-Grenze des allgemeinen Evidenzformats wird nicht erhöht, um eingebettete Excel-Dateien unterzubringen.“
- Keine echten Nachrichten, Uploads, Zahlungs-/Blockchain-Abfragen, Konto- oder Schlüsseländerungen. Alle Integrationstests verwenden Fake-Adapter.
- Kein Dienstneustart, keine ON-/OFF-Änderung und kein Unterbrechen einer laufenden Sitzung. Kein nachgelagerter Aktivierungsautomat.
- Bestehende Vertragsversionen, Content-Pilot, Quellen und Aufträge werden nicht automatisch migriert. Office-Zulassung nur explizit für uGig.
- Kein beliebiges Kundenskript im Host-Python: ausschließlich der fest gebundene vertrauenswürdige Formatter. Keine Behauptung einer Container-Zertifizierung.
- Großer vorhandener Arbeitsstand: keine pauschalen Git-Operationen, kein Reset/Stash/Checkout über fremde Änderungen. Git-Autorenidentität fehlt derzeit; keine erfinden. Geplante Teil-Commits erst bei bereits korrekt konfigurierter Identität, ausschließlich für die jeweils eigenen Änderungen.

## Prüfschwerpunkte

1. JSON-Schlüsselreihenfolge, unbekannte Schemafelder und Versionsverwechslung dürfen keine alternative Freigabe erzeugen — Aufgabe 1.
2. Windows-Pfadvarianten, Reparse-Points und während des Lesens ausgetauschte Dateien dürfen keinen Zugriff außerhalb des Eingabespeichers ermöglichen — Aufgabe 2.
3. Zwei konkurrierende Prozesse und ein Absturz direkt nach Ergebniscommit dürfen keine zweite Erzeugung auslösen — Aufgabe 3.
4. Eine neue Kundennachricht über die Paketfreigabe muss gelesen werden können, ohne den ursprünglichen Arbeitsumfang umzuschreiben; ein unreviewter Änderungswunsch muss blockieren — Aufgabe 5.
5. Quellenweite `submit`-Fähigkeit eines anderen Auftrags darf keine Office-Paketfreigabe ersetzen; Abnahme und Zahlung müssen weiterhin zum gelieferten Paket gehören — Aufgaben 7/8.

## Dateistruktur und gemeinsame Begriffe

Alle Pfade relativ zu `C:/Users/Patrice/automaton`.

| Neue Datei | Verantwortung |
|---|---|
| `scripts/founder-ugig-office-contract.mjs` | Strikte Schemas, Digest-Berechnung, Freigabevalidierung |
| `scripts/founder-ugig-office-evidence.mjs` | Lesende Auflösung der geprüften Nachweise und Inhaltsreferenzen |
| `scripts/founder-ugig-office-journal.mjs` | Transaktionale Versuche und gespeicherte Ergebnisse |
| `scripts/founder-ugig-office-work.mjs` | Auftragsgebundene Erzeugung und Wiederaufnahme |
| `scripts/founder-ugig-office-pipeline.mjs` | Arbeits-/Lieferansichten, Finanzierung und Fachprüfung |
| `scripts/founder-ugig-office-fixture.mjs` | Ausschließlich synthetische Testdaten und Fake-Plattform |

Zu jeder neuen Produktdatei gehört eine gleichnamige `.test.mjs`. Zusätzlicher Ende-zu-Ende-Test: `scripts/founder-ugig-office-flow.integration.test.mjs`. Der bestehende `founder-ugig-office.mjs` bleibt Formatteradapter; Auftragslogik wird nicht in Python dupliziert.

Gemeinsame Namen und Formen:

- `OrderRef`: `sourceId, externalId, ownerId, rootTaskId, sourceRevision, scopeDigest`; zusätzliche Gig-/Bewerbungs-/Käufer-/Gesprächs-IDs stehen im Vertrag.
- `WorkAgreement`: `schema: numaron-ugig-office-work-v1`, `profileId: office-generation`, Identität, ursprüngliche Kundennachrichten, Frist, Abnahmekriterien, AI-/öffentliche Verarbeitungserlaubnis, `workKind`, `inputRefs`, `specRef`, `referenceRef`, `generatorVersion`, `requiredFiles`, `paymentTerms`, `scopeDigest`. Keine fertigen Artefakte oder Lieferfreigaben.
- `BlobRef`: `{sha256,size,format,privacy:'public'}`; Formate `json` oder `xlsx`. Kein vom Vertrag frei bestimmter Pfad. Namenszuordnung für XLSX in `inputRefs` separat und streng begrenzt.
- `WorkPack`: `{agreement,workGrant,fundingEvidence,acceptance?}`. `workGrant` bindet `digest(agreement)` und exakt `read/work/verify`; aktuelle Finanzierungsbelege liegen außerhalb des unveränderlichen Vertrags.
- `GenerationKey`: Digest von Auftragsidentität, Revision, Scope, Eingabe-/Referenzdigests und `generatorVersion`; keine zufälligen Zeitstempel.
- `GeneratedResult`: `{generationKey,attemptId,binaryArtifacts,files,packageDigest,productDigest,technicalReportRef}`. `files` sind die vollständigen zugelassenen Textdateien, kein eingebettetes XLSX. Der technische Bericht liegt bereits als Textdatei im Paket und wird nicht nochmals als großer Payload dupliziert.
- `ReleasePack`: `{release,deliveryGrant}`. `release.schema = numaron-ugig-office-release-v1`; Inhalt wie Spezifikation einschließlich Arbeitsvertragsdigest, Ergebnis-ID, vollständiger Manifeste, Kundenbeleg, Provenienz und `productReview`. `deliveryGrant` bindet `digest(release)` und exakt `submit/reconcile`. Der Grant selbst ist nicht Teil seines Bindungsdigests.
- `ctx`: bestehender Ausführungskontext mit `order, grant, signal, assertActive`; keine nachgelagerten Funktionen dürfen `isEnabled:()=>true` für Produktionsspeicher einsetzen.

## Aufgabe 1: Versionierte Vertrags- und Freigabeprüfung

**Dateien:** neu `founder-ugig-office-contract.mjs`, `.test.mjs`, `founder-ugig-office-fixture.mjs`; bestehende Digest-/Binärprüfungen nur importieren.

**Schnittstellen:** `officeScopeDigest(agreement): string`, `validateOfficeWork(agreement): {valid,blockers}`, `validateOfficeRelease({agreement,result,releasePack,now}): {valid,blockers}`, `officeGenerationKey(agreement): string`. Die Fixture exportiert `officeFixture(workKind)` mit synthetischem Vertrag, Referenzen und Nachrichten; Hilfsmethode `releaseFor(result)` nur in Tests.

- [ ] Fehlende APIs durch Tests belegen. Kernassertionen: `assert.equal(validateOfficeWork(a).valid,true)` ohne Binärmanifest; `assert.equal(validateOfficeRelease({...f,releasePack:null}).valid,false)`; Arbeitsgrant darf kein `submit` enthalten. Für jeden Identitäts-, Eingabe-, Regel-, Referenz-, Versions- und Zahlungswechsel muss sich der Scope ändern oder die Validierung scheitern.
- [ ] `node --test scripts/founder-ugig-office-contract.test.mjs` ausführen; zunächst fehlende Implementierung beziehungsweise gezielt fehlende Validierung erwarten, keine Umgebungsfehler als Rot-Nachweis akzeptieren.
- [ ] Explizite Feldlisten verwenden, unbekannte Felder und Versionen ablehnen. `officeScopeDigest` hasht alle vereinbarten Scope-Felder außer sich selbst und operativen Review-Markierungen; keine dynamische Ausschlussliste. `paymentTerms` enthält dieselben wirtschaftlichen Felder wie der vorhandene Marketplace-Digest, einschließlich Settlement, nicht laufende Beleg-Ablaufzeiten. Vorhandene v1-Digestfunktionen nicht verändern.
- [ ] Tests für umgeordnete JSON-Schlüssel (gleicher Digest), fehlende öffentliche Klassifizierung, falsche Manifeste, alte Paketfreigabe, Grant-Selbstreferenz, technische Prüfung statt unabhängiger Prüfung und abgelaufene Grants ergänzen. Befristungen mit injizierter Uhr prüfen.
- [ ] Testbefehl erneut ausführen: alle Fälle grün. Nur diese Aufgabedateien prüfen; Teil-Commit nach globaler Git-Regel: `feat: validate scoped ugig office contracts`.

## Aufgabe 2: Begrenzter, lesender Evidenz- und Eingabezugriff

**Dateien:** neu `founder-ugig-office-evidence.mjs`, `.test.mjs`; verwenden: Vertragsvalidator aus Aufgabe 1 und vorhandene Integritätsfunktionen.

**Schnittstellen:** `createOfficeEvidence({base,isEnabled,now})` liefert `work(order): WorkPack`, `release(order,generationKey): ReleasePack|null`, `inputs(agreement): {spec,reference}`, `completionPack(order): {agreement,netReceipt?,acceptance?,...}` als explizite Anpassung der vorhandenen Finanzierungsbelege. Keine Schreibmethode für Grants.

- [ ] Temporäre Pfade für `ugig-office-contracts/<digest(orderKey)>.json`, `ugig-office-releases/<generationKey>.json` und `ugig-office-inputs/<sha256>` testen, unter `artifacts/founder-autonomy-20261013`. Fehlende Datei, anderer Auftrag, fremde Revision und OFF müssen vor Verarbeitung blockieren; nicht vorhandene Freigabe liefert nur `null`, keine Erlaubnis.
- [ ] `node --test scripts/founder-ugig-office-evidence.test.mjs` rot ausführen.
- [ ] Sichere Öffnung und Prüfung aller Pfadkomponenten, Dateityp, Linkanzahl, Bytes und Hash implementieren. Vor/nach Lesen Metadaten vergleichen; ausgetauschte Datei ablehnen. JSON-Evidenz maximal 256.000 Bytes; Spec-JSON maximal 96.000 Bytes; Referenz-JSON maximal 16 MiB; höchstens drei XLSX-Inputs à 10 MiB. Nach Zusammensetzen gelten zusätzlich die bestehenden Formatterlimits. Keine Produktionsdaten im Test.
- [ ] `inputs` löst ausschließlich Inhaltsreferenzen auf, prüft jede Klassifizierung und baut intern Base64 für den vorhandenen Formatter. JSON-Referenzen ebenfalls auf vertrauliche verschachtelte Angaben prüfen. `completionPack` übernimmt nur vorhandene geprüfte Finanzierungs-/Abnahmebelege; keine neuen `verified`-Flags setzen.
- [ ] Tests für Hash-/Größenänderung, Groß-/Kleinschreibung, Pfadtraversal, Symlink/Junction/Hardlink, Austausch beim Lesen und Grenzwertüberschreitung ergänzen. Windows-Linkfälle tatsächlich ausführen; fehlt eine notwendige Testfähigkeit, als offene Abnahme dokumentieren, nicht still überspringen.
- [ ] Testbefehl grün; Teil-Commit: `feat: read bounded office work evidence`.

## Aufgabe 3: Dauerhaftes Erzeugungsjournal

**Dateien:** neu `founder-ugig-office-journal.mjs`, `.test.mjs`.

**Schnittstellen:** `openOfficeJournal({directory,isEnabled,now})` liefert `prepare(key,contractDigest)`, `claim(key,attemptId)`, `commit(key,attemptId,result)`, `read(key)`, `interrupt(key,attemptId,reason)`, `retry(key,{previousAttemptId,newAttemptId,reviewedAuthorization})`, `close()`. `claim` liefert `{claimed:true}` oder vorhandenen Datensatz; niemals still einen zweiten Versuch.

- [ ] Tests mit zwei separaten SQLite-Verbindungen und zusätzlich zwei Testprozessen: `assert.equal(successfulClaims,1)`. Commit muss atomar sowohl unveränderliches Ergebnis als auch Status `generated` setzen. Ein anderer Ergebnisdigest unter derselben Versuch-ID muss scheitern.
- [ ] `node --test scripts/founder-ugig-office-journal.test.mjs` rot ausführen.
- [ ] SQLite-Transaktionen und eindeutige Generation-/Versuchsschlüssel verwenden, `busy_timeout=5000`, `synchronous=FULL`. Statuswerte exakt `prepared/generating/generated/interrupted/rejected`. Keine aktive Erzeugung allein wegen Zeitablauf als frei erklären; fremder Prozess darf sie nicht erneut beanspruchen.
- [ ] Absturztests vor und nach Ergebniscommit ergänzen. Nach Prozessverlust wird ein unvollständiger Versuch blockiert; expliziter Retry erfordert passende alte Versuch-ID und aktuellen extern geprüften Berechtigungsbeleg. Ein `generated`-Ergebnis ist nicht überschreibbar. Verwaiste Artefakte gelten nicht als Ergebnis.
- [ ] Tests grün; Teil-Commit: `feat: persist office generation attempts`.

## Aufgabe 4: Auftragsgebundene Erzeugung und Wiederaufnahme

**Dateien:** neu `founder-ugig-office-work.mjs`, `.test.mjs`; ändern `founder-ugig-office.mjs` nur für nötige Abbruch-/Runtime-Prüfpunkte; erweitern dessen bestehende Tests.

**Schnittstellen:** `createOfficeWork({evidence,journal,generator,artifactStore,authorizeWork,isEnabled,runtimeVersion})` liefert `prepare(order,ctx)`, `generate(order,ctx): GeneratedResult`, `readResult(order,ctx): GeneratedResult`. `authorizeWork(order,agreement,ctx): Promise<true>` muss aktuelle Vergabe, Finanzierung, Arbeitsgrant und Reservierung prüfen; konkrete Implementierung folgt in Aufgabe 5.

- [ ] Fake-Formatter mit Aufrufzähler einsetzen: nach zwei identischen `generate`-Aufrufen `assert.equal(calls,1)` und identische Produkt-/Paketdigests. Entfallene Autorität nach Prozessende muss vor Journalcommit blockieren. Ohne `ctx.grant.reservationId` keine Arbeit.
- [ ] `node --test scripts/founder-ugig-office-work.test.mjs` rot ausführen.
- [ ] Eingabedaten erst nach Autorisierung auflösen, Runtime-Version mit Arbeitsvertrag vergleichen, Journal beanspruchen, vorhandenen Generator aufrufen, alle Datei-/Digestgrenzen prüfen, Autorität erneut prüfen und Ergebnis committen. Keine Freigabedatei schreiben. Technischer Bericht muss `independentlyVerified:false` behalten.
- [ ] Wiederaufnahme liest bestehende Artefakte erneut, vergleicht Bytes und Textmanifest und prüft aktuelle Autorität. Nie neu rendern, um ZIP-Hashwerte nachzubilden. Bei OFF oder Abbruch Prozesssignal weitergeben und nächste Zustandsänderung verhindern. Erzeugerfehler mit begrenztem, datenfreiem Grund dokumentieren.
- [ ] Tests für Eingabeänderung während Autorisierung, Runtime-Digestwechsel, beschädigte gespeicherte Bytes, fehlende Reservierung und jede Abbruchgrenze ergänzen; grün ausführen. Teil-Commit: `feat: bind office generation to authorized work`.

## Aufgabe 5: Arbeits-/Lieferansichten und bestehende Finanzierungsprüfung

**Dateien:** neu `founder-ugig-office-pipeline.mjs`, `.test.mjs`; ändern `founder-ugig-order-pipeline.mjs`, gegebenenfalls gezielt `founder-ugig-pilot-contract.mjs`; bestehende Completion-/SOL-Prüfung wiederverwenden.

**Schnittstellen:** `createOfficePipeline({base,isEnabled,now,request,credential,paymentAuthority,officeWork,...existingPaymentOptions})` liefert `readAssignment(order,ctx)`, `authorizeWork(order,agreement,ctx)`, `readDeliveryAssignment(order,ctx)`, `verifyProduct(product,ctx)`, `submitDelivery(input,ctx)`, `readDelivery(order,intent,ctx)`, `readAcceptance(order,ctx)`, `readPayment(order,ctx)`, `access(order,operation)`.

- [ ] Test: Arbeitsvertrag ohne Paketfreigabe kann die bestätigte Fake-Vergabe lesen, aber `verifyProduct` liefert `false`; Finanzierung wird gegen den ursprünglichen Scope geprüft. Test mit falschem `funding.scopeDigest` muss vor Generatoraufruf scheitern.
- [ ] `node --import tsx --test scripts/founder-ugig-office-pipeline.test.mjs` rot ausführen.
- [ ] `createUgigContractReader` mit eigenem striktem Office-Validator verwenden. Seine bisherigen Identitäts-/Gesprächs-/Nachrichtenprüfungen nicht abschwächen. Arbeitsansicht bleibt `office-generation`, Lieferansicht wird aus Arbeitsvertrag, Ergebnis und Freigabe zu `reviewed-binary` zusammengesetzt; explizites Office-Schema, stabiler Arbeitsscope, keine v1-Scope-Neuberechnung.
- [ ] Nachweise der geprüften Paketfreigabenachricht als zusätzliche geprüfte Kundenbelege zulassen, auch vor `submitted`, ohne sie in den unveränderlichen Arbeitsvertrag zu schreiben. Nur der Office-Reader erhält diesen Hook; beliebige neue Kundennachrichten bleiben blockierend. Vollständigen Ansichts-/Release-Digest an jeder asynchronen Grenze erneut prüfen.
- [ ] Bestehende `createUgigCompletion` mit `completionPack` anbinden; `verifyFunding` beziehungsweise vorhandene `paymentAuthority.allows` vor Arbeit und Lieferung ausführen. Keine generelle Vorleistung und keine Änderung der CHF-1-Policy. Auftragsgebundene Fachchecks aus `UGIG_WORK_CHECKS`, Binär- und Mischprüfungen plus erforderliche DOCX-Layoutabnahme verlangen.
- [ ] Tests für aktuelle/geänderte Kundennachricht, fehlende/exakte/fremde Release-Belege, abgelaufene Grants, fehlende Fachchecks, Zahlungsempfängerwechsel und OFF; dazu bestehende Order-/Pilot-/Completiontests grün. Teil-Commit: `feat: gate office delivery on exact release evidence`.

## Aufgabe 6: Profil und Auftragsausführung verbinden

**Dateien:** ändern `founder-order-execution.mjs`, `founder-work-profiles.mjs`, `founder-native-work.mjs`, `founder-opportunity-store.mjs`, `founder-marketplace-work-source.mjs`; Tests in `founder-order-execution.test.mjs`, `founder-marketplace-work-source.test.mjs` und neuem `founder-ugig-office-flow.integration.test.mjs`.

**Schnittstellen:** uGig-Quellenvertrag erhält vertrauenswürdige Hooks `prepareOffice(order,ctx)`, `generateOffice(order,ctx)`, `readOfficeResult(order,ctx)`. Diese werden nur für `office-generation` verwendet. `marketplaceContractDigest` bekommt einen expliziten Office-Zweig über unveränderlichen Arbeitsvertrag und wirtschaftliche Bedingungen; andere Profile behalten identische Digests.

- [ ] Testfälle über echte `openOrderExecution`-Adapter: `prepare` speichert Office-Bindung, `work` schreibt das erzeugte vollständige Manifest mit `stage:worked`, `verify` bleibt ohne Freigabe blockiert. Nach passender synthetischer Freigabe `verified`; kein Formatter-/Sandbox-Fallback.
- [ ] `node --import tsx --test scripts/founder-ugig-office-flow.integration.test.mjs` rot ausführen.
- [ ] Office-Profil in ausdrücklich autorisierten uGig-Routen zulassen. Dateiadmission entspricht bestehendem Mischprofil. Für Office gilt öffentliche Klassifizierung aller Eingaben unabhängig von `privateProcessingAllowed`. Andere Plattformen dürfen das Profil nicht durch bloße Profilangabe einschleusen.
- [ ] Office-Zweig in `prepare/work/verify` vor generischer Code-Sandbox behandeln. `readOfficeResult` muss auch bei bereits `worked/verified` erneut Integrität prüfen; keine frühe Rückgabe nur wegen Textmanifestdigest. Zwischen Journalcommit und Produktcommit fehlgeschlagene Ausführung übernimmt beim nächsten Lauf dasselbe Paket.
- [ ] `work` liefert Nullkosten nur mit bestehender Reservierungs-ID und erfolgreichem Arbeitsabschluss. `submit` übernimmt weiterhin den ursprünglichen Vertragsdigest, echte Verifikation und vorhandenes Delivery-Journal. Keine neue globale Auftragszustandsmenge.
- [ ] Tests für Vergabeprofil-Bypass, Guru/Freelancer-Einschleusung, fehlende Hooks, beschädigtes wiederaufgenommenes Produkt und unveränderte Altvertragsdigests; alles grün. Teil-Commit: `feat: execute office work through order lifecycle`.

## Aufgabe 7: Produktionskomposition vorbereiten, ohne Aktivierung

**Dateien:** ändern `founder-production-order-bindings.mjs`, `.test.mjs`, `founder-ugig-order-pipeline.mjs`; ergänzen gezielte Tests in `founder-ugig-production.integration.test.mjs`.

**Schnittstellen:** Komposition nimmt optional `officeRuntime: {python,generatorVersion}` an. Fehlende Konfiguration bedeutet sichtbare Arbeitsblockade, keine Installation/Host-Python-Suche. Neue Office-Verträge werden ausschließlich über Schema und gültige geprüfte Bindung geroutet. `access(order,operation)` darf nicht pauschal alle Operationen bestätigen.

- [ ] Tests: Office-Arbeitsgrant kann `work/verify`, nicht `submit` erneuern; gültige `submit`-Fähigkeit eines anderen Auftrags ersetzt den lokalen Release-Check nicht. Der feste `PILOT_GIG` wird unverändert an den Content-Pilot geroutet.
- [ ] `node --import tsx --test scripts/founder-production-order-bindings.test.mjs scripts/founder-ugig-production.integration.test.mjs` mit neuen Fällen rot ausführen.
- [ ] Hooks der Aufgaben 4/5 durch die existierende Marketplace-Komposition führen; uGig-Konfiguration und Erneuerung je Operation begrenzen. Ausgaben der Statusanzeige: Konfiguration, fehlende Arbeitserlaubnis, wartende Paketfreigabe oder unabhängige Fachprüfung; kein `liveReady:true` allein wegen vorhandenem Generator.
- [ ] Test: OFF erzeugt keine Request-/Runtime-Aufrufe, unbekanntes Schema blockiert, fehlender Interpreter blockiert, alte Text-/Binärrouten unverändert. Grün ausführen. Kein Startskript aufrufen, keine Umgebungsvariable des Dienstes setzen. Teil-Commit: `feat: compose guarded office order adapters`.

## Aufgabe 8: Gesamtprüfung, Nachweise und Übergabe

**Dateien:** `founder-ugig-office-flow.integration.test.mjs`, `docs/numaron-ugig-office-20261020.md`, `docs/numaron-continuation-index.json`; neue Ergebnisse unter `outputs/ugig-office-flow-20261020/`.

- [ ] Für alle vier Facharten synthetische vollständige Verträge aufbauen. Die Fixture darf Testgrants erzeugen, Produktivcode nicht. Testtransport unterscheidet lokale Fakes von jeder echten URL; echte Netzwerk-/Versandaufrufe müssen sofort scheitern. Pipeline bis `verified` und simulierte Liefergrenze prüfen.
- [ ] Neue Ende-zu-Ende-Tests zuerst rot ausführen: Kundenabnahme und Nettozahlungsbeleg für ein anderes Paket dürfen trotz gleicher Auftrags-ID nicht akzeptiert werden. Nach minimaler Korrektur erneut ausführen. Prüfung der unveränderten finanzierten Scope-Bindung bis `payment` mit Fake-Daten.
- [ ] Python-Tests und gezielte Node-Suite ausführen; Exitcodes einzeln prüfen, Ergebnisse protokollieren. Kein Testausfall darf durch den Erfolg eines späteren Befehls verdeckt werden.

```powershell
$officePython = 'C:/Users/Patrice/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $officePython -I scripts/test_ugig_office.py
if ($LASTEXITCODE -ne 0) { throw 'Office-Python-Tests fehlgeschlagen' }
$env:NUMARON_OFFICE_TEST_PYTHON = $officePython
$officeTests = @(Get-ChildItem scripts -Filter 'founder-*.test.mjs' |
  Where-Object { $_.Name -match 'ugig|binary-|production-order|marketplace-work|order-|work-profiles' } |
  ForEach-Object FullName)
node --import tsx --test --test-concurrency=1 @officeTests
if ($LASTEXITCODE -ne 0) { throw 'Office-Auftragsregression fehlgeschlagen' }
```

- [ ] Gesamtdiff auf unbeabsichtigte Änderungen an Grants, Budgets, Privacy, Pilotroute und Netzwerkanbindungen prüfen. Fünf Prüfschwerpunkte auf konkrete bestandene Tests abbilden. Fehlende Testfähigkeit ausdrücklich als offen führen.
- [ ] Bericht mit Code-/Runtime-Digests, tatsächlichen Testzahlen, Fehlerzahl, Wiederaufnahmebelegen und klaren Grenzen schreiben. Keine alten 126 Tests als neue Abnahme ausgeben. Fortsetzungsindex aktualisieren, Status `implemented-offline-tested-activation-pending` erst bei belegtem Gesamterfolg.
- [ ] Nur eigene Änderungen für Git prüfen; bei weiterhin fehlender Autorenidentität Commit offen lassen. Abschlussmeldung: umgesetzt/getestet, verbleibende reale Kunden-/Vertrags-/Finanzierungsnachweise, nicht aktiviert. Keine automatische Wartung anschließen.

## Selbstprüfung und Ausführungsempfehlung

Spezifikationsabdeckung: Datenmodell/Digests → 1; Speicher und Datenschutz → 2; Parallelität/Absturz/Wiederaufnahme → 3/4; Finanzierungs- und Paketfreigabe → 5; Arbeitszustände → 6; Quellenkomposition/Pilotbestand → 7; vier Kandidaten, Abnahme/Zahlung und Regression → 8. Alle fünf Prüfschwerpunkte sind den genannten Tests zugeordnet. Gemeinsame Funktionsnamen und Datenformen sind durchgängig festgelegt.

Empfehlung: sequenzielle Umsetzung in dieser Sitzung mit `superpowers:executing-plans`, weil die acht Aufgaben eng aufeinander aufbauen und dieselben Berechtigungsgrenzen teilen. Anschließend unabhängige Gesamtprüfung entsprechend dem Ausführungs-Skill. Alternativ ist ausdrücklich gewählte Umsetzung mit Teilagenten möglich; bis zur Wahl wird nicht delegiert.

Nächster Schritt: Patrice prüft den Plan und wählt die Ausführungsmethode. Produktcode und laufender Dienst bleiben bis dahin unverändert.
