# Phase 2 tasks (to be executed by maintainers / CI)

1. PromptLoader enforcement
   - Run: Start `services/circuit-agent` with missing prompt file and assert process exits with non-zero code.
   - Owner: backend maintainer

2. Runtime config validation
   - Run: Start `services/circuit-agent` with `OPENROUTER_BASE` unset in CI; assert failure or mark as dev-only default.
   - Owner: backend maintainer

3. Frontend E2E (Playwright)
   - Run: `npm --prefix frontend run test:e2e` after starting dev server; output saved to `frontend/test-reports/`.
   - Owner: frontend maintainer

4. Static import scan
   - Run: `node scripts/check-frontend-no-backend-imports.js` and fail CI on violations.
   - Owner: infra

5. README sync check
   - Manual: compare `services/circuit-agent/README.md` and `README.zh.md`; script optional.

6. Dist artifact audit
   - Manual: list candidate files in `frontend/dist/` and `services/*/dist/`; propose `.gitignore` changes.

7. Chinese comments sampling
   - Run: `node scripts/sample-chinese-docs.js` (placeholder) to produce coverage report.


