# Lokale Einbindung der Referenzverwaltung

## Stand

Die bisher fehlende lokale Komposition ist im Code implementiert. Die Produktionsstartdatei kann die Verwaltung optional konfigurieren und verbindet die Quellenadapter mit derselben Freigabeablage. Sie wurde dafür nicht gestartet oder neu geladen. Numaron bleibt OFF.

## Feste Pfade und Datenfluss

Die Konfiguration liegt ausschließlich unter `artifacts/founder-reference-admin-config.json`. Erlaubt sind genau `enabled` (Boolean) und `reviewerId` (lokale Betreiberidentität). Ohne Datei oder mit `enabled:false` bleibt die Erweiterung deaktiviert. Pfade lassen sich nicht über die Konfiguration oder Browseranfragen vorgeben.

Bei aktivierter Konfiguration wird ausschließlich das bestehende Verzeichnis `artifacts/founder-autonomy-20261013/restoration` verwendet:

- `reference-candidates.json`: optionales lokales Manifest mit `schema: "reference-candidates-v1"` und `bindings: [...]`. Es enthält gezielt vorbereitete Rechnungsaufträge, keine ausführbaren Leser oder Dateipfade. Maximal 100 Bindings, insgesamt 2 MB. Der lokale Import ist administrative Vorbereitung; er beweist keine authentische Datenherkunft.
- `products.db`: bestehende Produktablage, ausschließlich read-only gelesen. Fehlende Datenbanken werden nicht angelegt. Identität, Profil, Stufe und Datei-Digest werden geprüft. Maximal 1.000 Zeilen und 2 MB Nutzdaten, Dateigröße maximal 20 MB. Überschreitungen blockieren und benötigen eine gezielte Erweiterung, statt Daten still abzuschneiden.
- `reference-evidence.db`: ausdrücklich für diese Verwaltung bestimmte Freigaben, Widerrufe und Protokolle in der bestehenden Hashketten-Ablage. Sie entsteht erst bei aktivierter Komposition und bestätigt lesbarem OFF-Zustand.

Pfadkomponenten und SQLite-Begleitpfade dürfen keine Symlinks/Junctions sein. Fehlerhafte oder widersprüchliche Eingaben führen nicht zu einer positiven Freigabe.

## Freigabe vor Arbeitsbeginn

Ein vorbereiteter Kandidat besitzt noch keine Lieferdateien. So kann die Referenzprüfung vor der Ausführung erfolgen, obwohl die Ausführung selbst bereits eine Freigabe verlangt. Seine Auftrags-ID wird aus der bestehenden Quellen-/Auftrag-/Eigentümeridentität und Revision abgeleitet. Sobald ein gespeichertes Produkt derselben Identität vorliegt, verwendet die Verwaltung dessen aktuellen Stand. Ein bloßer Kandidat erzeugt immer ein blockiertes lokales Abnahmeprotokoll; erst passende tatsächliche Lieferdateien können die Fachprüfung bestehen.

Der Manifestinhalt wird weder als Auftrag registriert noch automatisch ausgeführt. Autoritative Quellenzuweisung, Finanzierung, Rechte, Budgets und manueller Start bleiben separat erforderlich.

## Quellenanbindung

`openLocalReferenceAdmin` stellt `admin`, `authority(sourceId)` und `close()` bereit. `createProductionOrderBindings` nimmt optional `referenceAuthorityForSource` entgegen und gibt die resultierenden Qualitätsprofile und Prüfcallbacks an den Ausführungspfad weiter. Im Produktionsentrypoint ist die Authority zunächst geschlossen und erlaubt ohne konfigurierte Ablage nichts. Danach liest sie bei jeder Prüfung denselben Speicher wie die Verwaltung. Ein manueller OFF-Zustand wird dadurch nicht verändert.

Die Laufzeitverbindung ist implementiert, aber es wurden keine aktive Konfiguration, Manifestdaten oder Freigaben in die Produktion geschrieben. Ein Betrieb mit echten Daten erfordert weiterhin gezielte Vorbereitung und menschliche Prüfung der Referenzherkunft. Der bestehende Dienst wurde nicht neu gestartet.

## Offline-Abnahme

Temporäre Datenbanken und Fake-Quellen prüfen Vorbereitung vor Arbeit, den Wechsel zum gespeicherten Produkt, persistente Quellenfreigabe/Widerruf, fehlende Dateien, beschädigte Manifeste, doppelte Identitäten, falsche Datei-Digests, ON/unklaren Startzustand, Konfigurationspfade und Junction-Schutz. Eine gefundene Weitergabelücke im Produktionswrapper wurde mit einem Integrationstest reproduziert und behoben. Nachweise: `outputs/founder-reference-composition-20261019/`.
