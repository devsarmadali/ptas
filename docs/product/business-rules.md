# Business Rules Baseline

| ID     | Rule                                                                                                                                   | Enforcement                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| BR-001 | Tax liability is effective-dated by financial year.                                                                                    | Every assessment and schedule row references a financial year/effective period. |
| BR-002 | A taxpayer may have only one assessment per financial year.                                                                            | Unique database constraint; revisions are assessment versions.                  |
| BR-003 | If a person is engaged in multiple taxable activities, the highest applicable rate is selected, subject to approved law/configuration. | Domain calculation with traceable candidate rates.                              |
| BR-004 | Approved versions are immutable.                                                                                                       | New revision version; compare and reapprove.                                    |
| BR-005 | Financial effects are append-only.                                                                                                     | Ledger entries; corrections are adjustment/reversal entries.                    |
| BR-006 | Statutory approval remains with the authorized ETO/assessing authority.                                                                | Server-enforced transition permission.                                          |
| BR-007 | Penalty cannot exceed its approved legal ceiling.                                                                                      | Effective-dated ceiling and reason/order fields.                                |
| BR-008 | Hearing/opportunity evidence is required before affected configured decisions.                                                         | Workflow guard; service and hearing record required.                            |
| BR-009 | Appeal and refund/adjustment are explicit case types, not destructive edits.                                                           | Dedicated workflows and ledger effects.                                         |
| BR-010 | External payment messages are idempotent and reconciled.                                                                               | Provider event key, payload hash, state machine and exception queue.            |
| BR-011 | Access is limited by both role and jurisdiction.                                                                                       | Server-side policy for every query and command.                                 |
| BR-012 | Legal schedules, forms and account heads are never hard-coded.                                                                         | Maker-checker configuration with approval evidence.                             |

## Unresolved rule handling

When a rule is not finally approved, implementation must expose a configuration point, feature flag, mock, or blocked workflow. It must not choose a plausible value silently.
