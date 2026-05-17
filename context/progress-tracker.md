# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- UI/UX Refinement

## Current Goal

- Feature development

## Completed

- Relocated Account feature from Sidebar to Top Header dropdown.
- Implemented responsive account dropdown with user info, settings link, and logout.
- Refactored Dashboard into a premium "state-of-the-art" admin layout.
- Removed receipts table from the dashboard to focus on analytics.
- Implemented mobile-optimized "List/Card" view for the receipts page.
- Added user-configurable default view mode (Table vs. List) in settings.
- Implemented user-configurable start page after login.
- Implemented multi-tenant cross-user split requests with receipt proxy preview and user search.
- Implemented system health monitoring page at /monitoring with service health cards for Drive Inbox Poller, Gmail Poller, Telegram Bot, and Gemini AI Extraction.
- Implemented persistent ING CSV import with AES-256-GCM encryption, deduplication with detail feedback, monthly/date-range filtering, individual and range deletion, and removal of the "Abgleich abschließen" button.
- Unified Aufteilungen + Anforderungen into a single split_requests system: extended schema with nullable toUserId, freeName, receiptSqliteId; removed old Google-Sheets-based splits API; merged /splits and /requests nav items into one /requests page with two tabs (Meine Aufteilungen, Eingehend).
- Added image preview in PhotoUpload (client-side object URL for images, FileText icon for PDFs).
- Added manual-entry fallback for failed Drive inbox items (Manuell button → ReceiptForm → POST /api/drive/inbox/:fileId/confirm-manual).
- SplitDialog now supports both app-user search (debounced /api/users/search) and free-name entry; known persons shown as datalist suggestions.
- MyAufteilungenList shows outgoing split_requests grouped by receipt with bank-tx linking (SplitBankTxDialog).

## In Progress

- None.

## Next Up

- (open)

## Open Questions

- [Any unresolved product or technical decisions]

## Architecture Decisions

- Added `receipts_view_mode` and `start_page` to the `users` table to persist UI preferences across sessions/devices.
- Updated `/api/settings/ui` and `/api/auth/me` endpoints to include UI-specific user configurations.
- Added `split_requests` SQLite table for cross-user Aufteilungsanforderungen. Cross-user coordination is app-level, stored in SQLite not Google Sheets.
- `split_requests` extended: `to_user_id` nullable (supports free-name splits), `free_name TEXT`, `receipt_sqlite_id TEXT` added, `receipt_id` made nullable. Migration recreates the table in-place with a guard column check.
- `GET /api/split-requests/known-persons` returns a deduplicated list of all free names previously used by the requesting user.
- `POST /api/drive/inbox/:fileId/confirm-manual` archives the Drive file, appends a receipt row to Google Sheets, and marks the file confirmed.
- `/splits` route removed; old `splitsApi` (Google Sheets) and `SplitRow` type deleted. Redirect /splits → /requests.
- `SplitStatus` type removed from client types (replaced by `SplitRequestStatus` in splitRequests API types).
- Receipt previews served via server-side proxy using from_user's refresh token — to_user never gets direct Drive access.
- User search endpoint (`GET /api/users/search`) returns only `{id, name, email}` — no internal fields ever exposed.
- Drive File ID is extracted from `ReceiptRow.driveLink` URL on the client side (`/file/d/{id}` pattern).
- `service_health` SQLite table tracks last-run status per service (upsert by `service_name`). Each service (Drive Inbox Poller, Gmail Poller, Telegram Bot, Gemini) writes health after every run/call. Frontend polls `GET /api/monitoring/health` every 30s via TanStack Query.
- Fixed pre-existing TypeScript error: `trinkgeld` was missing from `ExtractionZ` schema in `gemini/schema.ts`.
- `bank_transactions` `haendler` and `verwendungszweck` fields are now AES-256-GCM encrypted at rest (key via `BANK_ENCRYPTION_KEY` env var; graceful plaintext fallback when key is absent for dev).
- App-layer dedup in `getDeduplicateKeys()` decrypts existing haendler values in-memory to build a comparison Set before each import (DB unique index retained as race-condition guard).
- Client-side filtering in Kontoabgleich via `useMemo`; single API query fetches all transactions, month dropdown and date range filter computed locally.

## Session Notes

- [Context needed to resume work in the next session]
