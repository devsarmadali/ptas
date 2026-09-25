# Professional Tax Administration Web App — Consolidated Implementation Issues

## Issue 02 — Eliminate Nested Scrolling & Fix Survey Template

### A. Scroll Architecture

- Remove all unnecessary nested/internal scroll containers.
- Use one primary vertical page scroll wherever possible; child sections, cards, panels, tables, modals, and windows must not introduce unnecessary independent vertical scrollbars.
- Keep vertical scrolling active where content exceeds the viewport.
- Completely eliminate horizontal scrolling/scrollbars across the application, including child windows, modals, tables, panels, and responsive layouts.
- Use responsive reflow, proper sizing, wrapping, adaptive tables, and layout adjustments instead of horizontal scrolling.
- Review fixed widths, `min-width`, flex/grid constraints, and other overflow causes.
- Ensure clean responsive behavior across desktop and smaller screen widths.

### B. Bulk Import Survey — Official Template

- In **Tax Units & Survey → Bulk Import Survey CSV → Download Official Survey Template**, do not export existing survey/unit records.
- Replace the current behavior that exports existing units with minimal data.
- Create a true blank official survey-import template based on the current database schema and survey functionality.
- Include all required/supported column headers, field structure, expected formats, and schema-compatible fields needed for survey creation/update.
- The template must be fillable externally and uploadable back into the system for survey creation/update.
- Keep the template synchronized with actual import validation and database fields.
- The modal/dialog must also follow the no-nested-scroll and no-horizontal-overflow requirements.

## Issue 03 — Survey Workflow, Assessment Queue & PFT2 Architecture

### A. Tax Units & Survey — Draft/Submission State

- Newly added/imported units must initially have **Updated/Feeded** status, not Submitted.
- While Updated/Feeded, Inspector actions remain **Edit Survey Data** and **Close Draft**.
- Once submitted, remove/disable both Edit Survey Data and Close Draft.
- Submission transfers the unit to the ETO level for approval or return.
- Enforce state restrictions in both UI and backend/authorization logic.

### B. Bulk Submission

- Add **Bulk Submit** in Tax Units & Survey.
- Allow one operation to submit all eligible Updated/Feeded units.
- CSV-imported units must also be eligible.
- Submitted units must enter the ETO assessment workflow.
- Prevent already submitted, approved, closed, or otherwise ineligible units from being resubmitted.

### C. Search & Filters

- Add a clean search/filter system to Tax Units & Survey.
- Follow the established search/filter patterns used elsewhere in the application.
- Support relevant workflow states such as Feeded/Updated, Submitted, Returned, Approved, etc.

### D. Assessment Queue — Returned Units

- Correct the state transition when an ETO returns a submitted unit.
- A returned unit must no longer remain stuck at Submitted.
- Return it to an appropriate Returned/Reassessment state.
- Restore permitted Inspector editing/reassessment capability.
- Verify the complete Inspector → ETO → Return → Inspector state transition at frontend and backend levels.

### E. Assessment Group Ordering

- Move **PFT Survey Assessment Register** to the first/leftmost position in the Assessment Group.

### F. PFT3 Assessment Register — Actions & Scrolling

- Remove the nested scroll area created by the Actions panel.
- Do not introduce another independent scrollbar when Actions is opened.
- Apply the overall no-nested-scroll/no-horizontal-overflow architecture.

### G. Remove Legacy PFT2 Chalan Flow

- Completely remove **Issue Form PFT2 Chalan** from the Actions panel.
- Remove its associated modal/dialog and obsolete functionality.
- Retain **Issue Form PFT2 New Tab** as the sole PFT2 issuance mechanism.
- Use the URL-based architecture for this workflow.

### H. PFT2 URL — Preserve Triggered Unit Context

- On a PFT2 URL opened from a specific unit, completely remove/disable **Select Taxpayer Establishment**.
- Keep the originating unit/establishment fixed and immutable.
- Prevent switching to another taxpayer establishment/unit.
- Enforce this server-side as well as in the UI.

### I. PFT2 PDF & QR Code

- Remove **Print Document** from the issued PFT2 page.
- Retain **Download PDF** as the document-generation mechanism.
- Ensure the QR code displayed on the web version is also embedded correctly in the downloaded PFT2 PDF.
- Verify the actual downloaded PDF, not only browser rendering.

## Issue 04 — PFT3 Actions Panel & URL-Based Documents

### A. View Form PFT1

- Replace the current child-window/modal behavior for **View Form PFT1**.
- Open **Form PFT1 — Notice of Tax Demand** through a dedicated URL.
- Follow the PFT2 New Tab URL architecture.
- Preserve originating unit context and provide appropriate view/download/issue functionality.

### B. Remove Receive Bank Payment Action

- Remove **Receive Bank Payment** from the PFT3 Actions overlay.
- Payment/receipt receiving must be performed from the issued PFT2 page.
- Do not redirect users from PFT3 Actions to Revenue & Citizens Desk → Form PFT2 Chalan.

### C. Consolidate Payment Actions

- Remove **View Status Tree Receipts**.
- Remove **Inspect Demand and Payment Ledger**.
- Replace them with one consolidated **Payment Details** action.
- Payment Details must open the relevant payment/collection information using the application's new URL-based architecture.

### D. Issue Land Areas Certificate

- Remove the child-window/modal implementation for **Issue Land Areas Certificate**.
- Open the certificate through a dedicated URL.
- Follow the PFT2 URL-based document architecture.
- Preserve originating unit context and prevent switching to another unit/taxpayer.
- Generate/view/issue the certificate from the dedicated page.

## Issue 05 — Statutory Reports Studio URL Architecture

- Move **MIS & Governance → Statutory Reports Studio** to a dedicated URL/page.
- Preserve the existing Statutory Reports Studio data and functionality.
- Remove child-window/modal-based report views.
- Actions such as **Print Schedule, Print Log, Print Role**, and similar report actions must open dedicated URLs/pages.
- Preserve relevant report/context parameters.
- Provide Download/print functionality from the dedicated report URL.
- Follow the URL-based architecture established for PFT1, PFT2, and other document/report pages.
- Avoid nested scrolling and horizontal overflow on report pages.

## Issue 06 — Remove Demand & Payment Ledger

- Completely remove the **Demand & Payment Ledger** tab and all associated functionality, routes, components, actions, and references.
- Remove all navigation/actions that open or depend on it.
- Do not retain duplicate or legacy functionality from the removed ledger.
- Strengthen **Receipts & Collection** as the primary consolidated receipt/collection interface.
- Integrate only necessary, non-duplicative functionality from the removed ledger.
- Make Receipts & Collection clean, structured, lightweight, searchable, filterable, and operationally useful.
- Clearly relate receipt/collection information to the relevant tax unit, demand, PFT2, receipt, collection status, dates, and amounts.
- Maintain authorization and data integrity while removing the redundant ledger architecture.

## Issue 07 — PFT2 Challan Lifecycle & Actions Cleanup

### A. Issued Challans

- Completely remove **View Challan** from PFT2 Challans.
- Remove its modal/child-window implementation and related code.
- An issued challan is immutable: no re-issuing, editing, or changing its details.
- **Download Challan PDF** is sufficient for viewing the issued challan.
- Remove duplicate functionality that allows an issued challan to be reopened for issuance.

### B. Remove View Unit Dossier

- Completely remove **View Unit Dossier** from the PFT2 Challans Actions panel.
- Remove its related code from this page.
- Unit Dossier belongs to the PFT3 Register.

### C. Cancelled Challans

- Once a PFT2 challan is cancelled, remove:
  - View Challan
  - Download Challan PDF
  - Re-issue/edit functionality
  - Related child-window/modal functionality
- A cancelled challan should remain as a lightweight historical record showing that it was issued and subsequently cancelled.
- Do not retain unnecessary generated PDF/image/document data for cancelled challans where no longer operationally required.

### D. Received Challans

- For received/paid challans, remove the redundant **View Challan** action.
- Retain the issued PFT2 PDF as historical documentation for received challans.
- Keep receipt/received status and relevant historical record intact.
- Represent the lifecycle clearly as **Issued → Received** or **Issued → Cancelled**, with actions appropriate to the final state.

### E. General Architecture

- Remove obsolete components, modals, routes, handlers, database references, and frontend code associated with discarded functionality where no longer required.
- Do not merely hide discarded buttons; remove the redundant functionality from the architecture.

## Issue 08 — Remove Internal Document Hash/Reference Codes

- In **Revenue → View Certificate / View Statutory Receipt**, completely remove user-facing display of **SHA-256 hashes, document hashes, internal reference codes, ETC codes, and similar technical identifiers**.
- These values must not be rendered in the frontend UI at all; do not merely hide them with CSS.
- Keep such identifiers only where technically required for backend integrity, verification, storage, or internal processing.
- Review related components, API responses, document templates, and frontend data models to ensure internal identifiers are not unnecessarily exposed to the client.
- User-facing certificates/receipts should display only official, meaningful information intended for the end user.

## Issue 09 — Statutory Receipt PDF & Executive PFT2 Brief

### A. Statutory Receipt PDF

- Reformat the **Statutory Receipt PDF** so it always fits on one page.
- Reorganize the complete layout rather than simply reducing font size.
- Remove redundant, duplicated, and non-essential information.
- Clearly link the receipt to the **received PFT2 number**.
- Include the relevant **PIN and Demand Number** of the associated tax unit.
- Retain other essential statutory/transaction details required for identification, verification, and official record purposes.
- Make the receipt compact, professional, readable, and suitable for official use.
- Ensure both browser presentation and generated PDF follow the same compact structure without unexpected second-page overflow.

### B. Executive PFT2 Brief

- In **Executive PFT2 Brief**, retain the existing functionality and add a **Download PDF** option alongside **Export CSV Receipt**.
- The PDF must provide a clean, professionally formatted executive summary of relevant PFT2 receipt/collection information.
- Generate the PDF directly from the brief data without unnecessary nested windows or redundant information.
