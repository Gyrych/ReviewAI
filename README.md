# schematic-ai-review

Minimal local development skeleton with separated frontend and backend.

**中文说明**：see `README.zh.md` for a localized Chinese version.

## Structure

- `frontend/` — Vite + React + TypeScript + Tailwind minimal app (port 5173)
- `backend/` — Node.js + Express + TypeScript API (default port 3001)

## Install & Run

Start backend:

```bash
cd backend
npm install
# default runs on port 3001; to override use PORT env var
npm run dev
```

Start frontend (in a separate terminal):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and you should see the frontend fetching `/api/hello` (the frontend proxies to the same host; ensure backend is running on port 3001).

### Demo

1. Start backend: `cd backend && npm install && npm run dev`
2. Start frontend: `cd frontend && npm install && npm run dev`
3. Visit `http://localhost:5173` — the page will display the message returned from the backend.

