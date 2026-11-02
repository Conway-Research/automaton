# uGig: Vertrags-, Liefer- und Zahlungsweg

Stand: 19. Oktober 2026. Änderungen kontrolliert in den lokalen Dienst geladen und authentifiziert zurückgelesen. Dienstprozess 21572; Numaron weiterhin OFF, Revision 79. Keine Plattformaktion und keine Aktivierung von Numaron.

## Was jetzt verbunden ist

Der normale Produktionsaufbau verwendet jetzt die Leser für geprüfte Vertragsunterlagen, Zugriffsfreigaben, Kundenabnahme und Zahlung. Vorher mussten Vertrags- und Zugriffsleser separat injiziert werden. Die Verbindung allein erteilt keine Berechtigung und meldet keine Live-Verifikation.

Der bestehende uGig-Pilot übernimmt eine bereits akzeptierte eigene Bewerbung nur mit passender Kundenzusage. Er erstellt das vereinbarte Inhaltspaket, verlangt eine unabhängige Inhaltsprüfung und liefert es in die vereinbarte bestehende Unterhaltung. Das Lieferjournal und die Rückleseprüfung verhindern blindes Wiederholen bei unklarem Versandergebnis. Eine geprüfte spätere Abnahmenachricht kann als bekannte Nachricht berücksichtigt werden, ohne dadurch den ursprünglichen Vertragsumfang zu ändern.

Der Zahlungsleser prüft die authentifizierte eigene uGig-Rechnung gegen Auftrag, Bewerbung, Auftraggeber, Leistungserbringer, Bruttobetrag, Währung und Rechnungsstatus. Zusätzlich ist ein unabhängig geprüfter Netto-Zahlungsbeleg erforderlich. Erst dann wird die Zahlung mit Empfänger, Nettobetrag, Währung und eindeutiger Belegkennung an die vorhandene Zahlungszuordnung übergeben. Eine Kundenbehauptung oder der Rechnungsstatus allein genügt nicht.

Zwei Verbindungsfehler wurden behoben: der fehlende Nachweisverweis bei der Auftragsübernahme und eine selbstbezügliche Umfangskennung bei vorfinanzierten Aufträgen. `pilotScopeDigest()` berechnet die Kennung jetzt aus stabilen Leistungs- und Zahlungsbedingungen.

## Benötigte echte Unterlagen

Es wurden keine echten Zusagen, Zahlungsbelege oder Freigaben angelegt. Der vertrauenswürdige lokale Prüfnachweis liegt pro Auftrag unter:

`artifacts/founder-autonomy-20261013/ugig-contracts/<digest(orderKey(order))>.json`

Das Schema lautet `numaron-ugig-reviewed-v1` und enthält:

- `agreement`: geprüfter Vertrag mit exakten Auftragsschlüsseln, Revision, Kunden- und Gesprächskennung, akzeptierter Bewerbung, Originalnachrichten samt Inhaltskennungen, erlaubtem KI-Einsatz, verwendbaren Ausgangsinhalten, Umfang, Abnahmekriterien, Frist, Lieferkanal und Zahlungsbedingungen. Berechnung der Umfangskennung mit `pilotScopeDigest(agreement)`.
- `grant`: ausdrückliche lokale Freigabe (`approved`), `agreementDigest`, Ablaufzeit als Millisekunden-Zeitstempel, Nachweisverweis und Operationen `read`, `work`, `verify`, `submit`, `reconcile`. Diese Freigabe ersetzt weder Kundenzusage noch Plattformberechtigung. Änderungen am Vertrag benötigen erneute Prüfung.
- `netReceipt`: unabhängig geprüfter Beleg (`reviewed`, `independentlyVerified`) mit Art `bank-statement`, `finalized-chain-receipt` oder `provider-settlement`, dauerhaft eindeutiger `receiptId`, `evidenceRef`, SHA-256-`evidenceDigest`, `scopeDigest`, Empfänger, Nettobetrag in kleinster Währungseinheit, Währung, Eingangszeit, Rechnungskennung und `invoiceDigest` der geprüften Rechnung.
- `acceptance`: nach Lieferung geprüfte ausdrückliche Abnahme mit `reviewed`, `noContractChangeReviewed`, `accepted`, exakter `deliveryDigest`, Nachrichtenkennung und Inhaltskennung. Die Nachricht muss tatsächlich vom Kunden stammen und seine neueste Nachricht sein.

Die Kennungen werden mit `digest()` aus `founder-restoration-integrity.mjs` gebildet. Ein synthetisches vollständiges Beispiel steht in `scripts/founder-ugig-production.integration.test.mjs`. Dieses Beispiel ist ausschließlich für Tests; niemals als echte Freigabe übernehmen.

Die Belegprüfung ist derzeit ein vertrauenswürdiger manueller Schritt: Der Code prüft die strukturierte, lokal geprüfte Erklärung und die aktuelle Rechnung, importiert aber keinen Kontoauszug und verifiziert keine Blockchain-Transaktion selbstständig. Ein `evidenceDigest` allein beweist keinen Zahlungseingang. Originalbeleg, Rechnungsbezug und Nettozufluss müssen vor Freigabe unabhängig geprüft werden.

## Umfang und verbleibende Grenzen

Der durchgehend getestete Standardweg ist der vorhandene Pilotauftrag mit dem Profil `content-repurpose`, USD-Rechnung und nachgewiesener Vorfinanzierung. Andere uGig-Aufträge, Lieferformate, Währungen oder Zahlungsanbieter sind dadurch nicht automatisch freigegeben. Der übrige breite Fähigkeitskatalog bleibt unverändert.

Bei Zahlung nach Lieferung bleibt eine passende bestehende Nachzahlungs-Risikofreigabe zwingend. Die neue Verbindung erzeugt keine uGig-Freigabe aus einer GitHub-Freigabe. Ohne gültige Finanzierung bleibt die Arbeit gesperrt. Rechnungen werden nur gelesen; der Adapter legt keine Rechnung an und löst keine Zahlung oder Auszahlung aus.

Eine bloße Kundenzusage reicht daher noch nicht: verbindlicher Umfang, erlaubte Eingaben, ausführbares Profil, Lieferberechtigung und Finanzierung müssen ebenfalls belegt sein. Vor dem echten Betrieb müssen diese Unterlagen zum tatsächlichen Auftrag vorliegen. Die Änderung wurde bereits kontrolliert in den Dienst geladen. Einschalten darf ausschließlich Patrice persönlich über das Dashboard.

## Isolierte Prüfung

Die Integrationstests verwenden temporäre Verzeichnisse, eigene SQLite-Dateien, synthetische Kunden und gefälschte HTTP-Antworten. Kein echter API-Schlüssel wird verwendet. Geprüft werden der gesamte Ablauf bis `paid`, einmaliger Versand, falsche oder fehlende Rechnungs-/Zahlungsdaten, falsche Abnahmezuordnung, widerrufene Freigabe und OFF ohne HTTP-Aufruf.

Ausführen in PowerShell:

```powershell
$tests = Get-ChildItem scripts/founder-*test.mjs | Where-Object Name -Match 'ugig|production-order|marketplace-work|order-|content'
node --import tsx --test --test-concurrency=1 @($tests.FullName)
```

Testprotokoll: `artifacts/ugig-connection-tests.tap`. Die Rechnungsfelder wurden gegen die bereits lokal gespeicherte uGig-OpenAPI-Beschreibung unter `artifacts/escrow-adapter-research-20261015/ugig-openapi.json` abgeglichen. Ein aktueller Live-Vertragstest wurde im ausgeschalteten Zustand nicht ausgeführt.

## Kontrolliertes Laden in den Dienst

Am 19. Oktober um 19:33 Uhr (Europe/Zurich) über den OFF-geschützten Wartungsstarter neu gestartet. 29 aktuelle isolierte Tests bestanden. Authentifizierte Rücklese: Vertragsleser, Arbeit, Lieferung, Abnahme und Zahlung konfiguriert; `liveReady: false` bleibt korrekt, solange echte Nachweise fehlen. Controller gestoppt, null aktive Worker, kein Schedulerfehler. Alle 3470 Budgeteinträge einschließlich Hash sowie Limits unverändert; 19 Aufträge weiterhin vorhanden. Prüfbericht: `artifacts/ugig-activation-20261019/after.json`.

## Nachfolgende lokale Erweiterung

Der vollständige mehrteilige Lieferweg und die geprüfte Auftragszuordnung in Sammelgesprächen sind in `docs/numaron-ugig-multipart-20261019.md` beschrieben. Diese nachfolgende Änderung ist isoliert getestet, aber noch nicht in den laufenden Dienst geladen. Die obige Neustartbestätigung bezieht sich auf den vorherigen Stand.
