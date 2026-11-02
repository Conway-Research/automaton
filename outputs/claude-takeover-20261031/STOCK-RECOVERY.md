# Stock-Lauf: Recovery-Befund

## Nachtrag nach der Entscheidung von Patrice (31.10.2026)

Patrice hat entschieden: „Ja, gilt als geklärt.“ Damit ist Punkt 1 unten erledigt.

**Korrektur:** Die Tabelle weiter unten ist unvollständig. Der Controller enthält auch `recoverAfterRuntimeReboot`, das ich zuerst übersehen hatte. Es gilt nur für die Phase `implement` mit Dateischritten, nicht für diesen `repair`-Aufruf. Die Aussage „kein vorhandener Weg“ bleibt also richtig.

**Neuer Beleg:** Die Gast-VM `podman-obolus-isolation-test` bootete um 02:40:52 Uhr Ortszeit (`btime` 1793410852), sieben Minuten nach dem letzten Journal-Eintrag von 02:33:52 Uhr. Ein laufender Container kann das nicht überstanden haben. Das erklärt wahrscheinlich auch den Verlust, die Ursache des Neustarts selbst ist aber nicht belegt.

**Stand der Vorbereitung, nichts davon ist gestartet:**

| Baustein | Stand | Beleg |
|---|---|---|
| Controller V8 als neue Kopie, V5 unverändert | Neue Methode `recoverRepairAfterRuntimeReboot`, 1 Datei geändert | `controller-reboot-repair-recovery-v8`, `CONTROLLER-V8-FREEZE.json` |
| Owner-Tests | 98/98, davon neu: Regeneration nur des verlorenen Edits, 7 Sperrfälle, doppelte Nutzung, andere Stufe, geänderter Payload, 3 Manipulationen | [controller-v8-first.tap](evidence/controller-v8-first.tap) |
| Kopie des echten Journals, Fake-Prozess | Übergang gelingt, Plan und Inspektion erhalten, 0 Modellaufrufe, Original unverändert | [stock-recovery-proof-v8.json](stock-recovery-proof-v8.json) |
| Host V8 | Aus V7 abgeleitet, Syntax geprüft, nicht ausgeführt | `run-stock-continuation-v8.mjs` |
| Zulassung V8 | **Nicht erzeugt.** `freeze-continuation-v8.mjs` verweigert sich ohne unabhängigen Review | |
| Unabhängiger Review | **Fehlt** | `INDEPENDENT-STOCK-CONTINUATION-V8-REVIEW-v1.json` |

**Nicht geprüft:** Der Host V8 selbst lief nie, auch nicht mit Fakes, weil seine Pfade fest sind. `author.step` nach der Recovery ist nur über den Controller getestet, nicht mit dem echten Verifier.

Die neue Methode prüft den echten Boot beim Aufruf selbst erneut, über den vorhandenen Reboot-Probe. Der Probe in der obigen Kopie war gefälscht; die Boot-Zeit stammt aus einer getrennten lesenden Abfrage.

---

Stand 31.10.2026. Geprüft nur lesend und auf Temp-Kopien mit Fake-Adaptern. Kein Modellaufruf, kein Container, keine Änderung an `outputs/complex-stock-project-run-20261030-v1`.

## Ergebnis

**Der reguläre Recoveryweg führt nicht weiter. Eine neue Ausführung ist zurzeit nicht zulässig.** Die Wirkung des ungeklärten Aufrufs ist geklärt, sein interner Ausgang nicht, und er lässt sich auch nicht mehr klären.

## Was belegt ist

| Frage | Befund | Beleg |
|---|---|---|
| Läuft der Worker noch? | Nein, PID 42424 fehlt. `STATUS.json` ist veraltet. | Prozessliste 31.10. |
| Läuft noch ein Modell? | Nein: keine laufenden Container, kein `numaron-local-llm`-Container, kein llama- oder python-Prozess in der Distribution `podman-obolus-isolation-test`. | Lesende Abfrage 31.10. |
| Gibt es ein gespeichertes Ergebnis? | Nein: `native-resume-v7/0750` fehlt, kein passendes Execution-Journal unter 124 Einträgen. | `outputs/founder-maintenance-fixes-20261031/training-state/execution-inventory.json` |
| Hat der Aufruf etwas verändert? | Nein: Journal und Author-Datenbank stimmen bytegleich mit dem Stand von 01:33 UTC und dem Checkpoint überein, Status `prepared`, 80 Belege, keine neue Quelle. | [stock-recovery-proof.json](stock-recovery-proof.json), `STOCK-CHECKPOINT-PROOF.json` |
| Könnte das Ergebnis noch nachträglich eintreffen? | Nein, der Empfänger ist beendet und nichts läuft mehr. | wie oben |

## Was nicht belegt werden kann

Ob die Generierung vor dem Abbruch fertig wurde, ist nicht feststellbar. Die Ausgabe wurde nicht gespeichert, und der Containername ist im Journal nicht festgehalten. Der letzte Beleg ist Native 0749 um 01:33:52 UTC, danach beginnt Sequenz 750. Warum der Worker endete, ist in den gelesenen Belegen nicht geklärt.

## Prüfung der vorhandenen Wege (eingefrorener V7-Controller, Fake-Prozess, 0 Prozessaufrufe)

| Weg | Ergebnis | Warum |
|---|---|---|
| `reconcile` | `null` | Nur `completed`, `resumable` und `resumable-repair` werden bedient. |
| `recoverKnownIncomplete` | `false` | Braucht einen `failure`-Eintrag und ein Execution-Journal mit Code 1. |
| `authorizeContinuation` | abgelehnt | Braucht Status `failed`, Datei-Schritte und ein Journal mit Code 137. |
| `infer` | abgelehnt | In der Probe bereits am fehlenden Modell-Probe gestoppt. Die eingefrorenen Tests `lost result is not blindly redispatched` und `an uncertain file call…` belegen den Reconcile-Zwang (2/2). |
| `author.step` | nicht bis zum Ende ausgeführt | Mit dem Fake-Verifier stoppt es an `Project verifier binding changed`. Laut [founder-project-author.mjs:62](../../scripts/founder-project-author.mjs:62) führt `null` zu `awaiting-model-reconciliation`. Das ist aus dem Code gelesen, nicht ausgeführt. |

Der vorhandene Controller hat für „Generierung `prepared`, Host verloren, kein Execution-Journal“ also keinen Zustandsübergang. Das ist Absicht: Nichts wird blind wiederholt.

## Zweiter Blocker: Die Zulassung V7 ist ungültig

`ADMISSION-resume-v7.json` pinnt 111 Dateien, davon stimmen 110. Abweichend ist `artifacts/founder-integration-20261012/power-state.jsonl`, weil der Dienststart um 03:15 UTC einen Eintrag angehängt hat (weiterhin OFF, Revision 101). Der Beleg `admissionPinsVerified: 111` stammt von 02:25 UTC, also davor. Ein Fortsetzen über den V7-Host braucht deshalb in jedem Fall eine neue, geprüfte Zulassung. Die Branch-Änderungen dieser Sitzung berühren keine gepinnte Datei.

## Was für eine neue Ausführung nötig wäre

1. **Entscheidung von Patrice:** Gilt „keine Wirkung, Empfänger beendet, nichts läuft mehr“ als hinreichend geklärt, obwohl der interne Ausgang unbekannt bleibt? Das fällt unter die Vorgabe vom 31.10. und ist nicht von mir zu entscheiden.
2. Ein neuer, eng gefasster Übergang im Controller, etwa `confirmLostGeneration`: nur bei Status `prepared`, ohne passendes Execution-Journal, mit nachgewiesen abwesendem Container und Worker, ohne Löschen des alten Eintrags, einmalig. Zuerst mit Fake-Adaptern und unabhängigem Review.
3. Eine neue Zulassung V8 mit aktuellen Pins, inklusive der geänderten Power-Datei.
4. Erst danach der eine Modellaufruf, nie parallel zu einem anderen großen Lauf.

Bis dahin bleiben Stock und das Incident-Projekt gesperrt. Andere Pakete sind davon nicht betroffen.

Die Probe ist wiederholbar: [stock-recovery-proof.mjs](stock-recovery-proof.mjs). Das Stock-Verzeichnis wurde nicht beschrieben; die Temp-Kopie liegt unter dem in der JSON genannten Pfad.
