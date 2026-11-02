# Founder-Version online nehmen

Stand 2.11.2026. „Online“ heißt hier: Numaron läuft auf diesem PC, gestartet mit deinem Knopf im Dashboard. Der Dienst hört nur auf `127.0.0.1`; öffentlich erreichbar ist nichts, und das bleibt so, solange du nichts anderes sagst.

Aktueller Stand jederzeit, nur lesend:

```bash
node scripts/founder-go-live-check.mjs
```

## Reihenfolge

| # | Schritt | Wer | Stand |
|---|---|---|---|
| 1 | Modellpreis und Bedingungen der Lesequellen neu belegen und die Fristen erneuern | Claude | Erledigt am 2.11., gültig bis 9.11., noch nicht geladen. Liegt der Start später, muss ich die Seiten erneut lesen. |
| 2 | Dashboard-Arbeit abschließen | Sitzung „Founder Dashboard öffnen“ | Runden Wälder bis Bildrate am 2.11. fertig und geladen. Jede weitere Runde braucht wieder Regression und Apply. |
| 3 | Unabhängiger Review des Zahlungs-Gates (Paket C) | Claude | Erledigt am 2.11., Ergebnis in `INDEPENDENT-PACKAGE-C-REVIEW-v1.md`. Blocker B1 und H3 behoben, 239 Tests grün. H1, H2 und die mittleren Befunde sind offen und vor dem Anschluss eines Readers zu schließen. |
| 4 | Gesamtregression auf dem endgültigen Stand | Claude | Erledigt am 2.11. nach der Innenräume-Runde: 2399 Tests, 2393 grün, 4 übersprungen, 2 rot (siehe „Bekannt“). Beleg: `evidence/regression-endstand3-20261102.tap`. |
| 5 | Commit | Du entscheidest | `e0c5bc97` auf `feat/founder-mittelerde-dashboard`, nicht gepusht. Die später geladenen Dashboard-Runden sind noch nicht committet. |
| 6 | Apply über den gemeinsamen Launcher | Du gibst frei, ausdrücklich für diesen Batch | Erledigt am 2.11.: zuletzt Batch `fff19771…` durch die Dashboard-Sitzung nach deiner Freigabe dort, 2393 von 2399 grün (Angabe der Sitzung). Check meldet `ready: true`, Dienst antwortet, Numaron aus. |
| 7 | „Numaron einschalten“ | Nur du persönlich | Offen. Vorher: Preisfrist 9.11. beachten und Platz auf C: schaffen (2.11.: 12,6 GB frei). |

## Was nicht warten muss

Stock, Incident, das Modelltraining für D und die 21 Anforderungen (0 von 21 bestanden) müssen für den Start nicht fertig sein. Die Pakete D, F, G, H, I, J und K sind nicht im Produktivcode eingebunden; sie laufen also weder mit noch können sie etwas verhindern. Der Preis dafür: Numaron darf bis dahin keine Expertenfähigkeit behaupten, und was es liefern darf, bleibt auf das qualifizierte Dokumentenprojekt (A/B) und die bestehenden Sperren begrenzt. Das ist meine Empfehlung; bewiesen ist sie erst im Betrieb.

## Was nach dem Einschalten gilt

**Der Start bringt zunächst keine bezahlten Aufträge.** Es ist weder ein Reader für bestätigte Zahlungen noch eine GitHub-Finanzierungsquelle angeschlossen. Nach dem Knopfdruck sucht und bereitet Numaron also vor, Kundenarbeit bleibt auf uGig, Office, LaborX, Freelancer, Guru und GitHub gesperrt. Dealwork verlangt einen eigenen Vertrag mit gehaltenem Escrow; einen solchen Vertrag gibt es derzeit nicht. Das ist die sichere Folge der Vorgabe vom 28.10., kein Fehler. Der Weg zu Einnahmen steht in `PLAN-READER-BESTAETIGTE-ZAHLUNG.md`.

GitHub-Vorleistung ist gesperrt: Die frühere Regel vom 18.10. (ein Auftrag, CHF 1 Risiko, Arbeit gegen ein Zahlungsversprechen im Issue) widerspricht der neueren Anweisung vom 28.10. und gilt deshalb nicht mehr.

Unverändert: CHF 20 je Tag, CHF 150 je 30 Tage, CHF 2.50 je Aufgabe, höchstens 10 Worker. Ich erweitere weder Budgets noch Berechtigungen.

Empfohlene erste Stufe: Numaron sucht und bereitet vor, Trading bleibt ausgeschlossen. Dafür gibt es keinen Handlungsbedarf, solange der Trading-Stufenplan nicht entschieden ist und du keinen Handel freigibst.

SOFA ist seit 20.10. abgelaufen und laut deiner früheren Entscheidung nicht erneuert. Ohne SOFA arbeitet Numaron ohne diese Quelle; das blockiert den Start nicht.

## Bekannt und nicht belegt

- Ein echter Lauf im eingeschalteten Zustand ist vor dem Knopfdruck nicht möglich. Geprüft wird nur mit Fake-Adaptern auf temporären Dateien.
- Offen aus der Liste „vor Anbindung“ (`REVIEW3-20261101.md`): gilt für die nicht eingebundenen Pakete und ist vor deren Einbindung zu schließen, nicht vor dem Start.
- `scripts/trade-radar-ui.test.mjs` ist rot. Der Test erwartet einen Fehlerpfad, den `web/founder/app.js` schon im letzten Commit nicht mehr enthält. Ich habe die Erwartung nicht abgeschwächt. Trading-Anzeige, kein Start-Blocker.
- 4 übersprungene Fälle: 2 „agreed heading page“ und 2 „real visual step“ im Office-Weg, sie laufen in dieser Umgebung nicht.
- Der erste Anlauf des letzten Apply scheiterte: Der Supervisor meldete `startup-evidence-mismatch` und beendete den Dienst nach 45 s, der zweite Anlauf lief durch. Ursache nicht belegt (siehe `PROGRESS.md`). Es fällt sicher aus und betrifft den Dienststart, nicht den Knopf.
- `scripts/trading-mt5.test.mjs` nicht ausgeführt (Trading-Vorgabe „keine Tests“), `founder-sofa-key` ohne `pwsh.exe` unbewiesen.
- Stock V13 ist am 2.11. ohne Fortschritt geendet (bester Stand 29 von 79, Befund: Modell reicht nicht). Ein Projekt dieser Größe darf Numaron deshalb nicht als lieferbar zusagen. Der Start wird dadurch nicht blockiert.
