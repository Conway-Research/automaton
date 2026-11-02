# Diagnose Stock-Lauf V12d

Stand 2.11.2026. Rein lesend aus den erhaltenen Checkpoints, dem Inferenz-Journal und dem eingefrorenen Controller-Code. Kein Modellaufruf, kein Container, kein Neustart. Keine Datei des Laufs und keine Anwendungsquelle wurde geändert. Syntaxprüfung nur mit `compile()` auf Kopien im Speicher, nichts wurde ausgeführt.

## Ergebnis

Der Lauf ist nicht an fehlender Rechenzeit gescheitert. Er hat einen brauchbaren Stand selbst zerstört und konnte ihn danach nicht mehr reparieren. Der Abbruch von außen um 03:30 war nur das Ende, nicht die Ursache.

## Verlauf

| Abschnitt | Stand | Was geschah |
|---|---|---|
| Runde 80 bis 84 | 0 von 79 | Syntaxfehler in `domain/model.py`, Compiler-Weg aktiv |
| Runde 85 bis 92 | 29 von 79, zweimal kurz 0 | Quellen kompilieren. Der beste Stand, aber keine Steigerung über 29 |
| Runde 93 | 0 von 79 | Ein Patch an `cli.py` bricht die Syntax. **Ab hier kompiliert das Programm nie wieder** |
| Runde 95 bis 125 | 0 von 79 | Reparaturen verschieben den Fehler nach `domain/storage.py`, Zeilen sind doppelt |
| Runde 126 bis 151 | 0 von 79 | **Keine einzige Quelländerung mehr**, knapp 5 Stunden und 26 Versuche |

Reparaturversuche dieses Laufs: 74, bei 117 Modellaufrufen und 14,7 Stunden Dauer.

| Ausgang je Versuch | Anzahl |
|---|---|
| Patch erzeugt | 20 |
| Abgelehnt: Zeilenumbrüche in `replacementLines` | 34 |
| Abgelehnt: Patch ändert nichts | 14 |
| Abgelehnt: überlappende Anker | 4 |
| Keine Dateien | 1 |
| Laufzeitfehler (der Abbruch) | 1 |

## Ursachen

Belegt:

1. **Kein Syntax-Tor.** Patches, die das Programm unkompilierbar machen, werden übernommen: Runde 89, 93 und folgende. Der Rückschritt von 29 auf 0 wird nicht abgewiesen.
2. **Kein Zurück zum besten Stand.** Der kompilierende Stand von Runde 92 liegt in den Checkpoints, wird vom Controller aber nie wieder verwendet.
3. **Formatfalle.** Das Modell schreibt ganze Dateiabschnitte in eine einzige Zeichenkette von `replacementLines`, die Regel verlangt eine Zeile je Element. Die Regel stand in den geprüften Fällen in der Rückmeldung an das Modell (3 von 4), trotzdem wiederholt es den Fehler. Das Ergebnis war 34-mal eine Ablehnung.
4. **Kein Stopp bei Stillstand.** Der Controller erweitert das Budget immer weiter (bis Grenze 156), auch wenn sich die Quellen gar nicht mehr ändern.
5. **Compiler-Weg setzt aus.** Bei 44 von 74 Versuchen meldet er „No eligible current syntax diagnostic“, obwohl die Syntaxfehler in allen 8 Rückmelde-Beispielen stehen. Wahrscheinliche Ursache, aus dem Code gelesen und nicht nachgestellt: Der Router liest `feedback.error` und einen 8000 Zeichen langen Log-Ausschnitt, die Beispiele tragen den Fehler aber in `observation`.

Abbruch: Der Modellprozess endete um 03:30 mit Code `0x40010004` und leerer Ausgabe, also von außen. Der Rechner startete um 03:45 neu. Einen Zusammenhang oder Auslöser kann ich nicht belegen. Der offene Aufruf steht als `awaiting-model-reconciliation`, der Controller hat korrekt gestoppt.

## Was offen bleibt

Auch im besten Abschnitt kam das Modell nicht über 29 von 79 hinaus. Die Ursachen 1 bis 5 erklären den Absturz auf 0, sie belegen nicht, dass dieses lokale Modell die restlichen 50 Kontrollen schaffen kann. Das ist die eigentliche offene Frage.

## Empfehlung

Kein Neustart des Laufs in dieser Form. Stattdessen, nur mit deiner Freigabe und als neue geprüfte Controller-Fassung:

1. Syntax-Tor: Ein Patch, der neue Syntaxfehler erzeugt, wird abgewiesen, die Quellen bleiben.
2. Zeilen eines `replacementLines`-Eintrags an Zeilenumbrüchen trennen. Der Inhalt bleibt der des Modells, nur das Format wird angepasst.
3. Compiler-Weg auch aus `observation` speisen.
4. Stopp nach einer festen Zahl von Runden ohne Änderung oder Fortschritt, Vorschlag: 6.
5. Einen begrenzten Versuch ab dem eigenen Stand des Modells aus Runde 92, Vorschlag: höchstens 20 Runden und rund 5 Stunden. Kommt der Stand nicht deutlich über 29 von 79, endet Stock mit dem Befund, dass dieses Modell dafür nicht reicht.

Der Rückgriff auf Runde 92 ist keine Handreparatur: Es sind Quellen des Modells, unverändert. Er ändert aber die Laufkette und braucht deshalb eine neue Zulassung und einen unabhängigen Review.

## Ergebnis des begrenzten Versuchs V13, 2.11.2026

Die Empfehlung wurde als V13 umgesetzt. Der Lauf endete um 11:51 an der Zeitgrenze (314 Minuten, Runde 110 von höchstens 112), Befund `model-not-sufficient`. Der beste Stand blieb 29 von 79 aus Runde 92; der historische Bestwert von 36 wurde nicht erreicht.

- 37 Modellaufrufe, 11 Prüfungen auf 11 verschiedenen Quellen.
- Die ersten 8 Prüfungen ergaben 29 von 79, immer mit denselben bestandenen Kontrollen. Das Modell änderte also Code, ohne eine weitere Kontrolle zu gewinnen.
- Die letzten 3 Prüfungen ergaben 0 von 79: `cli.py` importiert `parse_quantity`, das in `domain/model.py` fehlt. Die Syntaxprüfung sieht solche Brüche über Dateigrenzen nicht.
- Das Syntax-Tor wies 9 Patches ab; der Absturz durch Syntaxfehler aus V12d trat nicht mehr auf. Die Korrekturen wirkten, sie erklären den Stillstand also nicht.

Damit ist die offene Frage für diesen Versuch beantwortet: Dieses Modell kam mit diesen Hilfen im gesetzten Rahmen nicht weiter. Ob es mit mehr Zeit oder ein anderes Modell es schafft, ist damit nicht belegt. Nach der vorab festgelegten Regel gibt es keinen weiteren Lauf; die Quellen bleiben unverändert erhalten.

## Grenzen dieser Diagnose

Ursache 5 ist nur aus dem Code gelesen. Korrektur nach Review vom 2.11.: Bei den 44 Versuchen ohne Compiler-Weg sind 37 mit Syntaxfehler in den Beispielen belegt, die übrigen 7 enthalten keinen. Die Änderungen sind inzwischen als V13 gebaut und offline getestet (siehe `PROGRESS.md`), aber nicht mit dem Modell gelaufen. Ein Zurück zum besten Stand enthält V13 nicht: Ein kompilierender Patch, der die Treffer senkt, bleibt erhalten. Ob die Änderungen helfen, ist offen. Modelltraining für D und Incident bleiben gesperrt, bis Stock technisch abgenommen ist.
