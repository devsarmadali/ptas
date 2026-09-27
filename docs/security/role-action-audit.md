# Role and Action Audit

## Authority rule

PTAS uses default-deny authorization. A role assignment grants only the actions listed below and
only inside its active jurisdiction. Technical administration never grants statutory authority.
Client-side visibility is advisory; every command and query must repeat the same check on the
server and, for exposed Supabase data, in PostgreSQL grants and RLS.

## Approved baseline matrix

| Action                                 | Inspector                                | ETO                                                    | Director                                               | Finance                          | Auditor                        | Assisted service                 | System admin                  |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | -------------------------------- | ------------------------------ | -------------------------------- | ----------------------------- |
| View assigned records                  | Allowed                                  | Allowed in office                                      | Allowed for oversight                                  | Assigned financial views only    | Read-only assigned audit views | Intake case only                 | Denied by default             |
| Create/feed survey                     | Allowed                                  | Denied unless a recorded delegation policy is approved | Denied                                                 | Denied                           | Denied                         | Intake only; no assessment       | Denied                        |
| Edit/close draft survey                | Allowed before submission                | Denied unless delegated                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                        |
| Submit/resubmit assessment             | Allowed                                  | Denied                                                 | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                        |
| Return/approve assessment              | Denied                                   | Allowed                                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                        |
| Record show-cause service              | Allowed                                  | Denied unless delegated                                | Denied                                                 | Denied                           | Denied                         | Intake evidence only if approved | Denied                        |
| Impose penalty                         | Denied                                   | Allowed after configured prerequisites                 | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                        |
| Request demand deletion/inactivation   | Allowed                                  | Review only                                            | Denied                                                 | Denied                           | Read-only                      | Denied                           | Denied                        |
| Approve demand inactivation/adjustment | Denied                                   | Allowed by approved workflow                           | Denied unless a separate legal authority is configured | Denied                           | Denied                         | Denied                           | Denied                        |
| Issue PFT-2                            | Denied unless approved policy assigns it | Allowed                                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                        |
| Receive/reconcile PFT-2 payment        | Allowed only when explicitly assigned    | Allowed when explicitly assigned                       | Oversight only                                         | Allowed when explicitly assigned | Read-only                      | Payment assistance only          | Denied                        |
| Cancel PFT-2 administratively          | Denied unless approved policy assigns it | Allowed                                                | Denied                                                 | Denied                           | Denied                         | Denied                           | Denied                        |
| Hear/decide appeal                     | Denied                                   | Denied                                                 | Allowed                                                | Denied                           | Denied                         | Denied                           | Denied                        |
| Decide refund/adjustment               | Denied                                   | Allowed                                                | Allowed under Rule 5 policy                            | Prepare/reconcile only           | Read-only                      | Denied                           | Denied                        |
| Manage users/configuration             | Denied                                   | Subordinate assignments only when policy permits       | Oversight assignments only                             | Denied                           | Denied                         | Denied                           | Technical administration only |

Any `Denied unless delegated` or `when explicitly assigned` cell is denied until an effective-dated,
audited delegation/configuration record exists. UI role selection or client metadata is not delegation.

## Audit findings and disposition

| Finding                                        | Previous behavior                                                          | Required disposition                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Technical admin inherited all statutory powers | `ADMIN` bypassed every action check                                        | Removed; admin is technical-only                                                       |
| Unknown actions were allowed                   | Authority switch defaulted to success                                      | Changed to default-deny                                                                |
| Any officer could submit assessments           | ETO, Director, and Admin could act as maker                                | Restricted to Inspector absent approved delegation                                     |
| Director could approve assessments             | Oversight role inherited ETO approval                                      | Restricted to the assigned ETO                                                         |
| Embedded officer passwords                     | Source and UI exposed reusable credentials                                 | Removed; passwords must be issued out-of-band                                          |
| Offline auth fallback                          | Network/auth failure created a successful Inspector session                | Removed; authentication now fails closed                                               |
| Client-editable metadata controlled authority  | `user_metadata` supplied role and jurisdiction                             | Removed; authenticated email maps only to an approved pilot assignment                 |
| Browser state is treated as authoritative      | Material commands mutate `localStorage` and then sync with a public client | Open blocker: replace with authenticated server commands and transactional persistence |
| Database has no RLS/grant policy migration     | Exposed tables may rely on deployment defaults                             | Open blocker: add and verify explicit grants/RLS before any live Supabase use          |
| PDF endpoints accept role headers              | Caller-controlled request values influence document role context           | Open blocker: derive actor from the verified server session                            |

## Server enforcement requirements

- Resolve the actor from the authenticated server session and active `user_role` assignment; ignore
  client-supplied user, role, jurisdiction, circle, unit-owner, and inspector fields.
- Evaluate role, jurisdiction, designation/delegation, workflow state, prerequisites, and separation
  of duties in one transaction before changing state.
- Use conditional updates or row locks plus idempotency keys for every sensitive command.
- Emit an immutable audit event in the same transaction as the state change.
- Apply least-privilege grants and RLS to every exposed table/view/function and test SELECT, INSERT,
  UPDATE, and DELETE for each role independently of the UI.
