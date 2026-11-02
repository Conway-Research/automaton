# Unabhängiger Review: Gate-Korrekturen und Synmerco-Reader (v1)

Stand 2.11.2026. Geprüft wurde der nicht committete Arbeitsstand auf `feat/founder-mittelerde-dashboard` gegen `e0c5bc97`. Numaron blieb AUS. Es lief kein Dienst, kein Provider und keine echte Synmerco-Abfrage. Ich habe keine Zugangsdaten gelesen. Beweistests und Mutationen liefen nur im Temp-Ordner; im Repo ist nur diese Datei neu.

## Urteile

**Laden in den Dienst: tauglich, sofern Patrice den Apply freigibt.** Es gibt keinen Blocker. Ohne Reader bleiben Timer, Reader-Aufrufe und Bindung ohne Wirkung, und jede Kundenarbeit bleibt gesperrt. B1 ist zu. Das ist weiter ein sicherer Start ohne Aufträge. Dieses Urteil ist keine Freigabe für Apply oder Einschalten.

**Anschluss des Readers: noch nicht tauglich.** Vorher müssen die beiden hohen Befunde R-H1 und R-H2 behoben sein, dazu der Rundungsfehler G-M1 und die fehlenden Reader-Tests aus G-M7. Danach braucht es einen echten Lesetest, den ich hier nicht machen durfte. Auch mit Reader entsteht allein noch keine Synmerco-Arbeit (`work:false`, siehe G-M6).

**Befunde: 0 blocker, 2 hoch, 9 mittel, 11 niedrig.**

## Stand der alten Befunde

| Alt | Stand | Nachstellung | Rest |
|---|---|---|---|
| B1 | **Geschlossen** | Mutationen B1a und B1b erkannt, Postpaid-Test grün. `founder-mt5.mjs:126` setzt keine `postpaidSource`. | N11 |
| H1 | **Geschlossen, zur Hälfte belegt** | Einzelauftrag-Pfad ausgeführt: nach Widerruf kein weiterer Teil, nach erneuter Finanzierung geht es weiter. Allgemeiner uGig-Pfad nur gelesen, Mutation H1b überlebt. | G-M7 |
| H2 | **Geschlossen** | Eine Finanzierung deckt nur einen Auftrag und Meilenstein, auch nach Neustart (G6 bis G9). | N3 |
| H3 | **Für den gemeldeten Fall geschlossen** | Der alte Beleg wird als `payment-not-real` gesperrt (G13). | N8 |
| M1 | **Weitgehend geschlossen** | Lange Arbeit wird erneuert, negative Lesungen stoppen sie. | G-M2, N1, N2 |
| M2 | **Geschlossen** | Mutation M2 erkannt. Der Prüfpunkt gilt auch für bereits eingereihte Stufen. | keiner |
| M3 | **Teilweise** | Netto, Währung und Empfänger werden verglichen. Brutto und der direkte Registrierungsweg nicht (G10, G12). | G-M5 |
| M4 | **Offen, ehrlich gekennzeichnet** | Eine eingetragene Rückbuchung nimmt den Beleg aus dem Beitrag, aber niemand trägt sie ein. | G-M8 |
| M5 | **Teilweise** | Die Summen werden nur gegen das Feld `inputs` geprüft, und nur bei der Zuweisung (G11). | G-M4, N9 |

## Antworten auf die Prüffragen

- **Verzögert der gültige Beleg einen Widerruf?** Ja, aber begrenzt. Der Widerruf wirkt erst, wenn die Lesung zurückkommt, spätestens endet der Beleg nach 60 Sekunden (G2 ausgeführt). Das Lesen des Schedulers fällt von alle 10 auf alle 30 Sekunden. Die Grenze von 60 Sekunden bleibt also eingehalten, das typische Fenster wird aber grösser.
- **Timer:** Kein Leck, denn `finally` räumt ihn ab und er blockiert das Prozessende nicht. Eine noch laufende Lesung wird durch die Abschlussprüfung überholt und kann keinen neuen Beleg löschen. Fehler in der Lesung selbst werden aufgefangen. Ein synchroner Fehler beim Lesen des Auftrags dagegen nicht (G-M1b).
- **Dauerhafte Blockade durch die Bindung?** Durch fehlgeschlagene Läufe nicht: Eine negative Lesung bindet nichts (G6), und derselbe Auftrag bleibt immer zugelassen (G7). Dauerhaft blockieren können nur ein geänderter Meilenstein oder ein zweiter Auftrag, weil es keine Freigabe gibt (N3).
- **Vorab beanspruchen?** Nur mit einer vollständig bestandenen Lesung, bei Synmerco also mit Patrices Auftragsblatt. Von aussen ist das nicht erreichbar.
- **Bindung vor oder nach den Prüfungen?** Nach allen inhaltlichen Prüfungen (`founder-confirmed-funded-authority.mjs:78`), aber vor der letzten Aktivprüfung. Ein Abbruch genau dort lässt die Bindung stehen (G7). Für denselben Auftrag ist das harmlos.
- **Korrekturrunde mit neuer `sourceRevision`?** Die Bindung bleibt gültig, und der alte Beleg deckt die neue Revision nicht (G8). Bei Synmerco ist für die neue Revision ein neues Blatt nötig (`founder-synmerco-funded-reader.mjs:24`). Das ist sicher, steht aber nicht im Reader-Vertrag.
- **`attachFundingClaims` nach Neustart?** Funktioniert (G9 ausgeführt). Kein Test im Repo sichert es ab (Mutation T2 überlebt). Fehlt der Aufruf, sperrt das Gate.
- **Neuer Pfad zu Schreibaktion, Budget oder Berechtigung?** Keiner gefunden.
  - `claimFunding` und `recordPaymentReversal` schreiben nur in den eigenen Store.
  - `fundedResume` kann einen Versand nur verhindern, nicht erlauben.
  - `founder-budget.mjs` und `founder-mt5.mjs` sind gegenüber `e0c5bc97` unverändert.
- **Ist der Reader angeschlossen?** Nein. Nur seine eigene Testdatei importiert ihn (Grep über `scripts` und `web`). `founder-mt5.mjs:126` übergibt keine `confirmedWorkSource`.

## Hoch

### R-H1: Eine hängende Synmerco-Antwort hält den ganzen Scheduler an

- **Stellen:** `founder-synmerco-funded-reader.mjs:30`, `founder-order-restoration.mjs:164`, `founder-runtime.mjs:155,163`
- **Szenario:** Der Synmerco-Dienst antwortet nicht, etwa beim Kaltstart des Hostings. Der Reader setzt kein Zeitlimit, und der Scheduler übergibt kein Abbruchsignal. `cycle()` wartet auf `refreshRegistrations`, und der nächste Lauf gibt nur denselben wartenden Lauf zurück.
- **Falsches Ergebnis:** Solange die Antwort hängt, gibt es kein `tick` und kein `controller.tick`, also keine neue Arbeit in Numaron. Belege anderer Aufträge laufen ab. `close()` wartet ebenfalls auf diesen Lauf. Der uGig-Client begrenzt dieselbe Lage auf 15 Sekunden (`founder-ugig-pilot-contract.mjs:25`).
- **Beleg:** Ausgeführt: S8 (kein Signal), S9 (Lesung bleibt offen), G5 (`refreshRegistrations` bleibt offen). Gelesen: `cycle()`. Nicht ausgeführt: die Standardgrenze von `fetch`, die das Warten vermutlich erst nach Minuten beendet.
- **Korrektur:** Im Reader `AbortSignal.any([ctx.signal, AbortSignal.timeout(15000)])` setzen und die Antwortgrösse begrenzen. Zeitlimit in den Reader-Vertrag aufnehmen. Einen Test mit hängendem `request` ergänzen.

### R-H2: Die Frist des Escrows wird nicht geprüft, und der gelesene Endpunkt liefert sie gar nicht

- **Stellen:** `founder-synmerco-funded-reader.mjs:30,40,43`
- **Szenario:** Ein Escrow steht auf `funded`, seine Frist ist aber abgelaufen (in den gespeicherten Daten etwa 23.10.). Das Blatt nennt eine spätere Abgabefrist. Der Reader meldet „gehalten“, und das Gate erlaubt Arbeit.
- **Warum das zählt:** Das Gate soll Arbeit ohne Absicherung verhindern. Was Synmerco nach Fristablauf tut, ist nicht geprüft. Der Käufer könnte das Geld dann zurückholen, während Numaron noch arbeitet.
- **Beleg:**
  - Ausgeführt: S10, ein `funded`-Eintrag mit vergangenem `deadline` passiert das echte Gate.
  - Gelesen: Die gespeicherten Einzelantworten (`escrow*.json`) enthalten `deadline`, `proofs` und `events`. Die gespeicherten Listenantworten (`escrows.json`), auf die der Reader setzt, zeigen `deadline` nicht.
  - Zusätzlich nennt der Beleg als `sourceRef` den Einzel-Endpunkt, den der Reader nie abruft.
- **Korrektur:** Den Einzel-Endpunkt `/v1/escrows/<id>` lesen oder ergänzen. Eine fehlende oder überschrittene Frist sperrt, ebenso eine Frist vor `deadlineUtc`. `railSourceTxRef` verlangen. Beim echten Lesetest die Felder bestätigen.

## Mittel

### G-M1: Brutto wird gerundet statt exakt verglichen

- **Stelle:** `founder-synmerco-funded-reader.mjs:42,47`
- **Szenario:** Vereinbart sind brutto 10,004, gehalten werden 10,00. Bei 1,005 ergibt die Gleitkommarechnung 100 Cent, also passt auch 1,00.
- **Falsches Ergebnis:** Das Gate lässt die Arbeit zu, und der Beleg meldet den vereinbarten Betrag als gehalten, nicht den tatsächlichen. Der Reader-Vertrag verlangt, dass der Bruttobetrag exakt passt. Die Lücke liegt unter einem Cent, gerundet wird aber am Geld.
- **Beleg:** Ausgeführt (S1, S2). Das Netto rundet dagegen korrekt (S3).
- **Korrektur:** Brutto als Dezimaltext mit höchstens zwei Stellen verlangen und ganzzahlig vergleichen. `amountDecimal` aus `amountCents` bilden.

### G-M1b: Synchroner Fehler im Timer erreicht die Prozessebene

- **Stelle:** `founder-order-restoration.mjs:50`
- **Szenario:** `currentOrder(action)` läuft ausserhalb des `.catch`. Meldet die Datenbank etwa `SQLITE_BUSY`, wird die Ausnahme nicht aufgefangen.
- **Falsches Ergebnis:** `uncaughtException`, dreimal im Lauf. Ohne eigenen Handler beendet das den Dienst mit laufender Arbeit. `founder-supervisor.mjs:16` protokolliert solche Fehler nur. Der Fall ist selten, und `close()` wartet vorher auf laufende Aufgaben, das Schliessen löst ihn also nicht aus.
- **Beleg:** Ausgeführt (`poc-timer-crash.mjs`, simulierter Datenbankfehler).
- **Korrektur:** Die Auftragslesung in den Promise verlegen, etwa `void (async()=>refreshConfirmed(currentOrder(action),guarded))().catch(()=>{})`.

### G-M2: Ein einzelner Lesefehler bricht gültige, bezahlte Arbeit ab

- **Stellen:** `founder-confirmed-funded-authority.mjs:80`, `founder-order-restoration.mjs:50`
- **Szenario:** Während der Arbeit liefert die Erneuerung einmal einen Fehler 502. Die Finanzierung ist unverändert gültig.
- **Falsches Ergebnis:** Der Beleg wird gelöscht, die Arbeit bricht ab, die Kosten bleiben, und die Adapter haben `retrySafe:false`. Das alte M1 ist damit für Netzfehler weiter offen. Der alte Korrekturvorschlag wollte nur negative Ergebnisse sofort wirken lassen.
- **Beleg:** Ausgeführt (G3). Der Reader-Vertrag beschreibt das Verhalten als gewollt.
- **Korrektur:** Reader-Fehler von inhaltlichen Ablehnungen trennen. Bei Fehlern den alten Beleg bis zu seiner 60-Sekunden-Grenze behalten.

### G-M3: Gate-Zusage und alter Finanzierungsbeleg laufen getrennt ab

- **Stellen:** `founder-order-lifecycle.mjs:17`, `founder-opportunity-store.mjs:14`
- **Szenario:** Das Gate bestätigt frisch, aber `order.funding.expiresAt` liegt in der Vergangenheit.
- **Falsches Ergebnis:** `assignment-or-funding-missing`, obwohl die Finanzierung bestätigt ist. `update` lehnt das Feld `funding` ab, einen Erneuerungsweg im Store gibt es nicht. Der Auftrag bleibt gesperrt. Das ist sicher, aber dauerhaft. Das klärt den offenen Punkt des alten Reviews auf Ebene des Prüfpunkts. Wie lange Belege im Echtbetrieb gelten, habe ich nicht geprüft.
- **Beleg:** Ausgeführt (G14).
- **Korrektur:** Bei strikter Politik die Frist des Altbelegs nicht mehr prüfen oder einen geprüften Erneuerungsweg ergänzen.

### G-M4: M5 ist nur für das Feld `inputs` und nur bei der Zuweisung erfüllt

- **Stellen:** `founder-opportunity-store.mjs:7`, `founder-order-execution.mjs:87-94`
- **Szenario 1:** Ein Auftrag hat seine echten Eingaben in `contentBrief`, `files` oder `data`, aber kein Feld `inputs`. `digest(null)` passt, und ein anderer Inhalt passt genauso. Die Fixtures des Integrationstests nutzen genau `digest(f.a.inputs??null)`.
- **Szenario 2:** `prepare` holt die Bindung neu vom Quellenadapter, und `inputsDigest` wird dort nicht verglichen. Nach der Zuweisung können die verwendeten Eingaben also abweichen.
- **Beleg:** Szenario 1 ausgeführt (G11). Szenario 2 gelesen; laut Grep kommt `inputsDigest` im Produktivcode nur in Gate und Store vor.
- **Korrektur:** Die Summe über alle arbeitsrelevanten Felder bilden, `digest(null)` ablehnen und beim Speichern in `prepare` erneut vergleichen.

### G-M5: M3 vergleicht Brutto nicht und gilt nicht für direkt registrierte Aufträge

- **Stellen:** `founder-opportunity-store.mjs:7,13,20`
- **Szenario 1:** Vereinbart sind brutto 38, der Altbeleg nennt 90 000. Die Zuweisung wird angenommen, und die Buchführung zeigt den falschen Bruttowert.
- **Szenario 2:** `register()` übernimmt `customerWork` und `funding` ohne Vergleich, sogar in verschiedenen Währungen.
- **Beleg:** Ausgeführt (G10, G12). Ob eine produktive Quelle solche Datensätze registriert, habe ich nicht geprüft; `verifyRegistration` ist je Quelle eigener Code.
- **Korrektur:** `amountMinor` gegen `grossDecimal` prüfen. Denselben Vergleich in `register` ausführen, sobald `customerWork` vorhanden ist.

### G-M6: Der Anschluss allein ermöglicht keine Synmerco-Arbeit und sperrt die übrigen Quellen weiter

- **Stellen:** `founder-production-order-bindings.mjs:33,161`, `founder-order-lifecycle.mjs:17`, `founder-native-work.mjs:9`
- **Szenario:** Die Autorität kennt genau eine Quelle. Wird der Synmerco-Reader angeschlossen, bekommt er auch uGig- und Office-Aufträge. Dort fehlt ihm das Blatt, also bleiben sie gesperrt.
- **Weitere Sperren für Synmerco-Aufträge:** `work:false`, der verlangte Altbeleg `order.funding`, und USDC scheitert bei `prepare` (N7).
- **Einordnung:** Das ist sicher. Es widerspricht aber der Erwartung „Reader an, Aufträge laufen“. Der Reader prüft zudem nicht, ob `expected.sourceId` Synmerco ist.
- **Beleg:** Gelesen; G14 und G15 ausgeführt.
- **Korrektur:** Einen Verteiler je `sourceId` einbauen und diese Grenzen im Reader-Vertrag nennen.

### G-M7: Wichtige neue Stellen sind ungetestet

- **Beleg:** 30 Mutationen in der Temp-Kopie, 19 erkannt, 11 überlebt (Tabelle unten).
- **Allgemeiner uGig-Pfad (H1b):** Entfernt man dort die Finanzierungsprüfung, bleibt alles grün. Der H1-Test deckt nur den Einzelauftrag ab, und der Test N12 prüft nur den Quelltext einer anderen Datei.
- **Bindung (T2):** Der Anschluss des Stores an die Autorität ist nicht abgesichert. Die Integrationstests fallen im synthetischen Modus auf die Speicherbindung zurück.
- **Reader (R1, R2, R4, R8, R9, R11):** Symlink, Blattgrösse, OFF nach der Antwort, `scopeDigest`, `rootTaskId` und Schema sind ungetestet. Das Verhalten im Code ist für Symlink, Grösse und OFF korrekt (S4, S6, S14 ausgeführt).
- **Schwacher Test:** „M1 long work renews“ prüft die Lesezahl erst nach dem Ende, und dann hat die Abschlussprüfung schon gelesen. Bei Mutation T1 ohne Timer blieb dieser Test grün; nur der Widerrufstest schlug an.
- **Korrektur:** Für diese Stellen Tests ergänzen, meine PoCs können als Vorlage dienen. Im Renew-Test die Lesezahl während der Arbeit messen.

### G-M8: Eine Rückbuchung wird weiterhin nicht erkannt

- **Stelle:** `founder-opportunity-store.mjs:27`
- **Szenario:** Eine Zahlung wird nach `paid` zurückgebucht. `recordPaymentReversal` hat keinen Aufrufer, also bleibt der Beitrag bestehen.
- **Beleg:** Grep, im Reader-Vertrag offen genannt. Die Buchführung kennzeichnet den Eingang als `confirmed-at-check-time`, das ist korrekt.
- **Korrektur:** Periodischen Abgleich einbauen, spätestens vor der ersten Gewinnaussage.

## Niedrig

| # | Stelle | Befund | Beleg | Korrektur |
|---|---|---|---|---|
| N1 | `founder-confirmed-funded-authority.mjs:58,80` | Eine ältere Lesung sieht den Widerruf, läuft aber schon eine neuere, wird er verworfen. Der Beleg gilt weiter, längstens bis zur 60-Sekunden-Grenze. | G1 ausgeführt | Negatives Ergebnis auch für ältere Lesungen wirken lassen |
| N2 | `founder-order-restoration.mjs:50` | Dauert die Lesung länger als das Intervall (30 s), überholen sich die Lesungen, und die Erlaubnis hat Lücken, obwohl die Finanzierung hält. Sie heilt danach selbst. Mein erster Verdacht „erneuert nie“ war falsch, der Lauf hat ihn widerlegt. | G4 ausgeführt, Zeit 100-fach gerafft | Keine neue Lesung starten, solange eine läuft |
| N3 | `founder-opportunity-store.mjs:25` | Eine Bindung lässt sich nicht lösen. Ein korrigierter Meilenstein oder ein falsch angelegter Auftrag sperrt die Finanzierung dauerhaft. | G7, G8 ausgeführt | Bewusst lokale Freigabe mit Beleg, nur bei AUS |
| N4 | `founder-order-restoration.mjs:164`, `founder-confirmed-funded-authority.mjs:42` | `needsRefresh` sieht keine geänderte Revision, das verzögert die neue Lesung um bis zu 30 s. Abgelehnte Aufträge werden ohne Pause alle 10 s neu gelesen. | G8 ausgeführt, Rest gelesen | Digest mitprüfen, Wartezeit nach Ablehnung |
| N5 | `founder-synmerco-funded-reader.mjs:21-23` | Das Blatt ist reines JSON ohne Signatur: Wer dort schreiben kann, kann `reviewedBy:patrice` setzen. `reviewMinutes:0`, beliebig ferne Frist und Hardlink werden angenommen. Symlink und Junction werden korrekt abgelehnt. | S4, S5, S13 ausgeführt | Höchstfrist und Mindestminuten festlegen, Ablage als nur für Patrice beschreibbar festhalten |
| N6 | `founder-synmerco-funded-reader.mjs:22,28` | Kaputtes JSON und Fehler aus `credential()` verlassen `read` ungefiltert. Das Gate ersetzt sie durch einen festen Text, also kein Leck im vorgesehenen Pfad. Bei direktem Aufruf ginge der Text durch. | S6, S7 ausgeführt | Beide in `fail(...)` einfassen |
| N7 | `founder-native-work.mjs:9`, `founder-marketplace-work-source.mjs:26` | Die USDC-Entscheidung gilt in Gate und Buchführung, aber nicht bei `prepare`. USDC-Aufträge scheitern dort. Der Reader meldet die Währung nur aus dem Blatt, die Antwort enthält keine. | G15, S10 ausgeführt | Regeln angleichen, Währung beim echten Lesetest klären |
| N8 | `founder-order-accountability.mjs:34-39`, `founder-ugig-completion.mjs:13,23`, `founder-ugig-sol-settlement.mjs:46` | `received` bleibt auch bei gesperrten und rückgebuchten Belegen gefüllt. `receiptKind` ist eine Selbstangabe aus lokalem JSON, und Marker wie `synthetic` gehen in `readPayment` verloren. Solche Belege zählen heute trotzdem nicht als Beitrag, weil dieser Pfad nur USD kennt. SOL-Belege haben gar kein `receiptKind`, also zählt auch ein echter nicht. | G13 ausgeführt, Rest gelesen. Anzeige von `received`: keine in `web/founder` gefunden | `received` bei Sperre leeren, Art nur aus geprüfter Quelle setzen, SOL nachziehen |
| N9 | `founder-opportunity-store.mjs:15` | `correctionScopeDigest` ist eine Angabe im Beleg, die niemand aus dem echten Umfang berechnet. Laut Grep erzeugt kein Produktivcode bisher `changes-requested`. Heute unerreichbar. | Grep | Beim Bau des Korrekturwegs aus dem echten Wunsch ableiten |
| N10 | `founder-synmerco-funded-reader.mjs:43`, `founder-ugig-pilot-delivery.mjs:45` | `observedAt` wird erst nach der Antwort gesetzt, eine langsame Antwort wirkt also frisch. Der Erstversand prüft nicht je Teil neu, der Beleg ist dabei bis zu 60 s alt. | S11 ausgeführt, Rest gelesen | Zeitpunkt vor dem Abruf nehmen |
| N11 | `founder-runtime.mjs:58,76` | Der Parameter `postpaidSource` besteht weiter. Der Test prüft nur die Standardwerte, nicht `founder-mt5.mjs`. | gelesen | Wächtertest auf die Komposition |

## Was in Ordnung ist

- **Nur lesen:** genau ein GET, kein Body, `redirect:'error'`, Schlüssel nur im Header (S8).
- **Geheimnisse:** kein Schlüssel in den Fehlermeldungen des vorgesehenen Pfads (S7).
- **Zustand:** Nur der exakte Wert `funded` passiert. `FUNDED`, Arrays, fehlende und krumme Beträge sperren (S12). In den gespeicherten Daten kommt `funded` achtmal vor, immer mit `railSourceTxRef` und vor `submitted`. Das stützt den Namen etwas stärker, als der Reader-Vertrag sagt, beweist aber nicht, dass das Geld gehalten wird.
- **Pfad:** Der Dateiname ist eine Prüfsumme, also gibt es keinen Pfadausbruch. Junction und Grössengrenze greifen vor dem Abruf (S4, S6).
- **OFF:** greift vor und nach der Anfrage (S14 und Repo-Test).
- **Plattformgebühren:** Die gespeicherten Beträge 800/774, 2000/1935 und 1000/968 passen zur Netto-Rundung. Nur 1000/968 ist ein echter Halbcent-Fall. Weicht die Plattform anderswo ab, sperrt der Reader.
- **Alle 277 Tests** im Repo-Stand sind grün (Tabelle unten).

## Tests

Befehl wie vorgegeben, mit `PYTHONDONTWRITEBYTECODE=1` und `NUMARON_OFFICE_TEST_PYTHON`, aus dem Repo.

| Test | Ergebnis |
|---|---|
| `founder-synmerco-funded-reader` | 27/27 |
| `founder-confirmed-funded-reader-guards` | 28/28 |
| `founder-confirmed-funded-matrix` | 36/36 |
| `founder-confirmed-funded-postpaid-closed` | 10/10 |
| `founder-confirmed-funded-authority` | 20/20 |
| `founder-confirmed-funded-lifecycle` | 6/6 |
| `founder-confirmed-funded-nested-execution` | 1/1 |
| `founder-confirmed-funded-restoration` | 4/4 |
| `founder-confirmed-funded-review-commit` | 1/1 |
| `founder-gate-acceptance` | 22/22 |
| `founder-gate-office` | 8/8 |
| `founder-order-claims` | 14/14 |
| `founder-order-accountability` | 6/6 |
| `founder-ugig-production.integration` | 19/19 |
| `founder-production-order-bindings` | 27/27 |
| `founder-order-github` | 26/26 |
| `founder-payment-runtime` | 2/2 |
| `founder-ugig-multipart` | 14/14 |
| `founder-ugig-pilot-delivery` | 6/6 |

**Beweistests (nur Temp-Ordner):** `poc-gate.test.mjs` 16/16, `poc-reader.test.mjs` 14/14, `poc-timer-crash.mjs` einzeln. Grün heisst hier: **das beschriebene Verhalten wurde beobachtet.**

Ablage: `C:\Users\Patrice\AppData\Local\Temp\claude\C--Users-Patrice-automaton\1dbd6454-ecd5-4e80-8ee9-3b620dcdf198\scratchpad\gate-reader-review-v1`

### Mutationen

Gegen 13 Testdateien, ohne `founder-gate-office`. Grundlauf grün. Ausführliche Ergebnisse in `mutation-results.json` im selben Ordner.

| Ergebnis | Mutationen |
|---|---|
| Erkannt (19) | T1, T4, H1a, H2a, H2b, H2c, M1a, M2, M3, M5a, M4, H3a, B1a, B1b, R5, R6, R7, R10, R12 |
| Überlebt, echte Lücke (8) | T2 Bindung nicht angeschlossen, H1b allgemeiner Pfad, R1 Symlink, R2 Blattgrösse, R4 OFF nach Antwort, R8 `scopeDigest`, R9 `rootTaskId`, R11 Schema |
| Überlebt, geringe Wirkung (3) | T3 Scheduler-Drosselung (keine Sicherheitsfrage, aber M1 ungesichert), H1c (der vorherige Refresh sperrt schon), R3 (das Blatt fängt es zusätzlich ab) |

## Nicht geprüft

- **Echter Synmerco-Abruf:** Auth-Kopf, Antwortform, ob `funded` Geld wirklich hält und was nach Fristablauf geschieht. Die Feldnamen stammen nur aus gespeicherten Antworten; deren Skripte (`synmerco.ps1`) habe ich wegen möglicher Zugangsdaten nicht geöffnet.
- **Voller Start:** kein Lauf über `founder-mt5.mjs` oder den Dienst. Den Blockadeweg von R-H1 habe ich in `refreshRegistrations` ausgeführt, in `cycle()` nur gelesen.
- **H1 im allgemeinen uGig-Pfad:** nur gelesen (`founder-production-order-bindings.mjs:146`, `founder-ugig-order-pipeline.mjs:56`). Andere Lieferwege gelesen: Binär und Office lesen beim Abgleich nur (`founder-ugig-binary-delivery.mjs:37`).
- **Produktivdaten:** Datenbanken und `artifacts/founder-integration-20261012` nicht geöffnet. Aus `artifacts/synmerco*` nur Feldnamen und Zustände von Escrow-Antworten ausgewertet.
- **Mehrere Prozesse:** nicht getestet. Die Bindung läuft in einer `IMMEDIATE`-Transaktion (gelesen).
- **Fremde Änderungen:** Während des Reviews hat sich der Arbeitsstand bei `AGENTS.md`, den Demo- und MT5-Bausteinen und `web/founder` geändert. Das stammt nicht von mir und ist nicht geprüft. Die geprüften Gate- und Reader-Dateien wurden zuletzt vor Beginn des Reviews geändert.

## Reihenfolge

1. **Vor dem Laden:** nichts zwingend. Sinnvoll, weil es eine Zeile ist: G-M1b. Der Apply bleibt Patrices Entscheidung.
2. **Vor dem Reader-Anschluss:** R-H1, R-H2, G-M1, die Reader-Tests aus G-M7, danach der echte Lesetest.
3. **Vor der ersten echten Kundenarbeit über das Gate:** G-M2 bis G-M6, H1b-Test, T2-Test.
4. **Vor der ersten Gewinnaussage:** G-M8 und N8.
