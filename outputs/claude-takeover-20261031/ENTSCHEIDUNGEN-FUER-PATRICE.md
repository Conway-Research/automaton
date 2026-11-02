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

## Entscheidung Grenzwerte Kundengewinnung, 2.11.2026: „wie vorgeschlagen“

Stundensatz durch Sachkosten ersetzen, Mindeststichprobe 20 abgeschlossene Aufträge, höchstens 2 Nachfassungen je 7 Tage, routinemäßig nur das Dokumentenprojekt A/B. Die Werte sind Vorschläge ohne Datengrundlage und nach echten Läufen zu prüfen. Damit erledigt: Punkt 8 und die genannten Teile von Punkt 9. Forschungslimits bleiben offen.

## Freigabe Patrice, 2.11.2026: „numaron hat die handelsfreigabe. alle freigaben“

So umgesetzt:
- **Trading-Arbeit:** Sperre für Änderungen, Offline-Tests und Reviews der Handelsbausteine aufgehoben.
- **Demo-Handel:** Numaron darf nach deinem Knopfdruck auf dem Demokonto handeln, innerhalb der dokumentierten Limits.
- **Apply:** Gilt für den nächsten stabilen, geprüften Stand, mit Numaron aus.
- **Reader:** Darf nach bestandenem Review angeschlossen werden.

Bleibt, weil die Freigabe dazu nichts Bestimmtes sagt oder es nicht von mir kommen kann:
- **Echtgeld:** Es gibt kein Live-Konto im Code, keine Einzahlung und keinen Kandidaten, der die Regel aus dem Stufenplan besteht. Konto, Einzahlung und Zugang kommen nur von dir. Eine Echtgeld-Anbindung braucht deine Angaben zu Konto, Kapital und Verlustgrenze.
- **Orders durch Claude:** Ich gebe selbst keine Orders auf, auch nicht auf Anweisung.
- **Einschalten:** Nur dein Knopf (AGENTS.md).
- **Budgets und Limits:** Unverändert, solange du keine neuen Zahlen nennst.
- **Codex-HOLD:** Besteht weiter, bis du ihn ausdrücklich aufhebst.

## Aus dem Review der Handelsbausteine (2.11.2026), Details in `INDEPENDENT-TRADING-REVIEW-v1.md`

**Korrektur:** „Innerhalb der dokumentierten Limits“ stimmte nicht. Im Code stehen 5 % je Trade, 15 % gesamt, 30 % Tagesverlust (`trading-risk.mjs:1`); gespeicherte Demo-Vorgänge erreichten laut Review rund das Fünffache des Kapitals. 0,5 / 3 / 2 %, 15 % Drawdown, 50 CHF, 500 CHF und „kein Hebel“ sind dort nicht umgesetzt.

Zu entscheiden:
1. **Gültiger Limitsatz:** 5/15/30 (bestätigt 13.10.) oder 0,5/3/2 mit 15 % Drawdown, 50 CHF Nominal, 500 CHF, kein Hebel (neuerer Stand). Empfehlung: der neuere.
2. **Märkte:** Es gibt keine Freigabeliste, Krypto wird auf dem Demokonto bevorzugt. Empfehlung: Aktien, ETFs, Währungen, keine Krypto, wie zuletzt dokumentiert.
3. **Offene Positionen bei OFF:** Heute bleiben sie offen und auch das Schließen ist gesperrt. Empfehlung: Schließen und Schutz bleiben bei OFF möglich, neue Einstiege nicht.
4. **Offene Demo-Position:** Vermutlich BCHUSD vom 23.10. Beim nächsten Einschalten kann sie sofort zu Markt geschlossen werden. Demo, kein echtes Geld.

## Entscheidung Limits, 2.11.2026: „5 / 15 / 30 behalten“

Gültig: 5 % je Trade, 15 % gesamt, 30 % Tagesverlust, wie im Code. Der Satz 0,5/3/2 mit 15 % Drawdown, 50 CHF und „kein Hebel“ ist damit nicht Vorgabe; die Demo kann weiter ein Mehrfaches des Kapitals als Nominal erreichen. Märkte und OFF-Regel wie vorgeschlagen: Aktien, ETFs, Währungen, keine Krypto; Schließen und Schutz bleiben bei OFF möglich.

## Entscheidung Märkte und Hebel, 2.11.2026: „auch mit hebel traden und unter anderem auch crypto. alles zugängliche traden“

Ersetzt den Vorschlag „keine Krypto“. Keine Freigabeliste für Märkte und keine Hebelgrenze auf dem Demokonto; es gelten 5/15/30. Die offene Frage nach dem Echtgeld ändert das nicht: Kein Live-Konto ist angeschlossen.
