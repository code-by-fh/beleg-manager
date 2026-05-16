# Architecture Context

## Stack

| Layer      | Technology               | Role                                                |
| ---------- | ------------------------ | --------------------------------------------------- |
| Framework  | Vite + React             | Frontend UI framework for a responsive SPA          |
| Backend    | Node.js + Express        | REST API and background processing services         |
| Language   | TypeScript               | Type safety across the entire stack                 |
| UI         | Tailwind + Radix UI      | Modern, accessible styling and components           |
| Auth       | Passport.js (Google)     | Secure authentication via Google OAuth 2.0          |
| Database   | SQLite (better-sqlite3)  | Lightweight, file-based relational storage           |
| AI         | Google Gemini AI         | Automated metadata extraction from documents        |
| Ingestion  | Google Drive / Gmail API | Automated polling for new documents                 |

## System Boundaries

- `client/src/` — Frontend application logic, components, and state.
- `server/src/auth/` — User identity, OAuth flows, and session management.
- `server/src/db/` — Database schema, migrations, and low-level data access.
- `server/src/gemini/` — AI logic for parsing and extracting metadata.
- `server/src/receipts/` — Core domain logic for receipt lifecycle and management.
- `server/src/inbox/`, `gmail/`, `drive/` — Specialized ingestion services for different sources.

## Storage Model

- **SQLite (app.db)**: Stores metadata (receipts, users, settings, sessions), and tracking for polling states.
- **File Storage**: Local filesystem used for temporary uploads and long-term storage of PDF/Image files.
- **Client Cache**: TanStack Query (React Query) manages server-state caching on the frontend.

## Auth and Access Model

- **Authentication**: Users sign in via Google OAuth 2.0.
- **Sessions**: Persistent server-side sessions stored in SQLite via `connect-sqlite3`.
- **Background Access**: Google Refresh Tokens are securely stored to allow pollers to access user's Drive/Gmail data.
- **Access Control**: Mutations are restricted to authenticated users (and their own resources).

## Invariants

1. **Secrets Security**: API-Keys, Tokens, and Secrets must never be committed to source control (strictly use `.env`).
2. **Privacy First**: Sensitive personal or financial data must never be written to logs.
3. **Storage Separation**: Large binary artifacts (PDFs/Images) belong in file storage; only metadata and references belong in the database.
4. **Input Validation**: All external input from users or external APIs must be validated via Zod at the system boundary.
5. **Type Safety**: Avoid `any` throughout the project; use explicit TypeScript interfaces and types.

