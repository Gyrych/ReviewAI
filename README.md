# ReviewAI

Local skeleton for AI-assisted schematic review: images → structured circuit JSON → Markdown review, with SVG overlay for human-in-the-loop verification.

This repository contains a Vite/React frontend and two backend microservices (`circuit-agent` and `circuit-fine-agent`) that implement image-to-JSON extraction, multi-pass recognition, and LLM-based review/report generation.

Important: The services require a set of prompt files under `ReviewAIPrompt/` (see "Prompts" section). Missing prompts cause the backend to fail fast.

Prerequisites
- Node.js >= 18
- Optional: Docker (for Redis in some workflows)

Quick start (development)

1. Start all services (cross-platform)

```bash
node start-all.js
```

2. Or start each service individually

```bash
cd services/circuit-agent
npm install
npm run dev

cd ../circuit-fine-agent
npm install
npm run dev

cd ../../frontend
npm install
npm run dev
```

By default the frontend in development proxies to the backend services:
- `circuit-agent`: http://localhost:4001
- `circuit-fine-agent`: http://localhost:4002

Prompts
-------

The runtime requires prompt files located under `ReviewAIPrompt/` organized per agent. The code loads files using `ReviewAIPrompt/{agent}/{filename}` and will throw when a required file is missing or empty.

Minimum required files (examples present in the repo):

- `ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_initial_en.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_en.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_zh.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_en.md`
- `ReviewAIPrompt/circuit-fine-agent/macro_prompt.md`, `ic_prompt.md`, `rc_prompt.md`, `net_prompt.md`, `verify_prompt.md`, `consolidation_prompt.md`

If any required prompt file is missing the backend will respond with 500 and log a `Failed to load system prompt` error.

Architecture overview
---------------------

- `frontend/` — Vite + React + TypeScript client. Agent selection and API configuration live at the App level; two agent forms exist under `frontend/src/agents/`.
- `services/circuit-agent/` — primary backend microservice. Layered structure under `src/`:
  - `app/usecases` — business use-cases (`DirectReviewUseCase`, `StructuredRecognitionUseCase`, `MultiModelReviewUseCase`, `FinalAggregationUseCase`).
  - `infra` — providers, prompt loader, HTTP client (OpenRouter-compatible), storage, progress store.
  - `interface/http/routes` — express routes (`orchestrate`, `directReview`, `structuredRecognize`, `structuredReview`, `aggregate`, `sessions`, `progress`, `health`).
- `services/circuit-fine-agent/` — parallel service for multi-pass/multi-agent workflows; structure mirrors `circuit-agent` and reuses the same `PromptLoader` conventions.

Key endpoints (circuit-agent)
- `GET /health` — health check
- `GET /progress/:id` — progress
- `GET /artifacts/:filename` — static artifacts
- `GET /system-prompt?lang=zh|en` — returns system prompt (used by frontend)
- `POST /orchestrate/review` — unified orchestrator; `directReview=true` triggers direct mode (images → LLM review), otherwise structured mode runs multi-pass recognition + review + aggregation.
- `POST /modes/structured/recognize` — structured recognition
- `POST /modes/structured/review` — structured multi-model review
- `POST /modes/structured/aggregate` — aggregation (final merge)
- `POST /sessions/save`, `GET /sessions/list`, `GET /sessions/:id`, `DELETE /sessions/:id` — session management

Important runtime behaviors
- The `PromptLoader` (in both services) enforces presence and non-emptiness of prompt files. It supports caching and `preloadPrompts` for startup pre-warming.
- `orchestrate` route auto-detects whether a request is a revision based on `history` content and loads `system_prompt_initial` or `system_prompt_revision` accordingly.
- `DirectReviewUseCase` prepares rich messages (system + user parts), may include web search summaries (DuckDuckGo provider) when `enableSearch=true`, converts attachments to data URLs for upstream LLM vision providers, and stores full request/response artifacts.
- Artifact storage is file-based (`ArtifactStoreFs`) under each service's storage root and exposed via `/artifacts`.

Configuration & environment variables
- `PORT` — service port (default per service: 4001 / 4002)
- `OPENROUTER_BASE` — upstream model provider base URL (OpenRouter compatible)
- `REDIS_URL` — optional Redis for progress store
- `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `FETCH_RETRIES`, `KEEP_ALIVE_MSECS` — network/timeouts

Security & privacy
- The services avoid persisting Authorization headers and strip secrets from logs where possible; however, by design request/response artifacts may contain raw LLM JSON for debugging—treat artifacts as sensitive if deploying to shared environments.

License
- MIT (see `LICENSE` file)

Troubleshooting
- If you see `Failed to load system prompt`, confirm the expected file exists under `ReviewAIPrompt/{agent}/` and is non-empty.
- If frontend cannot reach the backend in dev, ensure the services are running and verify `App.tsx` agent base URLs (dev points to `http://localhost:4001` / `4002`).

Contact
- maintainer: gyrych@gmail.com
