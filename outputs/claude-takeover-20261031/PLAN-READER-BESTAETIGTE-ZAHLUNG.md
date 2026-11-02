# Plan: Reader für bestätigte Zahlungen

Stand 2.11.2026. Nur Plan, nichts davon ist gebaut. Grundlage sind der Code, der Review von Paket C und gespeicherte Belege vom 28.10.; keine neue Abfrage bei einer Plattform.

## Ziel

Numaron darf heute keine Kundenarbeit beginnen, weil niemand dem Gate eine bestätigte Finanzierung melden kann. Der Reader schließt diese Lücke: Er liest je Auftrag Beauftragung, Vergütung und gesicherte Zahlung, und das Gate entscheidet. Er bucht, sendet und signiert nichts.

## Empfehlung: Synmerco zuerst

| Plattform | Stand laut Belegen | Für den ersten Reader |
|---|---|---|
| **Synmerco** | Einzige Plattform mit echtem Geld: 3 Aufträge, 38 USDC brutto, 36,765 USDC erhalten. Eigener Lesezugang und Escrow-Abfrage existieren. | **Zuerst.** Escrow mit Käufer, Verkäufer, Betrag, Netto und Zustand ist genau, was das Gate braucht. |
| uGig | 14 Bewerbungen offen, keine Beauftragung. Rechnungs- und SOL-Escrow-Prüfung sind gebaut. | Danach. Der Code ist da, es fehlt ein Auftrag zum Prüfen. |
| Dealwork | 8 Angebote, 0 Verträge. Eigene Escrow-Prüfung läuft am Gate vorbei. | Nur vereinheitlichen, wenn ein Vertrag kommt. |
| GitHub | 8 eigene PRs ohne bestätigte Vergütung. Keine Finanzierungsquelle. | Nicht planen, solange es keine echte Escrow-Quelle gibt. |
| Freelancer, Guru, LaborX | Nur manueller Browser oder persönliches Login. | Später, je mit eigener Klärung des erlaubten Zugangs. |

Stand der Belege ist der 28.10. Ob bei Synmerco heute Aufträge offen sind, weiß ich nicht.

## Was bei Synmerco fehlt

1. **Vertragsangaben.** Die gespeicherten Escrows enthalten in `terms` nur Quelle, Beschreibung und Bezug zum Gebot. Das Gate verlangt zusätzlich Eingaben, Abnahmekriterien, Korrekturumfang, Frist und Zahlungsauslöser. Diese kommen nicht von der Plattform, sondern aus einem von dir geprüften lokalen Auftragsblatt, wie es uGig schon hat (`ugig-contracts/<digest>.json`).
2. **Währung.** Das Gate akzeptiert nur drei Buchstaben, USDC hat vier (N4). Synmerco führt Cent-Beträge, Eingang war USDC. Ohne Entscheidung bleibt jeder Synmerco-Auftrag gesperrt.
3. **Arbeitsweg.** Synmerco ist heute nur als Lesequelle verdrahtet (`work:false`), ohne Vorbereitung und ohne Einreichung. Die frühere Einreichung lief über ein Einzelskript mit genau einem `submit-proof`. Der Reader allein ermöglicht also noch keine Lieferung.
4. **Beitrag in CHF.** Die Buchführung weist nur CHF als Beitrag aus (`settlement-currency-not-chf`). Ein Auftrag in USDC bleibt dort ohne Beitrag, bis es einen belegten Kurs gibt. Einen Kurs rate ich nicht.

## Schritte

Alle Schritte laufen offline mit Fake-Adaptern auf temporären Dateien, Numaron bleibt aus.

| # | Schritt | Ergebnis |
|---|---|---|
| 0 | Deine Entscheidungen unten | Festgehalten in `ENTSCHEIDUNGEN-FUER-PATRICE.md` |
| 1 | Offene Befunde vor Anschluss schließen: H1 (Lieferung nach Widerruf), H2 (ein Escrow, mehrere Aufträge), M1, M2, M5 | Pflichtfeld Finanzierungs-ID, eindeutiger Anspruch je Auftrag im bestehenden Store, Widerruf stoppt jeden weiteren Lieferteil, Beweistests aus dem Review übernommen |
| 2 | Testlücken schließen (M6): `tick`, Währung, Parteien, Umgebung, Komposition | Absichtlich eingebaute Fehler erneut laufen lassen; alle 19 echten Lücken müssen erkannt werden |
| 3 | Schriftlicher Reader-Vertrag | Felder, Frische (60 s), was der Reader nie darf, wann er sperrt |
| 4 | Währungsliste und Zahlungsquellen im Code | Gate und `validateOrderPayment` nach deiner Entscheidung; Beträge von Gate und Altbeleg werden abgeglichen (M3) |
| 5 | Lokales Auftragsblatt für Synmerco | Schema nach uGig-Vorbild; nur du gibst frei, nie Modell oder Aufgabentext |
| 6 | Synmerco-Reader | Liest das eigene Escrow und das Auftragsblatt; Tests mit den Feldern der gespeicherten Antworten, darunter Fremd-Escrow, falscher Verkäufer, zu wenig Betrag, `released` als nicht mehr gedeckt |
| 7 | Rückbuchung nach `paid` (M4) | Kennzeichnung „zum Prüfzeitpunkt bezahlt“ und periodischer Abgleich |
| 8 | Unabhängiger Review, Regression | Muss vor dem Anschluss bestanden sein |
| 9 | Anschluss in `founder-mt5.mjs` | Nur mit deiner Freigabe, über den gemeinsamen Launcher |
| 10 | Arbeitsweg für Synmerco | Eigener Abschnitt: Vorbereitung und Einreichung. Einreichen ist eine Außenwirkung und braucht deine eigene Freigabe |

Schritte 1 und 2 lohnen sich unabhängig von der Plattform. Schritte 3 bis 8 betreffen den ersten Reader, Schritte 9 und 10 machen ihn erst wirksam.

## Reihenfolge zum Start

Der Reader muss nicht vor dem Start fertig sein. Empfehlung: erst Founder-Version ohne Kundenarbeit starten, parallel offline bauen. So bleibt der Start nah, und der Reader kommt später über einen eigenen Apply dazu. Einnahmen gibt es erst danach.

## Deine Entscheidungen

1. **Synmerco zuerst?** Empfehlung: ja.
2. **USDC als Vertragswährung zulassen?** Empfehlung: ja, nur USDC zusätzlich zu Dreibuchstaben-Währungen, in Originalpräzision und ohne Umrechnung.
3. **Welche Zahlungsquellen zählen als Beleg?** Empfehlung: die drei Arten, die der Code schon kennt: Kontoauszug, finalisierter Chain-Beleg, Abrechnung des Anbieters. Dazu der Grundsatz: Plattformanzeige allein zählt nicht, entscheidend ist der Eingang.
4. **Wer prüft das Auftragsblatt?** Empfehlung: du, je Auftrag. Das kostet deine Minuten, die erfasst werden.
5. **Darf ich später einmal echt lesend testen?** Nur eine eigene Escrow-Abfrage, keine Schreibaktion. Empfehlung: erst nach Schritt 8 entscheiden.

## Nicht belegt

- Ob die Synmerco-API noch so antwortet wie am 28.10. und ob ein Escrow vor der Arbeit tatsächlich als gehalten sichtbar ist. Die gespeicherten drei stehen alle auf `released`, den Zustandsnamen für „gehalten“ kenne ich daraus nicht.
- Ob Synmerco neue Aufträge liefert. Der Plan schafft die Voraussetzung, keine Nachfrage.
- Der Aufwand. Ich nenne keine Zeit, weil Schritt 10 von der Plattform abhängt.

## Entscheidungen Patrice, 2.11.2026: „wie empfohlen“

1. Synmerco zuerst.
2. USDC zusätzlich zu Dreibuchstaben-Währungen, Originalpräzision, keine Umrechnung.
3. Als Beleg zählen Kontoauszug, finalisierter Chain-Beleg und Abrechnung des Anbieters; die Plattformanzeige allein nicht.
4. Patrice prüft jedes Auftragsblatt, Minuten werden erfasst.
5. Echter Lesetest wird erst nach dem Review entschieden.

Offline, Numaron aus. Anschluss, Einreichen und echtes Lesen sind damit nicht freigegeben.
