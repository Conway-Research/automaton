# Numaron: verbundener Founder-Auftragsablauf

Stand: 13.10.2026. Umfang durch Patrice im Chat beauftragt; konkreter Entwurf zur Prüfung. Kein Nachweis einer bereits erfolgten Anbindung.

## Ziel und bestehende Basis

Numaron soll belegte eigene Aufträge verfolgen, relevante Antworten und Termine zuordnen, überprüfte Ergebnisse erstellen und dauerhaft ablegen. Vorhandene Recherche über Exa, Firecrawl und SOFA sowie Budgetcontroller und persistente Aufgaben bleiben die Grundlage. Installation eines Codex-Plugins ist kein Dienstzugang des Hintergrundprozesses.

## Entscheidung

## Präzisierung durch Patrice: Genesis als Grundlage

Die vorhandene konfigurierte Genesis-Direktive bleibt unverändert maßgeblich für die wirtschaftliche Mission. Patrice präzisierte am 13.10.2026: Numaron muss selbst Arbeit entdecken, auswählen und beginnen; die hier beschriebenen Anbindungen ergänzen diese Mission. Der Ausbau darf Numaron nicht auf die Verarbeitung manuell zugewiesener Aufgaben reduzieren. Technische Einrichtungsetappen und fehlende Ausführungsfähigkeiten sind kein abschließender Ersatz für den Genesis-Auftrag.

Der autonome Regelkreis lautet: Chancen und Wissenslücken entdecken, bewerten, günstig validieren, priorisieren, Budget reservieren, geeignete Arbeit parallel ausführen, Ergebnisse prüfen, tatsächliche Kosten und Resultate messen, Erkenntnisse speichern und nächste sinnvolle Arbeit auswählen. Er läuft durch einen dauerhaften Scheduler auch ohne offene Codex-Unterhaltung. Abgeschlossene Aufgaben lösen eine erneute Priorisierung aus. Fehlende Information führt zu gezielter Recherche, mit Herkunfts- und Aktualitätsprüfung. Wiederholungen ohne neue Erkenntnis werden begrenzt. Wirtschaftlich unbegründete Aktivität wird zugunsten von Kostenersparnis und gezielter Wiedervorlage unterlassen.

Genesis muss vollständig und nachweisbar an Planer und Modell-Worker übergeben werden; eine bloße Erwähnung oder verkürzte Ersatzmission reicht nicht. Die vorhandenen Hilfen in src/agent/genesis.ts sind dafür zu prüfen und wiederzuverwenden. Die aktuelle direkte Founder-Laufzeit ist auf diese Durchleitung noch ausdrücklich zu prüfen; der vorhandene Rechercheplan allein belegt keine vollständige Genesis-Ausführung.

Zusätzliche Abnahmekriterien: Start mit leerer Aufgabenliste erzeugt selbstständig eine begründete Arbeitsauswahl; nach Abschluss wird ohne Nutzereingabe weiter priorisiert; Informationslücken erzeugen begrenzte Recherche; mehrere unabhängige Arbeiten laufen innerhalb desselben Budgets; Neustarts erhalten Aufgaben, Reservierungen und Ergebnisse; ein fehlender Zugang blockiert nur abhängige Arbeit; Betrieb ohne Codex-Fenster wird getestet. Nachweisbare Kostenersparnis und begründetes Warten zählen ebenfalls als zulässige Entscheidungen. Autonomie bedeutet keine Garantie auf Profit oder ununterbrochene Verfügbarkeit externer Dienste.

Die bestätigten Budgets, persönlich erteilten Kontozugänge und konkreten Aktionsberechtigungen bleiben durchsetzbar. Numaron darf sie nicht aus der Genesis heraus eigenständig erweitern. Erforderliche persönliche Anmeldung oder externe Freigabe wird als Ausnahme sichtbar, während unabhängige Arbeit weiterläuft. Vollständige Autonomie wird erst für tatsächlich implementierte und geprüfte Abläufe ausgewiesen. Fehlende Veröffentlichung, Auftragsannahme, Lieferung oder Zahlungsfunktion bleibt explizite Fähigkeitslücke und darf nicht als fertig gelten.

Empfohlen: direkte, eng begrenzte Dienstadapter im bestehenden Founder-Prozess. Eine ausschließlich durch Codex bediente Verbindung wäre nicht autonom. Ein neuer externer Automatisierungsdienst würde zusätzliche Kosten und einen zweiten Berechtigungsbereich schaffen. Deshalb wird weder die Codex-Anmeldung kopiert noch ein zusätzlicher bezahlter Dienst vorausgesetzt.

## Adapter und Grenzen

* GitHub: öffentliche eigene Issues, PRs, Kommentare, Reviews und CI direkt lesen. Eigene Aufträge nur anhand lokaler Einreichungsnachweise oder ausdrücklich zugeordneter Konten aufnehmen. Private Repositories erst nach gezielter Kontofreigabe. In dieser Stufe keine neuen PRs, Kommentare oder verbindlichen Zusagen.
* Gmail: eigener OAuth-Dienstzugang mit Leseumfang; nur ein vom Nutzer bestimmtes Postfach/Label für Numaron. Nachrichten anhand bekannter Thread- und Auftragskennungen zuordnen. Unklare Zuordnung bleibt ungeklärt. Antwortentwürfe zunächst lokal; kein automatischer Versand und kein vollständiger Import des privaten Postfachs.
* Drive/Docs/Sheets: eigener Dienstzugang für einen bestimmten Numaron-Ausgabeordner. Ergebnisdateien und zugehörige Nachweise versioniert erstellen. Keine öffentliche Freigabe, keine Bearbeitung fremder Dokumente, keine Löschung bestehender Ergebnisse. Externe Schreibaktionen erhalten eindeutige Vorgangskennungen; nach unklarer Antwort zunächst abgleichen statt erneut anlegen.
* Kalender: ausgewählten Kalender lesend verwenden. Fristen aus Nachrichten als Vorschläge speichern; bestätigte Termine getrennt kennzeichnen. Keine Einladungen, Absagen oder automatischen Terminänderungen.
* Amplitude: vorhandenes, vom Nutzer ausgewähltes Projekt lesend abfragen. Ohne Projekt, Zugang und echte Ereignisse bleibt die Anzeige nicht verbunden. Dieser Ausbau installiert kein Besuchertracking und überträgt keine Kundendaten zu Amplitude.

## Gemeinsames Auftragsmodell

Ein Auftrag besitzt eine stabile interne ID, Plattform und externe IDs, Titel, Herkunftsnachweis, Bearbeitungsstatus, Quellenzeitpunkt, zugeordnete Ergebnisse und optionale bestätigte Frist. Ausschreibung, Zuteilung, Lieferung, Abnahme, Vergütungszusage und bestätigter Zahlungseingang sind getrennte Felder mit eigenen Belegen. Ein Merge ist keine Zahlungsbestätigung. Unklare oder widersprüchliche Belege lösen keine Aufwertung des Status aus.

Eingehende Änderungen werden normalisiert und anhand Provider plus externer ID plus Revision dedupliziert. Cursor und Ergebnisse werden dauerhaft gespeichert. Ein Neustart darf weder doppelte Dateien noch doppelte Aufgaben verursachen. Veraltete Daten bleiben sichtbar mit Datum und Status, statt als aktuell zu gelten.

## Ergebnis- und Lernablauf

Belegte Änderung -> Zuordnung zu eigenem Auftrag -> lokale Arbeitsaufgabe -> Quellenprüfung -> Analyse/Ergebnis -> Validierungsnachweis -> versionierte Ablage. Bestehende Worker übernehmen nur unterstützte Arbeit; unbekannte Anforderungen werden als Fähigkeitslücke ausgewiesen. Private Mailinhalte gelangen nicht in öffentliche Suchdienste oder SOFA. Eine Übertragung an ein Modell benötigt eine ausdrücklich dafür freigegebene Datenregel; ohne diese bleibt die Verarbeitung auf lokale Metadaten und Zuordnung beschränkt.

Finance- und Qualitätsmethoden werden durch nachvollziehbare Kosten-/Ergebniszuordnung ergänzt. Wiederverwendbare Erkenntnisse speichern Quelle, Prüfstatus und Gültigkeitsdauer. Erfolg wird aus erfüllten Akzeptanzkriterien abgeleitet; weder gespeicherter Text noch ein Modellurteil allein belegen erfolgreiche Lieferung oder Profit.

## Kosten und Betrieb

Gemeinsame vorhandene Grenzen: CHF 150 für die autorisierte 30-Tage-Periode, CHF 7.50 pro Zürcher Kalendertag, CHF 2 je Aufgabenfamilie, vier Worker. Keine separaten Plugin-Budgets. Jeder Aufruf wird vor Ausführung zugelassen; kostenpflichtige Aufrufe benötigen einen konservativen Kostenhöchstwert. Unbekannte Preise blockieren. Provider-Abonnements oder Kosten anderer Prozesse können nicht durch den lokalen Controller gedeckelt werden und werden nicht automatisch eingerichtet.

Kontingente, begrenzte Antwortgrößen, Zeitlimits, Backoff und persistente Reservierungen gelten auch für die neuen Adapter. Berechtigungsentzug und Authentifizierungsfehler stoppen den betroffenen Adapter. Schlüssel werden Windows-benutzergebunden verschlüsselt außerhalb des Git-Verzeichnisses gespeichert. Verbindung, letzter erfolgreicher Abruf, Aktualität, Fehler und fehlende Einrichtung werden getrennt angezeigt.

## Migration und vorhandener Fehler

Die bestehende Auftragsanzeige erwartet `prs`, während neuere Monitorberichte `pr_states` enthalten. Ein versionierter Normalisierer muss beide nachgewiesenen Formate lesen, fehlende/fehlgeschlagene Prüfungen erhalten und darf weder Zahlungsstatus noch Aktualität erfinden. Bestehende SQLite-Daten und unabhängige Workspace-Änderungen bleiben erhalten; Migrationen benötigen Sicherung und Wiederanlauftest.

## Einrichtung und Abnahme

Vor Implementierung: Entwurf prüfen; danach konkrete Implementierungsplanung gemäß verwendetem Entwicklungsprozess. Während der Einrichtung Kontozuordnung, Gmail-Label, Drive-Ordner, Kalender und Amplitude-Projekt über tatsächlich verfügbare Konten klären. OAuth-Freigaben führt Patrice aus; kein Erraten von Zugängen und kein Kopieren von Codex-Tokens.

Erforderliche Tests: eigene/fremde Zuordnung; widersprüchliche Belege; Neustart und doppelte Ereignisse; parallele Budgetreservierung; Limitüberschreitung vor Netzaufruf; Tokenentzug; begrenzte Wiederholungen; unklarer Drive-Schreibausgang; Datenschutz zwischen Mail und öffentlichen Rechercheadaptern; Berichtsformatmigration. Anschließend je eingerichtetem Dienst ein begrenzter echter End-to-End-Lauf samt persistiertem Nachweis. Nicht verfügbare Konten werden als offen gemeldet und nicht als erfolgreich verbunden gezählt.

## Selbstprüfung

Der Entwurf deckt die fünf beauftragten Dienste sowie Finanzabgleich und Lernen ab. Nutzerseitige Kontoauswahl und Freigaben sind explizite Einrichtungsvoraussetzungen. Entwurfsanlage ist keine Aktivierung externer Rechte. Keine unbestätigten Preise, Einnahmen, Fremdautorschaft oder erfolgreichen Integrationen werden behauptet.
