# Punjab Professional Tax Web Application — Consolidated Implementation Specification

## Purpose

This document consolidates **all implementation requirements provided in this conversation**. Treat it as one integrated specification for the AI coding agent. Do not omit any requirement. Existing functionality should be preserved unless a requirement below explicitly changes its presentation, workflow, or behavior.

---

# 1. Document / Notice / Challan UI and Terminology

## 1.1 Remove Browser Print Functionality

Remove browser Print functionality completely throughout the application.

- Remove visible Print buttons.
- Remove underlying print handlers such as `window.print()`.
- Remove obsolete print-specific components and CSS where they are no longer required.
- Do not replace the removed browser-print workflow with another print dialog.
- **Download PDF must remain available and fully functional everywhere it is currently required.**

## 1.2 PIN Terminology

The backend/database may retain the formal field name **Professional Identification Number**, but all user-facing references must use only:

> **PIN**

Do not display **UIN** to users. Replace user-facing UIN terminology with PIN.

PIN is the universal identification number for professional-tax entities province-wide when the application is scaled.

## 1.3 QR Codes in PDFs and Documents

PF2/PFT2 and other documents containing QR codes must render the actual QR code in downloaded PDFs.

Current problem:

- QR renders correctly in the web preview.
- Downloaded PDF renders a black box instead of the QR.

Fix PDF generation so that:

- The actual QR image/data is embedded in the PDF.
- It remains scannable.
- It matches the intended QR content.
- It is not replaced by a black placeholder.

For all relevant PF2/PFT2/challan/notice documents:

- Display the QR itself only.
- Do not display labels such as:
  - “Scan to verify”
  - “Notice Number”
  - “Scan to Verify”
  - “Verification Code”
  - or other redundant QR-label text.

QR codes should point to the public verification route described later.

## 1.4 Security Codes

Security codes must remain on relevant documents.

However:

- Do not label them “Security Code”.
- Do not label them “Security PIN”.
- Do not label them “PIN Code”.
- Do not confuse the security code with the entity's professional-tax PIN.

Show only a lock icon plus the actual security code, e.g.:

> 🔒 68XXXXXX

For PF2/PFT2 specifically:

- Put the security code directly below the QR code.
- Keep it inside the QR/verification box.
- Remove redundant QR label text.

## 1.5 Remove Urdu-Script UI Text

Remove all Urdu-script text from:

- notices;
- web pages;
- forms;
- labels;
- PDFs;
- dialogs;
- navigation;
- tooltips;
- menus;
- other user-facing UI.

The application should use English only.

Search source code/templates for Unicode Urdu-script text and remove/replace it.

## 1.6 Document Issuance from Unit Actions

When issuing a PF2/PFT2 or other notice/challan from a unit action:

- Do not open a child window/modal inside the same page.
- Construct a standardized issuance URL.
- Open the issuance workflow in a **new browser tab**.

Example:

`/documents/pf2/new?unit=<UNIT_ID>`

or an equivalent standardized route.

The architecture should be universal enough to support:

- PF2/PFT2;
- other challans;
- notices;
- future document types.

The URL/context should identify:

- document type;
- originating unit/entity ID;
- validated issuance context.

### Immutable Unit Context

The new tab must be immutably bound to the unit from which the action was triggered.

- Remove entity/unit dropdowns from context-specific issuance workflows.
- Show fixed/read-only entity information, such as:
  - Entity;
  - PIN.
- Backend must validate:
  - unit;
  - authorization;
  - entity existence;
  - PIN;
  - relationship between unit and entity;
  - requested document type.
- Do not trust hidden client fields or query parameters alone.
- Prevent cross-entity contamination through:
  - React state;
  - localStorage;
  - sessionStorage;
  - cached API responses;
  - stale child windows/tabs;
  - other client-side state.

The new tab must:

- preserve the correct unit context after refresh;
- work correctly when opened directly from the URL;
- preserve context when bookmarked;
- prevent IDOR/cross-unit access.

The original page must remain open.

### Universal Issuance Architecture

Use a common architecture for document issuance based on:

> Document Type + Unit/Entity ID + Validated Context + Issuance Workflow

Acceptance tests should include:

- Unit A issues PF2/PFT2 → correct Unit A entity appears.
- Unit B issues PF2/PFT2 → correct Unit B entity appears.
- Manipulating the URL cannot switch the entity to an unauthorized unit.
- No entity/unit dropdown appears in the context-specific workflow.
- Refresh/direct URL/bookmark retains the correct validated context.

---

# 2. Assessment / Tax Units and Survey / PFT3

## 2.1 PFT3 Assessment Register

PFT3 Assessment Register is now under **Assessment** and is the final operational register.

PFT3 must be a clean final operational register.

Remove from PFT3 Assessment Register:

- Bulk Import CSV;
- CSV upload/import;
- survey import;
- bulk survey submission controls.

## 2.2 Correct Survey Workflow

Bulk Import CSV belongs only under:

> **Tax Units and Survey**

Required workflow:

> CSV/Survey Import → Surveyed Units → Inspector Review/Submission → Submit Bulk Units for ETO Approval → ETO Bulk Approval → Approved Units become available in PFT3 Assessment Register

Do not duplicate this workflow inside PFT3 Assessment Register.

## 2.3 Row-Level Assessment Actions

Current unit action buttons exist in Tax Units & Survey, but assessment-related actions should be available in the rows of the **PFT3 Assessment Register**.

Operational assessment actions belong in the operational Assessment/PFT3 tab, not in reporting-only PFT3 views.

## 2.4 Role-Based Actions

Action buttons must be role-based both:

- in the UI;
- at the backend/API/database authorization layer.

Required hierarchy:

- Inspector sees only Inspector actions.
- ETO sees only ETO actions.
- Other roles cannot see or execute those actions.

Do not rely on frontend hiding.

Centralize the role/action permission matrix rather than scattering role checks throughout the application.

## 2.5 PFT3 View Details

Add **View Details** to PFT3 Assessment Register.

When clicked from a unit row:

- Open a new browser tab.
- Use a standardized route such as:

`/units/<UNIT_ID>/details`

The page must be immutable to that unit.

Backend must validate:

- target unit;
- authenticated user;
- actual role;
- jurisdiction/authorization.

Prevent IDOR/cross-unit access.

## 2.6 Search and Filtering

Replace the generic single “search anything” field as the primary search mechanism with separate structured search fields, including:

- Demand Number;
- PIN;
- Name / Unit Name;
- Class;
- other important identifiers as appropriate.

Search criteria must:

- work independently;
- work in combination.

Add separate structured filters:

- District-wise;
- Circle-wise;
- Locality-wise;
- Class-wise.

For large datasets, search/filter should preferably be server-side rather than filtering the full dataset in the browser.

Add relevant database indexes where justified, such as:

- PIN;
- demand number;
- unit IDs;
- district;
- circle;
- locality;
- class.

Preserve search/filter state in URL where appropriate, but do not place sensitive information in query parameters.

Apply only filters relevant to the particular tab/dataset.

---

# 3. Revenue and Citizen Desk

Current Revenue and Citizen Desk combines:

- PFT2 Challans;
- Receipts Collection;
- Demand/Payment Ledger;
- ePay Punjab reconciliation;
- Public Portal QR Authentication.

Split this into three separate tabs:

### Tab 1

**PFT2 Challans, Receipts Collection, Demand and Payment Ledger**

### Tab 2

**ePay Punjab Reconciliation**

### Tab 3

**Public Portal / QR Authentication**

## 3.1 ePay

ePay Punjab functionality should be architecturally implemented but remain completely disabled/inactive until the actual integration is implemented.

Do not simulate an ePay transaction.

Do not allow officers to manually create an ePay payment while the integration is disabled.

## 3.2 Public Verification Segregation

Public Portal / QR Authentication must be completely segregated from departmental working routes/URLs.

Prefer a separate namespace/domain where possible, e.g.:

`/verify/...`

Public verification must be:

- read-only;
- limited to the minimum necessary information;
- free of departmental editing/admin controls;
- free of departmental working navigation.

Internal departmental routes and public verification routes must remain logically separate.

QR codes on official documents should point to the public verification route.

---

# 4. User Management

Create a dedicated **User Management** module for ETU and Director users.

Suggested route:

`/admin/user-management`

Additional routes may include:

- `/admin/user-management/users`
- `/admin/user-management/users/<USER_ID>`
- `/admin/user-management/inspectors`
- `/admin/user-management/assignments`

## 4.1 Access

Visible and accessible only to:

- ETU;
- Director.

Backend must enforce this. Hiding the tab is insufficient.

Inspector must be blocked even when attempting to access the direct URL/API.

## 4.2 ETU Permissions

ETU can:

- change own password;
- change own permitted name/profile data;
- manage inspectors under its jurisdiction;
- assign/reassign circles to inspectors under its jurisdiction;
- view inspectors and circle assignments.

ETU must not:

- manage users outside its scope;
- manage other ETUs outside its scope;
- manage Director accounts;
- elevate users to Director;
- alter jurisdictions outside its authority.

## 4.3 Director Permissions

Director can, within authorized scope:

- create/assign ETU logins;
- create/assign Inspector logins;
- change names/data/mobile numbers;
- reassign circles and districts;
- manage user/account status.

## 4.4 Hierarchy

Use:

> Director > ETU > Inspector

District/circle assignment is authorization data, not merely profile information.

Changing a user's district/circle assignment must immediately affect their actual permissions.

## 4.5 Authentication and Profile Separation

Passwords must remain in the authentication provider.

Never store/expose passwords as ordinary departmental profile data.

Mobile-number changes used for authentication/OTP/recovery must follow secure authentication verification.

Keep separate:

- authentication/account data;
- departmental profile data;
- jurisdiction/authorization data.

Do not use user-editable metadata for authorization decisions.

## 4.6 Audit Trail

Record:

- who made the change;
- target user;
- timestamp;
- old value;
- new value;
- action type.

User-facing timestamps should use Pakistan time (UTC+05:00).

## 4.7 User Management UI

Separate the main UI into:

- ETUs;
- Inspectors;
- Jurisdiction Assignments.

ETU should see:

- own profile;
- subordinate inspectors;
- relevant circle assignments.

Director should see hierarchy:

> District → ETU → Inspector → Circle

## 4.8 Backend Security

Authorization must be enforced using secure departmental authorization tables and backend/RLS/server logic.

For Supabase:

- authorization must not rely on editable `user_metadata`;
- use secure authorization data;
- RLS/policies must enforce actual scope;
- backend must validate authenticated user + actual role + administrative scope + target user + requested change.

Do not expose privileged keys in the browser.

## 4.9 Acceptance

- Only ETU/Director can access.
- Inspector is blocked from UI, direct URL, and API.
- ETU can manage own permitted profile/password and subordinate inspectors/circles.
- Director can manage broader users/jurisdictions.
- District/circle changes affect authorization.
- Changes have audit records.
- No privilege escalation is possible through frontend/API/URL manipulation.

---

# 5. Intelligence & Governance — Statutory Category Yield Distribution

Existing Intelligence and Governance contains an Analytical Dashboard with **Statutory Category Yield Distribution**.

Move Statutory Category Yield Distribution into a separate dedicated tab.

Suggested route:

`/intelligence/statutory-category-yield`

## Requirements

- Analytical Dashboard should no longer display or unnecessarily fetch statutory-yield data.
- Refactor existing yield functionality into a reusable module/service.
- Do not duplicate calculation logic.
- Preserve existing:
  - categories;
  - definitions;
  - yield calculations;
  - assessment/recovery relationships;
  - aggregations;
  - filters;
  - charts;
  - tables;
  - totals;
  - percentages;
  - drilldowns.

This is a separation/refactor, **not a calculation change**.

New route must:

- work on refresh;
- work when opened directly;
- have appropriate Intelligence & Governance authorization.

High-level structure:

> Intelligence & Governance
>
> - Analytical Dashboard
> - Statutory Category Yield Distribution
> - Other modules

---

# 6. Intelligence & Governance — Statutory Reports Studio

Existing Statutory Reports Studio contains sub-tabs such as:

- Notice Dispatch Sheet;
- Defaulter;
- Area Scrolls;
- Clarity Certificate Log;
- Form PFT-3 Register.

## 6.1 Gazette Report

Current **Print Gazette Report** opens a modal/child window containing all units. This is incorrect.

Replace it with a **report download workflow**.

Do not:

- open a modal/child window;
- use browser print.

### Gazette Report Purpose

The Gazette report is for policy and decision-making.

Therefore it must contain **aggregated statistics/figures**, not unit-wise rows.

Potential content:

- total units;
- total assessments;
- total demand;
- total collection;
- total arrears;
- category-wise distribution;
- sub-category-wise distribution;
- area-wise distribution;
- assessment/yield statistics;
- other relevant statutory aggregates.

The report should be elegantly formatted for quick senior/policy review, emphasizing:

- headline figures;
- categories/subcategories;
- totals/subtotals;
- concise explanatory information.

## 6.2 Export Active Register

**Export Active Register** is the detailed alternative.

It must remain functional as a CSV export with row-wise data, organized according to:

- category/sub-category;
- relevant sub-tabs.

Distinction must remain clear:

> Gazette/Report Download = aggregated policy-level report  
> Export Active Register = detailed row-wise CSV  
> Operational Actions = processing individual units

## 6.3 Reporting PFT3

Form PFT-3 Register inside Statutory Reports Studio is reporting-only.

Remove all operational action buttons from reporting PFT3.

PFT3 operational actions belong only under:

> Assessment → PFT3 Assessment Register

Reports should be read-only operationally.

They may show information and, if genuinely needed, a read-only View Details/drill-down, but must not provide:

- assessment actions;
- notice issuance;
- challan issuance;
- approvals;
- editing;
- unit management.

## 6.4 General Action Placement Rule

Use this rule throughout the application:

> **Operational tabs may contain action buttons. Reporting tabs should not.**

Do not duplicate operational workflows in reporting screens.

Backend must still protect operational endpoints so that removing buttons from the UI does not make the endpoints themselves unsafe.

## 6.5 Acceptance

- Print Gazette Report no longer opens a modal.
- It downloads an aggregated policy-level report.
- Active Register still exports detailed row-wise CSV.
- Reporting PFT3 has no operational buttons.
- Operational PFT3 actions exist only in Assessment.
- Role authorization remains intact.

---

# 7. Global UI/UX Refinement — Single Scroll Architecture

The application currently has multiple scroll areas in child windows/tabs because of fixed-width/fixed-height layouts.

The application must adopt a **single-scroll-container principle**.

## 7.1 One Primary Vertical Scroll Area

Each page/window/tab should have one primary vertical scrolling context.

- Use a vertical scrollbar when content exceeds the viewport.
- Do not create nested vertical scroll containers inside:
  - tabs;
  - child windows;
  - cards;
  - tables;
  - banners;
  - action panels;
  - modal-like components;
  - sections.

Avoid fixed-height containers that force internal scrolling.

Where a large table exists, use an intentional responsive table strategy rather than unnecessary independent vertical scrollbars wherever technically possible.

Review and remove unnecessary:

- `overflow-y: auto`;
- `overflow-y: scroll`;
- fixed `height`;
- `max-height`;
- similar patterns that create secondary scroll areas.

## 7.2 No Horizontal Scrolling

There must be **no horizontal scrollbar anywhere** during normal use.

Correct the underlying layout rather than merely hiding overflow.

Do not solve the problem by applying only:

`overflow-x: hidden`

Instead:

- remove unnecessary fixed widths;
- use responsive/flexible layouts;
- wrap long text;
- allow labels/buttons/forms to reflow;
- use responsive grid/flex behavior;
- collapse/stack columns where appropriate;
- design tables responsively;
- intelligently wrap or truncate long identifiers/names/descriptions.

Avoid `white-space: nowrap` unless specifically justified.

Test common desktop and narrower viewport sizes.

## 7.3 Actions Overlay

The current Actions control opens a banner/label UI that contains action buttons and another scroll area. This must be redesigned.

When Actions is clicked:

- do not expand a banner;
- do not increase the row/container height;
- do not disturb the page width;
- do not push surrounding content down;
- do not create another scrollbar.

Instead, open a floating **overlay/popover** positioned relative to the Actions button.

The overlay:

- floats above existing content;
- does not affect document flow;
- does not change underlying dimensions;
- contains the available action buttons;
- remains within the viewport through intelligent positioning;
- normally has no internal scrollbar;
- closes when an action is selected;
- closes on outside click;
- closes with Escape where appropriate;
- preserves the underlying scroll position;
- remains visually associated with the row/entity.

Use a dropdown/popover pattern rather than an expanding banner.

## 7.4 Overlay Layering

The overlay must appear above:

- table rows;
- cards;
- tabs;
- surrounding content.

It must use appropriate z-index/stacking behavior without interfering with unrelated global dialogs.

Opening it must not cause layout shifting.

If it would extend outside the viewport, reposition it rather than creating page overflow.

## 7.5 General UI Audit

Audit the entire application for:

- nested overflow-y;
- nested overflow-x;
- fixed height/max-height;
- fixed-width containers;
- unnecessary min-width;
- horizontal overflow;
- scrollable cards;
- scrollable tabs;
- scrollable banners;
- scrollable modal bodies;
- nested table scroll containers;
- expanding action sections;
- components that change page dimensions when opened.

Refactor toward the single-scroll architecture.

## 7.6 Preserve Functionality

This is a UI/UX architecture refinement.

Do not remove:

- existing actions;
- filters;
- search;
- table functionality;
- tabs;
- forms;
- document controls;
- role-based controls;
- navigation.

Only change presentation/layout where necessary.

Role-based authorization must remain unchanged.

---

# 8. PFT2 Challan Issuance — Date Controls and Redundant Preview Removal

## 8.1 Remove Issue Date from Issuance Form

The PFT2 issuance screen must **not display an editable Issue Date field**.

Issue Date must be:

- automatically generated by the system at issuance;
- determined server-side;
- immutable after issuance;
- stored as the actual issuance timestamp/date;
- never controlled by the client.

The user should see no Issue Date input/control during issuance.

If the issued PFT2 displays an Issue Date, it must be the system-generated issuance date.

## 8.2 Due Date

Due Date is the **only manually configurable date**.

Due Date must remain within the current calendar month in which the challan is issued.

Rules:

- cannot be earlier than the permitted issuance/current date;
- cannot extend into a future month;
- maximum is the last calendar day of the current month;
- date picker disables dates outside the permitted range;
- backend independently enforces the same restrictions.

Example:

- Issuance date: 15 September
- Due Date range remains within September
- Maximum: 30 September.

Use Pakistan time (UTC+05:00) for issuance-date logic rather than relying on the client device clock.

## 8.3 Server-Side Date Validation

At issuance, backend must:

1. Determine current system date/time.
2. Set Issue Date/issuance timestamp automatically.
3. Ignore/reject any client-supplied Issue Date.
4. Validate Due Date belongs to the same calendar month.
5. Validate Due Date is not earlier than the permitted issuance date.
6. Reject manipulated requests attempting to bypass these restrictions.

## 8.4 Remove Redundant Issuance Preview

The current PFT2 issuance section contains information such as:

- Life Certificate;
- Identification Preview;
- PIN;
- Security Number/Code pattern;
- other automatically generated information.

This entire redundant section must be removed from the issuance interface.

The issuing officer does not need to preview or configure these values.

The issuance screen should focus only on information genuinely required to issue the challan, particularly:

- Due Date;
- issuance action;
- other genuinely necessary issuance controls.

## 8.5 Automatic Document Generation

When issuance is confirmed:

- system generates Issue Date;
- system generates/assigns PIN/security information according to existing rules;
- system includes required identification/verification information on final PFT2;
- final downloaded/issued document displays required information;
- issuance form does not redundantly reproduce it.

## 8.6 Acceptance

- No editable Issue Date.
- Server generates Issue Date.
- Client manipulation cannot change stored Issue Date.
- Due Date is the only configurable date.
- Due Date cannot exceed last day of current month.
- Due Date cannot be bypassed through API manipulation.
- Pakistan time UTC+05:00 is used.
- Life Certificate, Identification Preview, PIN, Security Number/Code pattern, and other automatically generated document information are removed from issuance UI.
- These values continue to appear correctly on the actual PFT2 where required.
- Issuance UI is simplified.

---

# 9. PFT2 Challan Types — Current, Arrear, and Combined Amount Validation

Existing PFT2 issuance supports:

- Standard / Current-Year Demand Challan;
- Arrear Challan;
- Section Office Combined Challan.

The amount logic must strictly reflect the actual financial balance.

## 9.1 Current-Year Demand Challan

When Current-Year Demand / Current Challan is selected:

- include only outstanding current-year demand;
- do not include arrears;
- use authoritative current-year assessment/demand records;
- exclude already-paid current-year amounts;
- officer cannot manually increase the calculated amount.

If no outstanding current-year amount exists:

- do not issue;
- do not generate a zero-value challan.

Display an elegant response such as:

> **No Current-Year Demand Pending**  
> There is no outstanding current-year amount available for challan issuance.

## 9.2 Arrear Challan

When Arrear Challan is selected:

- include only outstanding arrear amount;
- do not include current-year demand;
- use authoritative arrear balance.

If arrear is zero:

- do not issue;
- do not generate a zero-value challan.

Display:

> **No Arrear Pending**  
> There is currently no outstanding arrear amount available for challan issuance.

The same rule applies to non-positive arrear balances.

## 9.3 Combined Challan

Combined Challan must handle negative arrear balances as adjustments/credits against current-year demand.

Formula:

> **Net Payable = Current-Year Outstanding Demand + Arrear Balance**

Example:

- Current-year demand = Rs. 10,000
- Arrear balance = Rs. -3,000
- Net combined payable = Rs. 7,000

Combined challan should be issued for Rs. 7,000.

Do not issue Rs. 10,000 and do not issue a negative arrear amount.

## 9.4 Combined Zero/Negative Balance

After adjustment:

- Net Payable > 0 → may issue.
- Net Payable = 0 → do not issue.
- Net Payable < 0 → do not issue.

Display:

> **No Amount Payable**  
> After adjusting the applicable arrear balance against the current-year demand, there is no outstanding amount available for combined challan issuance.

Negative arrear balances must never appear as negative payable amounts on a generated challan.

## 9.5 Challan Type Separation

| Challan Type        | Amount Included                                                       |
| ------------------- | --------------------------------------------------------------------- |
| Current-Year Demand | Current-year outstanding amount only                                  |
| Arrear              | Arrear outstanding amount only                                        |
| Combined            | Current-year outstanding amount adjusted by applicable arrear balance |

Do not silently mix current demand and arrears in Current-Year or Arrear challans.

## 9.6 Backend Calculation and Validation

Backend must independently calculate and validate the amount.

Do not trust:

- frontend-calculated amounts;
- hidden form fields;
- query parameters;
- local storage/session storage;
- manually supplied amount values.

At actual issuance, re-check the latest authoritative balance.

Prevent race-condition problems where payment or another issuance changes the balance between display and final issuance.

## 9.7 Prevent Duplicate/Excess Collection

Before issuance verify latest outstanding balance so that:

- paid amounts are not collected again;
- settled amounts are not unnecessarily re-challaned;
- the same balance cannot repeatedly be converted into payable challans contrary to settlement rules.

Existing ledger/payment reconciliation should remain authoritative.

## 9.8 Acceptance

1. Current-Year Challan contains only current-year outstanding demand.
2. Arrear Challan contains only outstanding arrears.
3. Current-Year never includes arrears.
4. Arrear never includes current-year demand.
5. Zero arrears → No Arrear Pending and no challan.
6. Negative arrear balances act as adjustments for Combined.
7. Combined calculates net payable after adjustment.
8. Net zero → no challan.
9. Net negative → no challan.
10. Negative/zero amounts can never be printed on an issued challan.
11. Officer cannot override calculated amount.
12. Backend independently recalculates and validates.
13. Latest authoritative balance is checked at issuance transaction.
14. Non-payable responses are clear and professional.
15. Existing challan generation, PDF, QR, PIN, security-code, and document-number functionality remains intact.

---

# 10. Row Actions — Consolidate Multiple Actions into Overlay Menus

The application currently has inconsistent row-action presentation.

Some tabs, such as Assessment/PFT3, already use a single Actions control. Other tabs, particularly Receipts and PFT2, display multiple action buttons directly in each row.

This wastes space and creates visual clutter.

## 10.1 Universal Row-Action Pattern

Where a row has more than one available action:

> **Row → Actions button → Overlay action menu**

Do not display all action buttons directly in the row.

The single Actions control should open an overlay/popover containing all actions available for that exact row/entity.

The overlay must not expand or shift the underlying layout.

## 10.2 Apply Globally

Apply this to all tabs/registers where multiple row actions exist, including at minimum:

- Receipt tabs;
- PFT2 tabs;
- Assessment/PFT3 tabs where multiple actions exist;
- any other operational register discovered during the UI audit.

Do not fix only the currently identified tabs.

## 10.3 Single-Action Exception

If a row has exactly one available action, it may remain a direct action button.

Do not create an unnecessary overlay containing only one action unless a strong consistency reason exists.

## 10.4 Overlay Behavior

The overlay must:

- float above existing content;
- not change row height;
- not expand table;
- not push rows downward;
- not create page-level scrollbar;
- not create horizontal overflow;
- remain associated with selected row;
- reposition near viewport edges;
- close after action selection;
- close on outside click;
- close on Escape where appropriate;
- preserve table scroll position.

Use one reusable/popover component rather than separate custom implementations.

## 10.5 Role-Based Actions

Only display actions the authenticated user is authorized to perform.

This does not replace backend authorization.

Backend endpoints must independently enforce:

- authenticated user;
- role;
- jurisdiction;
- target entity;
- permitted operation.

Unauthorized users must not gain access by constructing API requests manually.

## 10.6 Visual Objective

Instead of:

`[View] [Edit] [Issue PFT2] [Receipt] [Approve] [Reject] [More...]`

Use:

`[Actions ▾]`

Clicking it opens:

`[View]`
`[Edit]`
`[Issue PFT2]`
`[Receipt]`
`[Approve]`
`[Reject]`

Exact actions remain dependent on role and record state.

## 10.7 Single-Scroll Integration

Actions overlay must not become a nested scrolling container.

Normally action list should size naturally. If an unusually large number of actions exists, use a viewport-aware popover strategy rather than unnecessary nested scrolling.

## 10.8 Acceptance

1. Rows with multiple actions show one Actions control.
2. Actions opens a floating overlay/popover.
3. Overlay does not alter row height.
4. Overlay does not push surrounding content.
5. Overlay does not introduce unnecessary scrollbars.
6. Receipt tabs follow the pattern.
7. PFT2 tabs follow the pattern.
8. Assessment/PFT3 and other applicable operational tabs follow the same reusable pattern.
9. Single-action rows may retain direct action.
10. Actions remain role/state specific.
11. Backend authorization remains independent.
12. Reusable RowActionMenu/Actions component is used.
13. Tables have substantially less visual clutter and wasted space.
14. Pattern is consistent throughout the application.

---

# 11. Receipt Collection — Three Payment Sources and Receipt Classification

Professional-tax payment can enter the system through three distinct sources. Their validation and amount-editing rules are different.

**Terminology:** The departmental document is **Form PFT2**. Do not call the system-issued PFT2 a “32A challan.”

## 11.1 Payment Source A — Previously Issued Form PFT2

Workflow:

> Issued Form PFT2 → Receive Payment → Receipt/Received Record

When receiving against an already system-issued PFT2:

- retrieve amount from authoritative issued-PFT2 record;
- received amount automatically equals issued PFT2 amount;
- officer cannot modify amount;
- store exact amount in Receipts/Received database;
- retain relationship to original PFT2;
- reject frontend/API attempts to alter it;
- preserve PFT2 identifiers and verification relationships.

This is a controlled receipt against a system-issued document.

## 11.2 Payment Source B — Manual Receipt

This applies where payment is received without an earlier system-issued PFT2 being the source record.

It includes:

- a manually presented PFT2 that was not previously issued through the system;
- applicable manual/32A process.

Workflow:

> Manual Receipt → Enter Amount → Validate → Create Received Record

For this source:

- officer may manually enter amount;
- amount is stored as entered subject to normal validation;
- record clearly indicates manual receipt;
- it must not be represented as payment against a system-issued PFT2;
- if an external/manual document number exists, store it separately from the system-generated PFT2 identifier.

## 11.3 Payment Source C — e-Pay Against Issued Form PFT2

Intended workflow:

> Issued Form PFT2 → e-Pay Punjab → Payment Confirmation → Receipt

Rules:

- amount originates from issued PFT2/e-Pay transaction;
- amount cannot be manually altered during receipt posting;
- payment reconciles against corresponding issued PFT2;
- received amount comes from authoritative e-Pay confirmation/transaction.

## 11.4 e-Pay Currently Disabled

The e-Pay pathway should be architecturally implemented but **completely disabled/inactive for the current phase**.

Do not:

- present a functional e-Pay receiving workflow;
- allow users to simulate confirmation;
- create fake/placeholder e-Pay transactions;
- allow officer to select e-Pay and manually enter an amount as authenticated e-Pay.

Underlying architecture/data model should be ready for future integration.

The option may be shown as disabled only if appropriate, with an unavailable/inactive indication.

When actual integration is later implemented, e-Pay becomes an independently authenticated source.

## 11.5 Mandatory Receipt Source Classification

Every Receipts/Received record must explicitly identify how payment was received.

Use a controlled source/type field, e.g.:

- `ISSUED_PFT2`
- `MANUAL`
- `EPAY`

Suggested labels:

| Internal Source | User-Facing Label                 | Current Status |
| --------------- | --------------------------------- | -------------- |
| `ISSUED_PFT2`   | Received Against Issued Form PFT2 | Active         |
| `MANUAL`        | Manual Receipt                    | Active         |
| `EPAY`          | e-Pay Against Form PFT2           | Disabled       |

Do not infer source later from amount/document number. Record source at receipt creation.

## 11.6 Amount Immutability

| Receipt Source              | Amount Origin                   | Editable During Receipt? |
| --------------------------- | ------------------------------- | ------------------------ |
| Previously Issued Form PFT2 | Existing issued PFT2 amount     | No                       |
| Manual Receipt              | Officer enters received amount  | Yes                      |
| e-Pay                       | Authenticated e-Pay transaction | No                       |

Backend must enforce these rules.

An `ISSUED_PFT2` amount modification request must be rejected.

An `EPAY` amount must not become manually editable through UI/API manipulation.

## 11.7 Database Design

Received/payment record should contain, where applicable:

- receipt ID;
- unit/entity ID;
- PIN;
- payment source;
- issued PFT2 ID;
- external/manual document reference;
- received amount;
- receipt date;
- receiving officer;
- financial year;
- e-Pay transaction/reference ID when applicable;
- audit timestamps.

For `ISSUED_PFT2`:

- explicit relationship to original PFT2.

For `MANUAL`:

- issued-PFT2 relationship should remain null unless a genuine system-issued document exists.

For `EPAY`:

- future implementation should maintain both issued-PFT2 relationship and authenticated e-Pay transaction reference.

## 11.8 Received Tab

Received/Receipts tab should visibly distinguish source.

Example Source values:

- Issued PFT2;
- Manual;
- e-Pay.

Source should be filterable so officers can independently view:

- receipts against issued PFT2;
- manual receipts;
- e-Pay receipts once enabled.

Do not use confusing terminology such as “32A Challan” for the system-issued PFT2.

## 11.9 Prevent Cross-Source Contamination

Do not allow one source to be converted into another simply through editing.

Examples:

- `ISSUED_PFT2` cannot become a manually entered amount.
- `MANUAL` cannot become payment against issued PFT2 unless a genuine relationship exists.
- Disabled `EPAY` cannot be manually created as e-Pay.
- Issued PFT2 original amount cannot be altered through receipt interface.

Enforce at backend/database level as well as UI.

## 11.10 Acceptance

1. Three payment-source architectures exist.
2. Issued Form PFT2 receipts use exact issued amount and cannot be modified.
3. Manual Receipt allows authorized manual amount entry.
4. e-Pay is architecturally supported but disabled until real integration.
5. Fake/manual e-Pay receipt cannot be created while disabled.
6. Every receipt has explicit source classification.
7. Source is stored in database and displayed in Received/Receipts tab.
8. Issued-PFT2 receipt retains original PFT2 relationship.
9. Manual receipt is distinguished from system-issued PFT2.
10. Future e-Pay receipts will be immutable and tied to authenticated transactions.
11. Backend enforces amount/source rules.
12. Frontend manipulation, hidden fields, query parameters, or API requests cannot bypass restrictions.
13. User-facing terminology uses **Form PFT2**, not “32A challan,” for system-issued PFT2.

---

# 12. Integrated Architecture and Security Requirements

All above changes must work together rather than being implemented as isolated UI patches.

## 12.1 Backend Authority

For all sensitive workflows, the backend/database must be authoritative.

Never trust:

- hidden form values;
- URL/query parameters;
- localStorage;
- sessionStorage;
- React state;
- client-calculated amounts;
- frontend-only role checks.

## 12.2 Supabase Security

Where Supabase is used:

- Enable RLS on exposed tables.
- Create policies matching actual authorization scope.
- Do not use editable `user_metadata` for authorization.
- Do not expose `service_role` or secret keys to the browser.
- Use secure departmental authorization tables.
- `TO authenticated` alone is not sufficient authorization; scope/ownership predicates are required.
- UPDATE policies need both `USING` and `WITH CHECK`.
- Do not use `auth.role()` for authorization.
- Avoid unnecessary `SECURITY DEFINER`; if genuinely required, keep privileged functions out of exposed public schema, validate `auth.uid()`, and secure execution.
- Be mindful that JWT/app metadata claims may not refresh immediately.
- Ensure public verification endpoints expose only intended read-only information.
- Protect against IDOR/BOLA in unit/document/user routes.
- Verify schema/data changes and run appropriate security advisors/tests after implementation.

## 12.3 Pakistan Time

Where user-facing or business-rule timestamps/dates are required, use Pakistan time:

> UTC+05:00

This is particularly important for:

- PFT2 Issue Date;
- Due Date validation;
- user-management audit timestamps;
- receipt dates where applicable;
- other statutory timestamps.

## 12.4 Reusable Components

Prefer reusable architecture for:

- row Actions overlay;
- document issuance context;
- role/action permission matrix;
- public verification;
- receipt source classification;
- report aggregation;
- search/filter controls;
- responsive layout.

Do not create duplicated one-off implementations where a shared component/service is appropriate.

---

# 13. Final Cross-Module Acceptance Checklist

Before considering the implementation complete, verify all of the following.

### Documents

- [ ] Browser Print removed.
- [ ] Download PDF remains functional.
- [ ] User-facing terminology is PIN, not UIN.
- [ ] PDF QR codes contain actual scannable QR images.
- [ ] QR label text is removed.
- [ ] Security codes remain but are shown only with lock icon + code.
- [ ] PF2/PFT2 security code is directly below QR in verification box.
- [ ] Urdu-script UI/document text removed.
- [ ] Issuance opens in a new browser tab.
- [ ] New tab is immutably bound to originating unit.
- [ ] Entity/PIN shown read-only.
- [ ] Backend validates unit/entity/authorization/PIN.
- [ ] URL manipulation cannot cause cross-entity contamination.

### Assessment / PFT3

- [ ] PFT3 is the final operational assessment register.
- [ ] Bulk CSV/survey import removed from PFT3.
- [ ] Survey import exists under Tax Units and Survey.
- [ ] Correct Inspector → ETO approval workflow retained.
- [ ] Assessment actions are in operational PFT3.
- [ ] Reporting PFT3 has no operational actions.
- [ ] Role/action permissions are enforced backend and frontend.
- [ ] View Details opens new tab and is IDOR-protected.
- [ ] Structured search fields exist.
- [ ] District/circle/locality/class filters exist.
- [ ] Large-data filtering is appropriately server-side/indexed.

### Revenue / Public Verification

- [ ] Revenue and Citizen Desk split into three tabs.
- [ ] ePay reconciliation is separate.
- [ ] Public QR verification is separate from departmental routes.
- [ ] Public verification is read-only/minimal.
- [ ] ePay is disabled until real integration.

### User Management

- [ ] Dedicated User Management URL.
- [ ] ETU/Director only.
- [ ] Backend authorization enforced.
- [ ] ETU scope enforced.
- [ ] Director hierarchy permissions enforced.
- [ ] Inspector cannot bypass through URL/API.
- [ ] Passwords remain in authentication provider.
- [ ] Authentication/profile/authorization data separated.
- [ ] District/circle assignments affect real permissions.
- [ ] Audit trail implemented.
- [ ] Pakistan time used for displayed audit timestamps.

### Intelligence & Governance

- [ ] Statutory Category Yield Distribution has dedicated tab/route.
- [ ] Analytical Dashboard no longer unnecessarily fetches/displays it.
- [ ] Existing calculations/definitions/filters/charts preserved.
- [ ] Statutory Reports Studio remains reporting-only.
- [ ] Gazette Report is an aggregated downloadable report.
- [ ] No modal/child-window Print Gazette workflow.
- [ ] Active Register remains detailed CSV export.
- [ ] Reporting PFT3 has no operational buttons.
- [ ] Operational actions remain only in operational tabs.

### UI/UX

- [ ] One primary vertical scroll context per page/window/tab.
- [ ] Nested scroll areas removed wherever unnecessary.
- [ ] No horizontal scrolling under normal supported viewport sizes.
- [ ] Fixed-width layout problems corrected rather than hidden.
- [ ] Content reflows responsively.
- [ ] Actions overlays float above content.
- [ ] Opening Actions does not alter layout dimensions.
- [ ] No nested scrollbar is created by Actions.
- [ ] Outside-click/Escape closing works.
- [ ] Overlay preserves scroll position.
- [ ] Row action presentation is consistent across modules.

### PFT2 Issuance

- [ ] Issue Date not displayed as editable control.
- [ ] Issue Date generated server-side at issuance.
- [ ] Due Date is only manually configurable date.
- [ ] Due Date stays within current month.
- [ ] Backend enforces date rules.
- [ ] Redundant Life Certificate/Identification Preview/PIN/Security Number preview removed from issuance form.
- [ ] Required values still appear on final challan.

### PFT2 Financial Logic

- [ ] Current challan contains only current-year outstanding amount.
- [ ] Arrear challan contains only arrears.
- [ ] Zero arrear → no challan + No Arrear Pending.
- [ ] Combined challan applies negative arrear as adjustment.
- [ ] Net zero/negative → no combined challan.
- [ ] No negative/zero payable challans generated.
- [ ] Amount recalculated server-side at issuance.
- [ ] Latest balance checked transactionally.
- [ ] Duplicate/excess collection prevented.

### Receipts

- [ ] Issued Form PFT2 receipt uses exact issued amount.
- [ ] Issued PFT2 amount cannot be modified.
- [ ] Manual receipt supports manual amount entry.
- [ ] Manual receipt is explicitly classified.
- [ ] ePay architecture exists but is disabled.
- [ ] ePay cannot be simulated.
- [ ] Every receipt stores explicit source/type.
- [ ] Source is visible/filterable in Received tab.
- [ ] Database relationships reflect source correctly.
- [ ] Cross-source conversion is prevented.
- [ ] System uses “Form PFT2” rather than calling issued PFT2 “32A challan.”

### Security

- [ ] Frontend hiding is never the only authorization layer.
- [ ] Backend/API authorization is enforced.
- [ ] IDOR/BOLA checks exist for units/documents/users.
- [ ] Client-calculated financial values are never trusted.
- [ ] Sensitive authorization data is not stored in editable user metadata.
- [ ] Supabase RLS/policies match actual jurisdiction/role scope.
- [ ] Privileged credentials are never exposed to browser.
- [ ] All significant changes are verified with appropriate tests.
