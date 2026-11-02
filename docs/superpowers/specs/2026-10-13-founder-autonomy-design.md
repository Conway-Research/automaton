# numaron: selbstständiger privater Founder-Betrieb

Stand: 13.10.2026. Entwurf zur Prüfung; keine Behauptung einer bereits aktiven Ausführung.

## Ziel und Nutzerauftrag

Patrice möchte numaron als eigenen Arbeitsbereich tatsächlich nutzen. numaron soll Aufgaben selbstständig bearbeiten, den Status führen, Ergebnisse zuordnen, technische Prüfungen durchführen und nach Neustarts verlässlich weiterarbeiten. Der am 13.10. bestätigte Umfang umfasst belegte Auftragsstände, lesenden Finanzabgleich und eine wahrheitsgemäße Betriebsanzeige. Eine reine manuelle Aufgabenliste erfüllt diesen Auftrag nicht.

Selbstständigkeit gilt innerhalb bestehender Berechtigungen. Sie beinhaltet keine neuen Zahlungen, kostenpflichtigen Dienste, Echtgeld-Trades, Bewerbungen, externen Nachrichten oder Veröffentlichungen. Die vorhandene Sonderfreigabe für einen ausdrücklich zugeteilten vergüteten Salt-Restumfang wird nicht durch diesen Ausbau erweitert. Öffentliche Website und privater Founder-Dienst bleiben getrennt; ein zahlendes Kundenprodukt ist nicht Teil dieser Abnahme.

## Belegter Ausgangspunkt

- `scripts/founder-dashboard.mjs`: lokaler HTTP-Dienst mit einmaligem Anmeldungstoken, Sitzung und CSRF-Prüfung; keine Controller-Schnittstelle.
- `scripts/founder-operations.mjs`: SQLite-Aufgaben, Versionsprüfung und Journal. Aufgabenwechsel sind manuell; keine Ausführung.
- `scripts/founder-mt5.mjs`: Anbindung von MT5, Coinbase und Stripe für lesende Kontoinformationen.
- `scripts/founder-supervisor.mjs`: begrenzter Wiederanlauf nach Prozessabbruch. Nach einem Rechnerneustart ist ein Start über die Verknüpfung nötig.
- `src/online/runtime.ts`: vorhandener Recherche-Controller mit Warteschlange, öffentlichen Quellen, privaten Entwürfen, Pause/Stopp und Wiederanlaufbehandlung.
- `src/online/sources.ts`: feste öffentliche Endpunkte, GET ohne Anmeldedaten, Zeit-, Größen- und Anfragelimits.
- `src/orchestration/local-worker.ts`: modellgestützte Bearbeitung, benötigt Inferenz, Werkzeugkontext, Richtlinien und Kostenverfolgung. Die Existenz dieses Codes ist kein Nachweis eines betriebsbereiten Workers.
- `src/v1/runtime.ts` ist ausdrücklich ein Simulationsbetrieb. Er darf nicht als realer Founder-Controller präsentiert werden.
- Der vorhandene Stripe-Leser liefert Kontostände, keine einzelnen Zahlungsnachweise. Coinbase-Kontostände sind ebenfalls keine Geschäftseinnahmen.
- Die aktuellen Auftragsberichte verwenden unter anderem `checked_at` und verschachtelte Promise-Ergebnisse. Der Founder-Leser erwartet teilweise `at` und flache PR-Datensätze; dieser Formatunterschied muss behoben werden.
- Sieben vorhandene Founder-Tests bestanden am 13.10.2026. Der Dienst wurde wieder gestartet. Das ersetzt keine Abnahme der neuen Autonomie.

## Gewählter Aufbau

Das Founder-Dashboard bleibt der private Zugang. Ein eigener Controller vermittelt zwischen dauerhafter Aufgabenwarteschlange und klar abgegrenzten Bearbeitern. Bestehende Recherche- und Prüfbausteine werden über Adapter wiederverwendet. Der allgemeine Automaton-Hauptprozess wird nicht pauschal gestartet: Er besitzt einen anderen Berechtigungs- und Werkzeugumfang.

Controller und Aufgaben verwenden einen eigenen Founder-Datenbestand. Bestehende operative Datenbanken werden zunächst ausschließlich gelesen; Schema-Migrationen betreffen nur die Founder-Ablage und erhalten vorhandene Aufgaben. Vor Migration wird eine konsistente SQLite-Sicherung erstellt und deren Lesbarkeit geprüft.

Eine unmittelbare Anbindung beliebiger Werkzeuge an den allgemeinen Worker wäre umfangreicher und könnte ungewollte externe Aktionen auslösen. Eine reine Berichtsanzeige wäre einfacher, würde den Auftrag zur selbstständigen Bearbeitung aber verfehlen. Die Adapterlösung erlaubt echte Bearbeitung mit nachvollziehbaren Grenzen.

## Selbstständiger Ablauf

1. Aufgabe oder dauerhaftes Ziel erfassen: Eingabe, erwartetes Ergebnis, zulässiger Bearbeiter und Herkunft speichern. Vorhandene manuelle Aufgaben werden nicht ungeprüft zur Ausführung übernommen.
2. Eignung bestimmen: Ein passender Bearbeiter erstellt einen begrenzten Arbeitsplan. Unbekannte Aufgabentypen werden als nicht unterstützt angezeigt, nicht stillschweigend umgedeutet.
3. Ausführung zulassen: Verbindung, Berechtigungen, Isolation, Größen- und Zeitlimits sowie gegebenenfalls eine Kostenreservierung müssen am tatsächlichen Startpunkt erfolgreich geprüft sein.
4. Bearbeiten: Der Controller bearbeitet unabhängige Aufgaben parallel, protokolliert einzelne Schritte und schreibt Resultate ausschließlich in das zugehörige Ausgabeverzeichnis. Der gewählte Startwert beträgt vier gleichzeitige Worker, mit einem gemeinsamen Budget und exklusiver Sperre für gemeinsam veränderte Ressourcen. Abhängige Aufgaben warten auf geprüfte Ergebnisse ihrer Vorgänger.
5. Prüfen: Ein vom Erzeugungsschritt getrennter Prüfschritt kontrolliert das erwartete Format, Quellen, Vollständigkeit und aufgabenspezifische Kriterien. Eine Selbstaussage des Modells genügt nicht.
6. Abschließen: Ergebnis, Prüfnachweis, Dateiversion und Laufkennung werden zusammen gespeichert. Ein technischer Abschluss heißt ausdrücklich nicht Kundenabnahme oder Zahlung.
7. Fortsetzen: Wiederkehrende Aufgaben werden mit nachvollziehbarer Fälligkeit geplant. Fehlversuche erhalten begrenzte Wiederholungen und Abstände; dauerhafte Blocker erzeugen keine Endlosschleife.

## Unterstützte Bearbeiter und Grenzen

### Ergänzung des Nutzerauftrags vom 13.10.2026

numaron soll Aufgaben selbst entdecken, auswählen, priorisieren und nachziehen. Fehlende sachliche Informationen lösen zunächst begrenzte Recherche und Quellenprüfung aus; sie werden nicht automatisch an Patrice zurückdelegiert. Wissenseinträge speichern Quelle, Beobachtungszeitpunkt, Gültigkeit, Widersprüche und den Nachweis ihrer Nutzung. Aus Erfolgen und Fehlern werden überprüfbare Anpassungen der Priorisierung abgeleitet. Lernen bedeutet hier dauerhaftes, belegtes Arbeitswissen und geprüfte Prozessverbesserungen, nicht unbeaufsichtigte Veränderung von Modellgewichten, Berechtigungen oder Budgetgrenzen.

Patrice wünscht beim Founder-Livestart auch finanzielle und externe Handlungsfähigkeit innerhalb eines definierten Rahmens. Diese Zielsetzung ersetzt die frühere dauerhafte Beschränkung auf ausschließlich private Ausgaben. Patrice hat CHF 150 Betriebsbudget für die ersten 30 Tage und höchstens CHF 7.50 täglich bestätigt. Finanzielle Freigaben außerhalb dieses Betriebsbudgets, Handelskapital und verbindliche externe Zusagen sind noch nicht konkretisiert. Identität, private Informationen und rechtlich erforderliche persönliche Bestätigungen lassen sich nicht durch Webrecherche ersetzen.

Bestätigtes Betriebsbudget: CHF 150 für einen ersten Zeitraum von 30 Tagen, maximal CHF 7.50 pro Kalendertag, insgesamt über alle Worker; CHF 2 pro Aufgabe einschließlich Wiederholungen und technischer Prüfung bleiben ein vorgeschlagener technischer Schutz, keine eigenständige Nutzerfestlegung. Vier parallele Worker als Implementierungsentscheidung; das gemeinsame Budget wird dadurch nicht vervierfacht. Neue Abonnements und wiederkehrende Verpflichtungen sind darin nicht enthalten. Handelskapital im ersten technischen Abnahmezeitraum: CHF 0; Paper-Betrieb zur Prüfung. Ein späteres Echtgeldmandat benötigt separat festgelegtes Kapital, Instrumente, Verlustgrenzen und überprüfte Ausführungswege. Der bestätigte Betrag ist ein begrenztes Erprobungsbudget, keine gemessene Kostenschätzung und keine Rentabilitätszusage.

### Recherche und private Analyse

Der bestehende OnlineRuntime liefert öffentliche Quellen mit Beobachtungszeitpunkt und privaten Rechercheentwürfen. Der Adapter muss seine tatsächlichen Voraussetzungen und Datenbankabhängigkeiten prüfen. Quellen bleiben unbestätigte Eingaben; darin enthaltene Anweisungen gewähren keine Berechtigungen. Recherche kann selbstständig laufen, ohne externe Kontaktaufnahme oder Bezahlaufrufe.

### Eigene Aufgaben und erzeugte Dateien

Jede automatische Aufgabe trägt Typ, Eingabe, Plan, Versuchszähler, Status, letzte Aktivität, Ergebnisreferenzen, Prüfergebnis und begründete Blockaden. Text- und Analyseaufgaben nutzen einen tatsächlich erreichbaren zugelassenen Modelladapter. Solange kein solcher Adapter betriebsbereit und im bestehenden Kostenrahmen zugelassen ist, sind diese Aufgaben sichtbar blockiert. Es werden keine neuen Anbieter gebucht und keine Modellberechtigungen stillschweigend erweitert.

Codebearbeitung und Tests fremden Codes benötigen die bereits vorgegebene begrenzte Offline-Podman-Umgebung. Kein Ersatz durch unbeschränkte Host-Shell. Ein fehlender oder nicht nachgewiesener Isolationspfad blockiert diesen Bearbeiter. Ein lokales Ergebnis kann technisch geprüft werden; Einreichungen bleiben der jeweiligen konkreten Freigabe unterstellt.

### Auftragsstände

Ein normalisierter Leser vereinigt die bestehenden eigenen Einreichungsberichte und die neuesten Überwachungsberichte. Er zeigt Autorenschaft, ursprünglichen PR, ersetzenden PR, Übernahme, Vergütungsantwort und Zahlung getrennt. Alte oder unzugängliche Quellen sind sichtbar markiert. Bloße Suchtreffer werden keine eigenen Aufträge. Der bestehende Monitor bleibt die Quelle aktueller externer Beobachtungen, bis ein separat geprüfter lesender Plattformadapter im Dienst verfügbar ist.

### Lesender Finanzabgleich

Kontostände, gebuchte Zahlungen, Gebühren und bestätigte Auszahlungen bleiben getrennte Datentypen. Für Stripe werden vorhandene lesende Rechte geprüft, einzelne Transaktionen mit stabiler Anbieterkennung paginiert eingelesen und je Währung abgestimmt. Erstattungen, Gebühren, unvollständige Seiten und doppelte Einträge sind ausdrücklich abzudecken. Ein Stripe-Auszahlungsstatus ist kein bestätigter Bankeingang. Ohne Bankbeleg bleibt der Bankeingang unbestätigt.

Coinbase und MT5 werden nicht als Bounty-Zahlungsnachweis verwendet. Verschiedene Währungen werden ohne belegten Kurs nicht zusammengerechnet. Fehlende Berechtigungen ergeben einen konkreten offenen Datenpunkt, keinen Nullbetrag. Mitarbeiterkosten werden nicht kalkuliert.

## Controller, Kosten und Wiederanlauf

- Betriebszustände: gestoppt, läuft, pausiert, Fehler. Anzeige stammt aus tatsächlicher Telemetrie mit Zeitstempel; eine erreichbare Webseite allein bedeutet keinen laufenden Worker.
- Start, Pause, Fortsetzen und Stopp werden mit Sitzung, CSRF und Versionsprüfung geschützt. Pause verhindert neue Aufträge; laufende Arbeit wird kontrolliert angehalten oder bis zur nächsten sicheren Grenze beendet. Stopp und Fehler werden journalisiert.
- Ein Lauf hat eindeutige Kennung, dauerhaften Besitznachweis und begrenzte Gültigkeit. Verwaiste Läufe werden nach Neustart erkannt. Nur nachweislich wiederholbare Schritte werden automatisch erneut ausgeführt; unklare externe Auswirkungen bleiben blockiert.
- Ergebnisse werden zunächst temporär geschrieben, gehasht und atomar veröffentlicht. Doppelte Zustellung darf keine doppelten Ergebnisse oder Buchungen erzeugen.
- Die dokumentierten CHF 7.50 werden nicht als bereits durchgesetzte globale Grenze ausgegeben. Die neue Ausführung erhält eine zentrale Zulassungsprüfung; die bestätigten Grenzen betragen 15000 Rappen für 30 Tage und 750 Rappen pro Kalendertag in Europe/Zurich. Der Zeitraum beginnt erst mit dem tatsächlichen Start des abgenommenen kostenpflichtigen Betriebs; er erneuert sich nicht automatisch. Ohne vollständige Preisobergrenze, Kostenreservierung und gültigen Adapter erfolgt kein kostenpflichtiger Aufruf. Reservierungen werden vor dem Aufruf atomar gebucht; unbekannte Kosten bleiben gebunden statt als null freigegeben.
- Diese Grenze schützt nur angeschlossene Prozesse. Andere Prozesse werden erst als abgedeckt bezeichnet, wenn auch ihre Aufrufpfade nachgewiesen über dieselbe Prüfung laufen.
- Der lokale Dienst bleibt auf 127.0.0.1 gebunden. Kein öffentlicher Founder-Zugang. Rechnerneustart und Sitzungsablauf erhalten einen nachvollziehbaren lokalen Wiedereinstieg ohne dauerhafte Tokens in URLs oder Protokollen. Ein Autostart darf keine unfreigegebenen Aufgaben nachträglich aktivieren.

## Oberfläche

Die Übersicht beantwortet: Was bearbeitet numaron gerade? Was wurde tatsächlich fertig? Was blockiert? Welche Daten sind aktuell? Aufgaben zeigen Ergebnisdateien und technische Prüfnachweise direkt. Menschliche Inhaltsprüfung bleibt von automatischer technischer Prüfung unterscheidbar. Ein Fehler blendet veraltete Kontodaten aus; der letzte Aufgabenstand bleibt mit seinem Zeitstempel sichtbar.

Bedienelemente lösen nur tatsächlich vorhandene Backend-Aktionen aus. Nicht verfügbare Bearbeiter zeigen den konkreten fehlenden Anschluss. Der Markenname bleibt numaron; vorhandene Website-Typografie ist kein Anlass für einen weiteren Website-Umbau.

## Abnahme

1. Eine zugelassene Aufgabe läuft ohne manuelle Statuswechsel von Erfassung über Bearbeitung und Prüfung zu einem gespeicherten Ergebnis.
2. Eine nicht unterstützte oder nicht freigegebene Aufgabe wird mit nachvollziehbarem Grund blockiert, ohne externe Nebenwirkung.
3. Gleichzeitige Browseraktionen und doppelte Ausführung erzeugen weder doppelte Arbeit noch doppelte Finanzbuchungen.
4. Prozessabbruch vor und nach dem Speichern wird getestet; vorhandene Aufgaben und Ergebnisse bleiben erhalten, unklare Arbeit wird nicht als abgeschlossen ausgegeben.
5. Pause, Stopp, Sitzungsablauf, CSRF und konkurrierende Änderungen werden über die HTTP-Schnittstelle geprüft.
6. Berichtsformate der tatsächlich vorhandenen Dateien werden verarbeitet; neue, alte, beschädigte und unzugängliche Beobachtungen bleiben unterscheidbar.
7. Finanztests umfassen Pagination, Erstattungen, Gebühren, Duplikate, Währungstrennung und fehlende Rechte. Kontostände werden nicht als Erlös verbucht.
8. Ein kostenpflichtiger Aufruf ohne Zulassung wird vor dem Anbieteraufruf abgewiesen; Parallelität und Neustart umgehen die Grenze nicht.
9. Ein echter, begrenzter Durchlauf wird im Browser überprüft und mit Ausgabedatei sowie Journal belegt. Modell- und Codebearbeitung gelten nur dann als abgenommen, wenn ihre jeweiligen Voraussetzungen tatsächlich nachgewiesen wurden.

## Umsetzung und ehrliche Abschlussmeldung

Die Umsetzung wird in getrennt prüfbare Abschnitte aufgeteilt: Datenmodell und Berichtsnormalisierung; Controller und Wiederanlauf; Bearbeiter und Ergebnisprüfung; Finanzabgleich; Oberfläche und Gesamtprüfung. Keine Vollständigkeitsbehauptung aufgrund bestandener Einzeltests. Der Abschlussbericht nennt aktive Bearbeiter, tatsächlich ausgeführte Aufgaben und noch blockierte Fähigkeiten konkret.

Entwurfs-Selbstprüfung: Ziel der selbstständigen Bearbeitung erhalten; keine Simulation als Echtbetrieb; keine neuen Finanz- oder Veröffentlichungsrechte; Status, Ergebnis und Abnahme getrennt; Wiederanlauf und doppelte Verarbeitung ausdrücklich abgedeckt. Verfügbarkeit von Modell, Isolation und einzelnen Finanzrechten ist durch technische Vorprüfung festzustellen und keine erfundene Betriebszusage.

