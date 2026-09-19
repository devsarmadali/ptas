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

## Authentication & Deployment Domain Policy

### Pilot & Staging Phase (Vercel Deployments)

- During the active pilot and staging evaluations hosted on Vercel preview/production URLs (`*.vercel.app`), officer email domain restrictions are intentionally relaxed.
- Authenticated sessions allow authorized testers, department stakeholders, and evaluators using custom deployment domains, preview domains, or staging credentials to sign in and test statutory workflows across Inspector, ETO, and Director tiers without domain lockouts.
- Role and jurisdiction authority guards (AGENTS.md Rule 2) remain fully enforced in code regardless of domain.

### Full Production Rollout

- Mandatory restriction to official departmental domains (`@punjab.gov.pk` or designated provincial government SSO / SAML 2.0 IdP).
- Strict email domain whitelisting combined with organizational MFA and hardware token / OTP enforcement.
