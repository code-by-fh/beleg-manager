# Design: Share-Link für Anforderungen einer Person

**Datum:** 2026-05-24  
**Status:** Approved

## Zusammenfassung

Der Ersteller einer Anforderungsliste kann für eine bestimmte Person einen zeitlich begrenzten Share-Link generieren. Die Person erhält den Link per E-Mail und kann damit — ohne Login — alle ihre Anforderungen mit Details einsehen sowie verknüpfte Belege in Google Drive öffnen.

---

## 1. Datenbank

Neue Tabelle `share_links`:

```sql
CREATE TABLE share_links (
  id           TEXT PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,
  from_user_id TEXT NOT NULL,
  person_name  TEXT NOT NULL,
  person_email TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_owner ON share_links(from_user_id, person_email);
```

- `token`: `crypto.randomBytes(32).toString('base64url')` — 256 Bit Entropie
- `expires_at`: `created_at + 20 * 24 * 60 * 60 * 1000` (20 Tage in ms)
- Kein Bezug zu einzelnen Split-Requests — die Liste wird beim Abruf live aus `split_requests` gefiltert (nach `from_user_id + person_email`). Neue Anforderungen erscheinen automatisch.
- Wenn für `from_user_id + person_email` bereits ein gültiger Link existiert, wird er erneuert (Token + `expires_at` aktualisiert, E-Mail erneut verschickt).

---

## 2. Server-API

### POST /api/share-links (authentifiziert)

Erstellt oder erneuert einen Share-Link für eine Person.

**Request Body (Zod-validiert):**
```ts
{
  personName: string;   // freeName oder Name des registrierten Users
  personEmail: string;  // Ziel-E-Mail (Email-Format validiert)
  // Wenn toUserId-Person: E-Mail aus UserRepo, kein Body-Feld nötig
}
```

**Ablauf:**
1. Validierung: E-Mail-Format, Person gehört zu `from_user_id`
2. Alle `receiptId`s der Split-Requests dieser Person ermitteln
3. Für jede `receiptId`: Drive-Freigabe `role: reader, type: user, emailAddress: personEmail` via Google Drive API
4. Bestehenden Link erneuern oder neuen anlegen
5. E-Mail mit Share-Link via Gmail API des Owners versenden
6. Response: `{ shareUrl: string, expiresAt: number }`

**Rate Limiting:** 5 Req/Min per userId.

### GET /api/share-links/:token (öffentlich, kein Auth)

Gibt die Anforderungsliste zurück.

**Ablauf:**
1. Token aus DB laden — `crypto.timingSafeEqual()` für den Vergleich
2. Ablauf prüfen (`expires_at > Date.now()`) → 410 Gone wenn abgelaufen
3. Split-Requests nach `from_user_id + person_email` laden
4. Response nur mit erlaubten Feldern (kein Datenleck)

**Response:**
```ts
{
  personName: string;
  requests: Array<{
    haendler: string;
    betrag: number;
    waehrung: string;
    nachricht: string;
    datum: string;
    status: string;
    driveFileUrl: string | null;  // direkter Drive-Link, nur wenn receiptId vorhanden
  }>;
  expiresAt: number;
}
```

**Explizit NICHT zurückgegeben:** `id`, `fromUserId`, `toUserId`, `person_email`, interne IDs.

**Rate Limiting:** 20 Req/Min per IP.

### DELETE /api/share-links/:id (authentifiziert)

Widerruft einen Share-Link. Nur der Ersteller (`from_user_id`) darf löschen.

---

## 3. Security

| Maßnahme | Detail |
|---|---|
| Token-Entropie | `crypto.randomBytes(32).toString('base64url')` — 256 Bit |
| Timing-safe Lookup | `crypto.timingSafeEqual()` beim Token-Vergleich |
| Ablauf serverseitig | `expires_at` in DB geprüft, nicht im Token kodiert |
| Rate Limiting öffentlich | 20 Req/Min per IP |
| Rate Limiting erstellen | 5 Req/Min per userId |
| Minimale Datenrückgabe | Keine internen IDs, keine E-Mails, keine `fromUserId` in der Response |
| Drive-Freigabe | `role: reader`, `type: user` — nur für `person_email` |
| Kein Proxy für Belege | Kein Server-Proxy für Drive-Dateien — nur direkter Drive-Link (durch Drive-Freigabe gesichert) |
| Widerruf | Owner kann Link jederzeit löschen; abgelaufene Links werden mit 410 abgewiesen |

---

## 4. Frontend

### Share-Button (`MyAufteilungenList`)

- Pro Person ein "Link teilen"-Button
- **freeName-Person:** Dialog mit E-Mail-Eingabe + Bestätigungsschritt
- **toUserId-Person:** E-Mail aus Konto, direkt bestätigen
- Nach Erfolg: Toast "Link wurde per E-Mail an [email] verschickt" + Copy-to-Clipboard

### Öffentliche Seite `/share/:token`

- Eigene Route, kein App-Layout, kein Login-Prompt
- Zeigt: Personenname, Ablaufdatum, Liste aller Anforderungen
- Pro Anforderung: Händler, Betrag + Währung, Verwendungszweck, Datum, Status-Badge
- Wenn `driveFileUrl` vorhanden: "Beleg öffnen"-Button → öffnet in neuem Tab
- Ungültiger/abgelaufener Token: Fehlermeldung "Dieser Link ist nicht mehr gültig"

---

## 5. E-Mail-Inhalt (Gmail API)

Versendet über die Gmail API des Owners. Enthält:
- Name des Senders
- Link zur Share-Seite
- Ablaufdatum
- Hinweis, dass Drive-Belege mit der eigenen Google-Adresse zugänglich sind
