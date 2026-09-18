# Workflow Transition Baseline

## Assessment

| Current                       | Action                        | Role                       | New                | Required guards                                            | Ledger effect         |
| ----------------------------- | ----------------------------- | -------------------------- | ------------------ | ---------------------------------------------------------- | --------------------- |
| Draft                         | Submit                        | Inspector/authorized maker | Submitted          | Mandatory facts complete; jurisdiction valid               | None                  |
| Submitted                     | Return                        | ETO                        | Returned           | Reason required                                            | None                  |
| Submitted                     | Record hearing                | ETO/authorized officer     | Hearing Recorded   | Service/hearing evidence                                   | None                  |
| Submitted or Hearing Recorded | Approve                       | ETO                        | Approved           | Approved schedule; authority; required hearing opportunity | Create demand         |
| Approved                      | Create revision               | Inspector/authorized maker | Revision Draft     | Reason required                                            | None                  |
| Revision Draft                | Resubmit                      | Inspector/authorized maker | Resubmitted        | Changed facts complete                                     | None                  |
| Resubmitted                   | Approve revision              | ETO                        | Approved           | Difference reviewed                                        | Adjustment entries    |
| Approved                      | Request withdrawal/adjustment | Inspector/authorized maker | Decision Requested | Evidence and reason                                        | None                  |
| Decision Requested            | Approve decision              | ETO/authorized authority   | Adjusted/Withdrawn | Written order                                              | Authorized adjustment |

## Payment

| Current   | Action                        | Role/system            | New       | Guards                                                         |
| --------- | ----------------------------- | ---------------------- | --------- | -------------------------------------------------------------- |
| Initiated | Receive provider confirmation | Integration            | Confirmed | Valid signature, unique provider event, amount/reference match |
| Confirmed | Post allocation               | Authorized service     | Posted    | Transactional ledger write and idempotency key                 |
| Confirmed | Flag mismatch                 | Reconciliation service | Exception | Amount/reference/status mismatch                               |
| Posted    | Correct                       | Authorized approver    | Corrected | Reason and order; opposite entries only                        |

Detailed legal transitions remain approval-gated in `docs/legal/unresolved-items.md`.
