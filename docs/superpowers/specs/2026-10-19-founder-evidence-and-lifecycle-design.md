# Founder: Fähigkeitsnachweise und vollständige Ablaufprüfungen

Stand: 19. Oktober 2026. Status: schriftliche Spezifikation von Patrice bestätigt; Implementierung und Offline-Abnahme dokumentiert.

## Auftrag und Grenzen

Patrice hat den Ausbauentwurf bestätigt und den Beginn mit Fähigkeitsnachweisen und vollständigen Ablaufprüfungen beauftragt. Ziel ist eine belastbare Grundlage für die anschließende Verbesserung von Ergebnisqualität, Priorisierung und Lernen in der Founder-Version. Eine subjektive Bewertung von 10/10 ist kein technisches Abnahmekriterium.

Numaron bleibt OFF. Keine Produktionsstarts, Neustarts, Kontozugriffe, externen Nachrichten, bezahlten Modellaufrufe oder Änderungen an Produktionsdatenbanken. Vorhandene Änderungen, Berechtigungen, Kostenreservierungen, Budgets und Handelsgrenzen bleiben erhalten. Tests verwenden ausschließlich temporäre Verzeichnisse, eigene Datenbanken und Fake-Adapter. Ein ON-Zustand darf ausschließlich in diesen isolierten Tests simuliert werden.

Dieses Paket erteilt keine neuen Ausführungsrechte. Es implementiert keine Kundenversionen, Abonnements oder neue Trading-Ausführung. Die spätere reale Abnahme bleibt von einem persönlich gestarteten, autorisierten Betrieb abhängig.

## Gelesene Grundlagen und konkrete Befunde

- `docs/numaron-continuation-index.json` und das dort verknüpfte Gap-Ledger: historische Nachweise und weiterhin offene externe Voraussetzungen.
- `scripts/founder-controller.mjs`: Fähigkeitsstatus aus Adapterverfügbarkeit; letzte Erfolge und Ausgänge aus gespeicherten Aufgaben.
- `scripts/founder-runtime.mjs`: bildet nicht blockierte Fähigkeiten mit beliebigem `lastSuccessAt` auf `verified` ab. Der bestehende Status wird von Planung und Lernen verwendet und darf deshalb nicht beiläufig umdefiniert werden.
- `web/founder/model.mjs`: weist bereits darauf hin, dass ein letzter erfolgreicher Lauf keine dauerhafte Verfügbarkeit beweist. Diese Aussage bleibt erhalten.
- `scripts/founder-source-registry.mjs`: enthält quellenspezifische Fähigkeiten, Belegreferenzen und Ablaufzeiten. Dieses Register bleibt die vorhandene Quelle; kein zweites Berechtigungsregister.
- `scripts/founder-autonomy-status.mjs`: enthält eine allgemeine, feste Aussage über fehlende End-to-End-Abnahme. Ergänzende Nachweise müssen konkreter werden, ohne Gesamtfreigabe zu behaupten.
- `scripts/founder-order-accountability.mjs`: bestehende Prüfung von Betrag, Währung, Empfänger und Auftragsidentität sowie Auswertung direkter Kosten. Kein neues paralleles Finanzbuch.

Der frisch ausgeführte Ausgangstest umfasst `founder-order-runtime.test.mjs` und `founder-restoration-runtime.test.mjs`: 12 Tests, 11 bestanden, 1 fehlgeschlagen. Der Zahlungstest übergibt nur Identität, Bestätigung und Referenz. Die aktuelle Zahlungsprüfung verlangt zusätzlich konkrete Vertragsbedingungen und übereinstimmenden Betrag, Währung und Empfänger. Die Testdaten sind mit diesem Vertrag nicht vereinbar. Die Produktionsprüfung darf zur Reparatur dieses Tests nicht gelockert werden. Der Ausgangslauf ist kein Nachweis eines vollständigen Produktionsablaufs.

Die anschließende Gegenprüfung von `founder-order-accountability.test.mjs` mit denselben Preloads bestand mit 6 von 6 Tests und Exitcode 0. Sie deckt gültige Vertragsdaten, Zahlungsabweichungen, Belegwiederverwendung und Kostenkonflikte ab. Der ursprüngliche Ablauf-Test ist weiterhin unverändert und fehlgeschlagen; diese Gegenprüfung ersetzt seine Reparatur nicht.

Ausgangsbefehl:

```powershell
node --require ./scripts/verification-network-guard.cjs --import ./scripts/founder-offline-test-guard.mjs --import tsx --test scripts/founder-order-runtime.test.mjs scripts/founder-restoration-runtime.test.mjs
```

## Architekturentscheidung

Eine additive, lesende Projektion ergänzt die bestehende Runtime. Sie wird aus bereits vorhandenen, lokal verfügbaren Nachweisen berechnet. Der Ausführungscontroller, seine bisherigen Statuswerte und seine Berechtigungsentscheidungen bleiben maßgeblich.

Neue Daten werden nur für fehlende Nachweisdimensionen eingeführt. Ein pauschales Bereitschafts-Bool oder eine Prozentzahl für angeblich vollständige Autonomie wird nicht erzeugt. Die Oberfläche zeigt, was bekannt ist, was fehlt und welche Voraussetzung aktuell eine Ausführung verhindert.

Die Alternative eines komplett neuen Registers würde vorhandene Zustände duplizieren. Eine reine Umbenennung von `verified` wäre unzureichend und könnte bestehende Planungslogik verändern.

## Datenvertrag für Fähigkeitsnachweise

Die neue Projektion besitzt `schemaVersion: 1`, einen explizit übergebenen Bewertungszeitpunkt und eine begrenzte Liste von Einträgen. Ein Eintrag bindet genau eine Fähigkeit an ihren Kontext:

- `capabilityId`: vorhandene Adapterkennung.
- `sourceId` und `operation`: nur bei nachweisbarer Quellbindung; sonst `null`.
- `implementation`: `present`, `missing` oder `unknown`.
- `authorization`: `confirmed`, `denied` oder `unknown` mit begrenzten Belegreferenzen.
- `availability`: `observed-available`, `unavailable`, `stale` oder `unknown`.
- `offlineVerification`: `passed`, `failed`, `stale` oder `unknown`.
- `liveVerification`: `observed-success`, `observed-failure`, `stale` oder `unknown`.
- `executionBlockers`: geordnete, deduplizierte Gründe einschließlich OFF und fehlender Voraussetzungen.
- `evidence`: Referenzen mit Herkunft, Geltungsbereich, Beobachtungszeit, optionaler Ablaufzeit und gegebenenfalls geprüfter Implementierungsrevision.

Die genaue Handlungsberechtigung wird aus bereits autoritativen Quelldaten übernommen. Ein verfügbarer Adapter, installiertes Plugin, vorhandener Schlüssel oder historisch erfolgreicher Lauf gilt nicht als Berechtigungsnachweis.

Für jede Dimension gilt: fehlend bedeutet unbekannt, nicht falsch und nicht erfolgreich. Bei fehlerhaften Daten wird die betroffene Dimension als unbekannt mit Diagnose ausgegeben. Überlänge, doppelte widersprüchliche Belege und ungültige Zeitangaben werden abgewiesen oder konservativ als Konflikt angezeigt; niemals stillschweigend erfolgreich zusammengeführt.

## Belegregeln

1. Fake-Tests können nur Offline-Verifikation begründen. Auch ein im Test verwendeter Registerwert `live-verified` ist kein Produktionsbeleg.
2. Historische Zusammenfassungen bleiben historische Referenzen. Sie werden nicht automatisch zu aktuellen Runtime-Belegen migriert.
3. Ein Erfolg muss zur Fähigkeit, Quelle, Operation und geprüften Implementierungsrevision passen. Fehlt eine erforderliche Bindung, bleibt der aktuelle Nachweis unbekannt.
4. Ablaufzeiten stammen aus vorhandenen quellenspezifischen Verträgen oder expliziten Prüfvorgaben. Ohne solche Vorgabe wird keine allgemeine 24-Stunden-Frist erfunden. Historischer Erfolg und aktuelle Verfügbarkeit bleiben getrennt.
5. Ein aktueller Fehlschlag darf nicht von einem älteren Erfolg verdeckt werden. Beide Beobachtungen bleiben nachvollziehbar; aktuelle Verfügbarkeit wird nicht daraus behauptet.
6. Zukünftige Zeitstempel, ungültige Datumswerte, widersprüchliche Revisionen und abgelaufene Rechte verhindern einen aktuellen positiven Nachweis.
7. Ein Aufgabenstatus `done` kann auch ein erfolgreich erstellter Wartebericht sein. Für einen fachlichen Erfolg ist der passende Ergebnisvertrag entscheidend; `waiting-data` ist kein erledigter Kundenauftrag.
8. OFF löscht historische Nachweise nicht. Es bleibt ein eigener, aktueller Ausführungsblocker.
9. Weder URLs noch Dateipfade werden durch die Projektion geöffnet. Keine dynamischen Imports, Provider-Aufrufe oder Entschlüsselungen aus Belegreferenzen.
10. Öffentlich darstellbare Belege enthalten keine Zugangsdaten, privaten Inhalte oder vollständigen Kundenkommunikationen.

## Integration

Geplante neue reine Funktion in `scripts/founder-capability-evidence.mjs`: Eingabe normalisierter vorhandener Snapshots und expliziter Prüfbelege, Ausgabe der beschriebenen Projektion. Sie enthält keine Datei-, Netzwerk- oder Datenbankschreiboperationen.

`scripts/founder-runtime.mjs` ergänzt ein separates Feld `capabilityEvidence`. Bestehende `capabilities`, Ausführungsprüfungen und Lernberechtigungen behalten ihre Semantik. Die Projektion verwendet bereits gelesene Daten; ihr Aufruf löst keine neuen Dienstprüfungen aus.

Eine separate lesende Runtime-Methode liefert die Projektion an einen ergänzenden Dashboard-Endpunkt `/api/capability-evidence`. Der alte `/api/capabilities`-Vertrag bleibt erhalten. Der neue Endpunkt darf keinen umfassenden Dashboard-Abruf auslösen, weil dieser weitere Provider-Reader und Journalbeobachtungen enthalten kann.

Die vorhandene Fähigkeitsdarstellung in `web/founder` wird additiv um Nachweisdimensionen, Alter und konkrete Blocker ergänzt. Sie zeigt keinen Einschalter und erteilt keine Freigaben. Fehlt die neue Projektion bei einer älteren Runtime, bleibt die bisherige Darstellung verwendbar.

## Vollständige Ablaufprüfungen

Bestehende Tests bleiben erhalten. Der inkompatible Zahlungstest erhält ausschließlich synthetische, exakt gebundene Vertrags- und Zahlungsdaten sowie Negativfälle für falschen Betrag, Empfänger und Währung.

Zusätzlich wird der wirkliche lokale Runtime-/Controller-/Budget-/Auftragspfad durchlaufen, anstelle lediglich nacheinander Adapter direkt aufzurufen. Fake-Adapter ersetzen jede externe Grenze. Jede Testfamilie erhält eigene temporäre Verzeichnisse. Alle Kosten und Zahlungseingänge sind ausdrücklich simuliert.

Pflichtszenarien:

| Szenario | Zu prüfende Aussage |
|---|---|
| OFF bei vorhandener Aufgabe | Kein Adapteraufruf, keine neue Kostenreservierung, keine Zustandsfortschreibung durch Ausführung. |
| Erfolgreicher Gesamtzyklus | Eigene bestätigte Zuteilung, Vorbereitung, Arbeit, unabhängige Prüfung, Einreichung, Abnahme und exakt gebundene Zahlung durchlaufen dieselbe Aufgabenfamilie. |
| Ende nach Zahlung | Weitere Ticks und erneutes Öffnen erzeugen weder erneute Lieferung noch zweite Zahlung. |
| Fehlende/abgelaufene Rechte | Keine Ausführung trotz vorhandenem Adapter oder früherem Erfolg. |
| Fehlerhafte Ergebnisprüfung | Kein Submit und kein Erfolgsnachweis bei fehlgeschlagener unabhängiger Prüfung. |
| Antwortverlust nach Einreichung | Unklarer Ausgang bleibt gespeichert; Wiederanlauf sendet nicht blind erneut. |
| Abbruch vor Einreichung | Wiederaufnahme nur anhand des bestehenden Nachweises eines noch nicht versendeten, passenden Lieferintents. |
| Korrekturanforderung | Neue geprüfte Lieferrevision unter derselben Budgetwurzel; alte Lieferung und Kosten bleiben erhalten. |
| Zahlungsabweichung | Falscher Auftrag, Betrag, Empfänger, Währung oder wiederverwendeter Beleg können keinen `paid`-Status erzeugen. |
| Unklare Kosten | Reservierungen bleiben bestehen; kein künstlicher Budgetreset oder unbelegter Deckungsbeitrag. |
| Simulierter OFF-Wechsel während Arbeit | Nächste externe Grenze wird nicht ausgeführt; bereits belegte Ergebnisse bleiben erhalten. |
| Belegprojektion | Offline-Erfolg erzeugt keinen Live-Nachweis; neuere Fehler, abgelaufene Belege und fehlende Bindungen bleiben sichtbar. |

Die Tests kontrollieren neben Endzuständen die Adapteraufrufe, persistierten Lieferintents, Kostenbelege und Aufgabenwurzel. Erwartete Ergebnisse stammen aus festen Testverträgen, nicht aus derselben Statusprojektion, die geprüft wird.

## Testisolation und Ausgangssicherung

- Die vorhandenen Fetch- und TCP/DNS-Guards werden für die ausgewählte Testgruppe verwendet. Dies ist eine Testabsicherung, keine Behauptung vollständiger Betriebssystemisolation.
- Alle Runtime-Konstruktoren erhalten explizite temporäre Basispfade und Fake-Abhängigkeiten. Produktionsschlüssel, echte Provider-Reader und Shell-/Container-Adapter werden nicht benutzt.
- Vor jedem Test wird geprüft, dass notwendige Konstruktorpfade keine echten Zugänge laden. Netzwerkversuche zählen als Fehler, auch wenn Anwendungscode sie abfängt.
- Bestehende Änderungen werden dateibezogen geprüft; keine Rücksetzung, kein allgemeines Staging, keine Übernahme fremder Änderungen in einen Commit.
- Vor Änderungen an gemeinsam bearbeiteten Dateien wird deren aktueller Inhalt erneut gelesen. Bereits vorhandene Verbesserungen werden weiterverwendet.
- Ein Testbericht nennt den genauen Befehl, Exitcode, Testanzahl, fehlgeschlagene Fälle und die geprüften Dateiversionen. Geänderte Implementierungen machen zugehörige frühere Prüfbelege historisch.

## Abnahme des Pakets

Das Paket ist lokal abgeschlossen, wenn alle Pflichtszenarien mit isolierten Daten bestanden sind, die neue Projektion und ihre Darstellung verifiziert sind, bestehende ausgewählte Runtime-/UI-Regressionstests bestehen und keine Produktionsrechte oder Schutzgrenzen geändert wurden.

Ein erfolgreicher Offline-Abschluss bestätigt ausdrücklich weder Kundenabnahme noch echten Zahlungseingang, Profitabilität, aktuelle Provider-Verfügbarkeit oder einen vollständig freigeschalteten produktiven Betrieb. Diese Nachweise bleiben separat offen.

## Folgepakete

Nach Abschluss dieses Pakets folgen fachliche Ergebnisprüfungen, beleggestützte Priorisierung und kontrollierte Lernverbesserungen. Sie bauen auf den vorhandenen Lern- und Kostenmodulen auf. Dieses Dokument legt keine neuen Modellanbieter, Budgets, Handelsrechte oder produktiven Experimente fest.
