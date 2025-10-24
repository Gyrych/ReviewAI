# Data Model (extract from spec)

## Entities

- **PromptFile**
  - agent: string
  - language: string
  - variant: string
  - path: string
  - sizeBytes: number
  - sha256: string

- **ServiceConfig**
  - openRouterBase: string
  - storageRoot: string
  - port: number
  - redisUrl?: string

- **APIContractSummary**
  - path: string
  - method: string
  - requestSummary: string
  - responseSummary: string
  - requiredAuth: boolean

## Validation Rules

- `PromptFile.path` must exist on disk and `sizeBytes > 0`.
- `ServiceConfig.openRouterBase` must be a valid URL when running in CI/production.

## State Transitions

- `PromptFile` lifecycle: created (in repo) -> validated (sha256 recorded) -> loaded (preloadPrompts) -> retired (deleted & recorded in change log)


