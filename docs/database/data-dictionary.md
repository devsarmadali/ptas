# Foundation Data Dictionary

This is the minimum engineering dictionary. Field-level form mapping must be expanded after official forms and master data are approved.

| Entity/field                   | Type          |    Required | Classification       | Rule                                                                    |
| ------------------------------ | ------------- | ----------: | -------------------- | ----------------------------------------------------------------------- |
| jurisdiction.id                | UUID          |         Yes | Internal             | Stable identifier                                                       |
| jurisdiction.parent_id         | UUID          | Conditional | Internal             | DIVISION/REGION root; DISTRICT/ZONE child; optional TEHSIL; CIRCLE leaf |
| jurisdiction.tier              | Text          |         Yes | Internal             | DIVISION/REGION, DISTRICT/ZONE, optional TEHSIL, or CIRCLE              |
| user_role.jurisdiction_id      | UUID          |         Yes | Internal             | Bound jurisdiction; inspector limited to 1 active circle                |
| taxpayer.id                    | UUID          |         Yes | Restricted           | Internal identity, not printed                                          |
| taxpayer.display_name          | Text          |         Yes | Restricted           | Normalized for search; original retained where required                 |
| taxpayer.status                | Enum          |         Yes | Internal             | Effective workflow status                                               |
| taxpayer.current_circle_id     | UUID          |         Yes | Internal             | Responsible circle jurisdiction                                         |
| taxpayer_identifier.type/value | Text          | Conditional | Highly restricted    | CNIC or approved identifier; normalized value stored                    |
| taxpayer_identifier.masked     | Text          |         Yes | Restricted           | Masked display value (e.g. 35201*******1)                               |
| financial_year.code            | Text          |         Yes | Public               | Unique, effective dates immutable after activation                      |
| assessment.id                  | UUID          |         Yes | Restricted           | One per taxpayer/year                                                   |
| assessment_version.version_no  | Integer       |         Yes | Restricted           | Monotonic within assessment                                             |
| assessment_version.snapshot    | JSONB         |         Yes | Restricted           | Approved version immutable                                              |
| demand_ledger.amount           | Numeric(18,2) |         Yes | Restricted financial | Signed entry; never updated/deleted                                     |
| demand_ledger.entry_type       | Text          |         Yes | Restricted financial | Approved controlled vocabulary                                          |
| audit_event.payload            | JSONB         |         Yes | Restricted/security  | Minimized before/after metadata; no secrets                             |

Hierarchy invariants and role-to-tier constraints are enforced by
`packages/database/migrations/0004_organization_hierarchy.sql`.

# Survey import pipeline

`Survey_Import_Filled` is represented by four normalized tables. `survey_import_batches` records
file identity, actor, jurisdiction, counts, and lifecycle. `survey_import_rows` preserves each
supplied row and validation outcome. `survey_unit_profiles` holds the survey-specific extension of
an imported `survey_units` record. `survey_classification_rules` is the effective-dated,
approval-evidenced source used to derive all legal classification and rate fields; spreadsheet
values are reconciliation inputs only and cannot override it.

Imports are staged and promoted only through security-definer commands. Direct client writes are
revoked, RLS scopes reads by the authenticated actor's inherited jurisdiction, the Inspector's
single Circle is resolved from the server-side assignment, and each promotion enters the ordinary
survey workflow in `FEEDED` state rather than creating a PFT-3 register entry.
