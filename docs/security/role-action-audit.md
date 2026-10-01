# Role and Action Audit

## Authority rule

PTAS uses default-deny authorization. A role assignment grants only the actions listed below and
only inside its active jurisdiction. Technical administration never grants statutory authority.
Client-side visibility is advisory; every command and query must repeat the same check on the
server and, for exposed Supabase data, in PostgreSQL grants and RLS.

## Approved baseline matrix

| Action                                 | Inspector                                | ETO                                                    | Director                                               | Finance                          | Auditor                        | Assisted service                 | System admin                      |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | -------------------------------- | ------------------------------ | -------------------------------- | --------------------------------- |
| View assigned records                  | One assigned circle only                 | All descendants of assigned district/zone              | All descendants of assigned division/region            | Assigned financial views only    | Read-only assigned audit views | Intake case only                 | All jurisdictions; technical only |
| Bulk-import survey records             | Assigned circle only                     | Assigned district/zone and its descendant circles      | Denied unless explicitly delegated                     | Denied                           | Denied                         | Denied                           | Denied                            |
| Bulk-submit imported survey batch      | Allowed for own assigned circle          | Denied                                                 | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Bulk-approve imported survey batch     | Denied                                   | Allowed for eligible submitted units in assigned scope | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Create/feed survey                     | Allowed                                  | Denied unless a recorded delegation policy is approved | Denied                                                 | Denied                           | Denied                         | Intake only; no assessment       | Denied                            |
| Edit/close draft survey                | Allowed before submission                | Denied unless delegated                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Submit/resubmit assessment             | Allowed                                  | Denied                                                 | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Return/approve assessment              | Denied                                   | Allowed                                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Record show-cause service              | Allowed                                  | Denied unless delegated                                | Denied                                                 | Denied                           | Denied                         | Intake evidence only if approved | Denied                            |
| Impose penalty                         | Denied                                   | Allowed after configured prerequisites                 | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Request demand deletion/inactivation   | Allowed                                  | Review only                                            | Denied                                                 | Denied                           | Read-only                      | Denied                           | Denied                            |
| Approve demand inactivation/adjustment | Denied                                   | Allowed by approved workflow                           | Denied unless a separate legal authority is configured | Denied                           | Denied                         | Denied                           | Denied                            |
| Issue PFT-2                            | Denied unless approved policy assigns it | Allowed                                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Receive/reconcile PFT-2 payment        | Allowed only when explicitly assigned    | Allowed when explicitly assigned                       | Oversight only                                         | Allowed when explicitly assigned | Read-only                      | Payment assistance only          | Denied                            |
| Cancel PFT-2 administratively          | Denied unless approved policy assigns it | Allowed                                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                            |
| Hear/decide appeal                     | Denied                                   | Denied                                                 | Allowed                                                | Denied                           | Denied                         | Denied                           | Denied                            |
| Decide refund/adjustment               | Denied                                   | Allowed                                                | Allowed under Rule 5 policy                            | Prepare/reconcile only           | Read-only                      | Denied                           | Denied                            |
| Manage users/configuration             | Denied                                   | Subordinate assignments only when policy permits       | Oversight assignments only                             | Denied                           | Denied                         | Denied                           | Technical administration only     |

Any `Denied unless delegated` or `when explicitly assigned` cell is denied until an effective-dated,
audited delegation/configuration record exists. UI role selection or client metadata is not delegation.

## Audit findings and disposition

| Finding                                        | Previous behavior                                                          | Required disposition                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Technical admin inherited all statutory powers | `ADMIN` bypassed every action check                                        | Removed; admin is technical-only                                                               |
| Unknown actions were allowed                   | Authority switch defaulted to success                                      | Changed to default-deny                                                                        |
| Any officer could submit assessments           | ETO, Director, and Admin could act as maker                                | Restricted to Inspector absent approved delegation                                             |
| Director could approve assessments             | Oversight role inherited ETO approval                                      | Restricted to the assigned ETO                                                                 |
| Embedded officer passwords                     | Source and UI exposed reusable credentials                                 | Removed; passwords must be issued out-of-band                                                  |
| Offline auth fallback                          | Network/auth failure created a successful Inspector session                | Removed; authentication now fails closed                                                       |
| Client-editable metadata controlled authority  | `user_metadata` supplied role and jurisdiction                             | Removed; authority resolves from active server-side `app_users`/`user_roles` assignments       |
| Browser state is treated as authoritative      | Material commands mutate `localStorage` and then sync with a public client | Cloud sessions use authenticated transactional RPC commands; local pilot state is demo-only    |
| Database has no RLS/grant policy migration     | Exposed tables may rely on deployment defaults                             | Fixed: explicit grants, jurisdiction RLS, command RPCs, and linked-database tests are deployed |
| PDF endpoints accepted role headers            | Caller-controlled request values influenced document role context          | Fixed: bearer session is verified server-side and authority comes from trusted metadata        |

## Server enforcement requirements

- Resolve the actor from the authenticated server session and active `user_role` assignment; ignore
  client-supplied user, role, jurisdiction, circle, unit-owner, and inspector fields.
- Evaluate role, jurisdiction, designation/delegation, workflow state, prerequisites, and separation
  of duties in one transaction before changing state.
- Use conditional updates or row locks plus idempotency keys for every sensitive command.
- Emit an immutable audit event in the same transaction as the state change.
- Apply least-privilege grants and RLS to every exposed table/view/function and test SELECT, INSERT,
  UPDATE, and DELETE for each role independently of the UI.

## Jurisdiction scope

- Division and Region are parallel root tiers. District and Zone are parallel ETO tiers.
- A District or Zone belongs to one Division or Region.
- Tehsil is optional between District/Zone and Circle; a Circle may also belong directly to its
  District or Zone.
- An Inspector has exactly one active Circle assignment.
- An ETO assignment includes its District/Zone and every descendant Tehsil and Circle.
- A Director assignment includes its Division/Region and every descendant District, Zone, Tehsil,
  and Circle.
- Admin has system-wide technical visibility but is excluded from statutory command roles.
