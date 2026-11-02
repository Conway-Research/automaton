# Entscheidungen für den Schluss

Stand 1.11.2026. Alles Offline-Machbare ohne diese Entscheidungen ist erledigt oder als offen benannt. Reihenfolge nach Wirkung; die Empfehlung steht jeweils dabei.

## Blockiert den Rest

| # | Entscheidung | Was davon abhängt | Empfehlung |
|---|---|---|---|
| 1 | **Stock beendet, nicht bestanden.** Auch der begrenzte Versuch V13 kam nicht über 29 von 79 hinaus, siehe `DIAGNOSE-STOCK-V12D.md`. Nach der vorab festgelegten Regel gibt es keinen weiteren Lauf mit diesem Modell. Offen, erst nach dem Start: ob ein anderes Modell versucht wird oder Stock als Ziel entfällt | Modelltraining für D, die 21 Anforderungen, Incident, K-Abschluss. Es bleiben 0 von 21 bestanden. | Nach dem Start entscheiden |
| 2 | ~~Unabhängiger Review~~ **Drei Runden gelaufen, weiter Einwände.** Danach Umbau und dritter Review, wieder mit Einwänden, siehe `REVIEW3-20261101.md`. Blocker danach behoben. Neu zu entscheiden: vollständiger vierter Review nach Stock, welche Zahlungsquellen als Beleg zählen (bis dahin wird kein Gewinn bestätigt), und die fünf Annahmen aus `REVIEW-20261101.md` bestätigen | Ohne bestandenen Review gilt keines dieser Pakete als abgenommen | Nach Stock |
| 3 | **Commit** der Offline-Arbeit auf `feat/confirmed-funded-gate` | Sichert den Stand; bisher ist nichts committet | Ja, ohne Apply |

## Produktion

| # | Entscheidung | Hinweis | Empfehlung |
|---|---|---|---|
| 4 | ~~Preise erneuern~~ Am 2.11. belegt, Fristen bis 9.11. im Code, noch nicht geladen | Apply steht aus. Läuft die Frist vor dem Start ab, neu belegen | Vor dem Einschalten prüfen |
| 5 | Apply der Änderungen über den gemeinsamen Launcher | AGENTS.md verlangt dafür eine neue ausdrückliche Freigabe | Erst nach Stock und Review |
| 6 | Numaron einschalten | Nur persönlich im Dashboard | Nach 4 und 5 |
| 7 | Übergabe-HOLD und die 15 pausierten Codex-Automationen: aufheben oder dauerhaft stilllegen | Der Auftragsmonitor läuft weiter als bestehender Prozess | Stilllegen, solange ich hier arbeite |

## Wirtschaft

| # | Entscheidung | Hinweis | Empfehlung |
|---|---|---|---|
| 8 | Stundensatz in `assessProfileOffer` (`plan.hourlyRateMinor`): Bewertet er Arbeitszeit? | Kann gegen „keine Stundenlöhne“ verstoßen. Muss vor der Anbindung von G geklärt sein. | Durch Sachkosten ersetzen, falls er Rechenzeit meint |
| 9 | Grenzwerte, die der Code bewusst nicht annimmt: Mindeststichprobe, Nachfass-Anzahl und Wartezeit, Forschungslimits, Umfang der routinemäßig freigegebenen Arbeiten | Ohne Werte melden `salesProjection`, `contactEligibility`, `researchBudget` und `profitClaim` „fehlt“ | Vor der Anbindung festlegen |
| 10 | Echte Quellen: Upwork und die übrigen Kandidaten öffentlich prüfen, Zugänge klären | Bisher nichts verbunden; die Zugangslücken sind unbekannt | Erst nach dem Kernabschluss |
| 11 | Moltbook später lesend anbinden | Der Adapter bleibt deaktiviert, ein Zugangsvertrag ist nicht geprüft | Nachrangig |

## Trading

Ziel selbstständiges Handeln: Ablauf in `trading-supplement-20261101/STUFENPLAN-TRADING.md`. Die Fragen dort unter Stufe 1 schließen Punkt 12 ein.

| # | Entscheidung | Hinweis | Empfehlung |
|---|---|---|---|
| 12 | **Limits für 500 CHF:** 50 CHF je Position beibehalten, ändern oder das Ziel aufgeben | Die Mindestkommission frisst bei dieser Größe rund 3,4 % je Zyklus (eigene Rechnung). Forex, Indizes und Rohstoffe passen gar nicht hinein. | Zuerst entscheiden, bevor weiter gesucht wird |
| 13 | Live-Konditionen, Freitrade und Inaktivität bei Admirals bestätigen, PostFinance-Kurs erfragen | Alle positiven Testwerte hängen an einer unbestätigten Aktion. Zur Supportanfrage gibt es nur Empfangsbestätigungen. | Selbst nachfragen |
| 14 | Demo-Position aus dem alten Status und aktuellen Terminalstand lesend prüfen (Brokerabfrage) | Herkunft der einen Position ungeklärt | Bei Bedarf freigeben |
| 15 | Neue Backtests, Downloads, ein Paper- oder Demo-Lauf | Bisher kein Vorwärtsnachweis, der einzige Lauf hatte null Strategie-Fills | Erst nach 12 |
| 16 | Invest.MT5 eröffnen, einzahlen, Echtgeld | Nur du; die Belege stützen das derzeit nicht | Nein |

## Aufräumen

| # | Entscheidung | Hinweis | Empfehlung |
|---|---|---|---|
| 17 | Ordner `scripts/scripts/` (697 Einträge, Herkunft ungeklärt) | Nicht gelöscht; ein rekursiver Lauf über `scripts` nähme ihn mit | Nach Commit prüfen, dann löschen |
| 18 | PowerShell 7 (`pwsh.exe`) installieren | Sonst bleibt `founder-sofa-key` auf diesem Rechner unbewiesen | Installieren |

## Neu aus dem Review von Paket C (2.11.2026)

- **GitHub-Vorleistung gesperrt.** Entschieden nach deiner Anweisung vom 28.10.; willst du die Regel vom 18.10. (CHF 1 Risiko gegen Zahlungsversprechen) zurück, musst du das ausdrücklich sagen.
- **Erst Einnahmen mit Reader.** Damit Numaron bezahlte Aufträge bearbeiten kann, braucht es eine Quelle für bestätigte Zahlungen je Plattform und deine Entscheidung, welche Zahlungsquellen als Beleg zählen. Das folgt nach dem Start.
- **Altkopien entfernt** (dein Ja vom 2.11.). `scripts/scripts`: alle 1421 Dateien inhaltsgleich anderswo vorhanden, liegt im Windows-Papierkorb. `docs/superpowers/docs`: 3080 leere Ordner, entfernt.
- **Reader:** Plan und fünf Entscheidungen in `PLAN-READER-BESTAETIGTE-ZAHLUNG.md`.
- **`src/src` und `web/web` bleiben** (Entscheidung Patrice, 2.11.). Sie sind nicht im Commit und fließen weiter in den Quell-Fingerabdruck ein.
