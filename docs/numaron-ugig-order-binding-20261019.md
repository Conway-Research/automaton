# uGig: Vertragsleser für weitere Aufträge

Lokale Implementierung vom 19. Oktober 2026. Numaron bleibt OFF, Revision 79. Keine Produktionsverträge oder Grants angelegt, keine Plattformabfrage und keine Kundennachricht, kein Dienstneustart.

## Umgesetzt

`founder-ugig-order-contract.mjs` stellt einen ausdrücklich einzubindenden Vertragsleser für weitere uGig-Aufträge bereit. Gig-ID, Bewerbungs-ID, Eigentümer, Käufer, Aufgabenfamilie, Quellrevision und Gespräch werden exakt verglichen. Die Aufgabenfamilie wird wie im bestehenden Auftragsregister aus der Gig-ID hergeleitet. Ein Profil muss durch eine im Anwendungscode übergebene Prüffunktion ausdrücklich zugelassen werden. Unbekannte Profile, lediglich wahrheitsähnliche Ergebnisse und asynchrone Prüffunktionen ergeben keine Zustimmung.

Der neue Umfangsdigest bindet zusätzlich die Eingaben, Ausgangsdateien, Daten-/Berichtsvertrag, fachlichen Qualitätsvertrag, Datenverwendung, erlaubten Änderungen, Quellen und Zahlungsbedingungen. Änderungen nach Prüfung machen den Beleg ungültig. Der bestehende Pilot behält seinen ursprünglichen Digest und seine feste Auftrags-/Profilbegrenzung.

Der gemeinsame authentifizierte Leser kontrolliert weiterhin eigene Kontositzung, genau eine passende angenommene Bewerbung, Käuferidentität, das richtige Zweiergespräch und Original-Käufernachrichten. Ein Sammelgespräch erfordert die geprüfte ausdrückliche Gig-/Bewerbungszuordnung. Neue ungeprüfte Kundennachrichten, abgelaufene Arbeitsfristen oder ein während des Abrufs geänderter Vertrag sperren die Bindung.

`createUgigReviewedOrderContract` verbindet dies mit der bestehenden lokalen Belegablage. Der Grant muss den kompletten Vertrag referenzieren, gültig sein und die erforderlichen Operationen enthalten. Die Belege werden erneut gelesen; Widerruf wirkt auch nach Erstellung des Lesers. Ohne ausdrücklich konfigurierte Validierung bleiben die bestehenden Belegleser ausschließlich für den Pilot zuständig.

## Verwendung durch spätere Anwendungskomposition

```javascript
const reader = createUgigReviewedOrderContract({
  base,
  isEnabled,
  credential: existingUgigCredential,
  profileValidators: {
    'source-report': validateReviewedSourceReportAgreement,
  },
});
```

`validateReviewedSourceReportAgreement` ist hier eine noch aufgabenspezifisch zu implementierende Anwendungscode-Funktion, keine fertige Freigabe und kein Kundenparameter. Es werden bewusst keine pauschal zustimmenden Produktionsprüfer geliefert. Das Modul bietet `readAssignment`, `access` und `status`; es besitzt keine Ausführungs- oder Versandfunktion.

## Was noch offen ist

Der Baustein prüft Vertrag/Zuweisung/Zugriffsbeleg. Er bestätigt keinen tatsächlichen Finanzierungseingang und ersetzt weder den Finanzierungsprüfer noch den unabhängigen Produktprüfer. Der neue Leser ist noch nicht in die reguläre Produktionsauswahl der übrigen 13 Aufträge eingebunden. Dort müssen pro Profil passende Fachprüfung und nachgewiesener Lieferweg gemeinsam hinzukommen. Die bestehenden Zahlungs-, Budget- und OFF-Gates bleiben erforderlich.

Nächster Schritt: eine ausdrücklich konfigurierte Zusammensetzung aus diesem Leser, tatsächlicher Finanzierungsprüfung, Profilprüfung und Liefer-/Rückleseadapter. Erst wenn diese vollständig ist, darf ein weiterer Auftrag im normalen Ablauf von assigned zu prepared gelangen. Binärlieferung, PDF/OCR, GUI, große Datenverarbeitung und weitere Fachprofile bleiben eigene Lücken laut vorangegangener Bestandsaufnahme.

## Prüfung

Test-first: Neue Leser und kombinierte lokale Beleganbindung wurden zuerst als fehlend reproduziert, anschließend implementiert. Künstliche Plattformantworten, synthetische Identitäten und temporäre Dateiverzeichnisse prüfen positiven Fremd-Pilot-Auftrag, falsche Identität/Revision/Scope, veränderte Eingaben, fehlende Profilprüfung, neue Käufernachricht, Widerruf und OFF ohne Netzwerkzugriff. Regression umfasst bestehende uGig-Vertrags-, Liefer-, Zahlungs- und Produktionsintegration sowie Marktplatz- und Quellenprüfung. Ergebnisse stehen in `outputs/ugig-order-binding-20261019/tests.tap`.

Aktuelles Ergebnis: **158 Tests bestanden, 0 fehlgeschlagen**, darunter 19 Tests des neuen auftragsübergreifenden Lesers.
