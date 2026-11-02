# Strukturierte Fachbelege für Supportvorlagen und Recherche

Die neue Methode `prepareOfficeSpecialistEvidence(order, context)` bereitet eine lokale Fachprüfanfrage für ein bereits erzeugtes Office-Paket vor. Sie ist über Pipeline, Marketplace-Quelle und Produktionskomposition verfügbar. Sie erteilt keine Fach-, Kunden- oder Lieferfreigabe. Im aktuellen Auftrag wurde sie ausschließlich mit synthetischen Daten in temporären Verzeichnissen getestet; kein Dienstneustart.

## Bindung und Ablauf

Die Belege stehen in `reference.specialistEvidence`. Damit gehören sie zum bereits gehashten Referenzeingang des Vertrags. Änderungen benötigen einen entsprechend neu gebundenen Vertrag und ein neu erzeugtes Paket; vorhandene Freigaben werden nicht umgeschrieben. Die Methode liest die lokal hinterlegten Originalbytes, prüft Größe und SHA-256 und bindet die Anfrage an Vertragsdigest, Generierungsschlüssel, Paket- und Produktdigest. Aktuelle Arbeitsberechtigung und Produktidentität werden vor der lokalen Speicherung erneut geprüft. OFF und Widerrufe blockieren den Aufruf.

Die Rückgabe enthält `evidenceRef` auf eine unveränderliche lokale Datei im bestehenden `ugig-office-proof`-Verzeichnis. `observedAt` dokumentiert den Prüfzeitpunkt. Die Anfrage muss bei geänderten Eingaben oder für eine neue Aktualitätsbewertung neu erstellt werden. Sie ist kein dauerhaft gültiger Freigabenachweis.

## Gemeinsames Eingabeformat

`schema: "numaron-office-specialist-input-v1"`, `privacy: "public"`. Nur die unten beschriebenen Felder sind erlaubt. Vertrauliche verschachtelte Inhalte und Felder wie `reviewed` werden abgewiesen. Dies prüft die deklarierte Einstufung; die tatsächliche Vertraulichkeit muss weiterhin unabhängig geprüft werden. Referenzdateien für diese Methode sind auf 256.000 Bytes begrenzt.

## Supportvorlagen

Zusätzlich sind `rules` und `cases` erforderlich:

- Regel: `id`, `policyIndex` (nullbasiert in `spec.checklist`), `quote` (wörtliche Stelle dieser Richtlinie), `expectedAction`, `forbiddenPromises` (Textliste), `escalationTarget`.
- Fall: `id` (aus `reference.expectedCaseIds`), `templateId` (identisch zur vorhandenen Referenzfallzuordnung), `ruleIds`, `expectedAction`, `escalationTarget`, `segments`.
- Segment: `field` aus `subject`, `body`, `short`, `escalation` und `quote` als exakte Textstelle der Vorlage.

Alle Richtlinien, Referenzfälle und Vorlagen müssen abgedeckt sein. Unbekannte oder doppelte Identitäten und falsche Zitate werden abgewiesen. Fehlende Fall-/Regelabdeckung, widersprüchliche Handlungen oder Eskalationsziele sowie wörtlich enthaltene verbotene Zusagen führen zu `blocked-evidence-issues`. Pro Fall werden Belege für Haupttext und Eskalation benötigt.

Die unabhängige Fachprüfung muss weiterhin Bedeutung, Negationen, angemessene Eskalation, Platzhalter und unzulässige Zusagen im Kontext bewerten. Wörtliche Fundstellen leisten diese semantische Prüfung nicht.

## Recherche

Zusätzlich sind `maxAgeDays` (1–365), `snapshots` und `claims` erforderlich:

- Quellenkopie: `id`, `url` (HTTP/HTTPS ohne Zugangsdaten), `retrievedAt` (UTC-ISO-Zeit mit Millisekunden), `privacy: "public"`, `text`, `sha256` (exakte UTF-8-Bytes von `text`). Mehrzeilige Ausschnitte sind erlaubt. Je Text maximal 12.000 Zeichen, höchstens 100 Kopien.
- Aussage: `row` (nullbasierter Tabellenindex), `column` (Spaltenname), `value` (exakter Zellwert), `snapshotId`, `quote` (wörtlicher Ausschnitt der Kopie), `relation` (`supports` oder `contradicts`). Höchstens 1.000 Aussagen.
- Für die Zusammenfassung: `row: null`, `column: "summary"`, `value` identisch zu `spec.summary`; sonst gleiche Felder.

Jede Datenzelle außerhalb `source_url` und `retrieved_at` sowie die Zusammenfassung benötigt einen Beleg. Tabellen-URL und Datum müssen zur Kopie passen. Ungültige Hashes, erfundene Zitate, doppelte Zellzuordnungen, zukünftige Zeitstempel und abweichende Zellwerte werden abgewiesen. Fehlende Belege, ungenutzte Quellen, veraltete Kopien und ausdrücklich dokumentierte Widersprüche blockieren die Anfrage.

Es erfolgen keine URL-Aufrufe. URL, Erfassungszeit und Beziehung sind deklarierte, gebundene Angaben; die Prüfsumme beweist die unveränderte lokale Kopie, nicht die Herkunft oder Wahrheit. Quellenqualität, Aussagebedeutung, Vollständigkeit und Nutzungsrechte bleiben unabhängig zu prüfen. Weitere Quellen für dieselbe Zelle erfordern derzeit eine zusammengefasste lokale Prüfdokumentation außerhalb dieser Ein-Quellen-Zuordnung; die Methode behauptet keine automatische Mehrquellenprüfung.

## Ergebnis und Grenzen

Vollständige Belege ergeben ausschließlich `pending-specialist-review`. Jeder Fachcheck bleibt `pending`; `reviewed`, `independentlyVerified` und `deliveryReady` bleiben `false`. Ein Fachprüfer muss die entsprechenden Belege selbst prüfen. Kundenfreigabe des fertigen Pakets, Vertrags- und Finanzierungsnachweise sowie sämtliche bestehenden Liefersperren bleiben unverändert. Die Methode sendet keine Nachricht und lädt keine Datei hoch.
