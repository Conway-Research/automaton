# Numaron: erste bezahlte Aufträge und vollständige Wirtschaftlichkeitsmessung

Status: prüfbarer Entwurf, noch keine Implementierung oder Aktivierung. Auftrag von Patrice am 25.10.2026 im Chat „Numaron-Aufgabentraining finden“ (01a1709d-8e59-7122-95e3-8694f65dadeb). Unabhängiger Builder-Check: keine wesentlichen offenen Planungsfragen. Erneute ausdrückliche Vorgabe von Patrice: niemals Mitarbeiterkosten einkalkulieren.

## Ziel und Grenzen

Nach passenden abgeschlossenen Trainingsnachweisen soll Numaron selbstständig geeignete Aufträge finden, prüfen und über die bestehenden erlaubten Wege bearbeiten. Die ersten drei bis fünf bezahlten, abgenommenen Aufträge liefern eine nachvollziehbare Auswertung von Einnahmen, sämtlichen Kosten und menschlichem Zeitaufwand. Profitabilität ist eine Annahmeprüfung, keine Erfolgsgarantie.

Numaron bleibt OFF. Keine Anbieterabfragen, Modellaufrufe, Bewerbungen, Nachrichten, Kundenarbeit oder Einreichungen durch die Vorbereitung. Keine Produktionsdatenbank ändern. Keine Dienste starten, stoppen oder neu starten. Der koordinierte Batch `coordinated-pending-20261024` bleibt unangetastet. Übernahme und späterer persönlicher Start sind getrennte Schritte. Ein späteres ON allein aktiviert keine unüberprüfte neue Funktion.

## Bestehende Teile und Ansätze

Vorhanden: `scripts/founder-order-selection.mjs` (Sichtung ohne Handlungsrechte), `scripts/founder-offer-feasibility.mjs` (umfangsgebundene Angebotsprüfung), `scripts/founder-project-author*.mjs` (Entwurf, Entwicklung und Abnahme), `scripts/founder-order-flow.mjs` und `scripts/founder-order-accountability.mjs` (Lebenszyklus), `scripts/founder-finance.mjs`, `scripts/founder-cost-import.mjs`, `src/revenue/profit-ledger.ts` und `src/revenue/personnel-cost-policy.ts`.

Empfohlener Ansatz: eine opt-in Pilot-Erweiterung an diesen vorhandenen Übergängen, mit eigenem Schema für Kosten-/Zeitzuordnung und unveränderten Berechtigungsprüfungen. Alternative eigenständige Pipeline verworfen: doppelte Zustände und Gefahr widersprüchlicher Freigaben. Alternative reine Checkliste verworfen: keine durchsetzbare Laufzeitprüfung. Diese Auswahl ist ein Implementierungsvorschlag, keine bereits erteilte Designfreigabe.

Der bestehende ProfitLedger ist USD-gebunden; CHF nicht dort als USD verbuchen. Kostenimport und Finanzansicht haben eigene Quellen. Neue Auswertungen müssen beleggebundene Projektionen sein, keine zweite unabhängig zählende Geldbuchhaltung.

## Pilotportfolio

Reihenfolge als bevorzugte Auswahl, keine Pflicht zur Annahme: (1) feste Excel-/CSV-Bereinigung; (2) gleichartige monatliche Berichterzeugung; (3) Transformation zweier klar definierter Datenformate; (4) ein dokumentierter lesender API-Export; (5) kleine lokale Oberfläche für einen zuvor bewährten Ablauf. Wiederholungen der ersten Kategorien sind erlaubt und erwünscht. Höchstens ein aktiver Pilotauftrag als vorsichtiger Startvorschlag, ohne andere Geschäftsbereiche global zu beschränken.

Für jeden Auftrag: explizite Grenzen für Eingabeformate, Datenvolumen, Zielsystem, Abnahme, Fehlerfälle, Korrekturrunden und Liefergegenstände. Kein pauschaler Anspruch auf beliebige OCR, ML, GUIs oder große Fremdcode-Reparaturen. Vertrauliche Eingaben bleiben im bestehenden gesperrten Zustand; diese Erweiterung erteilt keine Datenschutzfreigabe.

## Durchgängiger Ablauf

1. Vorhandene erlaubte Quellen liefern bei ON aktuelle Kandidaten. Quellen- und Listing-ID deduplizieren; Datum, Status und Gebühren erhalten. Fehlende Quelle oder Berechtigung blockiert mit konkretem Grund. Keine neuen Plattformkonten oder automatisch erlernten Live-Adapter.
2. Sichtung ordnet den Kandidaten einem Pilotprofil zu. Originalbeschreibung ist untrusted Material. Passende Fähigkeit verlangt prüfbaren Nachweis mit exaktem Umfang, Executor-/Prüferidentität, Quell-/Artefaktbindung, Abnahmeergebnis und Zielruntime. Ein Boolean `trainingComplete` oder ein erfolgreicher Modellstart genügt nicht. Geänderter/veralteter Nachweis verlangt Neubewertung.
3. Angebotsprüfung verbindet versionierten Umfang, Eingaben, Rechte, AI-Erlaubnis, unabhängige Abnahmefälle, Ressourcen-/Kalenderprüfung und Kalkulation. Ergebnis: ausgeschlossen, Klärung nötig oder intern angebotsbereit. Das Ergebnis selbst autorisiert weder Kontakt noch Arbeit.
4. Vor jeder externen Aktion prüft der bestehende Adapter erneut ON, aktuelle Berechtigung, Budget und Aktionsumfang. Vor Arbeit zusätzlich Vergabe, Vertrag und erlaubten Finanzierungs-/Zahlungsmodus prüfen. Der Pilot verschärft oder nutzt bestehende Gates, er lockert sie nicht. Öffentliche Lieferung benötigt die bestehende ausdrückliche Freigabe des fertigen Pakets.
5. Ausführung nutzt den bestehenden Projektarbeiter. Anforderungen und unabhängige Tests bleiben gebunden. Jede Runde zeichnet Verbrauch, Laufzeit und Fehler auf. Überschrittene Aufwands-/Kostenreserve oder geänderter Umfang führt zu sicherem Halten und neuer Kalkulation; kein Abschwächen der Abnahme.
6. Exakt geprüftes Paket über den vorhandenen journalisierten Lieferweg, mit Wiederaufnahme und unbekanntem Sendeausgang ohne Doppelversand. Abnahme und Zahlung bleiben getrennte Zustände. Nur bestätigte Zahlung zählt als vereinnahmter Umsatz.

## Kalkulation und Vorschlagswerte

Geldbeträge als sichere ganzzahlige Untereinheiten mit Währung; keine stillschweigende FX-Umrechnung. Für CHF-Auswertung Originalbetrag, belegter Kurs, Bewertungsdatum und Rundungsrest erhalten. Fehlender Kurs ergibt unvollständig, nicht null.

Vor Angebot konservative Obergrenze direkter Kosten bestimmen: Suche/Bewerbung, AI/API, lokale Rechenzeit/Energie, externe Dienste/Daten/Lizenzen, Plattform-/Zahlungs-/Wechselgebühren, Lieferung, erwartete Nacharbeit und Support. Gemeinkosten separat und nach versionierter nachvollziehbarer Zuordnung. Verlorene Bewerbungen werden im gesamten Pilotpool erfasst und nicht ausgeblendet. Frühere Entwicklung/Training separat als Investition ausweisen.

Vorgeschlagene zunächst zu bestätigende Pilotparameter: 30 % Kostenreserve, mindestens CHF 100 erwarteter Deckungsbeitrag und mindestens 30 % Deckungsbeitragsmarge nach Reserve und zugeordneten Akquisekosten. Diese Werte sind keine neue Ausgabenfreigabe. Unbekannte Kosten blockieren die Aussage „profitabel“. Existierende Ausgabenlimits gelten zusätzlich; das kleinste Limit gewinnt. Keine Mindestpreise aus den früheren Gesprächsbeispielen als Marktdaten übernehmen.

## Kosten- und Zeitereignisse

Jeder Datensatz trägt eindeutige Ereignis-/Quellbeleg-ID, Auftrag oder Pilot-/Investitionspool, Phase, Datum, Menge/Einheit, Währung, Betrag, Belegreferenz und Status (geschätzt, gemessen, bestätigt, ungeklärt). Keine Schlüssel oder unnötigen Kundentexte speichern. Doppelte Beleg-ID mit identischem Inhalt idempotent; abweichender Inhalt ist ein Konflikt. Korrekturen durch nachvollziehbare Gegen-/Ersatzbuchung, keine stille Überschreibung.

Kategorien: Akquise einschließlich erfolgloser Bewerbungen, AI/API-Verbrauch, Rechen-/Energiekosten, Hosting/Infrastruktur, Daten/Lizenzen/Dienste, Gebühren/FX, Nacharbeit/Support, Erstattungen und belegte sonstige Ausgaben. Lokal nicht gemessene Energie bleibt ungeklärt oder ausdrücklich geschätzt mit Tarif-/Messbasis. Prepaid-Aufladung und späterer Verbrauch dürfen nicht doppelt als Aufwand zählen; Rechnung und zugehöriger Nutzungsbeleg ebenfalls nicht. Nettopayout und Bruttoumsatz minus Gebühr sind alternative Darstellungen derselben Zahlung.

Patrices Zeit in Minuten für Akquise, Klärung, Prüfung, Bedienung, Korrektur und Support erfassen. Automatische Prozesslaufzeit ist keine menschliche Arbeitszeit. Tatsächliche Zeit durch Start/Stop oder manuell bestätigte Intervalle; Chat-Zeitabstände nicht als Arbeit raten. Überschneidende Intervalle und offene Timer markieren. Schätzungen getrennt; unbestätigte Minuten führen zu unvollständiger Zeitauswertung. Niemals Mitarbeiterkosten, Gehälter, Stundenlöhne oder kalkulatorischen Personalaufwand in Angebote, Annahmeprüfung oder Gewinnkalkulation einrechnen. Auch Patrices Minuten nicht monetarisieren. Diese feste Vorgabe entspricht der bestehenden PersonnelCostPolicy und ist keine optional aktivierbare Einstellung. Der frühere CHF-40-Beispielwert wird nicht übernommen.

## Auswertung und Stopps

Pro Auftrag und für den vollständigen Pilotpool: bestätigte Zahlung, direkte Kosten, Deckungsbeitrag, zugeordnete Gemeinkosten, operativer Überschuss vor Steuern, offene Forderungen/Erstattungen, geschätzte oder fehlende Kosten, Minuten je Phase sowie Gesamtminuten. Umsatz/Deckungsbeitrag je bestätigter menschlicher Stunde darf als Kennzahl erscheinen, nicht als garantierter Lohn. Keine Kennzahl bei null/fehlender Zeit. Steuern nur aus echten vorhandenen Belegen berücksichtigen; sonst ausdrücklich vor Steuern.

Ein Auftrag zählt zu den drei bis fünf erfolgreichen Fällen erst nach Lieferung, Kundenabnahme und bestätigter Zahlung. Sämtliche erfolglosen, abgebrochenen und unbezahlten Versuche bleiben in der Kohortenauswertung mit Kosten und Zeit sichtbar. Nach drei Erfolgen Zwischenbewertung; bis fünf nur bei positivem konservativem Ergebnis und ohne ungeklärte kritische Kosten/Nachweise. Kein automatisches Hochskalieren allein aufgrund synthetischer Tests.

## Umsetzung und Abnahme nach Designfreigabe

Eigene isolierte Arbeitskopie verwenden. Existierende Trainingsläufe und fremde Änderungen nicht bearbeiten. Kleine neue Module für Pilotregel, append-only Kosten-/Zeitjournal und Aggregation; Integration an bestehenden Auswahl-, Angebots-, Ausführungs-, Liefer- und Finance-Übergängen. Exakte Namen und Schnittstellen im anschließenden Implementierungsplan festlegen. Keine globale Aufweichung oder Migration der USD-Buchhaltung.

Erforderliche Offline-Tests mit temporären Datenbanken und Fake-Adaptern: (a) Kandidat bis bestätigte Zahlung mit jeder Gate-Prüfung; (b) OFF verbietet sämtliche externen Aktionen; (c) fehlender/ersetzter Trainingsnachweis; (d) Kostenreserve, fehlende Gebühren/FX, Überlauf, negative Werte, unterschiedliche Währungen; (e) Doppelbelege, Nutzungs-/Rechnungsabgleich, Brutto-/Nettopayout und Teilrückerstattung; (f) erfolglose Akquise und abgebrochene Arbeit in Gesamtsicht; (g) Timerüberschneidung/offener Timer/manuelle Korrektur; (h) Modellfehler, Budgetstopp und Wiederaufnahme ohne doppelten Verbrauch oder Versand; (i) vollständige isolierte Regression bestehender berührter Gates.

Abschlussbericht benennt Implementierungsstand, tatsächliche Testergebnisse, Integrationslücken und Aktivierungsstatus getrennt. Eine neue eigenständige Fortsetzungsdatei kann zunächst die Übergabe sichern; den gleichzeitig veränderten Fortsetzungsindex erst konfliktgeprüft ergänzen. Keine automatische Produktionsübernahme.
