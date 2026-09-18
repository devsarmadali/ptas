# Unresolved Legal and Policy Items

These are production blockers or approval gates.

| ID      | Item                                                           | Required evidence                               | Interim engineering treatment                           |
| ------- | -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| LEG-001 | Current consolidated Act and Finance Act 2026 delta            | Legal sign-off and source copy                  | Versioned configuration; no FY 2026-27 activation       |
| LEG-002 | Gazette-approved PFT-1, PFT-2 and PFT-3 layouts                | Gazette/source copies and template sign-off     | Renderer interfaces and provisional test templates only |
| LEG-003 | Final category/rate schedule for target year                   | Approved schedule with effective dates          | Test fixtures clearly marked non-production             |
| LEG-004 | Correct head-of-account matrix                                 | Finance/Treasury approval                       | Effective-dated config; no hard-coded value             |
| LEG-005 | Ex-parte, notice, penalty and recovery wording                 | Legal and departmental approval                 | Configurable content; block operative publication       |
| LEG-006 | Appeal service date, deadline calculation and authority naming | Legal interpretation                            | Clock service with disabled production policy           |
| LEG-007 | Refund versus adjustment operating procedure                   | Authorized SOP                                  | Generic adjustment case; payment-out flow disabled      |
| LEG-008 | Discontinuance/closure liability treatment                     | Legal interpretation and evidence rules         | Capture notification; do not auto-remove demand         |
| LEG-009 | ePay/e-Khidmat/treasury contracts                              | Signed technical and operational specifications | Ports and mocks only                                    |
| LEG-010 | Data residency, retention and privacy policy                   | Security/legal approval                         | Minimize data; configurable retention; no live data     |
