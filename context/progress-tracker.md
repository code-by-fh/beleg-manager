# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- UI/UX Refinement

## Current Goal

- Feature development

## Completed

- Share-Links für Anforderungen: öffentliche /share/:token-Seite, Drive-Freigabe per E-Mail, Gmail-Versand über Owner-Account, 20-Tage-Ablauf, timing-safe Token-Lookup.
- Implemented Google Drive Archiv tab on Receipts page: collapsible YYYY/MM folder tree in sidebar, file list with on-demand loading per month, side-panel preview (desktop) and modal preview (mobile).
- Implemented robust error tracking and premium visual error descriptions for failed Google Drive inbox receipts.
  - **Clean Error Formatting:** Created a `cleanErrorMessage` utility in `server/src/gemini/errors.ts` to clean up complex Gemini/Google API failures (such as the `429 Too Many Requests` quota exceeded message or network timeouts) into elegant, short, user-friendly German summaries that fit perfectly within Google Drive's private `appProperties` constraints.
  - **Propagating Failures:** Updated `generateAndParse` in `server/src/gemini/extract.ts` to throw errors instead of swallowing them and returning a silent empty extraction, ensuring callers can properly react to API failures.
  - **Auto Poller & Manual Import Logging:** Integrated `cleanErrorMessage` in the background `inbox/poller.ts` and in `server/src/drive/routes.ts` `/import/:fileId` routes to gracefully log and record the exact cleaned error text in `bm_error` when processing fails, and to clear any pre-existing error messages upon a successful manual or automatic retry.
  - **Exposing Errors via API:** Extended the `GET /api/drive/inbox` endpoint to return the stored `bm_error` as `error` in the file object.
  - **Interactive Failure Display:** Updated the client-side `DriveInboxFile` type definition and modified the `FailedReceiptsSection.tsx` component to dynamically render the exact, descriptive error details directly under the failed receipt items, giving the user immediate, helpful feedback.
  - **Failed Receipt Document Preview:** Enhanced `FailedReceiptsSection.tsx` so that clicking on a failed Google Drive receipt item (file name, icon, or error details) triggers a premium, animated modal `<Dialog>` displaying a high-fidelity visual preview of the document (image or PDF iframe) along with a link to open in a new tab, matching the main review workspace and providing maximum convenience.
- Resolved a critical UI refresh gap where manually uploading a photo and clicking "Erfassen" (Capture) did not update the "Drive-Eingang" queue without a manual browser refresh. Added instant invalidation of the `["drive", "inbox"]` TanStack Query cache upon photo upload success inside `UnifiedInput.tsx`, ensuring the uploaded receipt immediately appears in the inbox list for review.
  - **Visual Previews & Direct Deletion in Capture Workspace:** Extended the "Belege Eingang (Drive)" queue on the main capture card inside `UnifiedInput.tsx` to support the exact same premium visual preview `<Dialog>` (image/PDF streaming) and instant direct file deletion (discard modal calling `driveApi.deleteInboxFile(f.id)` and invalidating the cache), providing a highly consistent, seamless workspace.
- Reduced the background inbox poller intervals (both Drive and Gmail) from 5 minutes to 5 seconds (`*/5 * * * * *`). This ensures a super rapid, near-instantaneous capture of incoming receipts for the DMS inbox.
- Implemented an automatic and manual queue removal for duplicate items. 
  - **Poller Automatic Removal:** Updated the background `poller.ts` so that if it detects a duplicate, it logs the detection and immediately sets the Drive file's status to `"confirmed"`, effectively and gracefully removing the file from the Drive Inbox queue without throwing a fatal error and leaving it stuck.
  - **Review Page Discard Capability:** Added a prominent, dedicated red outlined `"Beleg verwerfen (aus Warteschlange löschen)"` button on `ReviewPage.tsx` next to the form. It triggers a premium React-based confirmation modal built using the existing shadcn `<Dialog>` components (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`) instead of native browser popups. Upon confirmation, it calls the newly added `DELETE /api/receipts/pending/:pendingId` endpoint (which deletes the pending session, resolves the Google Drive file status to `"confirmed"`, and safely clears it from the queue without checking sheets for non-existent saved rows), returning the user to the main page.
  - **Failed Drawer Discard Capability:** Implemented a `DELETE /api/drive/inbox/:fileId` backend endpoint and integrated it on the frontend `driveApi.deleteInboxFile`. We added a trash/discard icon-button for failed Drive files directly in the `FailedReceiptsSection.tsx` list drawer. Furthermore, if the user opens a failed file manually via `ManualEntryDialog` and it's a duplicate, a large red discard button is rendered below the warning box so the user can wipe the duplicate item out of the queue right inside the dialog. Both paths trigger a unified premium confirmation `<Dialog>` modal to safely discard the Drive inbox file.
  - **Query Cache Invalidation Fix (Instant Counter Updates):** Resolved a critical cache mismatch bug where all mutations and deletes in `FailedReceiptsSection.tsx`, `Review.tsx`, and `UnifiedInput.tsx` were calling `qc.invalidateQueries({ queryKey: ["driveInbox"] })`. However, the core query in `useDriveInbox.ts` uses the `["drive", "inbox"]` queryKey. By standardizing this invalidation key to `["drive", "inbox"]` across all files, the UI and Bento-box counters are now instantly updated upon import, confirmation, manual save, or discard, eliminating the need for a browser refresh.
- Implemented a strict backend-and-frontend duplicate check. We introduced a centralized `checkDuplicateRow` helper in `server/src/google/sheets.ts`. We integrated this strict check to return a `409 Conflict` inside server routes (`/confirm`, `/voice`, `/retry-voice/:jobId`, and `/inbox/:fileId/confirm-manual`), and also inside the background inbox poller so that duplicates fail with a descriptive "Duplikat erkannt" error message in Google Drive. On the frontend, we updated `ReceiptForm` to watch inputs and report changes dynamically, enabling both `ReviewPage` and `ManualEntryDialog` to run dynamic, debounced duplicate checks, display a prominent red blocking duplicate warning banner, and disable the save button if a duplicate exists.
- Fixed a critical navigation bug in the Bento-style `UnifiedInput` dashboard component. Clicking "Start" or "Review" on a Drive inbox item successfully processed/analyzed the file via `POST /import/:fileId` on the backend, but the frontend did not navigate to the `/review` page (due to a missing `useNavigate` import and call). It instead showed a misleading toast ("Beleg importiert") without writing the receipt to Google Sheets or archiving it. It now correctly triggers extraction and redirects the user to the review page.
- Fixed a critical issue where manually confirming a Google Drive inbox receipt failed to mark the Google Drive file status as "confirmed" (leaving it in "pending_review" in the inbox view), and where session token expiration (after 1 hour) caused Google API calls in manual routes to fail. All Google API interactions in receipts routes now use the robust database refresh token (`user.refreshToken`), matching the behavior of the automatic poller and ensuring manual actions never expire.
- Fixed a failing test in `test/gemini-schema.test.ts` by adding `trinkgeld: null` to the complete extraction test case.
- Fixed dashboard routing lock when a custom start page is configured. Introduced a dedicated `/dashboard` route and updated `RootRedirect` to handle initial routing dynamically while allowing explicit dashboard navigation.
- Optimized /requests page layout, tabs, and split-request cards for full mobile responsiveness, including card layout transformations and elegant touch-friendly button configurations.
- Integrated a pending requests count notification badge into the mobile navigation overlay.
- Added access to the "Aufteilungen" (/requests) view in the mobile bottom "Mehr" (More) navigation menu, resolving a critical mobile UX gap.
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
- Implemented a premium document preview component on the receipt review screen ([ReviewPage.tsx](file:///c:/Development/beleg-manager/client/src/pages/Review.tsx)), pre-upload card ([UnifiedInput.tsx](file:///c:/Development/beleg-manager/client/src/components/upload/UnifiedInput.tsx)), and manual correction dialog ([FailedReceiptsSection.tsx](file:///c:/Development/beleg-manager/client/src/components/receipts/FailedReceiptsSection.tsx)).
  - Added backend routes `GET /api/receipts/pending/:id/preview` and `GET /api/drive/inbox/:fileId/preview` to serve binary content (images and PDFs) of both pending receipts and Drive inbox items securely.
  - Extended the `GET /api/receipts/pending/:id` and `POST /api/drive/import/:fileId` routes to return the `mimeType` of the pending file.
  - Integrated a live client-side image preview (`URL.createObjectURL`) inside [UnifiedInput.tsx](file:///c:/Development/beleg-manager/client/src/components/upload/UnifiedInput.tsx) so that users can instantly see their selected image before uploading/processing it.
  - Refactored [ReviewPage.tsx](file:///c:/Development/beleg-manager/client/src/pages/Review.tsx) with a responsive two-column grid on desktop/tablet layout, displaying a sticky document preview (image or inline PDF) on the left/right, and the review form on the other side. This enables users to easily check and correct data fields while looking directly at the original receipt! On mobile viewports, the preview smoothly stacks above the form.
  - Enhanced the `ManualEntryDialog` in [FailedReceiptsSection.tsx](file:///c:/Development/beleg-manager/client/src/components/receipts/FailedReceiptsSection.tsx) to render a side-by-side split-column workspace with a live preview of the failed file and the manual corrections form.
  - Added direct links to open the original image/PDF preview in a new browser tab for ease of access and zoom.

## In Progress

- None.

## Next Up

- (open)

## Open Questions

- [Any unresolved product or technical decisions]

## Architecture Decisions

- Moved the Dashboard rendering from `/` (inline) to a dedicated `/dashboard` route, converting `/` into a pure redirection route (`RootRedirect`) that maps both `/` and `/dashboard` start page settings to `/dashboard`, avoiding infinite redirection loops.
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
