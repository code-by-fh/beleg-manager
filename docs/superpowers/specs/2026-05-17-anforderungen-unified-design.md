# Design: Anforderungen & Aufteilungen (Unified)

**Date:** 2026-05-17  
**Status:** Approved

---

## Overview

Eight improvements and bug fixes to the Beleg-Manager app:

1. Image preview on photo upload
2. Failed receipts: removed from queue, marked for manual re-processing
3. Person name suggestions in split dialog (from previous splits)
4. Split dialog enhanced with app-user search + free name entry
5. A split is always an "Anforderung" — stored in `split_requests`
6. Merge `/splits` and `/requests` nav items into one `/requests` page
7. Unified data model: Aufteilung = Anforderung
8. Any user can file a request against any other user (already exists, retained)

---

## 1. Foto-Vorschau beim Upload

**Component:** `client/src/components/upload/PhotoUpload.tsx`

- When a file is selected and is an image (jpg/png/webp): render `<img src={URL.createObjectURL(file)}>` below the dropzone with `max-h-48 object-contain rounded-lg`
- When a file is a PDF: show a document icon + filename (no browser PDF embed)
- Use `useEffect` cleanup to revoke the object URL on file change or unmount

---

## 2. Failed Receipts from Queue

**Problem:** When a direct photo upload fails Gemini extraction, only a toast is shown. The file sits in limbo — not in review, not accessible.

**Server changes:**
- New DB table `failed_receipts` with columns: `id`, `user_id`, `filename`, `filepath`, `error`, `type` (`upload` | `voice` already in `failed_voice_jobs`), `created_at`
- In `server/src/receipts/routes.ts` upload handler: on Gemini extraction failure, insert into `failed_receipts` instead of letting the error surface as a bare HTTP error
- `GET /api/receipts/failed` — returns all failed receipts for the current user
- `POST /api/receipts/failed/:id/retry` — re-runs Gemini extraction on the stored file; on success removes the failed entry and redirects to review flow; on failure updates error text

**Frontend changes:**
- `client/src/components/receipts/FailedReceiptsSection.tsx` gets a third entry type "Foto-Upload" alongside voice and Drive failures
- Hook `useFailedUploads` (mirrors `useFailedVoiceJobs`) queries `/api/receipts/failed`
- The failed count badge on `/receipts` nav item includes all three failure types

---

## 3. Person Name Suggestions

**Status:** Already implemented (HTML `<datalist>` in `SplitDialog.tsx` with `knownPersons` prop).

**Change after unification:** `knownPersons` will be derived from `split_requests.free_name` (not from the old `splits` table). The `ReceiptsPage` query that assembles `knownPersons` is updated to read from the new endpoint.

---

## 4. Split Dialog — User Search + Free Name

**Component:** `client/src/components/receipts/SplitDialog.tsx`

Replace the plain `<Input list="...">` for person name with an enhanced picker:

- Debounced search input (triggers at ≥2 chars) using the existing `useUserSearch` hook
- Dropdown shows two sections:
  - **App-Nutzer** (from user search API) — displayed with name + email
  - **Als freien Namen verwenden: „{input}"** — always shown when input ≥1 char
- Selecting an app user sets `toUserId`, clears `freeName`
- Selecting "freier Name" sets `freeName`, clears `toUserId`
- Selected state shown as a chip with "×" to reset
- `knownPersons` suggestions remain available via datalist as a fallback for the free-name input

---

## 5–7. Unified Data Model: Aufteilung = Anforderung

### Database

**Schema change to `split_requests` table:**

```sql
ALTER TABLE split_requests ADD COLUMN free_name TEXT;
ALTER TABLE split_requests ADD COLUMN receipt_sqlite_id TEXT REFERENCES receipts(id);
```

`to_user_id` becomes nullable (SQLite: handled via migration that recreates the table).

**Remove `splits` table:** Existing `splits` rows are migrated into `split_requests` with:
- `from_user_id` = owner of the receipt
- `to_user_id` = NULL
- `free_name` = `splits.person`
- `receipt_sqlite_id` = `splits.receipt_id`
- `betrag` = `splits.betrag`
- `status` = `splits.status` mapped to the existing request status enum

### API

**Existing `/api/splits` endpoints** (`server/src/splits/routes.ts`) are removed. Callers migrate to `/api/split-requests`.

**`POST /api/split-requests`** extended:
- Accepts `toUserId` (optional) OR `freeName` (optional, ≥1 char) — one must be present
- Accepts `receiptSqliteId` (optional) for app-side receipts
- `receiptId` (Drive file ID) becomes optional when `receiptSqliteId` is provided

**`GET /api/split-requests?direction=outgoing`** — returns all requests created by the current user (replaces the old `/api/splits` list). Groups are assembled client-side by `receiptSqliteId` or `receiptId`.

### Frontend

**Remove:** `client/src/pages/Splits.tsx`, `client/src/api/splits.ts` (or keep minimal for migration compat)

**Update `App.tsx`:** Remove `/splits` route; keep `/requests`

**Update `AppShell.tsx`:** Remove "Aufteilungen" nav item; `/requests` label becomes "Anforderungen"

**Update `client/src/pages/Requests.tsx`:** Restructure into two tabs:

- **Tab "Meine Aufteilungen":** All `split_requests` where `from_user_id = me`, grouped by `receipt_sqlite_id` / `receiptId`. Free-name entries shown identically to app-user entries (person chip, amount, status dropdown). Bank reconciliation link (`Link2` button) retained for free-name entries.
- **Tab "Eingehend (N)":** Unchanged from current `IncomingList` — requests from others to me.

The "Neue Anforderung" button (`CreateRequestDialog`) is retained on the page.

### Status Mapping

Old `splits.status` → `split_requests.status`:
- `offen` → `pending`
- `angefordert` → `pending` (was manual label, now real request)
- `unterwegs` → `accepted`
- `ohne_verrechnung` → `cancelled`
- `ausgeglichen` (derived from bank link) → remains derived client-side from `linked_bank_tx_id`

---

## Routing

| Old | New |
|-----|-----|
| `/splits` | removed |
| `/requests` | remains, contains both tabs |

---

## Migration Safety

- Migration runs inside `db/migrations.ts` in a transaction
- Old `splits` data is inserted into `split_requests` before the table is dropped
- `to_user_id` constraint relaxed to nullable in the same migration

---

## Out of Scope

- Email/push notifications when a split_request is sent to an app user (existing behavior retained)
- Bank reconciliation UI changes beyond what's needed for the status dropdown update
- Mobile nav restructuring beyond removing the "Aufteilungen" entry from `moreItems`
