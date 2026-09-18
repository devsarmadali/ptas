# Vercel Deployment Notes

The region in `vercel.json` is a non-binding placeholder chosen for engineering rehearsal. Do not promote it to production until data residency, latency, external integration reachability, contract and disaster-recovery requirements are approved.

Production requirements:

- Organizational paid plan
- Department-owned project, domain, billing and administrator identities
- Protected previews and least-privilege deployment identities
- Separate environment variables and external service projects
- Log drain and external monitoring
- Explicit production promotion and rollback
- Off-provider data/document backup
