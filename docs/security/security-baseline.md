# Security Baseline

## Identity and access

- Organizational identities; MFA for privileged and approving roles
- Least privilege, role plus jurisdiction and separation of duties
- Short-lived sessions, secure cookies, CSRF controls and reauthentication for high-risk actions
- Joiner/mover/leaver process and emergency access logging

## Application

- Server-side validation and authorization
- Parameterized database access
- Content Security Policy, secure headers, rate limiting and abuse detection
- File type/size validation, malware scanning interface and private object storage
- Signed, time-limited document access
- Dependency, secret, static and dynamic security scanning

## Data

- TLS in transit and encryption at rest
- CNIC/identifiers masked by default and access logged
- No personal data in analytics or general logs
- Environment isolation and separate credentials
- Backup encryption and restore testing

## Operations

- Centralized security/application/audit logs with correlation IDs
- Alerting for authentication abuse, privilege changes, unusual exports, ledger exceptions and integration failures
- Incident classification, containment, evidence preservation, notification and post-incident review
