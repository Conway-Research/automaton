# Fachprüfer in Auftragsabläufen

Die Produktionsimplementierung von `founder-order-execution.mjs` wendet Fachprofile beim Erstellen, Verifizieren und unmittelbar vor der Auslieferung an. Getestet wird ausschließlich mit temporären Zuständen, synthetischen Aufträgen und Fake-Adaptern. Produktionsbetrieb bleibt OFF.

## Content-Auftrag

`content-repurpose` verwendet `content-package-structural-v1`. Das Paket muss zum vereinbarten Brief und exakt zu den ausgelieferten Dateien passen. Verifikation und Versand verlangen weiterhin den unabhängigen Content-Review. Dessen Reservierungen, Kosten, Quellenbelege und ursprüngliche Aufgabenfamilie bleiben erhalten. Strukturprüfung ist keine automatische Bestätigung semantischer Qualität.

## Rechnungsabgleich

Ein `structured-data`-Auftrag kann einen `qualityContract` mit exakt `profile`, `referenceRows`, `referenceDigest` und `evidenceRef` führen. Das Profil lautet `invoice-reconciliation-v1`; der Referenzdigest bindet die Vergleichszeilen. Der lokale Quellenadapter muss das Profil deklarieren und `validateQualityContract(binding)` synchron ausdrücklich mit `true` bestätigen. Diese Funktion ist geprüfter Anwendungscode, keine vom Auftrag gelieferte Anweisung. Sie muss den tatsächlich freigegebenen Referenzvertrag prüfen; ein pauschales `true` ist nur eine Testattrappe.

Der Auftrag erzeugt `delivery.csv` und `reconciliation.json`. Der Fachprüfer vergleicht vollständige IDs, ganzzahlige Beträge und Summen je Währung mit den gebundenen Referenzen. Die Referenzdaten selbst werden dadurch nicht als wahr oder authentisch bewiesen. Nicht passende Zeilen, ungültige Summen, geänderte Referenzen und entzogene Freigaben blockieren die Auslieferung.

`createMarketplaceWorkSource` nimmt den geprüften Callback optional entgegen. Ohne ihn ist das Rechnungsprofil nicht freigegeben. Der Vertragsfingerabdruck umfasst vorhandene Qualitätsverträge; Verträge ohne dieses Feld behalten ihr bisheriges Digestformat. Die bestehende frische Marktplatz-Auftragsprüfung bleibt zusätzlich erforderlich.

## Nachweise und Grenzen

Im Produkt wird `qualityCheck` mit Profilresultat sowie Datei- und Binding-Digests gespeichert. Wiederverwendung und Versand prüfen erneut; ein gespeichertes positives Ergebnis reicht nicht. Die Quellenfähigkeit meldet ihre tatsächlich eingebundenen Profile über `qualityProfilesForSource`; fremde Quellen erhalten daraus keinen Nachweis. Zertifikatszuordnungen bleiben ausdrücklich zu erstellen und revisionsgebunden. Es entstehen keine neuen Produktionsrechte oder Freigaben.

Bereits versandte, noch ungeklärte Lieferungen dürfen weiterhin über den bestehenden reinen Rücklesepfad abgeglichen werden. Ein späterer Widerruf darf diese Klärung nicht verhindern und erlaubt keinen erneuten Versand.

Die feste Zertifikatssuite enthält jetzt zusätzlich Auftragsausführung, Marktplatzadapter, Content-Worker und Content-Lebenszyklus. Der Abnahmebericht und die Zertifikate liegen unter `outputs/founder-quality-adapters-20261019/`. Live-Abnahme, authentische Referenzfreigaben je konkreter Quelle und weitere Fachprofile bleiben ausstehend.
