# Beleg-Manager

Receipts, invoices and vouchers — captured by photo, voice or Google-Drive inbox, extracted via Gemini, archived in your Google Drive, and persisted to a Google Sheet.

## Setup

### 1. Google Cloud project

1. Open https://console.cloud.google.com/ and create a new project.
2. Under **APIs & Services → Library**, enable:
   - Google Drive API
   - Google Sheets API
3. Under **APIs & Services → OAuth consent screen**, configure an external/testing app. Add test users (the Google accounts that will sign in during development).
4. Under **APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** of type "Web application":
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
5. Note the Client ID and Client Secret.

### 2. Gemini API key

Create one at https://aistudio.google.com/app/apikey.

### 3. `.env`

```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GEMINI_API_KEY, SESSION_SECRET (32+ chars)
```

### 4. Install + run

```bash
npm install
npm run dev
```

Server: http://localhost:3000 — Client: http://localhost:5173

## Production build

```bash
npm run build
NODE_ENV=production node server/dist/server.js
```

The Express server then serves the built React app from `client/dist`.

## How it works

- **First login** auto-creates `My Drive/Beleg-Manager/{Inbox,Archive}` and a Google Sheet `belege`.
- **Photo upload / camera capture** → Gemini extracts fields → review screen → file archived into `Archive/YYYY/MM/`, row appended to the Sheet.
- **Voice input** → Web Speech API transcribes (de-DE) → Gemini extracts fields → review screen → row appended (no file to archive).
- **Drive inbox** → place a file in `Beleg-Manager/Inbox/`. Either wait up to 5 min for the auto-poller, or open the Drive-Inbox tab and import manually. Confirmed files move to the archive.
