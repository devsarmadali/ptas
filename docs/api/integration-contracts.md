# Integration Contract Requirements

All external integrations implement a port in `packages/integrations` and a deterministic mock.

## Mandatory controls

- Provider-specific authentication and signature verification
- Persist raw inbound event metadata before processing, subject to data minimization
- Unique provider event ID and payload hash
- Idempotent command processing
- Replay-window validation
- Correlation ID across ingress, queue, worker, ledger and audit
- Retry with bounded exponential backoff
- Dead-letter queue and operator resolution workflow
- Reconciliation report independent of real-time callbacks
- Explicit timeout and circuit-breaker policy
- No sensitive payloads in general application logs

Official ePay, e-Khidmat, treasury, identity, SMS and email contracts remain pending.
