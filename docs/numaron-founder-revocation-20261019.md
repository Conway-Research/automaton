# Founder: Widerruf revisionsgebundener Nachweise

Umsetzung am 19. Oktober 2026, Teil der priorisierten Nachweiskette. Expliziter Auftrag: offline implementieren und testen, Produktion OFF, bestehende Arbeit erhalten.

## Vertrag

Die reine Projektion akzeptiert zusätzlich revocations (höchstens 2048). Jeder Datensatz benötigt capabilityId, sourceId, operation, revision (64 Hex-Zeichen), dimension, revokedAt (gültiger Zeitpunkt, nicht in der Zukunft) und eine sichere opaque ref. Die vier Nachweisarten sind authorization, availability, offlineVerification und liveVerification.

Widerrufe kommen ausschließlich als explizite vertrauenswürdige lokale Eingabe. Kein Providerabruf, kein automatischer Import von Modellantworten oder Dateien. Ungültige Eingaben führen zu einer leeren Projektion mit Diagnose, niemals zum Rückfall auf positive Belege.

Ein Widerruf gilt exakt für Fähigkeit, Quelle, Aktion, Implementierungsrevision und Nachweisart. Der Status lautet revoked. Ein neuerer Erfolgszeitstempel hebt ihn nicht auf. Andere Nachweisarten und Revisionen werden nicht mitwiderrufen. Eine neue Revision benötigt eigene gültige Belege und erteilt selbst keine Berechtigung. Historische Belege bleiben zur Nachvollziehbarkeit sichtbar; aktuelle Statuswerte und Widerrufe sind getrennt.

Runtime erhält capabilityRevocations (standardmäßig leer) und reicht diese an die Projektion weiter. Der vorhandene authentifizierte Lese-Endpunkt liefert das Ergebnis. Keine Änderungen an ausführenden Berechtigungsentscheidungen oder Produktionsregistern: Dies ist ein Widerruf von Nachweisaussagen, keine neue zentrale Betriebssteuerung.

## Umsetzung und Prüfungen

Fünf betroffene Dateien vor Bearbeitung unter outputs/founder-revocation-20261019/before gesichert. Test-first: explizite Widerrufe, falsche Bindungen, Übersteuerungsversuche, ungültige Eingaben, Datenschutz/Deduplizierung, UI und echte Laufzeit/HTTP-Integration mit temporären Speichern. Die Integration weist OFF, null Adapteraufrufe und unverändertes Budget nach.

Keine produktive Nachweissammlung eingebaut oder behauptet. Die Quelle der vertrauenswürdigen Widerrufe, deren dauerhafte Administration, automatische revisionsgebundene Testzertifikate und die generische Fähigkeitsbindung bleiben Folgearbeit. Reale Plattformverträge, fachliche Kundenqualität und Live-Abnahme werden durch diese Tests nicht ersetzt.
