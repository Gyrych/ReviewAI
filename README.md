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
- Web search enrichment for ambiguous parameters (DuckDuckGo by default)
- Local session save/load (files as base64, JSON, overlay) without persisting secrets
- File-based logging for diagnostics

## Recent updates

- 2025-09-30: Added multi-turn dialog mode for single-agent schematic review. Key changes:
  - Backend `DirectReviewUseCase` now accepts and merges `history` into LLM messages and supports `enableSearch` to include web search summaries in LLM context.
  - Frontend `ReviewForm` now supports multi-round submissions, preserves history, allows abort/resume, and can export final Markdown as a `.doc` file. `FileUpload` max files increased to 20.

## Architecture (updated)

- `frontend/` — Vite + React + TypeScript + Tailwind (dev port 3000).
- `services/circuit-agent/` — Standalone backend microservice (default port 4001). All APIs are under `/api/v1/circuit-agent/*`.
- `backend/` — Deprecated. Legacy endpoints have been removed. Use the sub-service instead.

## Quick start (new service)

Prerequisites: Node.js >= 18

1. Circuit Agent Service

```
cd services/circuit-agent
npm install
# default: 4001 (override with PORT)
npm run dev
```

2. Frontend (separate terminal)

```
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000 (development). Frontend calls the sub-service at `/api/v1/circuit-agent/*`.

Windows one-click: run `start-all.bat` at repo root (or `node start-all.js`).

## Configuration

- System prompt: see `ReviewAIPrompt/` (required). Root fallbacks for system prompt only.
- Upstream models: OpenRouter endpoints (recommended). The service forwards to OpenRouter with your Authorization header.
- Environment variables (service): see `services/circuit-agent/.env.example`
  - `PORT`, `OPENROUTER_BASE`, `REDIS_URL`
  - `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `FETCH_RETRIES`, `KEEP_ALIVE_MSECS`
  - `STORAGE_ROOT`

## API summary (sub-service)

Base path: `/api/v1/circuit-agent`

- Health: `GET /health`
- Progress: `GET /progress/:id`
- Artifacts (static): `GET /artifacts/:filename`
- Logo (static): `GET /logo/*`
- System prompt: `GET /system-prompt?lang=zh|en`
- Orchestrate review: `POST /orchestrate/review` (multipart) — switches between direct and structured modes by `directReview` flag
- Structured recognize: `POST /modes/structured/recognize` (multipart)
- Structured multi-model review: `POST /modes/structured/review` (json)
- Final aggregation (gpt-5): `POST /modes/structured/aggregate` (multipart)
- Sessions: `POST /sessions/save`, `GET /sessions/list`, `GET /sessions/:id`, `DELETE /sessions/:id`

Note: OCR functionality has been removed. If OCR is required, perform it externally before submitting inputs.

## Troubleshooting

- Missing system prompt file: ensure required files in `ReviewAIPrompt/` exist and are non-empty.
- Upstream HTML/404 errors: verify endpoint paths and model names (e.g., OpenRouter `/api/v1/chat/completions`).
- Port conflicts: frontend 3000, sub-service 4001.
- HTTP 422 in structured review: indicates low confidence or conflicts.

## Security & privacy

The app avoids persisting secrets in sessions and omits sensitive headers from logs. Intended primarily for local development.

## License

Add a suitable license if this repository is to be shared or published.
