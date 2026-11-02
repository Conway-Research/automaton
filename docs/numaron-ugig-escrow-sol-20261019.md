# uGig: Escrow und SOL-Zahlungsnachweise

Stand: 19. Oktober 2026. Implementiert, isoliert getestet und anschließend auf ausdrücklichen Wunsch kontrolliert in den laufenden Dienst geladen. Numaron bleibt OFF; keine Kontenabfragen, echten Blockchain-Abfragen, Zahlungen oder Kundennachrichten. Öffentliche API-Dokumentation und öffentlicher Anbieterquellcode wurden gelesen.

## Geprüfter Ablauf

Die bestehende Produktionsanbindung verwendet jetzt einen gesonderten SOL-Prüfer, wenn die geprüfte Zahlungsvereinbarung `settlement.kind` auf `ugig-sol-escrow-v1` oder `ugig-sol-invoice-v1` setzt. Bisherige USD-Rechnungen mit unabhängig geprüftem Nettoeingangsbeleg bleiben unterstützt.

Ein Escrow-Nachweis kombiniert drei Quellen: den authentifizierten uGig-Auftrag, einen authentifizierten GET des zugehörigen CoinPay-Escrows und die bestätigte Solana-Transaktion. Gig, Bewerbung, Auftraggeber, Auftragnehmer, Anbieter-Escrowkennung, Einzahlungsadresse, Begünstigtenadresse und Beträge müssen zusammenpassen. Streitfälle, Rückerstattungen, abgelaufene Finanzierung und widersprüchliche oder während der Prüfung veränderte Belege sperren den Vorgang.

Bei gefülltem Escrow werden die endgültige Einzahlung und der aktuelle endgültig bestätigte Saldo geprüft. Das kann die Finanzierung belegen, ist aber kein Einnahmenbeleg. Erst uGig-Freigabe, CoinPay-Status `settled` und der tatsächliche Nettoeingang beim vereinbarten Empfänger ergeben einen Zahlungsnachweis. Der normale Auftragsablauf verlangt weiterhin Lieferung und geprüfte Kundenabnahme, bevor der Auftrag bezahlt wird. Plattformstatus `in_progress` wird für einen Escrow-Vertrag unterstützt; `completed` erlaubt die spätere Abstimmung bereits gelieferter Aufträge.

Beim Rechnungsweg muss die uGig-Rechnung die Weiterleitungstransaktion (`merchant_tx_hash`) und SOL als Zahlungswährung belegen. Eine Kundeneinzahlung beim Zahlungsanbieter allein genügt nicht.

## Exakte Zuordnung und Buchhaltung

Der Vertrag bindet Adressen, Brutto-/Nettobeträge, Gebühren, Netzwerk und ausdrücklich vereinbarte Umrechnung an seinen Umfangsdigest. SOL-Beträge werden in ganzzahligen Lamports geprüft (9 Dezimalstellen). Es gibt keine automatische Wechselkursschätzung.

Der RPC-Prüfer verlangt Solana Mainnet, `finalized`, erfolgreiche Ausführung, identische Signatur und Slot, passenden Zeitpunkt, erwarteten Absender sowie exakt den vereinbarten Nettozuwachs beim Empfänger. Die Transaktionssignatur bildet eine auftragsübergreifende eindeutige Belegkennung. Unter `artifacts/founder-autonomy-20261013/ugig-payment-claims/` werden nach einem späteren manuellen Start unveränderliche Zuordnungen für Escrowkennung, Escrowadresse und Transaktion gespeichert. Diese bleiben nach Neustarts wirksam; widersprüchliche Wiederverwendung scheitert. Teilweise geschriebene Zuordnungen bleiben vorsorglich gesperrt und werden nicht automatisch neu vergeben.

Der gespeicherte Zahlungsbeleg und die Auftragsübersicht enthalten den tatsächlichen SOL-Eingang einschließlich Lamports, Signatur und Empfänger sowie den erfüllten USD-Vertragsbetrag. Der USD-Wert ist ein vereinbarter Vertragswert, kein USD-Bankeingang. Ein CHF-Gewinn wird daraus nicht berechnet. Für Gewinnermittlung, steuerliche Bewertung oder spätere Veräußerung fehlen weiterhin passende Bewertungs-/Kostenbelege.

## Noch benötigte echte Konfiguration

Kein Produktionsvertrag wurde angelegt oder als geprüft markiert. Für einen späteren echten Auftrag braucht es:

1. Den bestehenden geprüften Vertrag samt Kundenzusage, exakter Auftragsbindung, Zugang und befristeter Freigabe.
2. Unter `funding.settlement` (oder `paymentAuthorization.settlement`) die unten beschriebenen Angaben; `recipient` muss der SOL-Empfängeradresse entsprechen.
3. Für Escrow eine unabhängig geprüfte `escrowReview`, einschließlich Begünstigtenadresse und Verwahrungs-/Freigabebedingungen.
4. Für den Zahlungseingang eine geprüfte `solReference` mit tatsächlich vom Anbieter belegter Auszahlungssignatur.
5. Für Escrow einen zum konkreten Escrow berechtigten CoinPay-API-Zugang über die Umgebungsvariable `COINPAY_API_KEY`. Die Anwendung verwendet damit ausschließlich GET. Ein Plattformkonto oder ein beliebiger persönlicher API-Key garantiert keinen Zugriff auf ein von uGig angelegtes Escrow. Ist der Zugang nicht verfügbar, bleibt die Freigabe gesperrt; es gibt keinen Ersatz durch eine bloße Statusbehauptung. Keine Release-/Beneficiary-Tokens in Vertragsdateien ablegen.

Die Angaben sind keine neuen Kundenanforderungen für Geheimnisse: CoinPay-Zugang wird sicher beim Betreiber eingerichtet. Kunden liefern Vereinbarung, Auftrags- und Zahlungsreferenzen; keine privaten Walletschlüssel.

### Schema der geprüften Zahlungsvereinbarung

Zusätzlich zu den bestehenden Vertragsfeldern gelten folgende Pflichtfelder:

| Feld unter `settlement` | Bedeutung |
|---|---|
| `kind` | `ugig-sol-escrow-v1` oder `ugig-sol-invoice-v1` |
| `network`, `asset`, `decimals` | `solana-mainnet`, `SOL`, `9` |
| `sourceAddress`, `recipientAddress` | Exakte Auszahlungsquelle und vereinbarter Empfänger |
| `grossLamports`, `netLamports`, `feeLamports` | Ganzzahlige Zeichenketten; Netto + Gebühren = Brutto |
| `platformFeeMinor`, `otherFeesMinor` | USD-Cents; zusammen mit Vertragsnetto exakt Vertragsbrutto |
| `settlesCurrency`, `settlesAmountMinor` | `USD` und vereinbarter Nettovertragsbetrag in Cents |
| `conversion` | `{mode:"fixed-agreed-amount", evidenceRef, agreedAt}`; Zeitpunkt als Millisekunden |
| nur Escrow | `escrowId`, `coinpayEscrowId`, `depositorAddress` |
| nur Rechnung | `invoiceId` |

`escrowReview` liegt neben `agreement` im geprüften Belegpaket und enthält `reviewed:true`, `independentlyVerified:true`, `conditionsReviewed:true`, `agreementDigest`, `escrowId`, `coinpayEscrowId`, `depositAddress`, `beneficiaryAddress`, `evidenceRef`, `expiresAt` (Millisekunden) und `depositSignature`.

`solReference` enthält `reviewed:true`, `agreementDigest`, `recordId` (uGig-Escrow- oder Rechnungskennung) und `signature` (Nettoauszahlung). Nach Vertragsänderungen müssen Umfangsdigest und alle daran gebundenen Prüfungen/Freigaben erneuert werden. Ein ausführbares synthetisches Beispiel steht in `scripts/founder-ugig-sol-fixture.mjs`; diese Testwerte sind keine Produktionskonfiguration.

## Grenzen und Tests

Unterstützt sind einfache native SOL-Transfers mit direkt erkennbarer System-Transferanweisung und exakt belegbarem Empfänger-Nettozuwachs. SPL/USDC, CPI-Transfers, aufgeteilte Zahlungen und andere nicht passende Transaktionsformen werden nicht automatisch anerkannt. Vorhandene Ausführungsprofile bleiben unverändert; dies schränkt Numarons allgemeines Aufgabenspektrum nicht ein und behauptet auch keine neue Ausführungsmöglichkeit für andere Profile.

Tests verwenden temporäre Verzeichnisse und Datenbanken, synthetische Schlüssel/Signaturen und Fake-Transporte. Sie decken den vollständigen regulären Ablauf sowie falsche Parteien, Beträge, Gebühren, Adressen, Status, Netzwerk, Signaturen, Wiederverwendung, OFF und Unterbrechungen ab. CoinPay-Antworten werden auf benötigte Felder reduziert; capability-Tokens und fremde personenbezogene Felder werden nicht gespeichert. Die Leser verfügen über keine Signier-, Freigabe-, Erstattungs- oder Sendefunktion.

Regressionstest (PowerShell):

```powershell
$ugigTestFiles = @(Get-ChildItem scripts/founder-*test.mjs | Where-Object { $_.Name -match 'ugig|production-order|marketplace-work|order-|content' } | ForEach-Object FullName)
node --import tsx --test --test-concurrency=1 @ugigTestFiles
```

Ergebnis: **310 bestanden, 0 fehlgeschlagen**. Ergebnisprotokoll: `artifacts/ugig-sol-tests.tap`. Echte Kompatibilität und Zugriffsberechtigung wurden bewusst nicht durch Konten- oder Mainnet-Abfragen getestet. Nachladen wurde am 19. Oktober 2026 um 19:16 UTC bestätigt.

## Öffentliche Schnittstellenquellen

- [uGig Escrow-Route](https://github.com/profullstack/ugig.net/blob/master/src/app/api/gigs/%5Bid%5D/escrow/route.ts): authentifizierter Escrowabruf und Auftragsfelder.
- [uGig CoinPay-Webhook](https://github.com/profullstack/ugig.net/blob/master/src/app/api/payments/coinpayportal/webhook/route.ts): Plattformstatus und Weiterleitungsreferenzen. Der Plattformstatus allein ersetzt den aktuellen Anbieterstatus nicht.
- [CoinPay Escrow-Route](https://github.com/profullstack/coinpayportal/blob/master/src/app/api/escrow/%5Bid%5D/route.ts) und [Escrow-Typen](https://github.com/profullstack/coinpayportal/blob/master/src/lib/escrow/types.ts): Berechtigungsprüfung, Verwahrungs-/Auszahlungsfelder und zusätzliche Statuswerte.
- [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction) und [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses): Transaktionsdaten und endgültige Bestätigung.


## Kontrolliertes Nachladen

Der bewachte Wartungsstarter wurde mit `-Restart` ausgeführt. Vorher und nachher bestätigten persistierter Powerstatus und authentifizierte lokale Statusabfragen OFF, Revision 79. Der neue Dienstprozess meldet einen passenden Gesundheitsnachweis; Controller gestoppt, null aktive Worker, kein Schedulerfehler. Die geänderten Module einschließlich SOL- und CoinPay-Leser wurden vor dem neuen Prozessstart geschrieben und blieben während des Nachladens unverändert. Die reguläre Produktionsverdrahtung meldet die geprüften uGig-Beleg-, Abnahme- und Zahlungsleser als konfiguriert.

66 gezielte Tests für Wartungssperren, regulären Auftragsablauf, Escrow, SOL und CoinPay bestanden ohne Fehler. Alle 19 Aufträge, Budgeteinträge, Lieferjournal und Zahlungszuordnungen blieben unverändert; auch der uGig-Monitorstand blieb gleich. Keine neuen Zugangsdaten oder Freigaben wurden angelegt. Die lokale Statusprüfung führte keine fachlichen Zahlungsleser aus; deren Verhalten wurde ausschließlich mit Fake-Transporten geprüft. Die reale Anbieterberechtigung bleibt unbestätigt und `liveReady` bleibt false.

Nachweise: `artifacts/ugig-sol-activation-20261019/before.json`, `after.json` und `tests.tap`.
