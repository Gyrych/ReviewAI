# Feature Specification: Review Flow Cleanup and Pipeline Assurance

**Feature Branch**: `001-review-flow-cleanup`
**Created**: 2025-10-21
**Status**: Draft
**Input**: User description: "1、允许；2、同意；"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initial Review with Optional Search (Priority: P1)

Users upload schematic images/PDF and provide requirement/spec/design texts. They may enable component search. The system consolidates all inputs into a single context, loads the appropriate system prompt (initial vs revision, zh|en), optionally runs identify→search→per-URL summarization, injects summaries as extra system context, and generates a Markdown review report.

**Why this priority**: This is the primary user value: turning inputs into an actionable initial review.

**Independent Test**: Submit a multipart form with at least one image/PDF and requirement/spec/dialog texts; toggle enableSearch on/off; verify that a Markdown report is returned, artifacts are saved, and (when enabled) search summaries are present and injected.

**Acceptance Scenarios**:

1. **Given** valid attachments and texts with enableSearch=false, **When** the user submits, **Then** the system returns a Markdown review and a timeline without search steps.
2. **Given** valid attachments and texts with enableSearch=true, **When** the user submits, **Then** the system performs identify→search→summarize per URL, saves artifacts, injects summaries as system messages, and returns a Markdown review with a timeline including search steps and `searchSummaries`.

---

### User Story 2 - Infinite Revision Loop (Priority: P1)

After receiving a report, users can enter objections (dialog). The system treats subsequent submissions as revision rounds when history includes assistant content or report markers, loads the revision system prompt, and returns a revised Markdown report. This process can repeat indefinitely.

**Why this priority**: Critical to iterative engineering workflows where objections must be resolved over multiple rounds.

**Independent Test**: Submit an initial round; then submit again with history that includes the previous assistant report and new dialog; verify the revision prompt is used and a revised report is returned. Repeat multiple times.

**Acceptance Scenarios**:

1. **Given** an initial report and history containing assistant text, **When** the user submits new dialog, **Then** the system loads revision prompt and returns a revised report.
2. **Given** repeated submissions with updated dialog and proper history, **When** the user continues, **Then** the system continues to produce revised reports without an enforced limit.

---

### User Story 3 - Session Handling and Artifacts (Priority: P2)

Users can save and later reload sessions. System stores LLM requests/responses, search traces, and summaries as artifacts accessible via static routes or listing endpoints.

**Why this priority**: Supports auditability and developer/operator workflows.

**Independent Test**: Save a session; verify it appears in the list; reload it; verify artifacts exist and are accessible via the artifacts route.

**Acceptance Scenarios**:

1. **Given** a completed review, **When** the user saves the session, **Then** the session appears in the session list.
2. **Given** an existing session, **When** the user reloads it, **Then** prior results and relevant artifacts are retrievable.

---

### Edge Cases

- Missing or unreadable system prompts → Return 500 with clear error and skip processing; no partial outputs.
- Upstream timeouts or access errors during search/summarization → Record failures in timeline; do not inject unusable summaries; continue main review flow.
- Non-JSON identify response → Log parse failure with snippet; proceed with fallback query using requirements/specs/dialog.
- Extremely large attachments → Be accepted within configured limits; processed as data URLs; report errors if size constraints are exceeded.
- Invalid `language` parameter → Reject with 400.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept multipart uploads including images/PDF and text fields (`requirements`, `specs`, `dialog`, optional `history`).
- **FR-002**: System MUST support `enableSearch` flag; when true, it MUST run identify pass to extract key components and technical routes.
- **FR-003**: System MUST perform online search per identified keyword and summarize each resulting URL into concise textual summaries.
- **FR-004**: System MUST inject valid summaries as additional system messages and save raw requests/responses and summaries as artifacts; invalid/failed summaries MUST be recorded but not injected.
- **FR-005**: System MUST load appropriate system prompt (`initial` vs `revision`) based on history and respect language selection (`zh` or `en`).
- **FR-006**: System MUST produce a Markdown review report and a timeline containing at least request/response entries; when search is enabled, timeline MUST also include identify/search/query/hit/summary events.
- **FR-007**: System MUST allow unlimited revision rounds by submitting additional dialog with prior assistant responses in history.
- **FR-008**: System MUST expose artifacts via static route and provide a listing endpoint for inspection.
- **FR-009**: Frontend MUST provide a toggle to enable/disable component search and pass through user inputs (files/texts/history) correctly.
- **FR-010**: Documentation (Chinese and English READMEs) MUST accurately describe the current flow and parameters after cleanup.

### Key Entities *(include if feature involves data)*

- **ReviewRequest**: Files (name, mime, bytes), texts (`requirements`, `specs`, `dialog`), `history`, `options` (e.g., `progressId`, `enableSearch`, `searchTopN`, `language`).
- **TimelineEntry**: Step identifier, timestamp, origin, meta data (snippets, counts), optional artifact references.
- **Artifact**: Persisted files for requests, responses, search traces, and summaries with retrievable URLs.
- **SearchSummary**: Text produced by summarizing a specific URL; eligible for injection when passing quality checks.
- **Session**: Saved conversation/report context enabling list/load/delete operations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Initial review submission returns a Markdown report and timeline within an acceptable end-to-end time for typical inputs (e.g., under 2 minutes in a standard dev environment).
- **SC-002**: With `enableSearch=true`, at least one valid summary is injected for ≥80% of cases when identify yields ≥1 keyword and the web results are accessible.
- **SC-003**: Timeline contains all major stages (identify/search/query/hit/summary/request/response) with artifact references for ≥95% successful operations.
- **SC-004**: Unlimited revision loop works: three consecutive revision submissions produce three distinct revised reports with correct revision prompts.
- **SC-005**: Documentation parity: Chinese/English READMEs reflect the current flow, parameters, and routes with no mismatches discovered during manual walkthrough.

## Assumptions & Dependencies

### Assumptions

- Inputs consist of: at least one schematic image/PDF and textual fields (requirements/specs/dialog), optionally prior history; this is sufficient to run identify and review.
- Online search providers will be available for most requests; transient failures are acceptable and should not block the main review.
- Users are familiar with uploading files and providing plain-text requirements/specs/dialog; no specialized client tooling is required beyond the existing UI.
- Unlimited revisions are driven by user resubmissions including prior assistant content in history; no server-side session locking is needed.
- Reasonable file size limits are enforced by deployment configuration; outsized files may fail gracefully.

### Dependencies

- External LLM provider availability and latency for both review and search/summarization.
- Storage for artifacts and sessions accessible by the application runtime.
- Frontend form correctly posts multipart data and control flags (`enableSearch`, `language`, `history`).
- Prompt assets (system/identify/search/summary) exist and are readable at runtime.


# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`
**Created**: [DATE]
**Status**: Draft
**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

