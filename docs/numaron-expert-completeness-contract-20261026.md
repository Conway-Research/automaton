# Vollständigkeitsvertrag für wirtschaftliche Expertenfähigkeiten

Status: autorisierte Spezifikation, nicht implementiert und nicht als bestanden bestätigt.
Owner: bestehender Trainingschat 01a16c55-49c6-7770-85bb-77ae0b971af4.
Ergänzt docs/numaron-expert-training-priorities-20261026.md sowie vorhandene Profit-/Anpassungspakete; ersetzt keine ursprünglichen Projektprüfungen.
Quelle: Patrices vollständiger Anhang C:/Users/Patrice/.codex/attachments/7c803bcf-db43-4e36-9a09-7d5ff2b81739/Eingefügter Text.txt und direkte Anweisung, sämtliche beschriebenen Tätigkeiten ohne Auslassung auf Expertenniveau zu beherrschen und auszuführen.

## Vollständige verpflichtende Abdeckung

Anforderungs-IDs sind stabil; kein Punkt darf allein durch Selbsteinschätzung erledigt werden.

| ID | Umfang | Verlangter Nachweis |
| --- | --- | --- |
| F01 | Anforderungen, fehlende Angaben, begrenzter Umfang und vorab festgelegte Abnahme | Mehrdeutige/unvollständige Anforderungen erkennen; prüfbarer Vertrag und begründete Rückfrage nur bei notwendiger menschlicher Information |
| F02 | Datenverarbeitung und unabhängige Kontrolle | Dubletten, Nullwerte, falsche Formate, Abweichungen, Herkunft und verständliche Prüfberichte; kein stiller Verlust |
| F03 | Robuste Schnittstellen | Anmeldung, Rechte, Mapping, Pagination, begrenzte Retries, Idempotenz, Teilausfall, Wiederherstellung und Abgleich |
| F04 | Vollständige Auftragsabwicklung | Suche, Eignung, vollständige Kosten, Angebot, Lieferung, Qualität, vereinbarte Einreichung; Abnahme/Zahlung nicht erfinden |
| F05 | Wiederverwendbare Verfahren | Herkunft/Lizenz und Version sichern; neue kundenspezifische Fälle bestehen, keine blinde Übertragung alter Freigaben |
| F06 | Folgeaufträge ohne Abosystem | Konkreten zusätzlichen Kundennutzen belegen, Kosten und Umfang prüfen, keine erfundenen Bedürfnisse oder unerwünschten Kontaktserien |
| T01 | Geschäftsprozesse und Schnittstellen automatisieren | Synthetischer Shop/CRM-Auftrag samt Bestellübertragung, Synchronisierung und Fehlerfällen |
| T02 | Daten bereinigen, abgleichen, auswerten | Excel-/CSV-Mischdaten, Importvorbereitung, Dubletten, Abweichungen und reproduzierbarer Bericht |
| T03 | Bestehende Automatisierung reparieren und erweitern | Reproduzierter Ausgangsfehler, begrenzte Diagnose, Ursachenbehebung und unabhängige Regression |
| T04 | E-Commerce-Kataloge und Feeds | Produktnormalisierung, Varianten, Kategorien, Feedfehler und Updates ohne erfundene Produkteigenschaften |
| T05 | Strukturierte Dokumentverarbeitung | Definierte PDF-Typen/Scans, Zuordnung, Feldvalidierung, CSV-Ausgabe; unsichere Extraktion ausweisen |
| T06 | Kleine interne Werkzeuge | Importportal/Freigabe-/Bestandsablauf mit Benutzerrechten, geprüften Eingaben, nachvollziehbarem Zustand und Betriebsdokumentation |
| T07 | KI-Integration in Arbeitsabläufe | Quellengebundene Suche, Ticketklassifikation und Entwürfe aus geprüften Daten; unbelegte Antworten, Datenschutz- und Eingabeangriffe prüfen |
| A01 | Vollständiger Datenimport mit Prüfbericht | Eingabevertrag, Zielschema, Fehlerliste und lückenloser Daten-/Summenabgleich |
| A02 | Wiederkehrender Betriebsbericht | Übernahme, Bereinigung, vereinbarte Kennzahlen, unabhängige Kontrolle und Wiederholbarkeit |
| A03 | Zwei Systeme für definierten Ablauf verbinden | Begrenzte Felder/Aktionen, Doppelverarbeitungsschutz, Fehlerbehandlung und Wiederherstellung |
| A04 | Fehlerhafte Automatisierung diagnostizieren/reparieren | Begrenzte Diagnosephase, abgegrenzte Reparatur, Originalfehler und Regression prüfen |
| W01 | Wirtschaftlich geeignete Auftragsauswahl | Umfang, Unsicherheit, Kosten, Abnahme und Kapazität vor Zusage prüfen |
| W02 | Vollständige tatsächliche Erfolgsrechnung | Bezahlter Umsatz; Akquise, erfolglose Versuche, Modelle, Infrastruktur, Werkzeuge, Gebühren, Lernen, Nacharbeit und Erstattungen; fehlende Kosten nicht null setzen |
| W03 | Ergebnis je Aufgabenfamilie | Gewinn, Abnahmequote, Nacharbeit, Laufzeit, Ressourcen, menschliche Minuten und Folgeaufträge mit Stichprobe/Unsicherheit |
| S01 | Selbstständige Verbesserung | Konkrete Hypothese, begrenztes Experiment, unveränderte Qualitätsuntergrenze, unabhängige neue Fälle, Regression, Annahme/Verwerfung und belegte Wiederherstellung |

## Ausführung und Abschluss ohne Auslassungen

Implementierende Stelle muss für jede ID ein maschinenlesbares Register im vorhandenen Evidenzsystem führen: Anforderungsquelle, verantwortlicher vorhandener Baustein, Abhängigkeiten, Kompetenzumfang, vorab festgelegte Metriken/Grenzwerte, Trainingsfälle, zurückgehaltene unabhängige Normal-/Grenz-/Fehlerfälle, Baseline/Kandidat, exakte Quell-/Modell-/Runtime-Bindung, Resultate, Kosten und menschliche Minuten. Zustände: offen, implementiert-ungetestet, geprüft-bestanden, fehlgeschlagen, blockiert oder entwertet. Register darf keine bislang nicht ausgeführten Tests als bestanden vorbelegen.

F01-F06 und A01-A04 in frischen synthetischen vollständigen Aufträgen gemeinsam prüfen: Anfrage bis vereinbarter simuliert bestätigter Einreichung, anschließend Abnahme-/Zahlungs-/Korrekturfälle und begründeter Folgeauftrag. Synthetische Abnahme/Zahlung sind keine echten Umsätze. T01-T07 jeweils zusätzlich fachlich unabhängig prüfen. Nicht anwendbare Teilprüfung nur begründet mit Umfangseinschränkung, niemals still streichen oder als umfassende Fähigkeit bestätigen.

Expertenfreigabe gilt nur für den nachgewiesenen konkreten Umfang. Alle verpflichtenden IDs müssen gültige passende Belege besitzen, bevor der Gesamtumfang als abgeschlossen bezeichnet wird. Fehlende, gesperrte, übersprungene oder veraltete Belege verhindern Gesamtabnahme. Auch nach Freigabe fachliche Einzelfallprüfung und definierte Lieferprüfungen pro Auftrag. Keine absolute Fehlerfreiheit, universelle Beherrschung oder garantierte Gewinnsteigerung behaupten.

Reihenfolge: laufende ursprüngliche technische Projektabnahme zuerst; danach vorhandene Pilotvoraussetzungen, Daten -> Schnittstellen -> Reparaturen, darauf weitere Familien. Keine neue konkurrierende Pipeline, kein Modellaufruf durch diese Spezifikation und kein Unterbrechen des laufenden Aufrufs. Zuständiger bestehender Owner integriert am sicheren Checkpoint.

Alles offline mit synthetischen Daten, Fake-Adaptern und Netzwerksperre. Numaron bleibt OFF; keine produktive Übernahme, realen Einreichungen oder externen Kundenkontakte. Keine Mitarbeiterkosten, Patrices Zeit ausschließlich Minuten. Bestehende Budgets/Rechte/Risikogrenzen nicht erhöhen. Selbstoptimierung nicht durch Testabschwächung, Auslassungen oder verdeckte menschliche Codekorrektur vortäuschen.
