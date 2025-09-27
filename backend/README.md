# Backend

Backend service for `schematic-ai-review` (Node.js + Express + TypeScript). It accepts images of circuits, extracts a structured JSON, and orchestrates an LLM to produce a Markdown review. It also manages sessions and exposes logs for local debugging.

For Chinese documentation, see `backend/README.zh.md`.

## Critical requirement

Provide system prompts in the `ReviewAIPrompt/` directory (preferred) or at the repository root for compatibility:

- **Preferred**: `./ReviewAIPrompt/系统提示词.md` (Chinese) and `./ReviewAIPrompt/SystemPrompt.md` (English)
- **Fallback (backward compatible)**: `./系统提示词.md` and `./SystemPrompt.md` at repository root

The endpoint `GET /api/system-prompt?lang=zh|en` reads the requested language file. The backend will first attempt to read from `ReviewAIPrompt/` and fall back to the repository root. If the target language file is missing in both locations, the endpoint returns 404. The frontend will surface a non-blocking warning and still allow normal conversation.

Need a ready-to-use system prompt? Contact the author for a paid copy: gyrych@gmail.com

## Run locally

Prerequisites: Node.js >= 18

```bash
cd backend
npm install
# default port: 3001 (override with PORT)
npm run dev
```

Default base URL: `http://localhost:3001`

## Endpoints (summary)

- `GET /api/health` — health check
- `GET /api/hello` — sample endpoint
- `GET /api/system-prompt` — reads root `系统提示词.md`
- `POST /api/review` — main review pipeline (images → JSON → Markdown)
- `POST /api/sessions/save` — persist a session snapshot (no secrets)
- `GET /api/sessions/list` — list recent sessions
- `GET /api/sessions/:id` — load a session
- `DELETE /api/sessions/:id` — delete a session
- `POST /api/deepseek` — simple DeepSeek text dialog pass-through
- `GET /api/logs` — return recent log lines (local debug)

## POST /api/review (details)

Request body (multipart when sending images, otherwise x-www-form-urlencoded or JSON is fine):

- `apiUrl` (string, required): upstream model API endpoint or base URL
- `model` (string, required): upstream model name
- `files` (image/*, optional): one or more images to analyze; if omitted, provide `enrichedJson`
- `enrichedJson` (string|object, optional): previously extracted circuit JSON to skip image processing
- `systemPrompts` (stringified JSON, optional): `{ systemPrompt, requirements, specs }`
- `requirements` (string, optional): additional design requirements
- `specs` (string, optional): additional design specs
- `history` (stringified JSON array, optional): prior conversation turns
- `enableSearch` (boolean/string, optional, default true): enable web enrichment for ambiguous params
- `searchTopN` (number, optional): top-N search results per ambiguous parameter
- `saveEnriched` (boolean/string, optional, default true): save enriched JSON under `uploads/`
- `recognitionPasses` (number/string, optional): **Deprecated** — the backend now enforces a fixed 5-step recognition pipeline (macro, IC, RC, net-trace, validation). If provided by clients it will be ignored and logged; the server will always run 5 passes.

Provider routing:

- If `provider=deepseek` or `apiUrl`/`model` contains `deepseek`, the backend forwards a text-only dialog (`POST /api/deepseek` logic). Images are rejected for `deepseek`.
- Otherwise, the backend performs vision extraction (OpenRouter-compatible JSON multimodal or multipart) and then calls the LLM to create a Markdown review.

Response (JSON):

- `markdown` (string): the review in Markdown
- `enrichedJson` (object): structured circuit JSON
- `overlay` (object, optional): `{ svg, mapping }` for UI highlighting
- `metadata` (object, optional): `{ model_version, inference_time_ms, warnings, ... }`
- `timeline` (array): `{ step, ts }[]` timing info for UI progress

Low confidence behavior:

- If low-confidence nets are detected, the server returns HTTP 422 and still includes the full JSON/overlay for manual verification. The client should display and guide the user to review.

## Directories

- `backend/uploads/` — enriched JSON and artifacts (optionally saved)
- `backend/sessions/` — saved session snapshots as JSON files
- `backend/logs/` — file-based logs (see `app.log`)
- `backend/schemas/` — JSON Schema for circuit extraction

## Environment variables (optional)

- `PORT` (default 3001)
- `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `DEEPSEEK_TIMEOUT_MS` (default 1800000)
- `FETCH_RETRIES` (default 1), `KEEP_ALIVE_MSECS` (default 60000)
- `SEARCH_PROVIDER` (`duckduckgo` | `bing`), `SEARCH_TOPN`, `BING_API_KEY`
- `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE` (OpenRouter best practices)

## Security & privacy

- Session save explicitly removes secrets (e.g., API keys, Authorization headers)
- Logs avoid storing sensitive headers
- Uploaded temp files are cleaned up after responses when possible

## Notes

- See `docs/circuit_schema.md` and `docs/overlay_spec.md` for format details.
- `backend/test/validate_parser_test.js` can be used for lightweight schema checks on example data.

