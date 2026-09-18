# PTAS AI Development Handoff

This repository packages the Punjab Professional Tax Administration System plan into an engineering structure that an IDE coding agent such as Codex can use safely and incrementally.

## Current status

- Planning baseline: v0.5, included under `docs/reference/`
- Repository status: bootstrap handoff, not a production application
- Safe starting point: platform foundation and design-system work
- Live legal forms, rates, payment integrations, real migration, and production deployment remain approval-gated

## Recommended Codex prompt

```text
Read AGENTS.md and the documents it references. Work only on backlog item PTAS-000. Do not implement later epics. Create a small reviewable change, run every required check, and report assumptions, security impact, tests, and remaining blockers.
```

## Repository map

- `apps/web` - Next.js web portal and short request/response APIs
- `apps/worker` - durable background job entry point
- `packages/domain` - pure business rules and workflow state machines
- `packages/database` - PostgreSQL schema and forward migrations
- `packages/ui` - accessible reusable UI components and design tokens
- `packages/integrations` - external-service ports and mocks
- `docs/api/openapi.yaml` - API contract baseline
- `docs/backlog/backlog.yaml` - machine-readable implementation backlog
- `docs/reference` - source plan and supplied legal/form references

## Local bootstrap

Prerequisites:

- Node.js 24 LTS
- Corepack
- Docker or another local PostgreSQL runtime when database work begins

```bash
corepack enable
pnpm install
pnpm test
pnpm build
```

Copy `.env.example` to `.env.local`. Use synthetic data only.

## Important limitations

This repository does not approve unresolved legal text or operational policy. Values shown in mocks are test values and must never be treated as an official tax schedule, account head, due date, form template, or integration credential.
