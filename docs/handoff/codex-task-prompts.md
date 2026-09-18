# Codex Task Prompts

## First task: repository validation

```text
Read AGENTS.md and all required files it names. Work only on PTAS-000. Install dependencies, create and commit the pnpm lockfile, resolve any toolchain issues, and make the repository pass format, lint, typecheck, unit tests, build and repository validation. Do not add authentication, database connectivity or domain screens. Report changed files, assumptions, security impact, commands and results.
```

## Second task: organization and jurisdiction

Use only after PTAS-000 is accepted.

```text
Read AGENTS.md and work only on PTAS-010. Implement the organization and jurisdiction domain with tests for hierarchy, effective assignment history and denial of unrelated jurisdiction access. Do not implement taxpayer or assessment features. Update the data dictionary, API contract and migration only where required.
```

## Third task: design system

Use only after PTAS-000 is accepted.

```text
Read AGENTS.md and work only on PTAS-020. Implement the draft non-branded design tokens and accessible Button, TextField, ErrorSummary, StatusBadge, DataTable and PageShell components. Add documentation, keyboard tests and automated accessibility coverage. Do not invent official Punjab branding.
```
