# schematic-ai-review

Local skeleton for AI-assisted schematic review: images → structured circuit JSON → Markdown review, with SVG overlay for human-in-the-loop verification.

For Chinese documentation, see `README.zh.md`.

## Critical requirement

Provide system prompts in the `ReviewAIPrompt/` directory (preferred) or at the repository root for compatibility:

- **Preferred**: `./ReviewAIPrompt/系统提示词.md` (Chinese) and `./ReviewAIPrompt/SystemPrompt.md` (English)
- **Fallback (backward compatible)**: `./系统提示词.md` and `./SystemPrompt.md` at repository root

The backend serves them via `GET /api/system-prompt?lang=zh|en`. It will first attempt to read from `ReviewAIPrompt/` and fall back to the repository root for compatibility.

- If neither location contains the requested language file, the endpoint returns 404. The frontend will display a non-blocking warning (“running without a system prompt”) but still allows normal conversation with the model.

If you prefer a ready-to-use version of this system prompt, contact the author for a paid copy: `gyrych@gmail.com`

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
  - `CONSOLIDATION_TIMEOUT_MS`（可选）：整合多轮识别结果的超时时间，单位为毫秒，默认 1800000（30 分钟）。在资源受限或高并发环境请谨慎增大。
  - `ENABLE_PARAM_ENRICH`（可选）：是否对每个组件参数逐项进行网络补充（默认 false）。推荐仅在必要时开启；一般场景可关闭以节省网络和降低噪声。
  - `FETCH_RETRIES`, `KEEP_ALIVE_MSECS`
  - `SEARCH_PROVIDER` (`duckduckgo` | `bing`), `BING_API_KEY` (when using Bing)
  - `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE` (for OpenRouter best practices)

## API summary

- `GET /api/system-prompt?lang=zh|en` — returns the content of the root system prompt file for the requested language. 404 if that language file is missing.
- `POST /api/review` — accepts images (multipart) or `enrichedJson`, plus `model`, `apiUrl`, optional `systemPrompts` JSON `{ systemPrompt, requirements, specs }`, and `history`. Returns `{ markdown, enrichedJson, overlay, metadata, timeline }`. If low-confidence nets are detected, responds with HTTP 422 but still includes the payload for manual verification.
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
