# Ledger Rules

- Balances are derived from entries, never stored as freely editable totals.
- Each entry has a unique idempotency key within its ledger scope.
- Posted entries cannot be updated or deleted.
- Corrections reference the original entry and use an opposite or authorized adjustment amount.
- Demand, payment and allocation changes occur in one database transaction.
- Every entry carries financial year, taxpayer/demand unit, source document or workflow action, actor/service and timestamp.
- Reports reconcile from ledger entries to approved assessment/document snapshots.
