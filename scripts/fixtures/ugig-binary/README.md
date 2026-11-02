# Synthetische Binärtestdateien

Alle Dateien wurden ausschließlich für isolierte Tests erzeugt; keine Kundendaten, Konten oder produktiven Freigaben.

- `book.xlsx`: openpyxl, kleine Tabelle mit `id`, `value` und einem Beispielwert 42.
- `document.docx`: python-docx, Überschrift und kurzer synthetischer Testtext.
- `plot.png` und `photo.jpg`: Pillow, jeweils 2 × 2 Pixel.
- `model.zip`: Python zipfile; genau `model.safetensors`, `model-card.md`, `evaluation.json`. Ein F32-Tensor `weight` mit Form `[1]` und Wert 1.0; kein fachlich trainiertes Modell.

Am 20.10.2026 unabhängig mit openpyxl, python-docx und Pillow wieder geöffnet/dekodiert; Modellheader und F32-Bytes separat mit json/struct gelesen. Die Tests lesen diese echten Dateibytes, statt nur Endungen oder MIME-Typen zu simulieren. Positive Formatprüfungen ersetzen keine Prüfung echter Kundenprodukte.
