# Arbeitergrenze: 10 ausdrücklich freigegeben und später geladen

Nachprüfung am 19.10.2026: Die ursprünglichen menschlichen Nachrichten sind im lokalen Originalverlauf `C:/Users/Patrice/.codex/sessions/2026/10/17/rollout-2026-10-17T18-52-42-01a14ac7-ac59-7a73-b9bc-0521d0fcf0c5.jsonl` belegt: Zeile 4595, 00:29:58 UTC: „numaron bitte auf 10 arbeiter gleichzeitig erhöhen. warum und worauf wartet numaron?“; Zeile 4853, 00:45:31 UTC: ausdrückliche Freigabe des kontrollierten Wartungsneustarts zum Laden der zehn Arbeiter bei unveränderten Budgets. `docs/numaron-maintenance-coordination-20261019.json` dokumentiert die spätere Übernahme mit maxWorkers 10. Der aktuelle Dienst wurde danach gestartet. Diese Nachprüfung ändert keine Grenze und erteilt keine neue Start- oder Wartungsfreigabe. Die folgende Beschreibung der damals noch ausstehenden Aktivierung ist historisch.

Patrice hat am 19.10.2026 ausdrücklich zehn gleichzeitige Arbeiter beauftragt.
FOUNDER_LIMITS.maxWorkers und der davon abgeleitete Controller-Standard sind auf 10 gesetzt.
Geldgrenzen bleiben CHF 20/Tag, CHF 2.50/Aufgabenfamilie und CHF 150/30 Tage.

Der bereits laufende Prozess PID 18668 hat noch die beim Start geladene Grenze 4.
Es gibt keinen bestehenden Laufzeitsetter. Keine Neustart-, Stop- oder Startaktion wurde ausgeführt.
Die neue Grenze wird erst beim nächsten zulässigen Wartungsneustart geladen. Die ON-Sitzung
darf dafür nicht ohne gesonderte Unterbrechungsfreigabe beendet werden. Diese Datei ist keine Startfreigabe.

Prüfung 2026-10-19T00:34:40Z: confirmedOn=true, Powerrevision 59,
Controller running, Revision 139, Generation 76, PID unverändert.
Controllerdatenbank unmittelbar davor: 408 erledigt, 29 queued, 47 blocked, 27 failed,
11 cancelled. Um 00:33:28Z waren erst 406 erledigt: der Scheduler arbeitet weiter.

Gespeicherte Wartegründe: 44 blockierte Dienstabrufe nach Fehler/Abrufpause;
ein blockierter Firecrawl-Zugang; zwei blockierte und acht fehlgeschlagene Aufgaben mit
ungeklärtem Anbieterausgang/Kosten und erhaltenen Reservierungen. Letzte Stunde:
local_read_failed bei external-communication, source-reconcile-application und order-report.
Diese Diagnose benennt die Fehlerklasse, nicht deren noch ungeprüfte Ursache.
Weitere Aufgaben haben gespeicherte notBefore-Termine und Abhängigkeiten.
Mehr Arbeiter beseitigen diese Zugangsvoraussetzungen und Fehler nicht.

Offlineprüfung: 56/56 Tests erfolgreich, mit tsx und verification-network-guard.cjs:
founder-worker-limit, founder-controller, founder-budget, founder-discovery,
founder-general-web, founder-group-root-controller, founder-learning-lifecycle.
Der neue Test hält zehn Fakeaufgaben gleichzeitig offen, lässt die elfte warten,
verhindert doppelte Ausführung bei überlappenden Ticks und lehnt mehr als zehn ab.
Keine echten Anbieteraufrufe oder produktiven Controllerinstanzen in Tests.
