# Reader-Vertrag für bestätigte Zahlungen

Stand 2.11.2026. Gilt für jede Quelle, die dem Gate `createConfirmedFundedAuthority` Belege liefert. Erster Reader: `scripts/founder-synmerco-funded-reader.mjs`. **Er ist nicht angeschlossen.** Der Anschluss in `founder-mt5.mjs` braucht deine eigene Freigabe und einen Apply.

## Was ein Reader tun darf

- Nur lesen, mit festem Ursprung über HTTPS, ohne Weiterleitungen und über den bestehenden Zugang.
- Keine Geheimnisse in Fehlermeldungen oder Belegen ausgeben.
- Bei allem, was nicht eindeutig ist, sperren.

## Was ein Reader nie darf

Schreiben, signieren, einzahlen, Geld freigeben, Kunden kontaktieren, Numaron einschalten, Budgets ändern. Auftragsangaben von einem Modell oder aus Aufgabentext übernehmen.

## Was er liefern muss

| Teil | Pflicht |
|---|---|
| Oberste Ebene | `schema`, `environment: production`, `bindingDigest`, `observedAt`, `expiresAt`; höchstens 60 Sekunden alt |
| `assignment` | `status: assigned`, `platformOrderId` gleich der Auftragsnummer, Käufer und eigener Auftragnehmer |
| `compensation` | Alle vereinbarten Felder exakt wie im geprüften Auftrag |
| `funding` | `fundingId` (eigene Kennung der Finanzierung), Art, Status, Betrag, Währung, Empfänger |
| Alle drei Teile | `bindingDigest` und `sourceRef` auf dem festen Ursprung |

## Was das Gate selbst sicherstellt

- **Eine Finanzierung, ein Auftrag:** `fundingId` wird atomar und dauerhaft an genau einen Auftrag und Meilenstein gebunden.
- **Eigener Empfänger:** Er muss in der vertrauenswürdigen Liste stehen, die nur die Komposition setzt.
- **Frische:** Ein Beleg gilt höchstens 60 Sekunden, Belege liegen nur im Speicher. Laufende Arbeit erneuert alle 30 Sekunden; ein negatives Ergebnis stoppt sie.
- **Widerruf:** Danach geht kein weiterer Lieferteil hinaus. Der Abgleich bleibt lesend.
- **Übereinstimmung:** Vereinbarung, Altbeleg und echte Eingaben und Abnahmekriterien müssen zusammenpassen. Korrekturen außerhalb des vereinbarten Umfangs werden abgelehnt.

## Deine Entscheidungen, im Code umgesetzt

- **Währung:** Drei Buchstaben oder `USDC`. `USDC` rechnet mit 6 Stellen in `amountMinor`, sonst 2; keine Umrechnung.
- **Belege:** Im Produktivpfad zählen nur `bank-statement`, `finalized-chain-receipt` und `provider-settlement`. Die Plattformanzeige allein zählt nicht.
- **Auftragsblatt:** `artifacts/founder-autonomy-20261013/synmerco-contracts/<digest des Auftrags>.json`, Schema `numaron-synmerco-reviewed-v1`, mit `approved: true`, `reviewedBy: patrice`, `reviewMinutes`, `expiresAt`, Auftragsschlüssel, `rootTaskId`, `sourceRevision`, `scopeDigest`, `buyerId` und `customerWork`.

## Synmerco im Besonderen

Nur der Zustand `funded` gilt als gehalten. Der Name stammt aus gespeicherten Belegen; die Daten, die ich strukturell geprüft habe, stehen auf `released`. `submitted`, `released`, `open` und jeder unbekannte Zustand sperren. Das ist bewusst eng, denn ob `funded` den Betrag wirklich hält, belegt erst ein echter Lesetest.

Der Bruttobetrag muss exakt passen, der Nettobetrag kaufmännisch gerundet auf Cent (9,675 zeigt die Plattform als 9,68).

## Bekannt und nicht gelöst

- **Lieferweg:** Synmerco bleibt `work:false`. Vorbereitung und Einreichung fehlen, Einreichen braucht deine Freigabe.
- **Teil-Zeitstempel:** Die drei Belegteile haben keine eigenen Zeitstempel; Frische gilt für die Antwort als Ganzes.
- **Rückbuchung:** `recordPaymentReversal` nimmt einen Beleg aus der Buchführung, aber niemand ruft es bisher automatisch auf. „Bezahlt“ heißt deshalb „zum Prüfzeitpunkt bezahlt“.
- **USDC in CHF:** Die Buchführung weist dafür weiter keinen Beitrag aus (`settlement-currency-not-chf`), weil kein belegter Kurs vorliegt.
- **Z01, Z03, Z05, Z08, Z09:** Sie sind weiter nur an `founder-order-claims.mjs` belegt, das nicht im Produktivpfad läuft (M7).
