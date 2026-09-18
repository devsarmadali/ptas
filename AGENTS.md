# PTAS Repository Instructions for Coding Agents

This repository is the AI-ready engineering handoff for the Punjab Professional Tax Administration System (PTAS).

## 1. Read before changing code

Read these files in order:

1. `docs/handoff/readiness-and-authority.md`
2. `docs/product/scope.md`
3. `docs/product/business-rules.md`
4. `docs/legal/legal-traceability.md`
5. `docs/architecture/solution-architecture.md`
6. `docs/security/security-baseline.md`
7. `docs/testing/quality-gates.md`
8. The closest nested `AGENTS.md`, if one exists.

The full approved planning baseline is in `docs/reference/ptas-plan-v0.5.md`. It is context, not permission to invent unresolved details.

## 2. Non-negotiable domain rules

- Never hard-code tax rates, categories, legal wording, financial years, due dates, account heads, form layouts, or payment-channel identifiers.
- Never create a second assessment for the same taxpayer and financial year. Revisions belong to the same assessment and use immutable versions.
- Never edit an approved assessment version in place.
- Never update or delete posted demand-ledger, payment-ledger, or audit entries. Corrections use equal-and-opposite or authorized adjustment entries.
- Never bypass the legally authorized ETO/assessing-authority approval step.
- Enforce role and jurisdiction on the server for every read and write. UI hiding is not authorization.
- Every material financial, workflow, configuration, export, and security action must create an audit event.
- Never infer an unresolved legal rule. Use configuration, a feature flag, a mock adapter, or a blocked backlog item.
- Never put taxpayer personal data, production data, credentials, tokens, private keys, or connection strings in source control, logs, fixtures, screenshots, or examples.
- Production deployment and live integrations require explicit human approval outside the coding task.

## 3. Development authority

- **GREEN:** repository tooling, design system, accessibility, test infrastructure, mocks, organization/jurisdiction model, audit framework, configuration framework, and non-legal UI prototypes.
- **AMBER:** assessment, documents, rates, ledger, payments, notices, appeals, reports, migration, and notifications. Implement only through effective-dated configuration and approved interfaces.
- **RED:** live payment activation, legally operative form publication, real taxpayer migration, recovery enforcement, production secrets, and production deployment. Do not activate without a recorded approval gate.

See `docs/handoff/readiness-and-authority.md` for the complete matrix.

## 4. Engineering rules

- Node.js 24 LTS and pnpm 11 are the baseline.
- Use TypeScript strict mode. Avoid `any`; justify unavoidable exceptions in code comments.
- Keep domain logic in `packages/domain`; do not bury legal or financial rules in React components or route handlers.
- Use PostgreSQL transactions for financial and workflow state changes.
- All public API changes must update `docs/api/openapi.yaml` and contract tests.
- All schema changes must be forward migrations in `packages/database/migrations`; never edit a migration already applied to a shared environment.
- External services must be behind adapters with deterministic mocks.
- Prefer small, reviewable changes. Do not implement multiple unrelated epics in one pull request.

## 5. Required checks

Before presenting a change as complete, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm repo:validate
```

For UI changes also run:

```bash
pnpm test:e2e
```

If a command cannot run, state the exact reason and what remains unverified.

## 6. Required task report

Every completed task must report:

- Files changed
- Requirement/story implemented
- Assumptions made
- Security/privacy impact
- Database/API impact
- Tests run and results
- Remaining blockers or follow-up work

## 7. First task boundary

The recommended first Codex task is `PTAS-000` in `docs/backlog/backlog.yaml`. Complete only that story and its acceptance criteria before moving to domain features.
