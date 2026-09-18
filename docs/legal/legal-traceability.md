# Legal Traceability Baseline

This file maps system capabilities to the supplied legal sources. Legal counsel and the department must validate the current consolidated law before production.

| Requirement                                          | Source baseline                                                    | System treatment                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Annual tax on listed persons/classes                 | Punjab Finance Act 1977, section 3 and Second Schedule, as amended | Effective-dated schedules and annual assessment                           |
| Highest-rate rule for multiple activities            | Finance Act section 3(2)                                           | Candidate-rate calculation with highest approved rate                     |
| Employer/DDO/principal-officer deduction and deposit | Finance Act section 3(2a)-(2c), as supplied                        | Employer registration, deduction statements, deposit and hearing workflow |
| Penalty up to tax amount                             | Finance Act section 3(5), subject to current validation            | Configurable ceiling and authorized order                                 |
| Annual taxpayer statement                            | Rules rule 3                                                       | Statement capture and filing status                                       |
| Assessing authority, particulars, appeal and hearing | Rules rule 4                                                       | Inquiry, evidence, hearing, order and appeal workflow                     |
| Refund or adjustment of wrongly collected tax        | Rules rule 5                                                       | Authorized refund/adjustment case and ledger entries                      |
| PFT-1 demand notice                                  | Rules rule 6                                                       | Approved document template and service evidence                           |
| DDO/principal officer collection statements          | Rules rules 7-8                                                    | Employer payroll statement and reconciliation                             |
| PFT-2 treasury/payment channel                       | Rules rule 9                                                       | Configurable payment document and channel adapters                        |
| Discontinuance notification within prescribed period | Rules rule 10                                                      | Notification, verification and future-status workflow                     |
| PFT-3 register                                       | Rules rule 11                                                      | Ledger-derived statutory register                                         |

## Source hierarchy

1. Enacted Act and amendments
2. Rules and amendments
3. Gazette-approved forms
4. Binding notifications/circulars
5. Department-approved templates and procedures
6. Validated operational requirements

Where sources conflict or appear outdated, create a legal issue and block activation.
