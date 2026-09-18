# Frontend Architecture

## Baseline

- Next.js App Router and React server-first rendering
- TypeScript strict mode
- Accessible reusable components in `packages/ui`
- Domain/API types imported from shared packages
- URL-addressable filters and work queues
- Server-side authorization for all data operations
- Client state limited to interaction state; authoritative state remains server-side

## Information architecture

Primary role navigation:

- Home/work queue
- Taxpayers
- Assessments and decisions
- Notices and service
- Payments and reconciliation
- Appeals and adjustments
- Reports
- Configuration/administration when authorized

## Interaction principles

- Show legal status, current owner, next action and deadlines on every case workspace.
- Use review pages before high-risk submission or approval.
- Present before/after comparisons for revisions.
- Require explicit reason and evidence for adjustments, reversals and rejections.
- Preserve entered data after recoverable validation errors.
- Use plain language and progressive disclosure.
- Support keyboard operation, screen readers, 200% zoom and touch targets.

## Performance budgets

At the 75th percentile on supported field connectivity:

- LCP <= 2.5 seconds
- INP <= 200 ms
- CLS <= 0.1
- Route JavaScript budgets are defined during implementation and enforced in CI.
