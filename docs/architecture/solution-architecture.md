# Solution Architecture

## Style

A modular monolith is the initial business architecture, deployed as a managed web application plus durable workers. Module boundaries are explicit so high-load capabilities can be separated later.

```text
Users
  -> Vercel CDN/WAF/TLS
  -> Next.js web portal and short APIs
  -> Application/domain modules
      - identity and jurisdiction
      - party/taxpayer registry
      - legal configuration
      - assessment and decisions
      - documents and service
      - demand/payment ledger
      - appeals/adjustments
      - reporting and audit
  -> Managed PostgreSQL (system of record)
  -> Private object storage (documents/evidence)
  -> Durable queue/workflow service -> worker application
  -> Managed cache/locks
  -> External adapters: ePay, treasury, e-Khidmat, identity, SMS, email
  -> External observability and off-provider backup
```

## Allocation

- Vercel/Next.js: portal, server rendering, short commands/queries, callback ingress, health endpoints
- Durable worker: PDF jobs, imports, notifications, reconciliation, long reports, offline sync processing
- PostgreSQL: authoritative state, workflow, ledgers, audit index, configuration
- Object storage: generated documents, scans, evidence and exports
- Queue/workflow: retries, scheduled jobs, dead-letter handling and idempotent processing
- Cache: non-authoritative cache, rate limiting and short locks only

## Constraints

- No statutory record relies on function memory or local disk.
- Workers must be idempotent.
- External callbacks are authenticated, replay-protected and persisted before processing.
- Database and storage credentials are environment-specific.
- Production data is prohibited in preview and development environments.
