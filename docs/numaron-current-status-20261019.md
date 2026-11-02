# Gemeinsamer Numaron-Stand vom 19. Oktober 2026

**Neuester uGig-Stand:** Wartekorrektur und sichere Behandlung abgelaufener Leseabgleiche nach ausdrücklich freigegebener Wartung geladen. Lesend bestätigt: OFF, Revision 62; Controller gestoppt; keine aktiven Worker. 119 Tests erneut isoliert bestanden; 672 Budgeteinträge exakt unverändert, CHF 5 reserviert; keine zusätzlichen Quellenabrufe. Bereits erfolgten parallelen Neustart wiederverwendet, keinen zweiten ausgelöst. Beleg: `outputs/order-reconcile-wait-20261019/activation-report.json`. Ausschließlich Patrice startet persönlich. Aktuelle uGig-Wirkung nach neuem Start noch zu prüfen; ältere Betriebsstände darunter sind historische Übergaben.

**Neueste Wartung:** Suchquoten-Korrektur mit ausdrücklicher Freigabe geladen und am 19. Oktober gegen 02:47 Uhr Schweizer Zeit geprüft. Numaron OFF, Revision 60; Controller gestoppt. Budget- und Suchquotenregister exakt unverändert (640 Budgeteinträge). Die vorhandenen Fenster werden für SearXNG-Forschung und reguläre Exa-Suche aufgeteilt; kein zusätzliches Kontingent. 101 frische isolierte Tests bestanden. Beleg: `outputs/search-quota-fix-20261019/activation-report.json`. Ausschließlich Patrice startet persönlich; neuer produktiver Sucherfolg bleibt nach Start zu belegen. Ältere Betriebsstände unten sind historische Übergaben.

Diese Übergabe verknüpft den aktuellen Chatabgleich mit lokalen Belegen. Sie erteilt keine neuen Rechte. Der Hauptschalter ist bei jeder späteren Arbeit frisch zu prüfen; der hier protokollierte ON-Stand ist kein dauerhafter Startauftrag.

## Neuester Stand nach separat freigegebener Wartung

Patrice hat während des Chatabgleichs in den Chats zur Dashboard-/WSL-Wartung ausdrücklich kontrolliertes Ausschalten und Neustarten genehmigt. Der dortige Ablauf hat die Scheduler-Korrektur übernommen und den Dienst am 19. Oktober gegen 01:51 Uhr Schweizer Zeit neu gestartet. Aktuell hier lesend bestätigt: OFF, Revision 58; Controller gestoppt; 403 unveränderte Budgeteinträge, CHF 11.32 verbucht und CHF 5 reserviert. Der Controller entspricht dem isoliert geprüften Zielcode bis auf einen Kommentar. Beleg: `artifacts/runtime-blocker-repair-20261019/restart-readback.json`. Dieser Untersuchungsauftrag hat selbst keinen Stopp, Neustart oder Produktionsstart ausgeführt. Nur Patrice darf wieder einschalten. Neue produktive Forschungs-/SearXNG-Ergebnisse sind weiterhin nicht belegt.

## Betrieb und Grenzen

Patrice hat Numaron am 19. Oktober um 01:37:17 Schweizer Zeit persönlich eingeschaltet; damals ON, Revision 57; durch den neueren OFF-Stand oben abgelöst. Keine Unterbrechung, kein Neustart und keine Aktivierung durch diesen Untersuchungsauftrag. Die bestehenden Grenzen bleiben CHF 150 / 30 Tage, CHF 20 / Tag, CHF 2.50 / Aufgabenfamilie und maximal vier Worker. Zuletzt CHF 11.32 verbucht und CHF 5 reserviert. Keine zusätzlichen Handels- oder Produktionsfreigaben.

## Gemeinsamer Planungsfehler

Die geprüfte uGig-Gruppenkommunikation erzeugt `ugig-conversation:<UUID>` als Budgetwurzel. Der Controller lehnt den Doppelpunkt ab und wirft `Invalid task`, bevor Lernplanung und Worker-Ausführung erreicht werden. Ein isolierter Test mit echtem Runtime/Controller reproduziert das Problem. Vier gespeicherte Gruppenziele waren noch nie eingeplant. Die Anzeige `running` oder `planning` belegt deshalb keine tatsächliche Aufgabenbearbeitung.

Eine minimale Korrektur und drei neue Regressionstests wurden isoliert vorbereitet. Der abschließende isolierte Lauf bestand mit 113 Tests. Die gleiche ausführbare Korrektur wurde inzwischen durch den separat freigegebenen Wartungsablauf übernommen und geladen; siehe neuesten Stand oben. Paket: `outputs/scheduler-fix-20261019/README.md`, Beleg: `outputs/scheduler-fix-20261019/status.json`.

Die Übernahme wurde im separat freigegebenen Wartungsfenster durchgeführt. Für jede weitere Übernahme gilt: ON-Sitzung nicht für Wartung stoppen oder neu starten. Nach Wartung OFF prüfen; ausschließlich Patrice startet persönlich.

## Unterschiedliche Abläufe nicht verwechseln

- Allgemeine adaptive Forschung: aktiviert, 25 Themenbereiche geladen; bisher kein neuer produktiver Lernlauf nachgewiesen. Der Planungsfehler blockiert den Weg dorthin.
- SearXNG: lokaler Konfigurationsabruf erfolgreich, DuckDuckGo aktiviert. Kein produktiver Suchlauf durch diese Untersuchung ausgelöst; neuer Lauf nach Korrektur noch zu belegen.
- Separater Auftragsmonitor: laut abgeschlossenem Lauf `2026-10-18T23-37-29-869Z-57b068b6` am 19. Oktober um 01:40:17 erfolgreich abgeschlossen, 36 von 37 Quellenprüfungen erfolgreich. Guru-Zugang bleibt eigener Blocker. Das ist kein Beleg für einen funktionierenden Founder-Scheduler.
- PR #142: einmalige Auswertung `pr142-excerpt-verification-v1` wurde in einem anderen Chat eingereiht; dort zuletzt queued, null Versuche. Historisch manuell übernommene Merge-Belege sind keine neue automatische KI-Auswertung.
- H4-Forschung: laut aktuellem gesonderten Prüfbericht wurden für BCHUSD und LTCUSD je sieben Kerzen nachgeladen; jeweils 71 gespeichert, keine internen Lücken. 15 Kombinationen weiterhin ohne neue Kandidaten, weil kein passender 40-Kerzen-Ausbruch vorlag. Das ist von der allgemeinen Lernplanung zu unterscheiden.
- Demo-Tagesabgleich, Langzeit-Rundenbudget und Firecrawl: Untersuchung im Chat „WSL ohne Distribution installieren“; Korrekturen dort getrennt halten und jeweils zwischen vorbereitet und tatsächlich geladen unterscheiden.
- USDC/CHF-Aktualisierung: Stand/Übernahme im Chat „numaron – Name und Markenauftritt“; kein Trade und keine Budgetänderung daraus ableiten.
- Aufträge/Bewerbungen: kein Doppelmonitor und keine Doppelbewerbungen. Gemeinsame vorhandene Register und tatsächliche eigene Zuteilung prüfen. Die Mail-/AVV-Arbeit ist eine getrennte Aufgabe; keine Unterschrift oder Empfangsmigration durch diese Übergabe.

## Reichweite des Chatabgleichs

Abgeglichen wurden aktuelle Zusammenfassungen/letzte Nachrichten der auffindbaren relevanten lokalen Numaron-Chats und fünf thematisch relevanter ChatGPT-Chats sowie der bestehende Fortsetzungsindex mit Gap-Ledger. Dies ist keine erneute vollständige Prüfung jeder Nachricht aller historischen Chats. Manche ChatGPT-Antworten erscheinen nur als Inhaltsreferenz; ein Remote-Host war nicht erreichbar. Alte Aussagen über OFF, Tests, Gewinne oder erfolgreiche Aktivierung dürfen aktuelle Belege nicht ersetzen. Der alte Chat mit Kontextüberlauf bleibt historische Quelle.

Andere Projekte, insbesondere „The $2 Experiment“, behalten ihre eigenen Budgets und Aufträge. Persönliche Daten werden nicht pauschal zwischen Chats, Modellprompts oder öffentlichen Einreichungen übertragen.
