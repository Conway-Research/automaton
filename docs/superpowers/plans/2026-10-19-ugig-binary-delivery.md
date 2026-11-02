# uGig-Binärlieferung: Implementierungsplan

Freigegebener Entwurf: docs/numaron-ugig-binary-delivery-design-20261019.md. Umsetzung im aktuellen Chat durch den Hauptagenten; keine Delegation, kein Neustart, keine echten Uploads. Nutzer hat Umsetzung und isolierte Tests ausdrücklich beauftragt.

1. Tests für einen lokalen Binärspeicher schreiben und fehlschlagen sehen. Modul founder-binary-artifacts.mjs: unveränderliche SHA-256-Dateien, begrenzter Import aus einem expliziten Exportordner, sichere Namen, Größen-/Formatprüfung. Manifest statt Base64 im Produkt. Office-/Modell-ZIP-Struktur begrenzt prüfen; Fachprüfung bleibt unabhängig.
2. Tests für founder-ugig-binary-delivery.mjs schreiben: Kundenfreigabe, private Daten, genaue Herkunft, Hash-Rücklesen, OFF, Widerruf, unklarer Upload, Doppelnachrichten. Feste Uploadroute und separat konfigurierter Speicherursprung; keine Schlüssel beim Download; dauerhaftes Journal.
3. Neues reviewed-binary-Arbeitsprofil in Vertragsleser, Fachprüfung, Auftragsausführung und Produktionszusammensetzung anschließen. Vertrag bindet Artefaktmanifest und ausdrückliche öffentliche Speicherfreigabe an die Kundennachricht. Keine beliebige Codeausführung oder automatische Modell-Deserialisierung.
4. Isolierte vollständige Integration mit realen kleinen Dateibytes und Fake-Plattform. Legacy-Textregressionen und OFF prüfen. Herkunft des Artefakts muss unabhängig geprüft sein; Import ist kein Beweis automatischer Erzeugung.
5. Ergebnisse, Grenzen, konkrete Einrichtung und Fortsetzungsindex dokumentieren. Produktivstatus bleibt OFF; Änderungen bleiben ohne Neustart ausstehend.
