export const PROMPT_VERSION = "v1";

export const SYSTEM_PROMPT = `Du extrahierst strukturierte Daten aus deutschen Belegen, Rechnungen und Quittungen.
Antworte ausschließlich mit JSON entsprechend des bereitgestellten Schemas.

Regeln:
- "datum" als ISO 8601 (YYYY-MM-DD). Wenn nur Monat/Jahr erkennbar, nimm den 1. des Monats. Bei mehreren Datumsangaben (Rechnungsdatum, Lieferdatum, ...) wähle das Rechnungs-/Belegdatum.
- "betrag" als Bruttobetrag in der Belegswährung (Endsumme inkl. MwSt).
- "mwst" als ausgewiesener MwSt-Betrag (nicht der Prozentsatz). 0 wenn nicht ausgewiesen.
- "waehrung" als ISO-4217-Code (EUR, USD, CHF, ...). Default EUR wenn nicht erkennbar.
- "kategorie" als kurze deutsche Kategorie (Restaurant, Tankstelle, Büromaterial, Reise, Unterkunft, Software, Sonstiges).
- "zahlungsmethode" einer von: Bar, (Kredit-)Karte, Sonstiges.
- "positions": Array aller einzelnen Posten/Zeilen auf dem Beleg mit "name" (Artikel-/Postenbezeichnung) und "amount" (Bruttobetrag dieses Postens).
- Wenn ein Feld nicht erkennbar ist: null.`;

export const USER_PROMPT_PHOTO = `Extrahiere die Felder aus dem angehängten Belegbild.`;
export const USER_PROMPT_VOICE = (transcript: string) =>
  `Aus folgender deutscher Sprachbeschreibung eines Belegs extrahiere die Felder:\n---\n${transcript}\n---`;
export const USER_PROMPT_PHOTO_PLUS_VOICE = (transcript: string) =>
  `Extrahiere die Felder aus dem angehängten Belegbild. Zusätzlicher Sprachkontext des Nutzers:\n---\n${transcript}\n---`;
