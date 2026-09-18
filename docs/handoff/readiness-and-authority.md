# Readiness and Development Authority

## Readiness verdict

The repository is ready for supervised, incremental engineering. It is not authorization for autonomous production activation.

## Authority matrix

| Area                                                      | Level | Agent action                                                                        |
| --------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| Repository, CI, local development, testing                | GREEN | Implement now                                                                       |
| Design system and accessible role portals                 | GREEN | Implement now with synthetic content                                                |
| Organization, office, circle and jurisdiction foundations | GREEN | Implement now                                                                       |
| Audit framework and append-only ledger primitives         | GREEN | Implement now                                                                       |
| Taxpayer registry structure and duplicate-review workflow | AMBER | Implement behind approved validation configuration                                  |
| Assessment, notices, appeals and adjustments              | AMBER | Implement from transition matrices; no invented legal values                        |
| Tax schedules and PFT templates                           | AMBER | Build effective-dated configuration and renderer; use unapproved test fixtures only |
| Payment and treasury integrations                         | AMBER | Build ports, mocks, idempotency and reconciliation; no live activation              |
| Live forms/rates/payment processing                       | RED   | Blocked until written approvals and official contracts                              |
| Production data migration                                 | RED   | Blocked until signed mapping, reconciliation and security approvals                 |
| Recovery enforcement                                      | RED   | Blocked until legal and departmental procedure is approved                          |
| Production deployment                                     | RED   | Infrastructure code may be prepared; activation requires human approval             |

## Approval evidence convention

Approval-gated configuration must reference an immutable approval record containing:

- approval identifier
- approving authority
- approval date
- effective date or financial year
- source document hash
- maker and checker identities

No code comment, chat message, or issue description substitutes for formal approval evidence.
