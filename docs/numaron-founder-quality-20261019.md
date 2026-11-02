# Founder: quellspezifische Zertifikatszuordnung und Fachprüfungen

Auftrag: lokale Implementierung und Offline-Tests, Numaron OFF, bestehende Änderungen und Schutzgrenzen erhalten. Umsetzung mit Test-first und unabhängiger Codeprüfung.

## Zuordnungsvertrag

Ein zusätzlicher unveränderlicher Ereignistyp quality-binding in der bestehenden Ablage enthält certificateId, capabilityId, sourceId, operation, revision, profile und createdAt. Die Ablage akzeptiert nur Verweise auf zuvor gespeicherte, positive Zertifikate der erweiterten Suite founder-quality-v2 mit gleicher Code-Revision. Historische v1-Zertifikate bleiben lesbar, decken diese Fachprofile aber nicht ab. Keine Aktualisierung bestehender Einträge und kein automatischer Import fremder Zuordnungen.

Die lesende Projektion verlangt: passende Quelle/Aktion im vorhandenen Fähigkeitsregister, konkrete Implementierung, vom Adapter ausdrücklich deklarierte qualityProfiles, passende Adapterrevision, explizit neu gelesene aktuelle Gesamtrevision und kein einschlägiger Offline-Widerruf. Ohne aktuellen Revisionsleser bleibt die Zuordnung ungeprüft; es gibt keinen stillen Dateiscan. Bei Lesefehlern entstehen keine positiven Aussagen.

Status profile-tested bedeutet: das benannte Fachprofil wurde in der festgelegten synthetischen Offline-Suite geprüft und explizit dieser Fähigkeit zugeordnet. Er bedeutet NICHT, dass deren externe Quellenanbindung getestet oder freigegeben wurde. sourceConnectionVerified bleibt false. Kein Eintrag wird in capabilityProofs umgewandelt; bestehende Arbeits-, Berechtigungs-, Budget- und Trading-Entscheidungen bleiben unverändert.

Lokale Anwendung: store.recordQualityBinding({...}) nach Speicherung des passenden Zertifikats; Read-only-Store als capabilityEvidenceStore verwenden und capabilityRevisionReader ausdrücklich bereitstellen, etwa () => fingerprintSources(base).revision. Quellenadapter müssen ihre unterstützten qualityProfiles und evidenceRevision deklarieren. Die Adapterrevision muss hier dem zertifizierten Gesamtfingerabdruck entsprechen; andere Revisionskonventionen qualifizieren sich nicht stillschweigend.

## Fachprofile

- content-package-structural-v1 nutzt die vorhandene Content-Paketprüfung: Briefbindung, erlaubte öffentliche Quelle, Format/Anzahl/Länge, Pflichtpunkte, Belegzitate, Links und Platzhalter. semanticVerified bleibt false; Stil, sprachliche Qualität und Tatsachenwahrheit sind dadurch nicht unabhängig bewiesen.
- invoice-reconciliation-v1 vergleicht einen Bericht mit expliziten Referenzzeilen: eindeutige IDs, vollständige und unveränderte Zeilen, Währungskennungen und exakte Summen pro Währung. Ganzzahlige Minor-Units, maximal 1000 Zeilen, keine negativen Beträge oder unsicheren Summen. Gutschriften, Wechselkurse und Buchhaltungsregeln sind nicht abgedeckt. sourceTruthVerified bleibt false: Eine korrekte Berechnung macht die Referenzdaten nicht authentisch.

Beide Funktionen liefern begrenzte Ergebnisse ohne Klartext der Referenz-/Berichtsinhalte. Es werden keine Modelle, Provider oder Kundensysteme aufgerufen. Der Zertifizierer führt zusätzlich die Fach- und Zuordnungstests sowie die bestehenden Content-Pakettests aus.

## Grenzen der Umsetzung

Die Zuordnung ist eine ausdrückliche lokale Aussage über die Anwendbarkeit eines getesteten Fachprofils. Sie beweist nicht die tatsächliche Qualität beliebiger Kundenarbeit. Kein bestehender Produktionsadapter wurde pauschal als geeignet markiert. Tests deklarieren Unterstützung ausschließlich an temporären Fake-Adaptern. Externe Plattformverträge und Produktionsrechte werden nicht verändert.

Die bisherigen Grenzen der lokalen Hash-Verkettung gelten weiterhin: keine Signatur, keine Garantie gegen Austausch/Rollback durch Schreibberechtigte. Alte Nachweise und alle bestehenden Änderungen bleiben erhalten. Testresultate und der konkrete zertifizierte Code-Stand sind im Abnahmebericht verzeichnet.

## Abnahme und Entwicklungsbeispiel

148/148 Tests der 17-Dateien-Suite bestanden auf einer stabilen Codekopie. Zertifikat und Fingerabdruck: outputs/founder-quality-20261019/certificate-snapshot.json. Ein früherer Lauf im Hauptarbeitsstand bestand ebenfalls alle Tests, wurde aber wegen parallel geänderter Dateien korrekt invalidiert.

Zwei Zuordnungen sind ausschließlich in der Entwicklungsablage demonstriert: offline-fixture:invoices/source-verify und offline-fixture:content/source-verify. Sie stehen explizit für synthetische Prüfquellen, nicht für reale Produktionsaccounts. mapping-readback.json dokumentiert Wiederöffnung, aktuelle Kopie, veralteten Hauptarbeitsstand und getrennte Nachweisarten. quality-sample-results.json zeigt einen korrekten und einen fehlerhaften synthetischen Rechnungsabgleich.

Der Laufzeitintegrationstest verwendet temporäre SQLite-Speicher, einen synthetischen Quellenregistereintrag und einen Fake-Adapter mit expliziter Profildeklaration. Er prüft gültige Zuordnung, anschließenden Revisionswechsel zu stale, unverändertes Budget und unbekannte Berechtigungs-/Live-Nachweise bei OFF. Kein Produktionsadapter wurde zur Nutzung des Prüfers umgebaut; dessen tatsächliche Einbindung in reale Kundenaufträge und deren inhaltliche Abnahme bleiben ein eigener, zu prüfender Schritt.
