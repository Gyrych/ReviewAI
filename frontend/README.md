# Frontend

Vite + React + TypeScript + Tailwind UI for `schematic-ai-review`. It connects to the backend for circuit extraction and Markdown review, and renders an SVG overlay for human-in-the-loop verification.

For Chinese documentation, see `frontend/README.zh.md`.

## Critical requirement

Provide system prompts in the `ReviewAIPrompt/` directory (preferred) or at the repository root for compatibility:

- **Preferred**: `./ReviewAIPrompt/系统提示词.md` (Chinese) and `./ReviewAIPrompt/SystemPrompt.md` (English)
- **Fallback (backward compatible)**: `./系统提示词.md` and `./SystemPrompt.md` at repository root

The frontend requests `GET /api/system-prompt?lang=zh|en` based on the current UI language. The backend will first attempt to read from `ReviewAIPrompt/` and fall back to the repository root. If the target language file is missing in both locations, the endpoint returns 404 and the UI shows a non-blocking warning but still allows normal conversation with the model.

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

### Artifact viewer in Timeline

- When viewing the **步骤历史 (Timeline)**, timeline entries that contain artifact references (for example `requestArtifact` or `responseArtifact`) now expose an inline artifact viewer.
- Click the timeline entry to expand details, then open the artifact detail ("Request" or "Response") and click **加载内容** to lazily fetch the artifact from the backend (`/api/artifacts/<filename>`).
- Supported artifact types:
  - JSON: rendered formatted and pretty-printed
  - Plain text/markdown: rendered inside a scrollable block
  - Images (png/jpg/webp): shown inline as an image preview
- The artifact content is fetched only on demand and cached in memory for the current session to avoid repeated network calls.
- If artifact fetch fails, an error message is shown in the artifact block.

Testing the artifact viewer:

1. Submit a review with image files so the backend produces `vision_model_request` and `vision_model_response` artifacts.
2. After the backend returns, open the **步骤历史** panel and expand the `vision_model_request` / `vision_model_response` entries.
3. Click the artifact `Request` or `Response` detail and press **加载内容** to view the full payload or model return.
4. If needed, open the artifact URL in a new tab by copying the provided artifact URL (format: `/api/artifacts/<filename>`).

Notes:

- The artifact viewer does not change backend behavior; artifacts are served statically under `/api/artifacts/` by the backend.
- Large artifacts are constrained by a maximum displayed height; use the download link (artifact path) to retrieve full files if necessary.

## Data flow

1) On submit, the app attempts `GET /api/system-prompt`. If found, it sends `{ systemPrompt, requirements, specs }` as `systemPrompts` to the backend.
2) If images are provided, the backend extracts circuit JSON; otherwise, previously returned `enrichedJson` can be reused.
3) The backend calls the LLM to produce Markdown and returns `{ markdown, enrichedJson, overlay, metadata, timeline }`.
4) The UI renders Markdown and overlay, and preserves `enrichedJson` for subsequent rounds to avoid re-uploading images.

## Configuration

- `VITE_CLIENT_TIMEOUT_MS` (optional): frontend request timeout to the backend (default 7200000 ms).

## Troubleshooting

- Missing system prompt file: create `系统提示词.md` at repo root or email `gyrych@gmail.com` for a paid copy.
- 422 from review: indicates low confidence or conflicts; use overlay and JSON to manually verify.
- Port mismatch: ensure frontend runs on 3000 and backend on 3001; update `vite.config.ts` proxy if changed.
- OpenRouter models: verify endpoint path (e.g., `/api/v1/chat/completions`) and model name.

## Security

The UI does not persist secrets to disk. Sessions saved to the backend exclude sensitive headers.

## License

Add a suitable license if distributing this project.

