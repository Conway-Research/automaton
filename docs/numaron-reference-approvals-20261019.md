# Quellspezifische Referenzfreigaben und vorbereitete Abnahme

## Implementierter Ablauf

1. Ein geprüfter lokaler Leser liefert den konkreten Rechnungsauftrag samt `qualityContract`. Die Herkunft der Rechnungsdaten muss unabhängig geprüft werden.
2. `referenceScope(binding)` erzeugt die genaue Bindung: Quelle, Auftrags-ID, Eigentümer, Aufgabenfamilie, Quellenrevision, Scope und Hash des vollständigen Referenzvertrags. Rohdaten werden nicht im Freigabedatensatz gespeichert.
3. Eine ausdrücklich vorgenommene lokale Prüfung kann über `store.recordReferenceApproval({scope, reviewerId, ref, reviewedAt, expiresAt})` dokumentiert werden. `ref` ist eine lokale `contract:`-Referenz. Die Ablage besitzt keine eigene Benutzeranmeldung: Schreibzugriff ist eine vertrauenswürdige administrative Schnittstelle und darf nicht einem Modell oder externen Auftragsdaten als Werkzeug angeboten werden. Ein Reviewername ist keine kryptografische Identitätsbestätigung.
4. `createReferenceAuthority({sourceId, store, now})` liest die aktuellen Datensätze bei jeder Prüfung. Ein optional read-only geöffneter Store reicht im Ausführungspfad. Unbekannte, abgelaufene, zukünftige, fremde oder widerrufene Freigaben sowie Lesefehler erlauben keine Ausführung.
5. `createMarketplaceWorkSource({..., referenceAuthority})` verknüpft diese Prüfung mit dem bestehenden Produktionsadapter. Ein zusätzlich übergebener `validateQualityContract` muss ebenfalls zustimmen. Die Freigabe wird auch nach asynchroner Produktprüfung und unmittelbar vor dem tatsächlichen Versandaufruf erneut geprüft.
6. `prepareReferenceAcceptance({product, authority})` erzeugt einen lokalen Abnahmeentwurf mit Scope und Datei-Digest. Passende Referenzfreigabe und erfolgreiche Fachprüfung ergeben höchstens `ready-for-source-review`. Frische Quellenzuweisung, Lieferbestätigung und Käuferabnahme bleiben ausdrücklich `pending-external`; `accepted` und `executionAuthorized` bleiben immer false.

## Widerruf und Persistenz

`store.recordReferenceWithdrawal({approvalId, revokedAt, ref})` verweist auf einen existierenden Freigabedatensatz. Ein Widerruf bleibt auch bei zurückgestellter Uhr wirksam. Derselbe Freigabedatensatz kann nicht durch erneutes Einfügen reaktiviert werden. Eine erneute fachliche Freigabe erfordert einen neuen ausdrücklich geprüften Datensatz.

Freigaben und Widerrufe verwenden die vorhandene transaktionale, append-only SQLite-Nachweisablage mit Hashkette, Größenbegrenzungen und Integritätsprüfung. Bestehende Zertifikats- und Widerrufsdaten werden nicht migriert oder verändert. Die Hashkette schützt nicht gegen einen Administrator, der die vollständige Datenbank ersetzt.

## Offline-Abnahmeplan

- Fehlende Freigabe, falsche Quelle/Eigentümer/Auftragsfamilie/Revision, geänderte Referenzen, zukünftige Prüfung und Ablauf müssen blockieren.
- Wiederöffnen im read-only-Modus muss die Freigabe erhalten; Schreibversuche müssen scheitern.
- Widerruf muss gespeicherte Verifikation und Versand blockieren, einschließlich Widerruf während der frischen Quellenabfrage.
- Der vollständige Rechnungsablauf wird nur mit temporären Datenbanken und Fake-Quellen ausgeführt. Der Test prüft genau einen Versand im Erfolgsfall und null Sendeaufrufe bei Widerruf.
- Abnahmeentwürfe dürfen weder Rohreferenzzeilen noch eine echte Käuferabnahme oder Ausführungsfreigabe enthalten.

## Betriebsgrenzen

Numaron bleibt OFF. Es wurden keine echten Quellenfreigaben erteilt, kein Produktionsstore beschrieben, keine Konten angesprochen und kein Dienst neu gestartet. Die neue Authority ist eine explizite Kompositionsoption; vorhandene Produktionskonfigurationen werden nicht automatisch umgestellt. Die vorbereitete Abnahme unterstützt derzeit den begrenzten Rechnungsabgleich. Der bestehende Content-Review bleibt unverändert.

Echte Referenzherkunft, administrativ geprüfte Freigaben und externe Kundenabnahmen sind ausstehend. Ein Offline-Zertifikat ersetzt keinen dieser Nachweise.
