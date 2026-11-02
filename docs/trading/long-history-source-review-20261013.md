# Langzeitforschung: Quellenprüfung vom 13.10.2026

Ziel des Nutzers: möglichst breite Forschung über etwa 80 Jahre Marktgeschichte, Schlussfolgerungen mit vorhandenem Numaron-Wissen verbinden und robuste Strategiekandidaten prüfen. Dies ist kein Nachweis erreichbarer Profitabilität und keine Freigabe realer Orders.

## Verifizierte Quellen und Grenzen

- Kenneth French Data Library: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
- Beschreibung: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html
- Die Beschreibung weist tägliche US-Faktorrenditen vom 01.07.1926 bis 31.08.2026 aus. Es sind aggregierte Forschungsrenditen, keine handelbaren OHLC-, Bid/Ask- oder Intrabar-Daten einzelner Produkte. Datenrevisionen und der Wechsel von FIZ zu CIZ ab 2025 müssen dokumentiert werden. Lizenz und Verwendung im konkreten Produkt vor Einbindung prüfen.
- JST Macrohistory: https://www.macrohistory.net/database/ — jährliche Daten für 18 entwickelte Volkswirtschaften seit 1870. Renditen nominal und in Landeswährung. Lizenz CC BY-NC-SA 4.0: kommerzielle Einbindung nicht als freigegeben behandeln. Noch nicht importiert.

## Vorhandenes Numaron-Wissen

`src/revenue/trading-literature-data.ts` enthält ausdrücklich ursprüngliche Briefings aus geprüften Verlagsbeschreibungen, keine vollständigen Bücher und keine Strategienvalidierung. `scripts/trading-replay.mjs` enthält kurze M5-Cash-Vergleichstests. Beide ersetzen keine 80-jährige globale Marktdatenbank.

## Vorgeschlagene Forschungsarchitektur (noch nicht implementiert)

1. Quellenmanifest mit Lizenz, Marktabdeckung, Zeitraum, Frequenz, Datenrevision und SHA256; separate fehlende Abdeckung statt erfundener Historie.
2. Langfristige Markt- und Krisenstudien getrennt von konkreten handelbaren Kursdaten. Aktien inklusive ausgeschiedener Titel, Dividenden und Splits; Futures mit expliziten Rollregeln; Kryptowährungen nur seit tatsächlicher Existenz.
3. Vorregistrierte Hypothesen aus Trend, Momentum, Mean Reversion und vorhandenem belegten Wissen. Begrenzte Zahl von Versuchen; auch verworfene Ergebnisse speichern.
4. Chronologische Entwicklungs-, Validierungs- und endgültige unberührte Prüfzeiträume; Kostenstress, Marktregime, Drawdown, Turnover und Benchmarkvergleich. Kein Zugang zu künftigen Beobachtungen bei Signalen.
5. Erkenntnisse als versionierte Forschungsberichte mit widersprechender Evidenz ablegen; Kandidaten erst nach Prospektivtest weiterstufen. Keine automatische Veränderung realer Handelsregeln.

Stand: Quellen gelesen und Bestand geprüft. Keine vollständigen 80-Jahres-Datensätze importiert, kein neues Langzeitmodell trainiert und keine profitable Strategie nachgewiesen.

## Umsetzung und neuer Direktquellenbefund am 14.10.2026

Die damalige Entwurfsnotiz ist historisch. Die Forschungsarchitektur ist inzwischen umgesetzt; der aktuelle Zustand steht in `long-history-operations.md`.

Board H.15: https://www.federalreserve.gov/releases/h15/ ; Nutzungshinweis https://www.federalreserve.gov/disclaimer.htm . Board-erzeugte Inhalte sind laut geprüftem Hinweis grundsätzlich public domain, sofern nicht anders gekennzeichnet; Attribution bleibt. Importierte Direktdatei und konkrete Serie stehen in der Betriebshilfe. FRED wurde wegen seiner AI-Nutzungsbeschränkung nicht importiert. French/JST bleiben gesperrt. Monatliche annualisierte Zinsen werden ausdrücklich nicht als Monatsrenditen behandelt.
