## Circuit Diagram Review Agent (Standalone Service)

This service provides a strictly layered, modular backend for circuit diagram review, designed for high cohesion, low coupling, and future extensibility to additional agents and modes.

Key points:
- Independent sub-service under `services/circuit-agent/`
- Two independent modes (initial scope):
  1) Direct review via OpenRouter vision model selected by user
  2) Structured recognition (5 fixed passes via `openai/gpt-5-mini`) + optional datasheet search (DuckDuckGo HTML) + multi-model text reviews + final aggregation (OpenRouter `openai/gpt-5`)
- Deepseek removed
- Progress via Redis; storage isolated
- No size limits enforced at the service level (be mindful of infra constraints)

### Quick Start

1) Copy `.env.example` to `.env` and adjust values.
2) Install deps and run:

```
cd services/circuit-agent
npm install
npm run dev
```

3) Health check:
```
GET http://localhost:4001/api/v1/circuit-agent/health
```

### Structure (strict layering)

```
src/
  domain/          # Entities & contracts (no infra deps)
  app/             # Use cases and orchestration
  interface/http/  # Controllers, DTOs, validators
  infra/           # Providers (OpenRouter, Search, Stores)
  config/          # Centralized config
  bootstrap/       # Server startup
storage/
  artifacts/
  datasheets/
  sessions/
  tmp/
```

### Security & Privacy
### API (v1) Summary

Base path: `/api/v1/circuit-agent`

- GET `/health` → `{ status, service, version? }`
- GET `/progress/:id` → `{ timeline: TimelineItem[] }`
- Static `/artifacts/:filename` → saved artifacts

Modes:
- POST `/modes/direct/review` (multipart)
  - fields: `apiUrl`, `model`, `systemPrompt`, `requirements?`, `specs?`, `dialog?`, `history?`, `progressId?`, `files[]`
  - returns: `{ markdown, timeline }`
- POST `/modes/structured/recognize` (multipart)
  - fields: `apiUrl`, `visionModel=openai/gpt-5-mini`, `enableSearch?`, `searchTopN?`, `progressId?`, `files[]`
  - returns: `{ circuit, timeline }`
- POST `/modes/structured/review` (json)
  - body: `{ apiUrl, models[], circuit, systemPrompt, requirements?, specs?, dialog?, history?, progressId? }`
  - returns: `{ reports: [{ model, markdown }], timeline }`
- POST `/modes/structured/aggregate` (multipart)
  - fields: `apiUrl`, `model=openai/gpt-5`, `systemPrompt`, `circuit(json)`, `reports(json)`, `progressId?`, `files[]`
  - returns: `{ markdown, timeline }`
- Do not log Authorization headers or API keys
- Anonymization will scrub PII and identifiable project references where possible

### License
Proprietary (internal).


