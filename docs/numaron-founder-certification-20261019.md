# Dauerhafte Nachweise und Offline-Testzertifikate

Auftrag: offline implementieren und prüfen, Numaron OFF, vorhandene Änderungen erhalten.

Plan: (1) lokale SQLite-Ereignisablage mit unveränderlichen, verketteten Datensätzen und reinem Lesemodus; (2) fester, durch Netzwerkguards geschützter Testlauf mit gebundenem Dateifingerabdruck vor/nach dem Lauf; (3) explizite lesende Runtime-Einbindung, ohne automatische Quellenfreigaben; (4) temporäre Speichertests, echter Zertifikatslauf, Regression und unabhängige Prüfung.

Zertifikate bescheinigen ausschließlich die feste synthetische Testsuite. Sie erzeugen keine capabilityProofs, keine Produktionserlaubnis und keinen Live-Erfolg. Der Fingerabdruck umfasst vorhandene lokale Programmquellen und Lock-/Konfigurationsdateien, nicht Zugangsdaten oder Betriebsdaten. Abhängigkeiten werden über Lockdateien identifiziert; installierte Binärdateien werden nicht attestiert. Der Zertifizierer führt keine frei eingegebenen Befehle aus.

Speicherintegrität erkennt versehentliche Änderungen an Datensätzen/Verkettung. Lokale Schreibberechtigte bleiben die Vertrauensgrenze; keine kryptographische Fremdbeglaubigung oder Garantie gegen vollständigen Austausch/Rollback der Datenbank. Widerrufe gelten unverändert exakt nach dem bestehenden Projektionsvertrag. Das Fehlen oder die Beschädigung einer ausdrücklich eingebundenen Ablage darf positive Aussagen nicht erhalten.

Produktionsablage und laufender Dienst bleiben unberührt. Erstellt wird eine Entwicklungsablage unter outputs/founder-certification-20261019. Einbindung erfolgt nur durch explizite Dependency Injection, standardmäßig ohne Speicheröffnung.

## Bedienung und Abnahme

Manueller Offline-Aufruf (Zielverzeichnis vorher anlegen):

```powershell
node scripts/founder-certify-offline.mjs outputs/founder-certification-20261019/evidence.db
```

Der Befehl führt die feste 14-Dateien-Suite aus, ermittelt Fingerabdrücke vor/nach dem Lauf und schreibt das Zertifikat automatisch. Ein fehlerhafter, übersprungener, unvollständiger oder während Codeänderungen laufender Test wird nicht positiv zertifiziert. Keine frei wählbaren Testbefehle. CLI-Ziele sind auf das lokale outputs-Verzeichnis begrenzt.

Explizite Runtime-Einbindung für eine passende lokale Umgebung: openEvidenceStore({file,readonly:true}) als capabilityEvidenceStore übergeben. Die Runtime liest nur; der aufrufende Besitzer schließt die Ablage. Standardmäßig wird keine Ablage geöffnet. Zertifikate werden separat angezeigt und nicht als capabilityProofs ausgegeben.

checkCertificateCurrency(certificate,base) vergleicht ein aus der geprüften Ablage gelesenes Zertifikat mit den aktuellen Quellen. Die normale Dashboard-Abfrage führt diesen umfangreichen Dateiscan nicht aus und kennzeichnet Aktualität deshalb als nicht erneut geprüft. Fingerabdrucktypen: mjs/cjs/js/ts/tsx/py/ps1/json/sh/html/css/yaml/yml/toml unter scripts/src/web/packages sowie die expliziten Root-Paket-, Lock- und TypeScript-Konfigurationen. Keine Aussagen über unberücksichtigte Dateitypen, installierte Binärdateien, Laufzeitumgebung oder externe Dienste.

Abnahme: 122/122 Tests in separater Codekopie bestanden, identischer Anfangs-/Endfingerabdruck. Zwei vorherige Läufe bestanden ihre Tests ebenfalls, wurden wegen parallel geänderter Arbeitsdateien korrekt invalidiert. Alle drei Zertifikate bleiben in der Entwicklungsablage erhalten. Beim Wiederlesen: Kopie current, Hauptarbeitsstand stale. Keine fremden Änderungen überschrieben. Bericht und genaue Zertifikats-ID unter outputs/founder-certification-20261019.
