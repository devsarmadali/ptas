# Database Instructions

- PostgreSQL is the statutory system of record.
- Never modify an applied migration; add a new migration.
- Use database constraints in addition to application validation.
- Ledger and audit tables are append-only.
- Financial/workflow commands must use transactions and idempotency keys.
- Do not store unencrypted secrets or unnecessary raw integration payloads.
- Review query plans and jurisdiction filters for any list/search endpoint.
