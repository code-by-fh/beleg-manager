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
- Receipt previews served via server-side proxy using from_user's refresh token — to_user never gets direct Drive access.
- User search endpoint (`GET /api/users/search`) returns only `{id, name, email}` — no internal fields ever exposed.
- Drive File ID is extracted from `ReceiptRow.driveLink` URL on the client side (`/file/d/{id}` pattern).
- `service_health` SQLite table tracks last-run status per service (upsert by `service_name`). Each service (Drive Inbox Poller, Gmail Poller, Telegram Bot, Gemini) writes health after every run/call. Frontend polls `GET /api/monitoring/health` every 30s via TanStack Query.
- Fixed pre-existing TypeScript error: `trinkgeld` was missing from `ExtractionZ` schema in `gemini/schema.ts`.

## Session Notes

- [Context needed to resume work in the next session]
