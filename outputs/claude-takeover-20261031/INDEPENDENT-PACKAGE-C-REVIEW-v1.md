# Unabhängiger Review Zahlungs-Gate „Paket C“ (v1)

Stand 2.11.2026. Geprüft wurde der aktuelle, nicht committete Arbeitsstand auf `feat/founder-mittelerde-dashboard`. Numaron blieb AUS. Es liefen keine Dienste und keine Netzaufrufe, und es wurden keine Zugangsdaten gelesen. `git status` ist vor und nach dem Review identisch. Mutationen und Beweistests liefen nur in einer Kopie im Temp-Ordner.

## Urteil

**Das Gate taugt in dieser Form nicht als Zusage „Numaron arbeitet nur gegen bestätigte Zahlung“. Der Start sollte erst nach einer Entscheidung zu B1 erfolgen.**

- **Der Kern hält.** `createConfirmedFundedAuthority` lehnt alle 35 geprüften Fehlerfälle ab (siehe unten). Ohne Reader bleibt auf dem Restoration-Pfad jede Kundenarbeit gesperrt. Das gilt für uGig, Office, LaborX, Freelancer und Guru.
- **Das Gate deckt nicht alle Produktivpfade ab.** Der GitHub-Weg läuft daran vorbei und kann gegen ein blosses Zahlungsversprechen arbeiten und einen PR einreichen (B1).
- **Heute ist kein Reader angeschlossen.** `founder-mt5.mjs:126` übergibt weder `confirmedWorkSource` noch `confirmedOwnRecipients`. Nach dem Einschalten gibt es deshalb über diese Pfade keine Kundenarbeit und keinen Umsatz. Offen bleiben nur GitHub-Vorleistung und Dealwork.
- **Wann die übrigen Befunde wirken:**
  - H1, H2 und M1 werden erst mit einem echten Reader erreichbar und müssen vorher behoben sein.
  - H3 und M4 betreffen die Buchführung und gelten, sobald ein Auftrag `paid` wird.

Ist B1 entschieden (GitHub-Vorleistung gesperrt oder von Patrice ausdrücklich zugelassen), spricht aus Sicht des Gates nichts mehr gegen den Start im Zustand „Reader fehlt, Kundenarbeit gesperrt“. Das ist dann ein sicherer Start ohne Aufträge, kein verdienender.

**Befunde: 1 blocker, 3 hoch, 7 mittel, 6 niedrig.**

## Befunde

### B1 — blocker: GitHub-Auftragsweg umgeht das Gate und arbeitet gegen ein Zahlungsversprechen

- **Stellen:**
  - `scripts/founder-runtime.mjs:77-78,104,213`
  - `scripts/founder-order-flow.mjs:9,12,14`
  - `scripts/founder-order-payment.mjs:30`
  - `scripts/founder-order-github.mjs:22,27`
  - `scripts/founder-github-postpaid.mjs:6,14`
  - `scripts/founder-production-order-bindings.mjs:30`
- **Szenario:** Ein öffentliches Issue enthält diese Angaben eines Maintainers:
  - `Bounty: $50`
  - `Payment: USD 40 net, settled as 40 USDC on Base within 14 days after acceptance`
  - `Fees: paid by maintainer`
  - `Recipient: @tricebr at 0x…`
  - Abnahmekriterien
  - den Satz „no assignment required“
- **Falsches Ergebnis:**
  - `openContributionConfirmed` wird wahr, und `require()` liefert `authorized-unpaid`.
  - `order-code` startet die Modellarbeit, `order-submit` erstellt den Draft-PR.
  - `requireConfirmedFundedOrders` und `confirmedWorkAuthority` werden auf diesem Weg nie geprüft; sie gelten nur in `openOrderRestoration`.
- **Warum das zählt:** Das widerspricht der Anweisung vom 28.10. („Zahlungsversprechen … ersetzen keine Finanzierung“, „Kundenarbeit ohne Absicherung nicht beginnen“) und Z02. Unbezahlte GitHub-PRs sind genau das Muster aus dem Audit vom 28.10.
- **Begrenzung:** höchstens ein offener Auftrag und CHF 1 Exposition (`POSTPAID_POLICY`). Der Schaden ist finanziell klein, die Arbeit wird aber öffentlich und unbezahlt abgegeben. Die Vorleistungsregel vom 18.10. erlaubte diesen Weg; sie ist älter als die Vorgabe vom 28.10., und beide stehen im Code nebeneinander.
- **Beleg:**
  - Verdrahtung gelesen.
  - Ausgeführt und grün in `founder-order-github.test.mjs` (26/26), unter anderem:
    - „GitHub postpaid preparation and publication…“
    - „production GitHub declaration selector…“
    - „actual GitHub submitted order… ordinary=true“
  - `founder-payment-runtime.test.mjs` (2/2) grün.
  - Nicht ausgeführt: der volle Produktivstart mit echtem GitHub-Zugang.
- **Korrektur:** Patrice entscheidet. Empfehlung: in der Produktivkomposition `postpaidSource` so setzen, dass `modeFor` immer `platform-escrow` liefert, oder `funding.require` im Order-Flow an die Gate-Autorität binden. `START_SCOPES.github.work` entsprechend anpassen und einen Test ergänzen, der die Produktivkomposition prüft.

### H1 — hoch: Mehrteilige Lieferung geht nach Widerruf weiter

- **Stellen:**
  - `scripts/founder-order-lifecycle.mjs:3,18`
  - `scripts/founder-order-restoration.mjs:43,48`
  - `scripts/founder-ugig-pilot-delivery.mjs:45,47,58`
  - `scripts/founder-production-order-bindings.mjs:139,144`
- **Szenario:** Eine Lieferung mit `numbered-messages-v1` bricht nach Teil 2 ab, und `pendingWrite` steht auf `delivery`. Danach meldet die Gate-Quelle `funding.status='revoked'`, und `allows()` ist `false`.
- **Falsches Ergebnis:** `reconcile-delivery` gehört nicht zur Menge `funded` und durchläuft weder Refresh noch Gate. `canResumeDelivery` prüft nur Capability und Verifikation. Die restlichen Teile gehen an den Kunden, und der Auftrag wird `submitted`.
- **Beleg:** ausgeführt (`poc-multipart.test.mjs`): Posts 2 → 5, Zustand `submitted`, auch mit strikter Planung. Der Fixture-Altbeleg `funding` blieb dabei gültig. Wenn auch die uGig-Quelle den Widerruf sieht, stoppt `authority()` den Versand.
- **Korrektur:** `canResumeDelivery` muss bei strikter Politik vor jedem neuen Teil `refresh` und `allows` verlangen. Ohne Gate darf `reconcile-delivery` nur lesen. Regressionstest ergänzen.

### H2 — hoch: Ein Escrow deckt beliebig viele Aufträge, Belege haben keine eigene Identität

- **Stellen:** `scripts/founder-confirmed-funded-authority.mjs:36,57,62,69`
- **Szenario:** Aufträge A und B werden aus demselben Escrow über 38 USD gemeldet, mit derselben `sourceRef`.
- **Falsches Ergebnis:** `allows(A)` und `allows(B)` sind beide `true`.
- **Ursache:**
  - Die Bindung ist `digest(expected)`, und diesen Wert erhält der Reader selbst. Er muss ihn nur zurückgeben.
  - Die Office-Fixture zeigt das Muster: `compensation:{...part,...expected.customerWork}`. So wird der Vergleich zur Tautologie.
  - Das Gate verlangt keine Escrow-, Vertrags- oder Transaktions-ID, keine Plattform-Auftragsnummer im Beleg und keinen Zahler.
  - Es merkt sich auch nicht, welcher Auftrag einen Beleg schon verwendet hat.
  - Die drei Beleg-Teile haben keinen eigenen Zeitstempel. Frische wird nur einmal auf oberster Ebene behauptet.
- **Abgrenzung:** Ein wörtliches Replay eines Belegs von A auf B wird abgelehnt (ausgeführt). Offen ist nur der Fall, dass der Reader frisch bindet.
- **Beleg:** ausgeführt (`poc-c.test.mjs`, P1).
- **Korrektur:**
  - Pflichtfeld für die Finanzierungs-ID und die Plattform-Auftragsnummer im Beleg.
  - Atomarer eindeutiger Anspruch `Finanzierungs-ID → Auftrag + Meilenstein` im bestehenden Store, analog zur Belegprüfung in `founder-opportunity-store.mjs:36`, also ohne neues Ledger.
  - Schriftlicher Reader-Vertrag, bevor ein Reader angeschlossen wird.

### H3 — hoch: Simulierte oder rückgebuchte Belege zählen in der Buchführung als Eingang

- **Stellen:**
  - `scripts/founder-order-accountability.mjs:5,32,37`
  - `scripts/founder-ugig-completion.mjs:13`
  - `scripts/founder-runtime.mjs:145`
- **Szenario:** Ein Auftrag `paid` mit `payment={confirmed:true,evidenceRef:'synthetic:settlement',receiptId:'fake-provider:1',environment:'synthetic',synthetic:true,refunded:true,chargeback:true,amountMinor:900,currency:'CHF',…}`.
- **Falsches Ergebnis:** `orderAccounts` liefert `contributionRappen:890` und keine Blocker. `readPayment` akzeptiert die Selbstangaben `reviewed:true` und `independentlyVerified:true` aus einer lokalen JSON-Datei, und Z07 endet mit genau solchen Fake-Werten auf `paid`.
- **Widerspruch:** `ENTSCHEIDUNGEN-FUER-PATRICE.md`, Punkt 2 sagt: „bis dahin wird kein Gewinn bestätigt“. Für diesen Pfad stimmt das nicht. `receiptPolicy` existiert nur in `founder-adaptation` und `founder-customer-funnel`, nicht hier.
- **Einordnung:** Für den Eintritt braucht es eine lokale Datei mit diesen Flags oder einen fehlerhaften Reader. Der Wert steht im Laufzeit-Snapshot, eine Anzeige in `web/` oder `founder-dashboard.mjs` habe ich nicht gefunden.
- **Beleg:** ausgeführt (direkter Aufruf der Funktion); Z07 ausgeführt.
- **Korrektur:** Solange die Zahlungsquellen nicht entschieden sind: `contributionRappen:null` mit Blocker `receipt-source-policy-undecided`. Danach eine feste Quellenliste in `validateOrderPayment`, unbekannte Felder und Marker wie `synthetic` hart ablehnen.

### M1 — mittel: Gültige Arbeit wird abgebrochen, Kosten fallen trotzdem an

- **Stellen:**
  - `scripts/founder-confirmed-funded-authority.mjs:6,41,46`
  - `scripts/founder-order-restoration.mjs:39,42,46,160`
  - `scripts/founder-order-execution.mjs:109,121,135`
  - `scripts/founder-runtime.mjs:164,218`
- **Szenario 1:** Ein Modellaufruf oder Sandbox-Lauf dauert länger als 60 s. `assertActive` wirft danach `Source action blocked`, obwohl die Finanzierung gültig ist.
- **Szenario 2:** Der Scheduler ruft alle 10 s `refreshRegistrations` auf. `refresh` löscht den Beleg schon beim Start, sodass eine laufende Aufgabe im Lesefenster abbricht.
- **Falsches Ergebnis:** Die Sperre ist sicher, aber die Kosten sind verbraucht, das Produkt wird verworfen, und die Adapter haben `retrySafe:false`. Zusätzlich liest der Reader pro aktivem Auftrag alle 10 s.
- **Beleg:** ausgeführt (P3, P4).
- **Korrektur:** Alten Beleg bis zum Ergebnis des neuen Lesens behalten (die 60-s-Grenze gilt weiter, negative Ergebnisse löschen sofort). Vor `active(ctx)` nach langen Schritten gezielt erneuern. Scheduler-Lesen drosseln.

### M2 — mittel: Adapter-Lernen gibt Modellkosten ohne Gate frei

- **Stellen:**
  - `scripts/founder-order-adapter-learning.mjs:7,9,22`
  - `scripts/founder-order-restoration.mjs:167`
- **Szenario:** Ein Auftrag im Zustand `assigned` mit `termsVerified`, `allows()=false`, ohne `work`-Capability.
- **Falsches Ergebnis:** `tick` reiht `source-adapter-draft-adapter` mit 50 Rappen Modellkosten ein. Das Budget bleibt die Grenze, die Zahlungsprüfung fehlt aber.
- **Beleg:** ausgeführt (P5, mit Fake-Controller; die Ausführung des Entwurfs selbst lief nicht).
- **Korrektur:** In `advance` und `binding` bei strikter Politik `allows()` verlangen oder das als bewusste Ausnahme festhalten.

### M3 — mittel: Zahlung wird gegen andere Beträge geprüft als das Gate

- **Stellen:**
  - `scripts/founder-ugig-completion.mjs:13`
  - `scripts/founder-order-accountability.mjs:4-5`
  - `scripts/founder-opportunity-store.mjs:18`
- **Szenario:** Das Gate bestätigt brutto 100, netto 90 USD. Der Altbeleg `funding` nennt 900 Minor (9 USD), und es gehen 9 USD ein.
- **Falsches Ergebnis:** Der Auftrag wird `paid`, die Forderung über 90 USD gilt als erledigt. Nichts vergleicht `customerWork` mit `funding` oder `paymentAuthorization`.
- **Einordnung:** Auslöser wäre eine widersprüchliche geprüfte Vereinbarung, kein Angriff von aussen.
- **Beleg:** ausgeführt (`poc-payment-mismatch.test.mjs`, Z07 mit geänderten Beträgen grün).
- **Korrektur:** Bei `confirmAssignment` Beträge, Währung und Empfänger exakt abgleichen, sonst Fehler. `validateOrderPayment` gegen `customerWork.netDecimal` prüfen.

### M4 — mittel: Rückbuchung nach `paid` wird nie gesehen

- **Stellen:**
  - `scripts/founder-opportunity-store.mjs:42`
  - `scripts/founder-order-lifecycle.mjs:23`
  - `scripts/founder-order-accountability.mjs:32`
- **Szenario:** Eine bestätigte Zahlung wird später zurückgebucht.
- **Falsches Ergebnis:** Für `paid` gibt es keine Folgeaktion mehr, und der Store verbietet das Wiederöffnen („without an explicit refund workflow“). Einen solchen Ablauf gibt es für diese Aufträge nicht, der Eingang bleibt bestehen. Vor `paid` sperrt eine zurückgezogene Finanzierung korrekt (ausgeführt).
- **Beleg:** Code gelesen, `refunded:true` in der Buchführung ausgeführt (siehe H3).
- **Korrektur:** Eigenen Zustand für Rückbuchung und periodischen Abgleich einführen. Bis dahin „bezahlt“ als „zum Prüfzeitpunkt bezahlt“ kennzeichnen.

### M5 — mittel: Prüfsummen für Eingaben, Abnahme und Korrekturumfang sind nicht an die Wirklichkeit gebunden

- **Stellen:**
  - `scripts/founder-confirmed-funded-authority.mjs:14,59`
  - `scripts/founder-opportunity-store.mjs:13`
- **Szenario 1:** `inputsDigest=digest('inputs')` passt nicht zu den echten `binding.inputs`. Die Summen werden nur auf Format und Gleichheit mit dem Reader geprüft. Z07 und die Office-Läufe gehen so bis `paid`.
- **Szenario 2:** Ein Kunde verlangt Änderungen ausserhalb des Korrekturumfangs. `applyReview` setzt den Auftrag zurück auf `assigned`, `correctionScopeDigest` wird nirgends verglichen. Die Vorgabe verlangt für zusätzliche Revisionen eine passende Vergütungsbindung.
- **Beleg:** Fixtures ausgeführt; `grep` zeigt keine andere Verwendung im Produktivcode. Szenario 2 nur gelesen.
- **Korrektur:** Summen aus den echten Eingaben und Kriterien berechnen und vergleichen. Korrekturen an den vereinbarten Umfang binden und im Zweifel sperren.

### M6 — mittel: 31 von 50 Mutationen bleiben unentdeckt

Details in der Tabelle unten. Die Abwehr im Code ist für die wichtigsten Fälle vorhanden (ausgeführt, siehe „Was in Ordnung ist“), aber künftige Änderungen könnten sie unbemerkt entfernen. Besonders kritisch:

- R02: Der echte `tick` könnte die strikte Politik verlieren. Die Tests rufen nur `planOrderActions` direkt auf.
- R05–R07: Die Gate-Prüfungen beim Content-Review in der Restoration sind ungetestet.
- A01, A03, A05, A06: Währung, zu kleine Vorauszahlung und falsche Vertragsparteien sind ungetestet.
- A07, A10, A25, A26: Umgebung, gleichwertiger Schutz, `authenticated` und HTTPS sind ungetestet.

Weitere Schwächen:

- `assertBlockedAtPrepare` akzeptiert ein sehr breites Muster (`confirmed|authority|funded|assignment|evidence|mismatch|recipient|binding`).
- Der Test „future and expired“ prüft zwei Ablaufgründe gleichzeitig.
- Es gibt keinen Test über `openFounderRuntime` oder die Komposition in `founder-mt5.mjs`.

**Korrektur:** `poc-matrix.test.mjs` übernehmen, einen `tick`-Test und einen Kompositionstest ergänzen.

### M7 — mittel: Z01, Z03, Z05, Z08 und Z09 sind nur an unverbundenem Code belegt

- **Stellen:** `scripts/founder-order-claims.mjs` wird nur von seinem eigenen Test importiert (`grep`). Die Laufzeit rechnet mit `orderAccounts` (`founder-order-accountability.mjs`).
- **Falsches Ergebnis:** Die 14 grünen Tests sagen nichts über den Produktivpfad. `orderAccounts` führt ganzzahlige Minor-Beträge und kann etwa 9,675 USDC nicht in Originalpräzision abbilden (Z09). Die Trennung von „freigegeben“ und „Geld eingegangen“ (Z08) gibt es dort nicht.
- **Beleg:** Tests ausgeführt, Verwendung per `grep` geprüft.
- **Korrektur:** Modul einbinden oder diese Z-Fälle als „nicht im Produktivpfad“ führen.

### Niedrig

| # | Stelle | Befund | Beleg | Korrektur |
|---|---|---|---|---|
| N1 | `founder-order-restoration.mjs:169` | `confirmedFundedPolicy.configured` ist `true`, obwohl kein Reader existiert. Die Autorität selbst meldet korrekt `false`. | ausgeführt (P6) | `authority.status().configured` übernehmen |
| N2 | `founder-confirmed-funded-authority.mjs:41,69` | `allows()` ist bei synthetischem Beleg `true`, trotz `realWorkAuthorized:false`. Nur erreichbar mit `allowSyntheticForTests:true`, was `founder-mt5.mjs:126` nicht setzt. | ausgeführt (P7) | Produktivstart verweigern, wenn `synthetic` wahr ist |
| N3 | `founder-order-restoration.mjs:27`, `founder-order-lifecycle.mjs:22,26` | Die strikte Politik ist ohne Option aus. Heute setzt `founder-production-order-bindings.mjs:159` sie fest, und `founder-mt5.mjs` ist der einzige Produktivaufrufer. | gelesen | Standard umkehren, Tests setzen die Ausnahme ausdrücklich |
| N4 | `founder-confirmed-funded-authority.mjs:14` | `[A-Z]{3}` lehnt USDC ab, die Währung der belegten echten Aufträge. Das sperrt sicher, solche Aufträge wären aber nie möglich. | gelesen | Währungsliste festlegen |
| N5 | `founder-runtime.mjs:102-103,214`, `founder-dealwork-escrow.mjs:81-94` | Dealwork läuft ebenfalls am Gate vorbei, verlangt aber eigenen Vertrag, gehaltenes Escrow und unveränderte Bindung. Fachlich vertretbar, nur nicht einheitlich. | gelesen | Als Ausnahme festhalten |
| N6 | `docs/numaron-confirmed-funded-orders-20261028.json` | Nennt weiter `implemented:false` und `testsPassed:0`. | gelesen | Nach den Korrekturen aktualisieren |

## Was in Ordnung ist

- **Fehlerfälle:** 35 von 35 am unveränderten Code abgelehnt (`poc-matrix.test.mjs`, ausgeführt):
  - **Beleg fehlt oder ist kaputt:** `null`, `undefined`, String, Array; fehlende Teile; `1e3`, negativ, als Zahl.
  - **Falscher Inhalt:** Währung, zu kleine Vorauszahlung, fremde Parteien, falsche Umgebung, falsches Schema, fremde Bindung.
  - **Status:** `refunded`, `charged-back`.
  - **Quellen:** ungültige `sourceRef`, unsichere Quellen ohne `authenticated` oder ohne HTTPS.
  - **Auftrag:** Frist abgelaufen, Beträge ohne Summe, Käufer gleich Eigentümer, Auftrag während des Lesens geändert.
  - **Ablauf:** abgebrochen, Fehler nach dem Commit, wörtliches Replay auf einen anderen Auftrag.
- **Frische:** Die 60-s-Grenze ist exakt (59 999 ms gültig, 60 000 ms ungültig). OFF entzieht sofort.
- **Neustart:** Belege liegen nur im Speicher. Nach einem Neustart muss neu gelesen werden; alte Zustände, Produkte oder `funding` reichen nicht. Ein gespeichertes Produkt wird erst nach frischer Prüfung weiterverwendet.
- **Nebenläufigkeit:** Ein langsamer älterer Lesevorgang überschreibt keinen neueren Widerruf. Die Prüfung ist auf den Commit bezogen synchron.
- **Bindung:** `requireConfirmedFundedOrders=true` steht in `founder-production-order-bindings.mjs:159` hinter dem Options-Aufbau und lässt sich nicht per Parameter abschalten. `allowEquivalentProtection` wird produktiv nicht gesetzt.
- **Absturz:** Lieferintention und `pendingWrite` werden vor dem Versand gespeichert (`founder-order-restoration.mjs:45`). Bei unklarem Ergebnis wird abgeglichen statt blind erneut gesendet; zur Ausnahme siehe H1.
- **Budgets:**
  - `FOUNDER_LIMITS` bleibt bei 15000 / 2000 / 250 Rappen und 10 Workern.
  - Das Gate fügt weder Budget noch Berechtigungen hinzu.
  - Der Worker-Wert steht im Arbeitsstand gegenüber dem letzten Commit bei 10 statt 4. Das entspricht der Vorgabe.
  - Die Vorleistung ist auf 100 Rappen begrenzt.

## Mutationen (nur Temp-Kopie)

50 Mutationen, je gegen die sechs Gate-Testdateien sowie Integration und Office. **19 erkannt, 31 überlebt.** Nach dem Lauf waren die fünf mutierten Dateien der Kopie byte-gleich mit dem Repo.

| Ergebnis | Mutationen |
|---|---|
| Erkannt (19) | A02, A04, A15, A20, A21, A27, A28, A30, R03, R04, R09, E01, E02, E05, L01, L02, L03, B01, B02 |
| Überlebt, echte Testlücke (19) | A01 Währung, A03 Vorauszahlungsbetrag, A05 Käufer, A06 Auftragnehmer, A07 Umgebung, A08 Schema, A09 Gesamtbindung, A10 gleichwertiger Schutz, A18 Änderung während des Lesens, A19 Rücknahme nach Commit, A22 Frist, A24 Käufer gleich Eigentümer, A25 `authenticated`, A26 HTTPS, A31 Abbruchsignal, R02 `tick`-Politik, R05, R06, R07 Content-Review |
| Überlebt, durch zweite Prüfung abgedeckt oder geringe Wirkung (12) | A11 OFF in `allows` (ohne Beleg ohnehin `false`, mit Beleg ungetestet), A12/A13/A29 überlappende Ablaufregeln, A14 Alter beim Lesen (zweite Bedingung im selben Test), A16/A17 doppelte Generationsprüfung ohne `await` dazwischen, A23 Summenregel (fällt über den Vergleich mit dem Reader auf), R01 und R08 (Refresh wirft vorher), E03/E04 (Zustand bleibt durch den Refresh in der Restoration geschützt, das Produkt wird aber gespeichert) |

## Testläufe

Befehl wie vorgegeben.

| Test | Ort | Ergebnis |
|---|---|---|
| `founder-confirmed-funded-authority` | Repo | 20/20 |
| `founder-confirmed-funded-lifecycle` | Repo | 6/6 |
| `founder-confirmed-funded-nested-execution` | Repo | 1/1 |
| `founder-confirmed-funded-restoration` | Repo | 4/4 |
| `founder-confirmed-funded-review-commit` | Repo | 1/1 |
| `founder-gate-acceptance` | Repo und Kopie | 16/16 |
| `founder-order-claims` | Repo | 14/14 |
| `founder-ugig-production.integration` | Repo | 18/18 |
| `founder-gate-office` | nur Kopie | 8/8, siehe unten |
| `founder-order-github` | Kopie | 26/26 |
| `founder-payment-runtime` | Kopie | 2/2 |
| `poc-c` | Kopie | 6/6 |
| `poc-matrix` | Kopie | 35/35 |
| `poc-multipart` (Integrationstests plus P8) | Kopie | 19/19 |
| `poc-payment-mismatch` | Kopie | 16/16 |

Grün heisst bei den PoC-Tests von Befund P1 bis P9: **das Fehlverhalten ist nachgewiesen.**

**Office:** `NUMARON_OFFICE_TEST_PYTHON` ist in der Shell nicht gesetzt. Im Repo lief dieser Test deshalb nicht. Ich habe ihn in der Temp-Kopie mit dem Python-Pfad aus `founder-mt5.mjs:126` ausgeführt, damit kein `__pycache__` im Repo entsteht. Der Lauf gilt nur für diese Umgebung.

Beweistests und Harness liegen unter `C:\Users\Patrice\AppData\Local\Temp\claude\C--Users-Patrice-automaton\1dbd6454-ecd5-4e80-8ee9-3b620dcdf198\scratchpad`, in `copy\scripts\poc-*.test.mjs` und `mutate.mjs`.

## Nicht geprüft

- **Echter Reader:** Es gibt keinen. Seine Korrektheit, die Plattformantworten und das Verhalten bei echter Rückbuchung sind offen; H2 betrifft genau diese Stelle.
- **Produktivdaten:** `artifacts/founder-integration-20261012` und die Produktiv-Datenbanken habe ich nicht geöffnet. Ob dort Aufträge in `assigned` oder `accepted` liegen, weiss ich nicht. Das bestimmt, ob M2 und H3 sofort greifen.
- **Voller Start:** Kein Lauf über `openFounderRuntime` oder `founder-mt5.mjs`. Für B1 ist daher nicht ausgeführt, ob die Warteschlangenprüfung oder der Controller den GitHub-Weg im Echtbetrieb zusätzlich bremst. Im Code habe ich keine solche Sperre gefunden.
- **Andere Arbeitswege:** `private-draft`, `work-planner` und `code-execution` habe ich nicht darauf geprüft, ob darüber Kundenlieferungen entstehen können.
- **Mehrere Prozesse:** Zwei gleichzeitige Dienste auf derselben Datenbank habe ich nicht getestet.
- **Altbeleg `funding.expiresAt`:** Im Store fehlt ein Erneuerungsweg, sodass ein Auftrag nach Ablauf dauerhaft gesperrt bleiben könnte. Das wäre sicher, aber unpraktisch. Ob es produktiv so eintritt, habe ich nicht abschliessend geklärt.

## Reihenfolge

1. **Vor dem Start:** B1 entscheiden und umsetzen.
2. **Vor der ersten Gewinnaussage:** H3 und die Entscheidung zu den Zahlungsquellen, dazu M3 und M4.
3. **Vor dem Anschluss eines Readers:** H1, H2, M1, M2 und M5.
4. **Mit den Korrekturen:** M6 und M7 sowie die niedrigen Punkte.

## Nachtrag: Korrekturen vom 2.11.2026 (nicht Teil des unabhängigen Reviews, nicht erneut unabhängig geprüft)

- **B1 behoben:** `founder-runtime.mjs` setzt keine Vorleistungsquelle mehr, `allows()` in `founder-order-payment.mjs` lehnt ohne Quelle ab, `START_SCOPES.github.work` lautet `exact-funding-only`. Grundlage ist die Anweisung vom 28.10., kein neues Abwägen. Eine gespeicherte alte Vorleistungs-Freigabe erlaubt keine Arbeit mehr.
- **H3 behoben:** `orderAccounts` blockiert ausdrückliche Marker (`synthetic`, `refunded`, `chargeback`, Umgebung ungleich `production`). Der strikte Produktivpfad meldet bis zur Entscheidung über die Zahlungsquellen immer `receipt-source-policy-undecided` und keinen Beitrag. Namensmuster in `evidenceRef` werden nicht ausgewertet, weil sie unzuverlässig sind und bestehende Prüffälle solche Namen verwenden.
- **Änderung an bestehenden Tests:** In `founder-production-order-bindings.test.mjs` ist die Erwartung auf `exact-funding-only` geändert, weil die Sperre gewollt ist. In `founder-gate-acceptance.test.mjs` (Z07) ist eine Prüfung ergänzt. Sonst nichts.
- **Neu:** `founder-confirmed-funded-postpaid-closed.test.mjs`. Lauf: `evidence/package-c/after-fixes-20261102.tap`, 239 von 239 grün. Altfassungen: `pre-review-c-20261102/`.
- **Offen:** H1, H2, M1, M2, M5 vor dem Anschluss eines Readers; M3, M4 vor der ersten Gewinnaussage; M6, M7 und die niedrigen Punkte danach.
- **Nebenbefund:** `founder-order-github.test.mjs`, Fall `ordinary=true`, schlug im Sammellauf zweimal fehl und lief danach 5-mal grün. Vermutete Ursache, nicht nachgestellt: In `ordinaryGithubPaymentTerms` liegt der Kurszeitpunkt eine Millisekunde hinter `now` (`at>now`). Der Pfad ist durch die Sperre produktiv nicht mehr erreichbar.
