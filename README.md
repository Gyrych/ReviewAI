# schematic-ai-review

Local skeleton for AI-assisted schematic review: images → structured circuit JSON → Markdown review, with SVG overlay for human-in-the-loop verification.

For Chinese documentation, see `README.zh.md`.

## Critical requirement

Provide system prompts and per-pass vision prompts in the `ReviewAIPrompt/` directory (preferred). These prompt files are required at runtime; the backend will throw an Error and fail fast if any required file is missing or empty.

Required files (must exist and be non-empty):

- `ReviewAIPrompt/系统提示词.md` (Chinese) — system-level prompt (fallback supported at repo root)
- `ReviewAIPrompt/SystemPrompt.md` (English) — system-level prompt (fallback supported at repo root)
- `ReviewAIPrompt/single_pass_vision_prompt.md` — general single-pass vision prompt
- `ReviewAIPrompt/macro_prompt.md` — macro pass (pass=1)
- `ReviewAIPrompt/ic_prompt.md` — IC specialized pass (pass=2)
- `ReviewAIPrompt/rc_prompt.md` — Resistor & Capacitor pass (pass=3)
- `ReviewAIPrompt/net_prompt.md` — Net-tracing pass (pass=4)
- `ReviewAIPrompt/verify_prompt.md` — Verification pass (pass=5)
- `ReviewAIPrompt/consolidation_prompt.md` — Consolidation prompt used by the backend merger

Backward compatibility: the backend will still fall back to root-level `系统提示词.md` / `SystemPrompt.md` only for the system prompt endpoints; specialized vision prompts must be present in `ReviewAIPrompt/`.

If you prefer a ready-to-use system prompt, contact the author for a paid copy: `gyrych@gmail.com`

## Features

- Circuit extraction from images into structured JSON following `backend/schemas/circuit-schema.json`
- SVG overlay + mapping to highlight components, pins, and nets for manual review
- LLM-powered Markdown review with timeline, requirements/specs, history, and system prompts
- Web search enrichment for ambiguous parameters (DuckDuckGo by default, optional Bing)
- Local session save/load (files as base64, JSON, overlay) without persisting secrets
- File-based logging for diagnostics

## Architecture

- `frontend/` — Vite + React + TypeScript + Tailwind (dev port 3000). Proxies `/api` to the backend.
- `backend/` — Node.js + Express + TypeScript (default port 3001). Exposes review, system prompt, sessions, and logs APIs.

## Quick start

Prerequisites: Node.js >= 18

1. Backend

```bash
cd backend
npm install
# default: 3001 (override with PORT)
npm run dev
```

1. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) (development). The dev server proxies `/api` to [http://localhost:3001](http://localhost:3001).

Windows one-click: run `start-all.bat` at repo root (or `node start-all.js`).

## Configuration

- System prompt: root-level `系统提示词.md` (required). For a paid, prewritten copy email: `gyrych@gmail.com`
- Upstream models: DeepSeek, OpenRouter, or custom API endpoints. Choose in the UI or input custom API/model; the backend routes accordingly.
 - Environment variables (optional):
  - `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `DEEPSEEK_TIMEOUT_MS`
  - `CONSOLIDATION_TIMEOUT_MS` (optional): timeout for consolidating multi-pass recognition results, in milliseconds; default 1800000 (30 minutes). Be cautious increasing in resource-constrained or high-concurrency environments.
  - `ENABLE_PARAM_ENRICH` (optional): whether to perform per-parameter web enrichment (default false). Recommended to keep off in common scenarios to reduce noise and network usage.
  - `FETCH_RETRIES`, `KEEP_ALIVE_MSECS`
  - `SEARCH_PROVIDER` (`duckduckgo` | `bing`), `BING_API_KEY` (when using Bing)
  - `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE` (for OpenRouter best practices)

## API summary

- `GET /api/system-prompt?lang=zh|en` — returns the content of the root system prompt file for the requested language. 404 if that language file is missing.
- `POST /api/review` — accepts images (multipart) or `enrichedJson`, plus `model`, `apiUrl`, optional `systemPrompts` JSON `{ systemPrompt, requirements, specs }`, and `history`. Returns `{ markdown, enrichedJson, overlay, metadata, timeline }`. If low-confidence nets are detected, responds with HTTP 422 but still includes the payload for manual verification.

Note: OCR functionality (previously provided via tesseract.js) has been removed from this project. The visual pipeline no longer performs OCR-based text extraction. If your workflows rely on OCR text (e.g., labeled components in images), consider adding an external OCR step before submitting images to the `/api/review` endpoint or re-integrating an OCR service.
- Sessions: `POST /api/sessions/save`, `GET /api/sessions/list`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`
- Logs (local dev): `GET /api/logs`
- DeepSeek test: `POST /api/deepseek`

## Troubleshooting

- Missing system prompt file: create `系统提示词.md` at repo root (or email `gyrych@gmail.com` for a paid copy). Otherwise `/api/system-prompt` is 404.
- Upstream HTML/404 errors: verify endpoint paths and model names (e.g., OpenRouter `.../api/v1/chat/completions`). The backend surfaces friendly messages.
- Port conflicts: frontend 3000, backend 3001. Update ports and the proxy config in `frontend/vite.config.ts` if you change them.
- HTTP 422 on review: indicates low confidence or conflicts; use the overlay and JSON to manually verify and resubmit.

## Security & privacy

The app avoids persisting secrets in sessions and omits sensitive headers from logs. Intended primarily for local development.

## License

Add a suitable license if this repository is to be shared or published.
