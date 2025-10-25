# research.md

## Unknowns resolved (from Technical Context)

- **Node.js/TypeScript**: Repository uses TypeScript for backend (`services/circuit-agent`) and Vite+React for frontend; confirmed via `package.json` files.
- **PromptLoader behavior**: Existing implementation enforces presence/non-empty checks; plan will ensure `preloadPrompts()` is invoked at startup and errors surfaced as required by spec.
- **Testing**: Playwright configured in frontend; `vitest` placeholder present in backend. Plan will add Playwright run instructions and ensure report path `frontend/test-reports/` is produced.

## Decisions

- **Decision**: Use existing `PromptLoader` implementation and enhance startup sequence to enforce spec checks and clearer, actionable error messages.
- **Decision**: Frontend will implement explicit error UI for prompt-loading failures and provide an "导出诊断" button that collects request/response artifacts for the current session.

## Rationale

- Reusing existing `PromptLoader` minimizes code churn and risk while meeting the requirement for fail-fast prompt validation.

## Alternatives considered

- Full rewrite of prompt loading: rejected due to time and risk; incremental enhancement preferred.

## Next steps / generated tasks

- Implement startup `preloadPrompts()` call and fail-fast or clear-warning behavior in `services/circuit-agent` (FR-001).
- Add frontend error UI and diagnostic export flow for prompt-loading and other contract errors (FR-002).
- Update `services/circuit-agent/README.md` and `README.zh.md` to reflect checks and startup behavior (FR-003).
- Append a change record to `CURSOR.md` once code changes are made (FR-006).


