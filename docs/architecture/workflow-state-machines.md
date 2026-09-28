# Professional Tax Workflow State Machines

The PostgreSQL command functions in `0002_workflow_command_layer.sql` are the authoritative
transition boundary. UI state and button visibility are projections only. Every command derives the
actor from `auth.uid()`, checks an active role and jurisdiction assignment, locks the aggregate,
compares `row_version`, records an idempotency key, changes state, and writes history in one
transaction.

## Survey and assessment

| Current    | Action   | Role      | Next      | Prerequisites and effects                                                       |
| ---------- | -------- | --------- | --------- | ------------------------------------------------------------------------------- |
| NEW        | FEED     | Inspector | FEEDED    | Assigned jurisdiction; imported and manual records use the same state           |
| NEW/FEEDED | CLOSE    | Inspector | CLOSED    | Reason required; terminal and preserved                                         |
| FEEDED     | SUBMIT   | Inspector | SUBMITTED | Expected row version; Inspector editing stops                                   |
| RETURNED   | RESUBMIT | Inspector | SUBMITTED | Corrected immutable-version workflow                                            |
| SUBMITTED  | RETURN   | ETO       | RETURNED  | Reason required                                                                 |
| SUBMITTED  | APPROVE  | ETO       | APPROVED  | Linked eligible assessment is approved and one immutable PFT-3 entry is created |

PFT-3 uniqueness is enforced independently for survey, assessment, and assessment version. Approval
retries use an idempotency key and cannot create a second register entry.

## Show cause and penalty

`CREATED -> ISSUED -> SERVED -> SERVICE_RECORDED -> PROCESS_COMPLETED -> PENALTY_IMPOSED`.
Issuance and service recording require the relevant document identifier. Inspector performs service
steps; ETO issues, completes the required process, and imposes penalty. Completion and penalty require
a reason. No later action is valid from an earlier state.

## Demand deletion

Inspector creates one pending request per demand. ETO may return or approve it with a reason.
Approval inactivates the demand and records the approving request; it does not physically delete the
demand or ledger history. A partial unique index prevents concurrent pending requests.

## PFT-2 challan

Administrative state and payment state are deliberately independent:

- `PREPARED -> ISSUED -> CANCELLED` is the administrative lifecycle.
- `OUTSTANDING -> RECEIVED` is the payment lifecycle.
- Both issued and administratively cancelled challans remain receivable; prepared or already received
  challans do not.
- A unique bank transaction ID and one-receipt-per-challan constraint reject duplicate receipts.

The scheduled database job runs after midnight and cancels an issued, outstanding challan only when
the Pakistan business date is later than `due_date + 3`. Repeated execution is safe because cancelled
or received rows no longer match. Automatic and manual cancellation sources are distinct.

## Immutability and reversal

PFT-3 entries, receipts, workflow actions, demand-ledger entries, and audit events reject update and
delete. Corrections must use a new authorized version, adjustment, or equal-and-opposite ledger entry.
Terminal states cannot be reopened by ordinary mutation.

## Data API policy

Anonymous access is revoked. Authenticated users receive read-only grants scoped by active
jurisdiction policies. Material writes are available only through explicitly granted command RPCs;
those RPCs re-check authenticated identity, role, jurisdiction, state, prerequisites, optimistic
version, and idempotency. Technical administrators receive no statutory command role.
