# ADR-0001: Initial Toolchain

- Status: Accepted for bootstrap; review before production procurement
- Date: 2026-07-16

## Decision

- Node.js 24 LTS target (Node.js >=22.16 supported in development, verified on Node.js 25.9.0)
- pnpm 11 (verified on pnpm 11.13.1)
- Next.js 16 App Router
- React 19
- TypeScript 5.9 strict mode for initial compatibility
- PostgreSQL with portable SQL migrations
- Vitest for unit/domain tests
- Playwright for browser and accessibility smoke tests
- Vercel-first web hosting with provider-neutral domain modules and data services

## Rationale

This provides a current LTS runtime, a mature server-rendered web framework and a portable data/domain core. Exact managed database, queue, cache, object-storage, identity and observability products remain procurement decisions. Runtime engine range was broadened in PTAS-000 to accommodate Node 25.x in local developer environments.
