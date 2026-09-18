# Foundation Data Dictionary

This is the minimum engineering dictionary. Field-level form mapping must be expanded after official forms and master data are approved.

| Entity/field                   | Type          |    Required | Classification       | Rule                                                          |
| ------------------------------ | ------------- | ----------: | -------------------- | ------------------------------------------------------------- |
| jurisdiction.id                | UUID          |         Yes | Internal             | Stable identifier                                             |
| jurisdiction.parent_id         | UUID          | Conditional | Internal             | Hierarchy link: CIRCLE->OFFICE->DISTRICT->REGION (root null)  |
| jurisdiction.type              | Enum          |         Yes | Internal             | REGION/DISTRICT/OFFICE/CIRCLE                                 |
| user_role.jurisdiction_id      | UUID          |         Yes | Internal             | Bound jurisdiction; inspector limited to 1 active circle      |
| taxpayer.id                    | UUID          |         Yes | Restricted           | Internal identity, not printed                                |
| taxpayer.display_name          | Text          |         Yes | Restricted           | Normalized for search; original retained where required       |
| taxpayer.status                | Enum          |         Yes | Internal             | Effective workflow status                                     |
| taxpayer_identifier.type/value | Text          | Conditional | Highly restricted    | CNIC or approved identifier; encrypted/masked policy required |
| financial_year.code            | Text          |         Yes | Public               | Unique, effective dates immutable after activation            |
| assessment.id                  | UUID          |         Yes | Restricted           | One per taxpayer/year                                         |
| assessment_version.version_no  | Integer       |         Yes | Restricted           | Monotonic within assessment                                   |
| assessment_version.snapshot    | JSONB         |         Yes | Restricted           | Approved version immutable                                    |
| demand_ledger.amount           | Numeric(18,2) |         Yes | Restricted financial | Signed entry; never updated/deleted                           |
| demand_ledger.entry_type       | Text          |         Yes | Restricted financial | Approved controlled vocabulary                                |
| audit_event.payload            | JSONB         |         Yes | Restricted/security  | Minimized before/after metadata; no secrets                   |

See `packages/database/migrations/0001_foundation.sql` for enforceable constraints.
