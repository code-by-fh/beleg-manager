export const PROMPT_VERSION = "v4";

export const DEFAULT_KATEGORIEN = [
  "Restaurant", "Café", "Supermarkt", "Bäckerei", "Drogerie",
  "Tankstelle", "Parkgebühr", "ÖPNV", "Taxi/Uber",
  "Büromaterial", "Software", "Hardware", "Telefon/Internet",
  "Reise", "Unterkunft", "Flug", "Mietwagen",
  "Kleidung", "Apotheke", "Arzt/Gesundheit",
  "Freizeit", "Sport", "Haushalt",
  "Versicherung", "Steuerberatung",
  "Sonstiges",
];

export function buildSystemPrompt(customCategories: string[] = []): string {
  const allCategories = [...DEFAULT_KATEGORIEN, ...customCategories.filter((c) => !DEFAULT_KATEGORIEN.includes(c))];
  const catStr = allCategories.join(", ");
  return `Du extrahierst strukturierte Daten aus deutschen Belegen, Rechnungen und Quittungen.
Antworte ausschließlich mit JSON entsprechend des bereitgestellten Schemas.

Regeln:
- "datum" als ISO 8601 (YYYY-MM-DD). Wenn nur Monat/Jahr erkennbar, nimm den 1. des Monats. Bei mehreren Datumsangaben (Rechnungsdatum, Lieferdatum, ...) wähle das Rechnungs-/Belegdatum.
- "betrag" als Bruttobetrag in der Belegswährung (Endsumme inkl. MwSt).
- "mwst" als ausgewiesener MwSt-Betrag (nicht der Prozentsatz). 0 wenn nicht ausgewiesen.
- "waehrung" als ISO-4217-Code (EUR, USD, CHF, ...). Default EUR wenn nicht erkennbar.
- "kategorie" als kurze deutsche Kategorie. Wähle die passendste aus: ${catStr}. Bei unbekanntem Händler: "Sonstiges".
- "zahlungsmethode" einer von: Bar, (Kredit-)Karte, Sonstiges.
- "positions": Array aller einzelnen Posten/Zeilen auf dem Beleg. Jeder Eintrag hat "name" und "amount" (Gesamtbetrag dieser Zeile, also Menge × Stückpreis). Im "name" die Menge voranstellen: "6x Belcando Pferd", "1x Wasser", usw. Wenn keine Menge erkennbar ist, "1x" verwenden.
  WICHTIG für Mengenzeilen: Kassenbons drucken die Mengenangabe entweder als Unterzeile direkt UNTER dem Artikelnamen oder als Zeile direkt ÜBER dem Artikelnamen. Beide Varianten sind möglich:
    - Unter dem Artikel: "Belcando Pferd  22,74\n  6 St. x 3,79 EUR/St." → 6x Belcando Pferd
    - Über dem Artikel: "6 St. x 3,79 EUR/St.\nBelcando Pferd  22,74" → 6x Belcando Pferd
  Zeilen im Format "N St. x Preis EUR/St.", "N x Preis" o.ä. sind keine eigenen Positionen, sondern Mengendetails des benachbarten Artikels (darüber oder darunter). Nie als separate Position behandeln.
- Wenn ein Feld nicht erkennbar ist: null.`;
}

export const USER_PROMPT_PHOTO = `Extrahiere die Felder aus dem angehängten Belegbild.`;
export const USER_PROMPT_VOICE = (transcript: string) =>
  `Aus folgender deutscher Sprachbeschreibung eines Belegs extrahiere die Felder:\n---\n${transcript}\n---`;
export const USER_PROMPT_PHOTO_PLUS_VOICE = (transcript: string) =>
  `Extrahiere die Felder aus dem angehängten Belegbild. Zusätzlicher Sprachkontext des Nutzers:\n---\n${transcript}\n---`;
