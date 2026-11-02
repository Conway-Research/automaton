# Zahlungswege für Numaron

## Isolierte Codeprofile und Opire-Vorbereitung

Der allgemeine Auftragsweg und die GitHub-Quellvorbereitung unterstützen jetzt getrennte Profile für Node-JavaScript, TypeScript, Python und Bash. Zulässig sind nur begrenzte vollständige Quellhüllen und vorhandene Tests. Gemischte oder nicht unterstützte Profile, Symlinks und Submodule werden nicht zugelassen. Bestehende Tests und Hilfsdateien dürfen durch den Änderungsgenerator nicht ersetzt werden; eine Änderung benötigt zusätzlich eine neue unabhängige Regression, die auf dem Original scheitert und auf dem korrigierten Stand besteht. Die bestehenden Finanzierungs-, Abnahme- und Einreichungsregeln bleiben erforderlich.

TypeScript läuft über die feste native Node-Transformation (`--experimental-transform-types`) des geprüften Images, Python über die festgelegte isolierte unittest-Ausführung und Bash über `/bin/bash --noprofile --norc` mit festem bereinigtem Environment. Bash-Skripte werden zuerst mit dem festen Syntaxprüfweg geprüft; nur vorhandene `*.test.sh` werden als Tests ausgeführt. Es gibt weder einen Host-Shell-Fallback noch Installationen, Image-Pulls oder die Ausführung von Befehlen aus dem Auftragstext. Die Container bleiben ohne Netzwerk, Host-Bind-Mounts, Capabilities und Privilegienerhöhung, mit Read-only-Root und Ressourcenlimits.

Ein Interpreter muss seine eigene feste Schutzprobe bestehen. Optional können geprüfte feste Image-SHAs aus vertrauenswürdiger Anwendungskomposition pro Profil übergeben werden; Aufgaben oder Adapterkandidaten dürfen sie nicht bestimmen. Ohne separate Konfiguration wird das lokal gebaute kombinierte Image `localhost/numaron-offline-code:20261018` geprüft und vor Ausführung auf seinen SHA gepinnt. Es wurde ausschließlich aus bereits vorhandenen lokalen Node- und Python-Images mit gesperrtem Netzwerk und ohne Pull gebaut. Python-, TypeScript-, Node- und Bash-Schutzproben bestanden auf diesem Image. JSX/TSX bleibt im nativen TypeScript-Prüfweg ausgeschlossen; fehlende Projektbibliotheken werden nicht automatisch installiert. Diese Proben bestätigen die festen Interpreter, nicht beliebige Projektabhängigkeiten.

`scripts/founder-opire-local.mjs` ist ausdrücklich lokale Testvorbereitung. Die Operation `read-contract` und die decodierten Felder sind ein internes Fixture-Protokoll, kein behauptetes Opire-API-Schema. Transport und Decoder müssen ausdrücklich eingesetzt werden; es gibt keinen Standard-HTTP-Transport, keine Zugangsdaten und keine Claim-, PR- oder Zahlungsaktion. Die Prüfung bindet Issue, Betrag, Währung, Empfänger, Bounty, Claim, Konto und Aktualität. Auch ein als bezahlt gemeldeter Fake bleibt `paymentConfirmed=false` und `liveAuthority=false`. Der produktive GitHub-Finanzierungsprüfer weist dieses `testOnly`-Gerüst zurück.

Für echtes Opire bleiben die offizielle Schnittstelle samt Authentifizierung, der konkrete finanzierte Bounty/Claim und ein unabhängig zugeordneter Zahlungseingang zu verifizieren. Ein `/opire try` aus einer Ausschreibung oder Zahlung nach Merge ist allein kein Finanzierungsbeleg. Es wurden keine echten Claims, Arbeiten oder Einreichungen ausgeführt; Numaron bleibt OFF.

## Normale GitHub-Zahlungsbedingungen

Neben dem bisherigen JSON-Marker wird ein begrenzter Leser für eindeutig formulierte normale Maintainer-Bedingungen unterstützt. Er verwendet keine KI-Auslegung und ergänzt keine fehlenden Zusagen. Ein unterstütztes Beispiel lautet (die Adresse ist durch die tatsächlich verifizierte Betreiberadresse zu ersetzen):

```text
Bounty: $50.
AI-assisted contributions welcome. No assignment required.
Payment: USD 50 net, settled as 49.75 USDC on Base within 14 days after acceptance.
Recipient: @tricebr at <verified operator Base address>.
Fees: paid by maintainer.
Acceptance criteria:
- Fix the stated bug.
- Include a passing regression test.
```

Die Bedingungen dürfen im aktuellen Maintainer-Issue oder in aktuellen Kommentaren mit Rolle OWNER, MEMBER oder COLLABORATOR stehen. Der Issue-Kontext bindet sie an den konkreten Auftrag. Betrag, Nettobetrag, atomarer USDC-Erfüllungsbetrag, Empfänger, Gebührenübernahme, Frist und Abnahmekriterien müssen vollständig und eindeutig sein. Bedingte/negierte Zahlungen, Codebeispiele, widersprüchliche oder doppelte Angaben sowie fehlende Felder bleiben gesperrt. Das ist ein begrenzter englischer Textleser; beliebige Prosa, andere Sprachen oder andere Zahlungsdienste werden nicht automatisch freigegeben.

Der CHF-Ertragsvergleich für diese normalen Bedingungen verwendet ausschließlich den bereits vorhandenen lokalen USDC/CHF-Kursbeleg, höchstens 30 Minuten alt und nicht aus der Zukunft. Die Berechnung verwendet Ganzzahlen und rundet ab. Ein fehlender oder veralteter Kurs blockiert neue Vorleistungsfreigaben. Dieser Leser ruft keine Kursquelle auf und verändert den gespeicherten Kurs nicht. Die bestehenden Kriterien für AI-Erlaubnis, Assignment, JavaScript-Umfang, Budget und Vorleistungsrisiko gelten weiterhin.

Nach Einreichung genügt auch ein normaler Maintainer-Kommentar mit eindeutiger Zuordnung:

```text
Payment for https://github.com/owner/project/issues/1: https://basescan.org/tx/<transaction hash>
```

Issue, gespeicherter Auftrag und ursprünglicher Vertragsdigest werden intern gebunden; öffentliche Numaron-Digests oder Marker sind dafür nicht erforderlich. Ohne ausdrücklichen Logindex wählt der RPC-Prüfer genau einen passenden Transfer des vereinbarten nativen USDC-Betrags an den Betreiber. Bei keinem oder mehreren passenden Logs bleibt die Zahlung unbestätigt. Die bestehenden Prüfungen von Chain, Erfolg, kanonischem Block, Zeitpunkt und Finalität sowie der Schutz vor doppelter Zahlungsanrechnung bleiben erhalten. Der alte strukturierte Weg bleibt für bereits bestehende Bedingungen kompatibel; gemischte widersprüchliche Angaben erteilen keine Freigabe.

## Plattform-Escrow

Der bestehende authentifizierte Leser der zuständigen Plattform muss den konkreten gehaltenen Betrag und Empfänger bestätigen. Ein Guthaben, ausgeschriebener Preis, alter Beleg oder eine andere Plattform ersetzt das nicht. Ein fehlgeschlagener Escrow-Abgleich schaltet nicht auf Vorleistung um.

## Begrenzte Vorleistung

Patrice hat maximal CHF 1.00 interne Kosten für einen gleichzeitig offenen unbezahlten Auftrag freigegeben. Diese Kapazität wird konservativ vollständig belegt, auch wenn ein erster Schritt kostenlos ist. Bestehende Monats-, Tages- und Aufgabenbudgets gelten zusätzlich. Die CHF 5 ungeklärter alter Reservierungen werden nicht verwendet oder freigegeben.

Die gemeinsame Zahlungsautorität in `scripts/founder-order-payment.mjs` speichert Auftrag, Familie, Quellrevision, Umfang, Regelversion und Vertragsdigest atomar in SQLite. Sie prüft aktuelle Bedingungen vor Arbeit/Einreichung erneut. Ein Neustart oder eine neue Aufgaben-ID beseitigt eine offene Forderung nicht. Abnahme oder Merge sind keine Zahlung. Nur ein exakt gebundener bestätigter Zahlungseingang über den vertrauten Zahlungsleser beziehungsweise den geprüften Quelladapter gibt die Kapazität frei; dabei zählt der vereinbarte Nettobetrag.

Im GitHub-Startweg ist `createGithubPostpaidSource` mit dem bestehenden authentifizierten GitHub-Client verbunden. Es akzeptiert nur eine ausdrückliche strukturierte Erklärung im frisch gelesenen, bereits auf Eigentümer-/Beitragsregeln geprüften Issue (`numaron-postpaid-v1`). Der Inhalt muss Auftrag/Preis/Währung/Empfänger, überprüfbare Abnahmekriterien, bekannte Gebühren und Nettobetrag, Auszahlungsmethode, nachvollziehbare CHF-Nettoabschätzung und Zahlungsfrist enthalten. Das ist ein strenger Erkennungsweg, keine Erlaubnis, eine solche Erklärung im Namen des Auftraggebers zu erfinden oder zu veröffentlichen. Ohne passende Erklärung bleibt der GitHub-Auftrag beim Escrow-Weg und gegebenenfalls gesperrt.

Der normale Runtime-Konstruktor bietet `postpaidSource` für weitere überprüfte Vertragsschnittstellen und `postpaidPaymentReader` für einen unabhängig geprüften echten Zahlungseingangsleser an. Der standardmäßige GitHub-Vertragsleser ist angebunden; ein echter bank-/zahlungsdienstspezifischer Zahlungseingangsleser ist dadurch nicht automatisch eingerichtet. Ohne bestätigten Eingang bleibt die einzelne Forderung offen. Es gibt keinen öffentlichen Schalter, der einen Auftrag ohne Beleg als bezahlt markiert.

## GitHub: Vertrags- und Zahlungseingangsprüfung

Die ausdrückliche Erklärung `numaron-postpaid-v1` darf auch in einem aktuellen Kommentar mit GitHub-Rolle OWNER, MEMBER oder COLLABORATOR stehen. Kommentare anderer Nutzer zählen nicht. Mehrere Erklärungen oder unvollständige Bedingungen bleiben gesperrt. Der Digest des Auftragsumfangs bindet die gelesenen Maintainer-Kommentare; Änderungen werden vor weiteren Arbeitsschritten erneut geprüft. Dies ist weiterhin ein strukturierter Vertragsleser, keine automatische rechtliche Auslegung beliebiger Bounty-Texte.

`createGithubPaymentReader` ist im normalen Runtime-Aufbau als Zahlungseingangsprüfer angeschlossen. Ohne eine von der Anwendung eingesetzte authentifizierte Anbieterimplementierung meldet er `connected=false` und bestätigt keine Zahlung. Er besitzt keinen Standard-Netzwerktransport und sucht keine Zugangsdaten. Sein internes Eingangsformat ist ausdrücklich kein bestätigtes Schema eines Zahlungsanbieters.

Eine echte Anbieterimplementierung muss den eingegangenen, endgültig gebuchten Nettobetrag unabhängig dem konkreten GitHub-Auftrag und dem tatsächlichen Empfänger zuordnen. Sie muss unter anderem `kind=incoming-payment`, `status=settled`, eine stabile `paymentId`, die genaue Auftragskennung, Währung, Empfänger und Nettobetrag sowie eine aktuelle offizielle Belegreferenz liefern. Guthaben, Merge, Abnahme, Auftraggeberbehauptung, ausgehende Zahlung und Sandbox-Daten genügen nicht. Die Prüfschicht prüft diese Bindungen und verwirft Ergebnisse bei OFF oder Abbruch. Die Zahlungskennung wird zusammen mit dem Anbieter-Ursprung zu einer stabilen Belegkennung; der Forderungsspeicher verhindert deren Wiederverwendung für einen anderen Auftrag auch nach Neustarts.

Die Adapterprüfung selbst kann keinen Anbieter authentifizieren. Für nicht unterstützte Zahlungswege bleibt ein echter anbieterbezogener Leser samt belegtem Antwortformat und Kontobindung nötig; der unten beschriebene Base/USDC-Leser ist nun lokal implementiert. Es wurde kein Konto eröffnet, kein Zahlungsdienst verbunden und kein Zahlungseingang extern abgefragt. Die Grenze bleibt ein offener unbezahlter Auftrag mit maximal CHF 1.00 internem Risiko.

## GitHub-Zahlungseingang über Base/USDC

Der normale Runtime-Aufbau enthält jetzt `createGithubBaseUsdcSource`. Der öffentliche RPC-Ursprung ist fest `https://mainnet.base.org`; erlaubt sind ausschließlich `eth_chainId`, `eth_getTransactionReceipt` und `eth_getBlockByNumber`. Die HTTP-Methode POST transportiert nur diese lesenden JSON-RPC-Methoden. Es gibt keine Signaturen, Walletverbindungen oder Transaktionen. OFF und Abbruch werden vor und nach jedem externen Schritt geprüft. Diese Implementierung wurde nur mit Fakes verifiziert; die Erreichbarkeit und aktuellen Antworten des echten RPC wurden nicht geprüft. Die Prüfung vertraut dessen kanonischer Blockansicht und `finalized`-Angabe; es ist kein eigener Light Client oder Mehranbieter-Konsens.

Die bestehende vollständige Erklärung `numaron-postpaid-v1` benötigt zusätzlich ein Feld `settlement` mit `network=base`, `chainId=8453`, `asset=USDC`, dem nativen USDC-Token `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, `decimals=6`, `recipientAddress`, `amountAtomic` als positive Ganzzahlzeichenfolge sowie `settlesCurrency=USD` und `settlesAmountMinor` gleich dem vereinbarten USD-Nettobetrag in Cent. Die Empfängeradresse muss der verifizierten Betreiberadresse entsprechen. Der genaue USDC-Betrag ist ausdrücklich als Erfüllung dieses USD-Betrags vereinbart; der Code nimmt weder USD/USDC-Parität an noch rechnet er stillschweigend um. Diese Vereinbarung wird im unveränderlichen Auftrags- und Zahlungsdigest gebunden.

Nach Einreichung muss ein aktueller Maintainer-Kommentar genau eine strukturierte Referenz enthalten:

```text
<!-- numaron-base-payment-v1
{"orderUrl":"<exact issue URL>","scopeDigest":"<prepared scope digest>","contractDigest":"<authorized contract digest>","transactionHash":"<0x transaction hash>","logIndex":0}
-->
```

Die Referenz wird über den vorhandenen authentifizierten GitHub-Leser dem gespeicherten eingereichten Auftrag zugeordnet. Ein Issue darf zur Zahlungsprüfung bereits geschlossen sein. Fremde Kommentare, mehrere Referenzen, unvollständige Kommentarhistorie und abweichende Bindungen bestätigen keine Zahlung. Numaron veröffentlicht diese Referenz nicht selbst im Namen des Auftraggebers. Die Referenz allein ist kein Zahlungseingang.

Die RPC-Prüfung verlangt Base 8453, eine erfolgreiche Transaktion, den exakten nicht entfernten nativen USDC-Transfer an den Betreiber mit dem vereinbarten atomaren Nettobetrag, passenden Transaktions-/Block-/Logkennungen, den kanonischen Block und einen Block auf oder unter der `finalized`-Höhe. Der Transfer darf nicht vor der Auftragsvorbereitung liegen. Noch nicht geminte oder nicht finalisierte Zahlungen bleiben offen und können später erneut geprüft werden. Die Belegkennung aus Chain, Token, Transaktion und Log verhindert doppelte Anrechnung. Gespeicherte Synmerco-Zahlungen werden nicht als GitHub-Eingänge übernommen.

## Opire: Bounty- und Claim-Beobachtungen

Die Monitorübergabe extrahiert Opire-Hinweise aus vollständig gelesenen GitHub-Kommentaren bereits verfolgter Issues. Maintainer-`/reward`-Befehle sind Erstellungsanfragen; passende OpireBot-Meldungen berichten Bounties oder Claims. `/try` bleibt eine gemeldete Absicht. Alle Einträge sind reine Listings mit `assignmentConfirmed=false`, `fundingConfirmed=false`, `paymentConfirmed=false` und `liveAuthority=false`. Sie erstellen keine ausführbaren Aufträge und erteilen keine Schreibfreigaben.

Es gibt dafür keinen zusätzlichen Opire-Endpunkt und keine neue Kontoverbindung. Dies ist keine plattformweite Opire-Suche. Der bisherige lokale Opire-Fake-Adapter bleibt ein Testgerüst ohne finanzielle Autorität. Unabhängige Vertrags-, Zuweisungs- und Zahlungsnachweise bleiben erforderlich. Der Code wurde mit 48 netzwerkgesperrten Tests und TypeScript-Prüfung verifiziert; Nachweis: `artifacts/opire-read-source-20261018/implementation-status.json`. Dashboard und Monitor wurden dabei nicht neu gestartet; das Laden des neuen Codes steht noch aus.

## Escrow.com-Testgerüst (lokal)

`scripts/founder-escrowcom-sandbox.mjs` ist ausschließlich ein lokales Gerüst mit explizit eingesetztem Fake-Transport und Decoder. Es verwendet nur den festen Sandbox-GET-Pfad und besitzt weder einen Standard-Netzwerktransport noch Zugangsdaten. Eine echte Anbieterantwort muss vor einer späteren Realanbindung gesondert auf ihr dokumentiertes Schema und Authentifizierung geprüft werden. Der Fake-Decoder ist kein bestätigter Vendor-Mapper.

Sandbox-Belege sind als Testdaten gekennzeichnet und werden von der produktiven Finanzierungsprüfung zurückgewiesen. Kein Escrow.com-Konto, keine Testtransaktion beim Anbieter, keine Einzahlung und keine Verbindung mit Plattformkonten wurden erstellt.

## Prüfung und Aktivierung

Nachweise: `artifacts/payment-modes-20261018/`. Die Änderungen sind im Code vorhanden; der laufende Dienst wurde in diesem Auftrag nicht neu gestartet. Numaron bleibt OFF. Ein Wartungsneustart lädt Code, ersetzt aber keine fehlenden Vertrags-, Konto- oder Zahlungsbelege.

Der abschließende Regressionstest lädt `scripts/founder-offline-test-guard.mjs`, damit externe Fetch-Versuche blockiert werden und den Prozess fehlschlagen lassen. Die alten Dashboardtests verwenden jetzt explizit einen Fake-Nutzungsleser. Frühere ungeschützte Regressionen sind nicht als sicher providerfrei nachgewiesen; siehe Prüfbericht.
