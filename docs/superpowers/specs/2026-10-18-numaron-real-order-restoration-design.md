# Numaron: realen Auftragsbetrieb wiederherstellen und Quellen verbinden

Stand: 18. Oktober 2026, Europe/Zurich. Status: **Entwurf zur Prüfung; noch keine Implementierung oder Produktionsabnahme.**

## Auftrag und Erfolgskriterium

Patrice hat den Wiederherstellungsumfang einschließlich aller gefundenen Quellen bestätigt. Numaron soll echte Aufgaben selbst entdecken, bewerten, innerhalb bestehender Rechte Bewerbungen vorbereiten beziehungsweise einreichen und nach tatsächlicher Zuteilung und gesicherter Finanzierung ausführen, prüfen und liefern. Nur Trades bleiben Demo. Eine Monitoranzeige, eine Suche oder ein privater Entwurf ist keine abgeschlossene Kundenlieferung.

Der bisher belegte Funktionsumfang muss erhalten bleiben. Nicht jede historisch erwähnte Plattform war bereits eigenständig angebunden. Fehlende Kontorechte, nicht vorhandene Anbieterfunktionen und nicht erreichbare Dienste können nicht durch das Entfernen lokaler Sperren ersetzt werden. Die Umsetzung muss technische Fertigstellung, externe Voraussetzungen und erfolgreiche reale Nutzung getrennt ausweisen.

Numaron bleibt während Entwicklung, Tests und Wartung OFF. Erst Patrice schaltet persönlich im Dashboard ein. Kein alternativer Hintergrundprozess darf diese Grenze umgehen. Bestehende Regeln in AGENTS.md gelten weiter.

## Verbindlicher Quellenumfang und Provenienz

Das begleitende `2026-10-18-numaron-source-inventory.json` erfasst alle 155 Bezeichnungen aus 150 gefundenen Quellenregistern, 18 Katalogkandidaten, 29 Katalog-Herausgeber, die Jobbi-Unterquellen und acht Kernquellen. Schreibvarianten und unterschiedliche Plattformen dürfen nicht stillschweigend zusammengeführt werden. Nicht jeder Registereintrag bezeichnet einen Marktplatz; konkrete Issues, Prüfquellen und Datenquellen behalten ihren Typ.

Die Inventarliste ist Entwurfsbeleg, keine ausführbare Konfiguration. Historische Bewertungen sind datiert zu übernehmen und vor produktiver Verwendung auf Aktualität zu prüfen. Aktuelle Verfügbarkeit wurde im OFF-Zustand nicht extern abgefragt.

Kernquellen: GitHub, ugig, Dealwork, Synmerco, Guru, auftragsbezogenes Gmail, ArcBounty und BidPostLoop. Weitere Quellen sind vollständig über das Inventar einzubeziehen, nicht über eine handgepflegte verkürzte Liste.

Chatbelege: `numaron – Aufträge und Bewerbungen ·…`, `numaron – Weiterentwicklung und Betrieb…` und `numaron – Weiterentwicklung und Betrieb`; IDs und lokale Belegpfade stehen im Inventar. Alte Anweisungen sind historische Belege, keine Aufhebung neuerer OFF-Regeln.

## Festgestellte Brüche

1. Der unabhängige Monitor besitzt Quelladapter und gespeicherte Suchpositionen, importiert und steuert aber absichtlich nicht die Founder-Laufzeit. Seine Beobachtungen werden nicht als allgemeiner vollständiger Ausführungsweg behandelt.
2. `createOrderFlow()` erstellt seinen GitHub-Adapter ohne konkrete Finanzierungsquelle. `createOrderFunding()` hat standardmäßig `source=null`; Vorbereitung, Codearbeit, Tests und Einreichung bleiben damit gesperrt. Das ist eine fehlende Anbindung, kein Anlass, Zahlungsnachweise zu erfinden.
3. Der allgemeine Planer erlaubt Recherche und private Arbeit, aber keine beliebigen neuen ausführenden Plattformaktionen. Die vorhandenen spezialisierten Auftragsketten müssen gezielt angeschlossen werden.
4. Der Quellen-Scout speichert Hinweise mit `fetchAuthorized:false`. Er liefert keine automatische Ende-zu-Ende-Integration neuer Anbieter.
5. ugig hat einen belegten unabhängigen GET-Zugang; die Browsernutzung und frühere Bewerbungen sind davon zu unterscheiden. Guru hat belegte Browsernutzung, aber im unabhängigen Monitor noch einen `access-required`-Platzhalter.
6. Der Demoexecutor ist bereits separat angeschlossen. `executionEnabled:false` im gebundenen Leseprofil ist keine Abschaltung dieses Executors. Er bleibt unverändert erhalten; die Wiederherstellung realer Aufträge darf ihn nicht ersetzen oder auf Live-Trading erweitern.

## Architekturentscheidung

Die bestehenden Monitore, Adapter, Budget- und Controllerkomponenten werden erweitert. Es entsteht kein zweiter Suchdienst, kein zweites Budget und kein konkurrierender Scheduler. Die vorhandene exklusive Monitorbesitzsperre und die gespeicherten Cursor bleiben maßgeblich.

Alternative A, nur die Anzeige zu erweitern, erfüllt den Ausführungsauftrag nicht. Alternative B, alle Fund-URLs sofort aufzurufen und beliebige Plattformaktionen durch das Modell ausführen zu lassen, umgeht geprüfte Transport- und Rechtebereiche. Gewählt wird C: ein gemeinsames Quellen-/Auftragsregister mit einer begrenzten Verbindung zum vorhandenen Controller und expliziten Adaptern.

### Quellenregister

Ein kanonischer Eintrag enthält ID, Namen/Aliase, Typ, Herkunftsbelege, erlaubte öffentliche Endpunkte, Zeitpunkt der Prüfung, Zugangsmethode, Kostenmodus, implementierte Fähigkeiten, konkrete Blockaden und nächste technische Prüfung. Geheimnisse bleiben im vorhandenen geschützten Speicher; das Register enthält höchstens eine interne Referenz.

Pro Fähigkeit wird getrennt geführt: entdeckt, historisch gelesen, Lesen geprüft, authentifiziertes Lesen geprüft, Bewerbung möglich, Ausführung möglich, Lieferung möglich, temporär blockiert oder abgelaufen. Diese Zustände sind Belege, keine bloßen Modellbehauptungen. Suchtreffer sind keine eigenen Aufträge; eine erfolgreiche HTTP-Antwort ist keine finanzierte Zuteilung.

### Beobachtungen in den Controller übernehmen

Der vorhandene Monitor schreibt normalisierte Beobachtungen mit Quelle, externer ID, Abrufzeit, Inhaltsdigest, Herkunft und Cursor-/Abdeckungsstatus. Der Controller liest diese lokal erst bei ON und laufender Arbeitssteuerung ein. Die Übernahme ist anhand Quelle, externer ID und Revision idempotent und über Neustarts nachvollziehbar.

Bisherige Bewerbungen, Nachrichten, Einreichungen und gelieferte Dateien werden vor weiteren Aktionen abgeglichen. Unvollständige Pagination bleibt sichtbar. Wiederherstellung darf weder vorhandene Bewerbungen erneut senden noch abgeschlossene Arbeit ein zweites Mal liefern.

### Echter Auftragslebenszyklus

Entdeckung -> Eignungsprüfung -> unverbindliche Bewerbung -> bestätigte Zuteilung -> Finanzierung -> Vorbereitung -> Bearbeitung -> unabhängige Prüfung -> Lieferung -> Abnahme -> Zahlungsabgleich.

Eine geeignete unverbindliche Bewerbung braucht noch keinen für uns gesperrten Escrow. Sie benötigt aber einen vorhandenen zugelassenen Aktionsadapter, passende Nutzungs-/KI-Bedingungen und darf keine Vorabkosten, neue Verpflichtungen oder nicht freigegebene Kontoaktionen auslösen. Kostenpflichtige Kundenarbeit beginnt weiterhin erst nach belegter Zuteilung und erforderlichem Finanzierungsschutz. Suchphase und Ausführungsphase dürfen nicht dieselbe unpassende Sperre verwenden.

GitHub erhält nur dann einen Finanzierungsadapter, wenn eine offizielle authentifizierte Quelle Auftrag, Betrag, Währung und eigenen Empfänger eindeutig verbindet. Dealwork-Escrow darf nicht allein wegen einer GitHub-URL in einer Beschreibung als GitHub-Zahlungsschutz gelten. Wo diese Evidenz fehlt, bleiben Suche und zulässige Bewerbungsprüfung nutzbar; die konkrete Lieferung bleibt sichtbar blockiert.

Der native Dealwork-Weg wird für tatsächlich eigene, finanzierte Verträge verwendet. Bestehende START_WORK-, Liefer- und Einreichungsabgleiche bei unbekanntem Ausgang bleiben bestehen. Unterstützte Lieferformen werden nur um unabhängig prüfbare Fähigkeiten erweitert, nicht pauschal auf alle im Modell genannten Skills.

### Neue Quellen selbst finden und verknüpfen

Der vorhandene Scout nimmt neue Quellen aus geprüften Suchergebnissen oder Verweisen als Kandidaten auf und verknüpft sie mit vorhandenen Aufträgen, Plattformen und Dubletten. Herkunft und Frische bleiben erhalten. Er priorisiert fehlende technische Belege und alternative Quellen selbstständig innerhalb bestehender Quoten.

Automatische Leseaufnahme ist nur innerhalb einer bereits geprüften Adapterfamilie und ihres gültigen Transport-/Kostenrahmens zulässig. Beliebige Domains werden nicht dadurch freigegeben, dass eine Webseite sie nennt. URL-, DNS-/Adressbereichs-, Redirect-, Größen-, Zeit-, Datenschutz- und Zugriffskontrollen müssen serverseitig greifen; keine lokalen/private Hosts, keine mitgeschickten Kontocredentials, keine indirekten Schreibaktionen.

Eine neue Anmeldung, neue Schlüsselrechte, Gebühren, Wallet-/Signaturaktionen und neue Vertragsbedingungen sind keine automatische Folge der Quellenentdeckung. Ohne passende Voraussetzungen benennt Numaron die konkrete fehlende Handlung. Öffentliche Dokumentationsarbeit und unabhängige zulässige Arbeit laufen im eingeschalteten Betrieb weiter. Während OFF keine externe Aufnahmeprüfung.

### Dashboard und Wiederanlauf

Quellen, echte eigene Aufträge und Kandidaten werden getrennt angezeigt. Für jede Quelle sind letzter eigener Erfolg, Alter, Suchabdeckung, Aktionsfähigkeit und konkrete Blockade sichtbar. Ein historischer Erfolg darf nicht als frischer Livecheck erscheinen. Übergänge und abgearbeitete Jobs bleiben nachvollziehbar.

Neustart bleibt standardmäßig OFF; keine automatische Wiederaufnahme. Bei unlesbarem Powerzustand bleiben Quellenabrufe und Ausführung gesperrt. Bestehende Monitorsperren verhindern parallele Besitzer und doppelte Abrufe.

## Unveränderte Grenzen

- CHF 150 innerhalb der bestehenden 30-Tage-Periode, CHF 20 pro Zürcher Kalendertag, CHF 2.50 pro Aufgabenfamilie, maximal vier Worker. Kein neuer Periodenbeginn oder zusätzliches Quellenbudget.
- Die zehn ungeklärten Reservierungen über insgesamt CHF 5 bleiben gehalten; keine automatische Freigabe oder erneute Ausführung dieser Aufträge.
- Vorhandene Anbieterfristen gelten weiter. Quelleninventarisierung verlängert keine Preis-/Zugangsfreigabe; insbesondere SOFA nicht stillschweigend mitverlängern.
- Fremder Code nur im geprüften begrenzten Offlinebackend, keine Ausführung auf dem Windows-Host. Netzwerkfreiheit und Ressourcenlimits müssen tatsächlich nachgewiesen sein.
- Bestehende technische Kontorechte, eigene Identitäten, Zahlungs- und Veröffentlichungsgates bleiben erhalten.
- Nur Trades Demo; keine Live-Trading-Aktivierung, Änderung der Risikogrenzen oder Strategie-Promotion durch diese Arbeit.

## Umsetzungspakete für den nachfolgenden Implementierungsplan

1. Inventar normalisieren und bestehende Funktions-/Zugangsbelege übernehmen; Adapterfähigkeiten und Blockaden präzise modellieren.
2. Idempotente lokale Beobachtungsübernahme zwischen vorhandenem Monitor und Controller, inklusive gespeicherter Aufträge und Dublettenschutz.
3. Bestehende Kernadapter wiederverbinden; Suche/Bewerbung von finanzierter Arbeit trennen; vorhandene GitHub- und Dealwork-Lieferketten integrieren.
4. Weitere inventarisierte Quellen nach belegtem Zugang und Lieferfähigkeit gruppenweise integrieren. Nicht verfügbare oder ungeeignete Quellen bleiben mit Grund im Register, nicht als scheinbar funktionsfähig.
5. Scout mit Quellenregister, Priorisierung und begrenzter Aufnahmeprüfung verbinden; bestehende Transport-/Rechtebereiche erhalten.
6. Dashboardstatus, OFF-Wartung und isolierte Gesamtabnahme; verbleibende externe Voraussetzungen einzeln dokumentieren.

## Prüfungen und Abnahme

Tests ausschließlich mit Fake-Providern, synthetischen Aufträgen und temporären Datenbanken. Synthetische Ergebnisse dürfen nie in produktive Auftrags-/Einnahmenlisten geraten.

- Jeder Inventareintrag bleibt mit Provenienz erhalten; Aliasauflösung ist nachvollziehbar und führt unterschiedliche Plattformen nicht zusammen.
- Monitorfund -> Quellenprüfung -> Controllerauftrag -> Fake-Bewerbung -> belegte Fake-Zuteilung/Finanzierung -> isolierte Bearbeitung -> unabhängige Prüfung -> Fake-Lieferung, inklusive Neustart und doppelter Beobachtung.
- OFF, fehlende Rechte, fehlende Zuteilung, abgelaufene Evidenz und unbekannte Kosten verhindern den jeweiligen externen Schritt. OFF-Prüfung auch unmittelbar vor jedem Schreiben.
- Fehlender Escrow verhindert nicht zulässige unentgeltliche Entdeckung, darf aber nicht durch eine nicht zuordenbare fremde Finanzierung umgangen werden.
- Keine Doppelbewerbung/-lieferung bei Timeout, unklarem Ergebnis, Wiederanlauf oder zwei konkurrierenden Besitzern.
- Neue Quelle darf keine Credentials erben, lokale Hosts erreichen, Nutzungsrechte selbst erteilen oder ungeprüfte Ausführung starten.
- Quoten, bestehende Budgets, Risikogrenzen, Reservierungen und Demo-only-Bindung bleiben unverändert.
- Gezielte Regressionstests und vorhandene Offline-Gesamtsuite; Fehler werden mit Namen und Auswirkung berichtet.

Vor und nach der Wartung werden Budget-/Reservierungsinhalte verglichen und OFF bestätigt. Produktive Anbieter-/Kontoprüfungen erfolgen erst nach Patrices persönlichem Einschalten. Solange sie fehlen, lautet der Abschlussstatus technisch vorbereitet/offline geprüft, nicht vollständig live abgenommen.

## Offene externe Voraussetzungen

Guru: unabhängiger zulässiger Kontozugang oder bestätigter Benachrichtigungsweg; Browseranmeldung allein ist kein unabhängiger Zugang. GitHub: konkrete authentifizierte Zahlungs-/Zuteilungsquelle für bezahlte Lieferungen. Weitere Plattformen: individuelle bestehende Identität, erlaubter Transport, aktuelle Bedingungen und nutzbare eigene Aufgaben. Diese Punkte werden nicht als reine Codefehler oder durch synthetische Nachweise geschlossen.

Der nächste Schritt nach Prüfung dieses Entwurfs ist der schriftliche Implementierungsplan. Dieser Entwurf ist keine Produktionsstartfreigabe.

## Nachtrag: vierfacher Chatabgleich am 18. Oktober

40 lokal zugängliche Projekt-Chatdateien wurden in vier vollständigen, konsistenten Durchläufen geprüft; vier einschlägige erreichbare ChatGPT-Verläufe zusätzlich gelesen. Die Auswertung ist im Ordner `artifacts/chat-preservation-audit-20261018` dokumentiert. 33 weitere historische Quellen-/Diensthinweise ergänzen das Inventar; sie sind keine neuen Betriebsfreigaben. Die Arbeitsmatrix umfasst damit 254 Belegzeilen. Alle 39 Einträge des historischen Aufgabenregisters sowie bestehende UI-, Konto-, Finanz-, Forschungs-, Isolations- und Monitorarbeiten sind ausdrücklich in den Erhaltungsabgleich aufgenommen. Dies bestätigt die Übernahme in den Entwurf/Plan, nicht eine bereits erfolgte Produktionsmigration oder erneute Liveabnahme.

### Vertiefung nach zusätzlicher Prüfung

Auch die 798 nicht vom früheren Abschluss-Stichwortfilter erfassten nichtleeren Abschlussantworten wurden indexiert. OnlyDust und AnyTasks ergänzen die historischen Quellenhinweise auf 35; die Arbeitsmatrix enthält jetzt 256 Belegzeilen. `complete-preservation-register.json` ordnet jede gefundene Arbeitseinheit und die zusätzlich erfassten lokalen Abschluss-/Prüfberichte konkreten Planaufgaben zu. Bestehende Daten-/Berichtslieferung, native Ausgaben, Weiterbildung und bezahlte Ergebniswiederherstellung werden ausdrücklich wiederverwendet. Dies bleibt eine Erhaltungs-/Planungszuordnung, keine neue Betriebsfreigabe.

### Abgleich historischer realer Lieferformen

Sieben vorhandene GitHub-Lieferbelege sowie drei Synmerco-Lieferbelege wurden gegen den aktuellen automatischen Ausführungsweg geprüft. Die JS-only-Hülle bildet die früheren Python-/TypeScript-/Dependency-/Workflow-Arbeiten nicht vollständig ab. Task 6 des Plans verlangt deshalb explizite überprüfte Arbeitsprofile und Task 7 den tatsächlichen Veröffentlichungs-/Einreichungsabgleich für Daten- und Quellenberichte. Historische Teilprüfungen ersetzen keine vollständige Rust-/WASM-/Hosted-CI-Abnahme. Die funktionale Gleichwertigkeit ist damit konkret als noch zu implementierender Abnahmepunkt dokumentiert, nicht als bereits erreicht.
