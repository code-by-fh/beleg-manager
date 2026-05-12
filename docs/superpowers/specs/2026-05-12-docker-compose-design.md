# Docker Compose – Dev-Modus Design

**Datum:** 2026-05-12  
**Status:** Genehmigt

## Ziel

Beide Apps (Server + Client) mit einem einzigen `docker compose up` im Dev-Modus starten, ohne nginx.

## Architektur

Zwei Services in einem gemeinsamen Docker-Netzwerk:

| Service  | Image           | Port | Befehl              |
|----------|-----------------|------|---------------------|
| `server` | node:20-alpine  | 3000 | `npm run dev:server` |
| `client` | node:20-alpine  | 5173 | `npm run dev:client` |

## Services

### server

- Mountet `./server/src` und `./server/package.json` in den Container
- `node_modules` bleiben im Container (anonymes Volume), nicht auf dem Host überschrieben
- SQLite-DB in `./server/data/` wird als Named Volume persistiert
- Liest `.env` aus dem Projekt-Root

### client

- Mountet `./client/src` und `./client` in den Container
- `node_modules` bleiben im Container (anonymes Volume)
- Env-Variable `SERVER_URL=http://server:3000` damit Vite den Proxy korrekt zum Server-Container routet

## Änderung an vite.config.ts

Der Proxy-Target wird aus `process.env.SERVER_URL` gelesen (Fallback: `http://localhost:3000`):

```ts
proxy: {
  "/api": process.env.SERVER_URL ?? "http://localhost:3000",
},
```

Damit funktioniert lokale Entwicklung ohne Docker unverändert.

## Volumes

- `server_data` (Named Volume): persistiert `server/data/app.db`
- Anonyme Volumes für `node_modules` beider Services

## Env-Variablen

docker-compose lädt die vorhandene `.env`-Datei – kein zweiter Konfigurationsort.
