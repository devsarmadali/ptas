# Quality Gates

A story is not complete until applicable gates pass.

## Automated

- Formatting and linting
- Type checking
- Domain unit tests
- Database migration validation
- API contract tests
- Authorization/jurisdiction tests
- Integration idempotency and failure tests
- Browser journey tests
- Automated accessibility checks
- Build and dependency/security scanning

## Human

- Product acceptance against story criteria
- Legal/configuration sign-off for approval-gated behavior
- Accessibility keyboard/screen-reader review for priority journeys
- Security review for authentication, financial and integration changes
- Print comparison for official forms

## Release blockers

- Unauthorized jurisdiction access
- Editable approved versions or posted ledger entries
- Unreconciled financial calculation defects
- Missing audit evidence
- WCAG 2.2 AA critical/serious failures in priority journeys
- Production secret or personal data in repository/logs/tests
- Unapproved legal content activated
