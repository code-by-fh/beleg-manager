# Design: Multi-Tenant Auth & Cross-User Split Requests

**Date:** 2026-05-16  
**Status:** Approved

---

## Overview

Extend Beleg-Manager to support multiple registered users with complete data isolation and a cross-user "Aufteilungsanforderung" (split request) workflow. User A can request User B to pay a portion of a receipt; User B can view the receipt (via server-side proxy) and accept or reject the request.

---

## Goals

1. Harden existing multi-user isolation to be fully OWASP-compliant.
2. Allow users to search for other registered users by name or email.
3. Allow User A to send a split request (Beleg + Betrag + Nachricht) to User B.
4. Allow User B to preview the receipt and accept or reject the request.
5. Keep Google Drive and Sheets per-user; no Drive sharing required.

---

## Out of Scope

- Push notifications / email notifications for new requests.
- Payment processing or integration with payment providers.
- Changing the existing internal splits feature (name-based, Google Sheets).
- Admin management of users.

---

## Architecture

### Approach

A standalone **"Anforderungen" module** backed by SQLite. Cross-user coordination is an app-level concern, not a financial record — it belongs in SQLite, not Google Sheets. Only after acceptance does the requesting user optionally update their own Google Sheet (existing splits flow).

### Data Flow

```
User A                    Backend                        User B
  |                          |                              |
  |-- search users --------->|                              |
  |<- [{id,name,email}] -----|                              |
  |                          |                              |
  |-- POST /split-requests ->|-- INSERT split_requests ---->|
  |                          |                              |
  |                          |<-- GET /incoming ------------|
  |                          |--- [{request+meta}] -------->|
  |                          |                              |
  |                          |<-- GET /:id/receipt-preview -|
  |                          |-- fetch from A's Drive       |
  |                          |--- stream image/pdf -------->|
  |                          |                              |
  |                          |<-- PATCH /:id/status --------|
  |                          |    {status: 'accepted'}      |
  |<- status update visible --|                              |
```

---

## Data Model

### New Table: `split_requests`

```sql
CREATE TABLE split_requests (
  id            TEXT PRIMARY KEY,
  from_user_id  TEXT NOT NULL,
  to_user_id    TEXT NOT NULL,
  receipt_id    TEXT NOT NULL,        -- Google Drive File ID
  receipt_meta  TEXT NOT NULL,        -- JSON: {haendler, datum, gesamtbetrag, waehrung}
  betrag        REAL NOT NULL,
  nachricht     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_split_req_to   ON split_requests(to_user_id, status);
CREATE INDEX idx_split_req_from ON split_requests(from_user_id, status);
```

### Existing Tables — No Breaking Changes

The `users` table gains no new required columns. User search runs over existing `email` and `name` columns.

---

## API Endpoints

All endpoints require an authenticated session. All request bodies are validated with Zod.

### User Search

```
GET /api/users/search?q=<string>
```

- `q` must be at least 2 characters.
- Returns at most 10 results matched against `name` or `email` (case-insensitive LIKE).
- Response: `{ users: Array<{ id, name, email }> }` — never exposes tokens, Drive IDs, or other internal fields.
- Rate limit: 30 req/min per user.

### Split Requests

```
POST   /api/split-requests                       Create a new request
GET    /api/split-requests/incoming              Requests addressed to me
GET    /api/split-requests/outgoing              Requests I created
PATCH  /api/split-requests/:id/status            Change status
GET    /api/split-requests/:id/receipt-preview   Proxy the receipt file
DELETE /api/split-requests/:id                   Delete (only cancelled/rejected, only from_user)
```

#### POST `/api/split-requests`

Request body:
```typescript
{
  toUserId:  string,   // must be an existing user, not self
  receiptId: string,   // Drive File ID — must belong to session user
  betrag:    number,   // positive
  nachricht: string    // optional, max 500 chars
}
```

Server validates that `receiptId` is accessible via the session user's Drive credentials before inserting.  
Rate limit: 10 req/min per user.

#### PATCH `/api/split-requests/:id/status`

```typescript
{ status: 'accepted' | 'rejected' | 'cancelled', grund?: string }
```

Authorization rules:
- `accepted` / `rejected` → only `to_user_id === session.userId`
- `cancelled` → only `from_user_id === session.userId`
- All other combinations → 403

#### GET `/api/split-requests/:id/receipt-preview`

Authorization chain (any failure → appropriate 4xx, no information leak):
1. Session present → else 401
2. Load `split_requests` WHERE `id = :id`
3. Record exists → else 404
4. `session.userId === to_user_id` AND `status IN ('pending','accepted')` → else 403
5. Load receipt from `from_user`'s Google Drive using `from_user`'s stored refresh token
6. Stream file to client with correct `Content-Type`
7. Set `Cache-Control: no-store`

Rate limit: 60 req/min per user.

---

## Security (OWASP)

| Threat | Mitigation |
|--------|-----------|
| **IDOR** | Every endpoint verifies `from_user_id` or `to_user_id` matches `session.userId` — URL param alone is never trusted |
| **Broken Access Control** | Receipt preview checks both relationship AND status; status changes are role-gated |
| **Information Disclosure** | User search returns only `{id, name, email}`; 404 vs 403 responses are consistent to avoid enumeration |
| **CSRF** | Covered by existing `helmet` + SameSite cookie configuration |
| **Rate Limiting** | Dedicated per-endpoint limits on search and request creation |
| **Token Leakage** | `from_user`'s refresh token is used server-side only; never exposed to `to_user` |
| **Self-request** | Backend rejects `toUserId === session.userId` with 400 |

---

## Frontend

### New Page: `/requests`

Two tabs:

**"Eingehend"**
- Lists all split requests where `to_user_id = me`
- Each card: sender name/email, Händler, Datum, Betrag, Status badge
- Actions on `pending`: "Beleg ansehen" (opens preview modal), "Annehmen", "Ablehnen"

**"Ausgehend"**
- Lists all split requests where `from_user_id = me`
- Each card: recipient name/email, Händler, Datum, Betrag, Status badge
- Action on `pending`: "Zurückziehen" (→ status `cancelled`)

### Receipt Preview Modal

- Opens as a `Dialog` over the request card
- Fetches `GET /api/split-requests/:id/receipt-preview` — rendered as `<img>` or `<iframe>` depending on MIME type
- Shows metadata alongside: Händler, Datum, Gesamtbetrag, angeforderter Betrag, Nachricht vom Sender
- Controlled `Cache-Control: no-store` — not cached by browser

### Request Creation Flow

Integrated into the existing Splits creation UI:

- Optional combobox "Registrierten Nutzer anfragen" using Shadcn `Command`
- Debounced search (300ms, min. 2 chars) against `GET /api/users/search`
- Selecting a user + entering Betrag + optionale Nachricht → `POST /api/split-requests`
- Falls back to the existing name-based split if no registered user is selected

### Navigation

- New sidebar item "Anforderungen" with a numeric badge showing pending incoming count
- Badge data: polled every 30s via TanStack Query with `refetchInterval`

### State Management

- `useQuery(['split-requests', 'incoming'])` / `useQuery(['split-requests', 'outgoing'])`
- `useMutation` for status changes → invalidates both queries on settle
- Search: `useQuery(['user-search', q], { enabled: q.length >= 2 })`

### Components

All built on existing Shadcn/UI primitives: `Card`, `Badge`, `Dialog`, `Command`, `Tabs`. No new UI libraries.

---

## File Structure

```
server/src/
  split-requests/
    routes.ts       -- Express router
    repo.ts         -- SQLite queries
    schema.ts       -- Zod schemas
  users/
    searchRoutes.ts -- GET /api/users/search

client/src/
  pages/
    RequestsPage.tsx
  components/
    split-requests/
      IncomingList.tsx
      OutgoingList.tsx
      ReceiptPreviewModal.tsx
      RequestCard.tsx
  hooks/
    useSplitRequests.ts
    useUserSearch.ts
```

---

## Migration

Added via `addColumnIfMissing` pattern (existing convention):

```typescript
// In runMigrations():
db.exec(`CREATE TABLE IF NOT EXISTS split_requests (...)`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_split_req_to ...`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_split_req_from ...`)
```

No existing tables are altered.
