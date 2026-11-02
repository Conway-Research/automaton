# Binäre uGig-Lieferungen – Umsetzung vom 20.10.2026

Die lokale Implementierung verbindet geprüfte binäre Artefakte mit dem vorhandenen Vertrags-, Finanzierungs-, Fachprüfungs-, Liefer-, Abnahme- und Zahlungsweg. Kein Dienstneustart, keine produktive Aktivierung, keine echten Uploads, Nachrichten oder Zahlungen. Der Betriebszustand wurde nicht verändert.

## Unterstützter Umfang

Das Profil `reviewed-binary` übernimmt ausdrücklich benannte Dateien aus einem lokalen Exportverzeichnis in einen unveränderlichen SHA-256-Speicher. Das Produkt enthält `binary-manifest.json`; die darin enthaltenen Byte-Hashes binden die Dateien an die bestehende Produktidentität. Auftragsidentität, Vertragsrevision und Umfang werden weiter geprüft.

Unterstützt werden XLSX, DOCX, PNG, JPEG und ein Modell-ZIP mit genau `model.safetensors`, `model-card.md` und `evaluation.json`. Letztere muss das Schema `numaron-model-evaluation-v1` tragen. Pickle, Joblib, ONNX, GIF, WebP und allgemeine ZIP-Sammlungen sind in diesem Lieferprofil nicht freigegeben. Office-Makros, eingebettete Binärprogramme, externe Beziehungen, XML-Entitäten, UTF-16-XML, unsichere Archivpfade und übermäßige Entpackgrößen werden abgewiesen.

Grenzen: höchstens 20 Dateien, 10 MiB pro Datei, 40 MiB pro Lieferung; maximal fünf Anhänge pro Nachricht. ZIP-Container: höchstens 200 Einträge und 32 MiB entpackt. Formatprüfung ist keine fachliche Abnahme, vollständige Office-Validierung oder Modellbewertung.

Der Import ist ein eigener, geprüfter Arbeitsweg. Er beweist keine automatische Erzeugung: Eine allgemeine automatische Excel-/Word-/Bildgenerierung oder ein Modelltraining wurde damit nicht eingerichtet. Der bestehende Sandbox-Codeexport wird nicht automatisch um beliebige Binärdateien erweitert. Fehlt ein geeigneter Erzeuger oder ein geprüfter Export, bleibt der betreffende Auftrag blockiert. Die im Entwurf erlaubte Alternative „lokal importiertes, unabhängig geprüftes Artefakt“ ist implementiert.

## Vor einer späteren echten Lieferung erforderlich

1. Dateien aus einem nachvollziehbaren, isolierten Arbeitslauf bereitstellen. `createBinaryArtifactStore({base,isEnabled}).importExport({directory,names})` übernimmt ausschließlich die explizit benannten Dateien; die injizierte Betriebsfreigabe bleibt erforderlich. Kein Umgehen des Produktionsschalters mit einem konstanten `true`.
2. Das zurückgegebene Array `{name,type,size,sha256}` als `agreement.binaryArtifacts` hinterlegen. `profileId` ist `reviewed-binary`, `deliveryProtocol` und `deliveryRequirements.format` sind `binary-attachments-v1`; `requiredFiles` enthält exakt die Dateinamen in derselben Reihenfolge.
3. Vertrag und sämtliche Eingaben müssen ausdrücklich `privacy: "public"` tragen. `deliveryRequirements.publicAccess` benötigt `approved: true`, den richtigen `buyerId`, `artifactDigest: digest(binaryArtifacts)` sowie `messageId` und `contentDigest` einer überprüften Kundennachricht in `agreementEvidence`. Diese Nachricht muss öffentlich erreichbare Speicherung genau dieser Dateien erlauben. Ein interner Haken oder eine allgemeine Lieferzusage ersetzt die ausdrückliche Kundenfreigabe nicht.
4. `binaryProvenance` benötigt `reviewed`, `independentlyVerified`, den exakten `artifactDigest` und einen belastbaren `evidenceRef`. Herkunft und Zuordnung müssen unabhängig geprüft sein.
5. Die bestehende `productReview` muss an Vertrags- und Produktdigest gebunden und aktuell sein. Zusätzlich zu den Fachprüfungen aus `UGIG_WORK_CHECKS[workKind]` sind `binary-format-decode`, `binary-content-and-privacy` und `binary-provenance` mit positiven, unabhängigen Nachweisen erforderlich. Beispielsweise müssen Office-Dateien tatsächlich geöffnet, Bilder dekodiert und Modelle fachlich evaluiert werden. Die Software kontrolliert diese lokalen Prüfnachweise; sie erzeugt keine unabhängige Begutachtung durch bloße Selbstbestätigung.
6. Den offiziellen Speicherursprung unabhängig verifizieren und später als `NUMARON_UGIG_BINARY_STORAGE_ORIGIN` konfigurieren. Erwartet wird ausschließlich ein kanonischer HTTPS-Origin, ohne Pfad. Es wurde kein Produktionswert geraten oder gesetzt. Vorhandene berechtigte uGig-Zugangsdaten werden ausschließlich für die Plattformroute verwendet.
7. Bestehende Vertrags-, Zugriffs-, Finanzierungs-, Abnahme- und Zahlungsnachweise bleiben erforderlich. Insbesondere ersetzt diese Änderung keinen CoinPay-Lesezugriff und bestätigt keine Finanzierung vorhandener Aufträge.

Diese Schritte sind Einrichtungshinweise, keine Freigabe zum Start oder Versand.

## Lieferkontrollen und Wiederaufnahme

Vor Upload und weiteren Versandgrenzen werden Vertrag, Finanzierung, öffentliche Freigabe, Betriebsfreigabe und Produktprüfung erneut geprüft. Vertrauliche Eingaben und Lieferungen bleiben gesperrt. Änderungen an Dateien erfordern neue Digests und passende Nachweise.

Der Adapter nutzt die feste uGig-Uploadroute. Er akzeptiert zurückgegebene Downloadadressen nur am konfigurierten Speicherursprung und im exakten Eigentümer-/Unterhaltungspfad. Weiterleitungen sind gesperrt. Downloads erhalten keinen uGig-Schlüssel. Metadaten, Bytezahl und SHA-256 werden zurückgelesen; anschließend werden alle Nachrichten samt Anhängen eindeutig zugeordnet.

Ein dauerhaftes Journal reserviert jeden Upload und Nachrichtenteil vor dem Senden. Bei unklarem Uploadausgang wird nicht automatisch erneut hochgeladen. Eine eventuell bereits öffentlich gespeicherte Datei kann deshalb manuelle Klärung benötigen; Widerruf nach einem Upload macht eine bereits erfolgte Veröffentlichung nicht rückgängig. Der reine Abgleich `readDelivery` erzeugt keine fehlenden Uploads oder Nachrichten. Bereits nachweisbar versandte Nachrichten werden ohne doppelten Versand erkannt.

## Isolierte Prüfung

Die Tests verwenden temporäre Dateisysteme und Datenbanken, synthetische Dokumente sowie vollständig simulierte Plattform-, Finanzierungs-, Abnahme- und Zahlungsantworten. Der Integrationsfall durchläuft Registrierung, Vertragsprüfung, Produkt, unabhängige Prüfung, fünf Dateiuploads, eine Nachricht, Abnahme und Zahlung. Fehlende Prüfung blockiert vorher.

Weitere Fälle prüfen fehlende/falsche Freigaben, vertrauliche Daten, Widerruf, OFF während eines Uploads, falsche Auftragszuordnung, ungültigen Speicherursprung, manipulierte Downloads, unklare Upload-/Nachrichtenausgänge, Dateimanipulation, Hardlinks, Archivangriffe und Aufteilung von sechs Anhängen.

Aufruf der betroffenen Regressionen in PowerShell:

```powershell
$binaryTests = @(Get-ChildItem scripts/founder-*test.mjs |
  Where-Object {$_.Name -match 'ugig|binary-|production-order|marketplace-work|order-|content|source-quality|work-profiles'} |
  ForEach-Object FullName)
node --import tsx --test --test-concurrency=1 @binaryTests
```

Ergebnisprotokoll und Dateihashes: `outputs/ugig-binary-20261020/tests.tap` und `evidence.json`. Das ist ein lokaler Implementierungsnachweis; keine Bestätigung der aktuell ausgerollten uGig-Version oder der live geladenen Numaron-Version.
