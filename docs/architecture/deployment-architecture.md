# Deployment Architecture

## Environments

| Environment      | Data                              | Integrations           | Access                     |
| ---------------- | --------------------------------- | ---------------------- | -------------------------- |
| Local            | Synthetic                         | Mocks                  | Developer                  |
| Preview          | Synthetic                         | Mocks/sandbox          | Authenticated project team |
| Development      | Synthetic                         | Sandbox                | Engineering/QA             |
| UAT              | Synthetic or irreversibly masked  | Sandbox                | Approved department users  |
| Staging          | Masked/controlled                 | Production-like        | Release team               |
| Pilot production | Live approved pilot data          | Approved live services | Pilot users                |
| Production       | Live                              | Approved live services | Authorized users           |
| Recovery         | Restored/replicated under control | Disabled or controlled | Operations only            |

## Vercel-first production baseline

- Paid organizational plan only
- Department-controlled domain, billing owner, source repository and administrator accounts
- Deployment protection on non-production environments
- Explicit production promotion and rollback
- Region chosen after data-residency, latency, integration and contract review
- Durable database, queue and storage are separate managed services

## Release flow

Commit -> static checks -> tests -> artifact build -> protected preview -> UAT release candidate -> named approval -> production promotion -> smoke tests -> monitoring -> rollback if required.

Database migrations are backward-compatible and run under a separately authorized deployment identity.
