# Native Dealwork Codeaufträge in numaron

Stand 16. Oktober 2026. Konkreter Integrationsentwurf zur Prüfung. Noch keine implementierte oder produktiv aktivierte Erweiterung.

## Ziel und bestehende Freigabe

Patrice möchte native Dealwork-Aufträge mit der vorhandenen Code-Verarbeitung verbinden. Nur eindeutig dem eigenen Agentkonto zugeteilte und durch Escrow finanzierte Aufträge dürfen verarbeitet werden. Numaron bleibt während Entwicklung und Prüfung eingeschaltet; Budgets, bestehende Risikolimits und Handelsfreigaben werden nicht verändert.

Bestehend sind der authentifizierte Dealwork-Leseadapter, ein strikt an nativen Auftrag, Empfänger, Währung und Betrag gebundener Funding-Nachweis, GitHub-Quellvorbereitung, der begrenzte JavaScript-Codeworker, Offline-Sandbox und Budgetcontroller. Der bestehende Code-Lieferweg erstellt GitHub-Draft-PRs und ist für native Dealwork-Verträge nicht passend. Der letzte authentifizierte Vertragsabgleich ergab null eigene Verträge und null Escrow-Nachweise. Ein echter durchlaufender Kundenauftrag kann deshalb derzeit nicht nachgewiesen werden.

## Auswahl und Finanzierungsbindung

Der native Ablauf verwendet nur die authentifizierte eigene Worker-Vertragsliste und die unabhängige Detailabfrage desselben Vertrags. Er übernimmt keine Aufträge aus allgemeinen Joblisten und erstellt keine Angebote, Claims oder Verträge. Auftraggeber-, Auftragnehmer-, Vertrags- und Job-ID müssen eindeutig sein; der Auftragnehmer muss das bereits konfigurierte Numaron-Konto sein. Betrag und Währung müssen zwischen Liste und Detail übereinstimmen, der Vertrag muss einen unterstützten gehaltenen Escrow-Zustand und eine gültige Frist haben.

Die Vorbereitung beginnt nur für escrow_locked oder in_progress. Bereits eingereichte Verträge werden ausschliesslich abgeglichen. Streitfälle, abgelaufene oder beendete Verträge, fremde Empfänger, Widersprüche und fehlende Felder sperren die Arbeit. Die bestehende Funding-Prüfung bleibt vor jedem Modellaufruf, jeder Sandbox-Ausführung und jeder externen Zustandsänderung verpflichtend. Eine geänderte Finanzierungsbindung oder veränderte Leistungsbeschreibung verlangt neue Vorbereitung statt stiller Fortsetzung.

Die Plattformzustände sind signierte Plattformnachweise und keine unabhängig bestätigten Bankeingänge. Eine Jobbeschreibung mit einem GitHub-Link macht eine GitHub-Bounty nicht zu einem finanzierten Dealwork-Vertrag.

## Unterstützte Codequelle

Die erste Integration bleibt innerhalb der bereits geprüften Hülle: öffentliche, eindeutig referenzierte und unveränderlich versionierte GitHub-Codequellen, abhängigerkeitsfreies JavaScript und vorhandene Node-Tests. Auftrag und Quelle müssen explizit zusammenpassen. Native Vertragsbedingungen, Quellverweise, Annahmekriterien, Basis-Commit und Quell-Digest werden gemeinsam versioniert.

Private Repositories, private Anhänge, Zugangsdaten, unklare Quellverweise, nicht unterstützte Sprachen oder zusätzliche Abhängigkeiten werden nicht an den Modellworker weitergegeben. Vertrags- und Finanzierungsdaten bleiben lokal; das Modell erhält nur freigegebene öffentliche Codequellen. Quellen und Auftragstexte bleiben untrusted Daten und dürfen keine Rechte erweitern. Explizite Beitragsverbote und zusätzliche Vertragsanforderungen werden beachtet. Ohne belastbar lesbare Vertragsdetails und eindeutige Codequelle bleibt der Auftrag sichtbar gesperrt.

## Verarbeitung und dauerhafte Zustände

Der gemeinsame Budgetcontroller plant Vorbereitung, Code-Erstellung, Regressionstest und Auslieferung unter einer stabilen Root-ID aus Anbieter und Vertrags-ID. Wiederholungen und Revisionen erhalten dieselbe Root-ID. Der native Ablauf verwendet den bestehenden Codeworker, applyCodeChanges und verifyOrderCode; er baut keine zweite Ausführungsumgebung auf.

Die Prüfung verlangt erfolgreiche Originaltests, erfolgreiche Tests der Änderung und eine neue Regression, die am Original fehlschlägt. Originaltests und geschützte Testhilfen bleiben unverändert. Netzwerklose Sandbox, Ressourcenlimits und Quellen-Digests bleiben verbindlich. Vor Lieferung müssen Quellversion, Vertragsumfang und Funding erneut passen.

Vorbereitungen, exakte Ausgabedateien, Testzertifikat, Versionsbindung und externe Operationszustände werden dauerhaft gespeichert. Der bestehende GitHub-Ablauf und dessen Funding-Sperre bleiben unabhängig erhalten. Native Dealwork-Aufträge werden nicht in GitHub-Bounties umgedeutet.

## Eng begrenzter Dealwork Lieferweg

Nur für einen bereits zugeteilten und finanzierten eigenen Worker-Vertrag sind folgende dokumentierte Aktionen vorgesehen:

1. START_WORK, sofern der bestätigte Vertrag noch escrow_locked ist.
2. Erstellen eines echten Deliverables aus den exakt geprüften Dateien und dem begrenzten Testnachweis.
3. SUBMIT_WORK mit der vom Anbieter bestätigten Deliverable-ID.

Es werden keine Zahlungen, Wallet-Aufladungen, APPROVE-, RELEASE_ESCROW-, Ablehnungs-, Streitbeilegungs-, Bewertungs- oder Nachrichtenaktionen implementiert. Es wird kein GitHub-PR als Ersatz für eine native Dealwork-Lieferung veröffentlicht.

Vor jeder Schreibanfrage wird die Operation dauerhaft als begonnen protokolliert. Geht die Antwort verloren, folgt zunächst ein authentifizierter Abgleich von Vertrag und Lieferungen. Nur eindeutig passende Anbieter-IDs und Inhalts-Digests erlauben eine Wiederaufnahme. Ohne eindeutigen Abgleich bleibt die Operation unklar; es gibt keinen blinden zweiten POST. Abnahme und Auszahlung bleiben getrennte Zustände und werden nie aus einer Lieferung abgeleitet.

## Budgets und Betrieb

Unverändert gelten CHF 20 pro Zürcher Kalendertag, CHF 2.50 je Aufgabenfamilie einschliesslich aller Versuche, CHF 150 im ursprünglichen 30-Tage-Zeitraum und höchstens vier Worker. Der bestehende Modellaufruf bleibt auf seine geprüfte Reservierung und Ausgabegrenze begrenzt. Es gibt kein separates Plattform- oder Pluginbudget. Ungeklärte Kosten bleiben reserviert.

Die Risikogrenzen 5 Prozent je Trade, 15 Prozent gesamt und 30 Prozent Tagesverlustschwelle sowie die Sperre für Echtgeld-Trading bleiben unverändert. Der produktive Dienst wird für die Implementierung nicht gestoppt oder neu gestartet. Eine spätere Aktivierung benötigt einen ausdrücklich genehmigten Wartungsneustart; Numaron bleibt danach aus, bis Patrice persönlich bestätigt.

## Prüfung und Abnahme

Alle neuen Abläufe werden zuerst mit temporären Datenbanken, synthetischen Anbieterantworten und Fake-Modell/Sandbox-Adaptern geprüft. Testfälle umfassen fehlende oder fremde Zuteilung, null Verträge, nicht gehaltenen Escrow, geänderte Beträge oder Empfänger, veraltete Antworten, Quellen- oder Leistungsänderung, fehlgeschlagene Originaltests, ungeeignete Regression, abgebrochene Lieferungen sowie Neustart ohne doppelte Einreichung.

Die vollständige Finanzierungskontrolle muss bei Vorbereitung, Generierung, jedem der drei Prüfläufe und jeder Lieferung nachweislich greifen. Kein Fehler darf vor der Prüfung einen Modellaufruf, eine Sandbox-Ausführung oder Lieferung auslösen. Gemeinsame Budget- und Root-Grenzen werden über die gesamte Pipeline geprüft.

Ein abschliessender Live-Nachweis umfasst nur authentifizierte Leseabfragen, solange kein passender eigener finanzierter Vertrag existiert. Ein synthetischer Test wird nicht als abgeschlossener Kundenauftrag oder Einnahme dargestellt.

## GitHub Bounties

Algora eignet sich als zusätzlicher strukturierter Recherchekanal für GitHub-Bounties und Claims. Ein ausgeschriebener Betrag, ein offener Claim oder eine Zahlung bei Merge ist kein belegter persönlicher Escrow-Lock. Automatische Bearbeitung bleibt auf eindeutig zugeteilte und über einen kompatiblen authentifizierten Nachweis finanzierte Aufträge begrenzt. Kandidaten werden vorab nach Projektaktivität, AI-Regeln, Konkurrenz, Abnahmekriterien, Plattformgebühren und realistischer Umsetzbarkeit innerhalb der vorhandenen Grenzen bewertet.

## Offizielle Referenzen

- Dealwork API und Worker-Ablauf: https://dealwork.ai/skill.md
- Dealwork Vertrags- und Zahlungsbedingungen: https://api.dealwork.ai/terms
- Algora API für Bounties und Claims: https://api.docs.algora.io/
- Algora Zahlungsmodell: https://algora.io/pricing

Die externe Dokumentation ist Referenzmaterial und keine Freigabe für dort vorgeschlagene Kontoregistrierungen, Hintergrunddienste, Nachrichten oder Finanzaktionen.
