# Frontend

Vite + React + TypeScript + Tailwind UI for `schematic-ai-review`. It connects to the backend for circuit extraction and Markdown review, and renders an SVG overlay for human-in-the-loop verification.

For Chinese documentation, see `frontend/README.zh.md`.

## Critical requirement

Provide system prompts in the `schematic-ai-review-prompt/` directory (preferred) or at the repository root for compatibility:

- **Preferred**: `./schematic-ai-review-prompt/系统提示词.md` (Chinese) and `./schematic-ai-review-prompt/SystemPrompt.md` (English)
- **Fallback (backward compatible)**: `./系统提示词.md` and `./SystemPrompt.md` at repository root

The frontend requests `GET /api/system-prompt?lang=zh|en` based on the current UI language. The backend will first attempt to read from `schematic-ai-review-prompt/` and fall back to the repository root. If the target language file is missing in both locations, the endpoint returns 404 and the UI shows a non-blocking warning but still allows normal conversation with the model.

## Dev server

- Dev URL: `http://localhost:3000`
- Proxy: `/api` → `http://localhost:3001` (see `vite.config.ts`)

If you change ports, also update the proxy target in `vite.config.ts`.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

## UI guide

- Global config (left panel):
  - Model API: select from defaults or choose "custom" and input your endpoint (DeepSeek, OpenRouter, or others).
  - Model name: preset list for OpenRouter; custom model name supported.
  - API Key: entered here, sent as `Authorization: Bearer <key>` to the backend which forwards to upstream.
  - Sessions: load recent sessions, delete, or refresh the list.
  - Theme toggle: light/dark.
- Tabs: Circuit (implemented), Code/Doc/Req (placeholders).
- Circuit tab:
  - File upload (JPEG/PNG/PDF, multiple files allowed)
  - System prompts: Requirements and Specs (the app will also fetch and prepend root `系统提示词.md` automatically)
  - Question confirm (read-only, shows model’s clarifying questions per page)
  - Dialog (your user message for this page)
  - Progress + elapsed time (from backend `timeline`)
  - Actions: Submit, Reset, Save Session
- Results (right panel):
  - Markdown review rendered with code highlighting
  - Optional overlay: inline SVG + mapping count
  - Collapsible `enrichedJson` for manual inspection

## Data flow

1) On submit, the app attempts `GET /api/system-prompt`. If found, it sends `{ systemPrompt, requirements, specs }` as `systemPrompts` to the backend.
2) If images are provided, the backend extracts circuit JSON; otherwise, previously returned `enrichedJson` can be reused.
3) The backend calls the LLM to produce Markdown and returns `{ markdown, enrichedJson, overlay, metadata, timeline }`.
4) The UI renders Markdown and overlay, and preserves `enrichedJson` for subsequent rounds to avoid re-uploading images.

## Configuration

- `VITE_CLIENT_TIMEOUT_MS` (optional): frontend request timeout to the backend (default 1800000 ms).

## Troubleshooting

- Missing system prompt file: create `系统提示词.md` at repo root or email `gyrych@gmail.com` for a paid copy.
- 422 from review: indicates low confidence or conflicts; use overlay and JSON to manually verify.
- Port mismatch: ensure frontend runs on 3000 and backend on 3001; update `vite.config.ts` proxy if changed.
- OpenRouter models: verify endpoint path (e.g., `/api/v1/chat/completions`) and model name.

## Security

The UI does not persist secrets to disk. Sessions saved to the backend exclude sensitive headers.

## License

Add a suitable license if distributing this project.

