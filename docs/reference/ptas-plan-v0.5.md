**GOVERNMENT OF THE PUNJAB**

Professional Tax Digitization Plan

Proposed Professional Tax Administration System (PTAS)

Punjab, Pakistan

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business, Legal, Functional, Technical, Cloud Deployment, Frontend,
UI/UX and Operations Plan

World-class frontend and UI/UX revision incorporating the source-aligned
legal plan, Vercel-first managed-cloud architecture, accessible design
system, responsive role portals and product operations through 15 July
2026

| Status: Draft v0.5 for departmental, legal, finance, product, accessibility, security and integration validation |
|------------------------------------------------------------------------------------------------------------------|

DRAFT v0.5 - FOR DEPARTMENTAL, LEGAL, FINANCE, PRODUCT, ACCESSIBILITY,
SECURITY AND INTEGRATION VALIDATION

# Document Control

| **Item**                                 | **Details**                                                                                                                                                                                                                                                                     |
|------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Document title                           | Punjab Professional Tax Digitization Plan                                                                                                                                                                                                                                       |
| Proposed system name                     | Professional Tax Administration System (PTAS)                                                                                                                                                                                                                                   |
| Version                                  | Draft v0.5 - world-class frontend, design system, accessibility and UI/UX integrated                                                                                                                                                                                            |
| Status                                   | Requirements and implementation baseline for departmental, legal, finance, product, design, accessibility, security, cloud procurement and integration validation                                                                                                               |
| Prepared through                         | 15 July 2026 (including current web research)                                                                                                                                                                                                                                   |
| Initial deployment                       | Commercial managed cloud/PaaS pilot for one or two districts, followed by phased Punjab-wide rollout                                                                                                                                                                            |
| Primary departmental users               | Director / District Officer, ETO / DDETO as legally applicable, Excise & Taxation Inspector, service staff/constable, authorized finance and system administration users                                                                                                        |
| External regulated parties               | Taxpayers/assessees, drawing and disbursing officers, principal officers, employers/local authorities/companies/public bodies, treasury/bank channels                                                                                                                           |
| Source hierarchy                         | Punjab Finance Act, 1977 and amendments; Punjab Professions & Trades Tax Rules, 1977 and amendments; Gazette forms and binding notifications/circulars; approved departmental templates; validated operational requirements                                                     |
| Supplied source limitation               | PFT-2 remains provisional. Official Gazette copies of PFT-1/PFT-2/PFT-3, the Punjab Finance Act 2026 delta, current Excise operational instructions, and ePay/e-Khidmat interfaces remain mandatory validation inputs before production approval.                               |
| Hosting baseline                         | No government data centre is currently available. PTAS will use a Vercel-first managed-cloud/PaaS model with managed PostgreSQL, durable queue/workflow services, private object storage and external observability/backup. Production must not use free/Hobby plans.           |
| Cloud decisions still requiring approval | Commercial plan and contract; primary/secondary region; data residency and cross-border processing; DPA/security review; billing owner; production support/SLA; database, queue and object-storage provider; exit/portability plan.                                             |
| Experience baseline                      | Research-led service design; role-based responsive interfaces; a Punjab Government Digital Design System; WCAG 2.2 AA; English/Urdu-ready architecture; coded Storybook component library; performance budgets; privacy-safe product analytics; and usability acceptance gates. |
| UX decisions still requiring approval    | Official Punjab/Excise brand assets and palette; Urdu scope and translation owner; assisted-digital model; approved browser/device inventory; analytics/telemetry policy; public self-service scope; usability targets after baseline research; and design authority.           |

| **Material additions in v0.5: World-class frontend and UI/UX architecture; user-centred service design; role-based information architecture; Punjab Government Digital Design System; Figma-to-Storybook component governance; responsive and bilingual-ready patterns; WCAG 2.2 AA; high-risk transactional UX; dashboard/table standards; Core Web Vitals budgets; privacy-safe product analytics; usability research; visual/accessibility regression; and frontend acceptance gates, plus all v0.4 cloud, DevSecOps, legal and integration controls.** |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# Contents

| **Section** | **Title**                                                           |
|-------------|---------------------------------------------------------------------|
| 1           | Executive Summary                                                   |
| 2           | Purpose, Objectives and Scope                                       |
| 3           | Source Hierarchy and Legal Baseline                                 |
| 4           | Legal Issue Register and Design Decisions                           |
| 5           | Organizational and Authority Model                                  |
| 6           | Current and Target Operating Models                                 |
| 7           | Source-Aligned Business Rules                                       |
| 8           | Functional Modules                                                  |
| 9           | Detailed Workflow Requirements                                      |
| 10          | Status Lifecycle                                                    |
| 11          | Roles and Permission Model                                          |
| 12          | Core Data Model and Constraints                                     |
| 13          | Forms, Documents and Numbering                                      |
| 14          | PFT-2 Specimen Mapping and Print Controls                           |
| 15          | Reports and Dashboards                                              |
| 16          | Offline Field Operations                                            |
| 17          | Recommended Technical, Cloud Deployment and Operations Architecture |
| 18          | Security, Audit and Governance                                      |
| 19          | Integrations                                                        |
| 20          | Data Migration                                                      |
| 21          | Non-Functional Requirements                                         |
| 22          | Implementation Roadmap                                              |
| 23          | Testing and Acceptance                                              |
| 24          | Risks and Mitigations                                               |
| 25          | Pending Inputs and Immediate Actions                                |
| Appendix A  | Legal Traceability Matrix                                           |
| Appendix B  | Working Second Schedule and Rates                                   |
| Appendix C  | Minimum Data Classification                                         |
| Appendix D  | Core Ledger and Correction Model                                    |
| Appendix E  | Web Research and Current Digital-Service Source Register            |

# 1. Executive Summary

The Professional Tax Administration System (PTAS) will replace
fragmented paper records with a controlled, source-traceable digital
process for annual professional tax assessment, notice, payment,
employer deduction, appeal, adjustment and recovery. The system must
preserve statutory decision-making by the legally authorized officers
while improving province-wide discovery of duplicate liabilities,
auditability, service tracking, payment allocation and reporting.

The supplied sources materially change the v0.1 design. Under the Rules,
PFT-1 is the notice of demand, PFT-2 is the treasury/payment instrument,
and PFT-3 is the register of assessed persons. The Rules also provide an
appeal to the Director within thirty days, require an opportunity of
hearing before relevant assessment and appeal decisions, and permit
written refund or adjustment orders where tax was wrongly collected.
These are core statutory functions and cannot be omitted from the legal
MVP.

The Punjab Finance Act also requires the highest applicable rate where
one person is engaged in more than one profession, trade, calling or
employment. The 2025 amendment introduces employer-side deduction and
deposit duties for drawing and disbursing officers and principal
officers, together with an opportunity of hearing before recovery from a
defaulting officer. PTAS therefore requires both direct-assessment and
employer-deduction operating models.

The supplied PFT-2 specimen confirms a three-copy layout for the
assessee, department and treasury; current-year and arrears components;
district, tehsil, locality, PIN and class; receipt and treasury fields;
head of account B01601; inspector contact/office details; and Urdu and
English notices. The specimen is marked provisional, so the template
engine must reproduce an approved official layout rather than hard-code
the sample.

| **Core design principle:** Digitize the legal process, not just the current paper movement. Every automated rule must be traceable to an effective-dated legal or departmental source, and every adverse order must preserve evidence, service, hearing and reasons. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 1.1 Outcomes

- A province-wide party and business registry with one annual liability
  calculation per liable party, while retaining multiple activities,
  locations and payment channels.

- Effective-dated tax schedules and a highest-rate determination engine
  for overlapping professions or categories.

- Digital annual statement intake, inquiry, hearing, assessment order,
  PFT-1 notice, PFT-2 payment instrument and PFT-3 register.

- Employer/DDO/principal-officer deduction schedules, deposits, annual
  statements and default recovery cases.

- Appeal, refund/adjustment, discontinuance, penalty and correction
  workflows with written reasons and immutable history.

- Exact three-copy PFT-2 printing, bilingual text support and
  field-by-field validation against the approved template.

- Offline field evidence collection without allowing offline approval of
  statutory orders.

Current web research changes the integration baseline. Professional Tax
is already presented through ePay Punjab using a unique 17-digit Payment
System Identifier (PSID), the ePay Professional Tax guide uses a legacy
“Assessee Code” registration flow, and e-Khidmat Markaz announced
Professional Tax payment availability on 3 June 2026. PTAS must
therefore coexist with and reconcile these channels rather than build a
disconnected replacement payment portal.

The direct Excise Professional Tax page supplied for this review must be
captured manually into the project repository because automated
retrieval was blocked by the site. Indexed reproductions indicate
operational practices such as computerized self-assessment, manual PFT-2
issuance, clearance certificates, call/demand notices and
category-specific evidence; these are treated as validation candidates,
not as substitutes for the Act, Rules, Gazette forms or approved SOPs.

- A channel-neutral payment-intent and reconciliation layer for PFT-2,
  ePay PSID, treasury receipts and e-Khidmat-assisted payment, with one
  authoritative allocation ledger.

- A digitally verifiable Professional Tax clearance certificate and
  controlled recovery-referral package, subject to approved templates,
  delegation and SOPs.

Because no government data centre is presently available, the
implementation baseline is a commercial managed-cloud architecture. The
recommended pilot uses Vercel for the Next.js web tier, protected
preview and production deployments, short request-response APIs, edge
delivery and web security; managed PostgreSQL for the authoritative
database; a durable queue/workflow provider for asynchronous tasks;
private object storage for statutory documents; and an external
log/security archive. The application remains portable by using
PostgreSQL, S3-compatible object interfaces, versioned REST contracts
and container-compatible TypeScript modules.

The user experience is treated as part of the control environment, not
as decoration. PTAS will use a research-led, role-based design system so
inspectors, ETOs, service staff, directors and administrators can
complete high-volume legal and financial tasks with fewer errors,
visible consequences and consistent evidence. The web interface will be
responsive, keyboard-operable, bilingual-ready and optimized for
ordinary office hardware and constrained field connectivity. High-risk
actions such as approval, penalty, refund, payment correction and
schedule publication will use review-and-confirm screens, explicit
server acknowledgement and immutable audit references rather than
ambiguous icons or optimistic updates.

- A governed digital design system and coded component library that keep
  all screens consistent, accessible, testable and maintainable across
  implementation partners.

# 2. Purpose, Objectives and Scope

## 2.1 Purpose

This plan is the source-aligned baseline for business owners, legal
reviewers, departmental leadership, implementation partners and software
teams. It translates the supplied Act, Rules and provisional PFT-2
specimen into business rules, workflows, data structures, forms,
controls, acceptance criteria and a phased implementation plan.

## 2.2 Objectives

- Implement annual professional tax for the effective financial year and
  approved Second Schedule.

- Ensure that a party engaged in multiple activities is charged once at
  the highest applicable rate, while retaining the evidence for every
  activity.

- Record the legal authority, source provision, effective date and
  approval for each configurable rule or form template.

- Support statutory opportunity of hearing, service evidence, reasoned
  orders and thirty-day appeal tracking.

- Support refunds or adjustments ordered in writing when tax was wrongly
  collected.

- Support direct payments and employer/DDO deduction and deposit
  channels without double collection.

- Produce accurate PFT-1, PFT-2 and PFT-3 outputs from a reconciled
  transaction ledger.

- Provide role- and jurisdiction-based access with complete audit
  history and no hard deletion of financial records.

- Integrate or coexist with the live ePay Professional Tax and e-Khidmat
  payment channels, preserving legacy assessee codes and reconciling
  every external payment to a PTAS liability.

- Support digitally verifiable clearance certificates, configurable
  notice campaigns and controlled recovery referrals without creating
  unsupported coercive powers in the application.

- Maintain a controlled web-source register and require manual
  archival/sign-off of pages that cannot be reliably retrieved
  automatically.

- Design the service around observed user journeys and task outcomes,
  not around database tables or the existing paper-file hierarchy.

- Achieve WCAG 2.2 Level AA for the web application and provide an
  accessible HTML alternative where an official print form cannot itself
  meet digital accessibility needs.

- Provide a reusable design-token and component architecture, documented
  in Figma and Storybook, with automated visual, interaction and
  accessibility tests.

- Measure task completion, error recovery, performance and adoption
  through privacy-safe product analytics and continuous user research.

## 2.3 Initial Programme Scope

| **Included in legal MVP**                                                                                           | **Deferred or conditional**                                                                                                         |
|---------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Identity, role, office, jurisdiction and delegation management                                                      | A new standalone taxpayer payment portal; PTAS should link to or integrate with the existing ePay/e-Khidmat channels instead        |
| Party, business, employer and professional activity registry                                                        | Automated external identity verification until legal and API approvals exist                                                        |
| Annual statement intake and document/evidence capture                                                               | Electronic signatures until an approved policy and service are available                                                            |
| Inquiry, hearing, assessment/order and PFT-1 notice                                                                 | Full automatic bank/treasury reconciliation before a reliable feed is available                                                     |
| PFT-2, PSID/payment-intent generation or mapping, ePay/e-Khidmat/treasury reconciliation, payment posting and PFT-3 | Advanced predictive analytics and unrelated taxes                                                                                   |
| Appeal, refund/adjustment, penalty and discontinuance workflows                                                     | Taxpayer mobile application and iOS field application                                                                               |
| Employer/DDO deductions, deposits and annual statements                                                             | Direct payroll integration except in a later approved phase                                                                         |
| Offline inspector evidence capture and migration tools                                                              | Province-wide rollout before pilot acceptance and legal sign-off                                                                    |
| Professional Tax clearance certificate, public verification code and controlled reissue/revocation                  | Direct 1-Link/bank integration where ePay already provides the government payment aggregator, unless Finance/PITB approve otherwise |
| Configurable reminder/call/demand notice campaign and recovery-referral evidence package                            | Automatic coercive recovery action without current legal delegation, service proof and approved SOP                                 |
| Research-led service blueprint, responsive prototypes, design system, component library and accessibility baseline  | Full public self-service redesign beyond ePay/e-Khidmat coexistence unless separately approved after the pilot                      |
| Role-specific desktop/tablet interfaces and mobile-optimized service/field journeys                                 | Native iOS application and advanced personalization unless an evidenced need is approved                                            |

## 2.4 Out-of-Scope Assumptions Removed

- PFT-1 must not be used as the internal assessment worksheet; a
  separate assessment worksheet/order record is required.

- A standard refund capability cannot be excluded because Rule 5
  expressly provides refund or adjustment by written reasoned order.

- Business discontinuance must not automatically cancel or prorate
  annual tax; the supplied Rule 10 only requires notice within thirty
  days, so financial effect requires a validated legal/departmental rule
  and an authorized order.

- CNIC, mobile and email are useful operational identifiers, but the
  supplied Rules do not make all of them statutory prerequisites. Field
  mandatory status must be classified and approved.

# 3. Source Hierarchy and Legal Baseline

PTAS must resolve requirements in the following order: primary
legislation; valid rules; Gazette forms and amendments; binding
departmental notifications/circulars; approved operational instructions;
and finally stakeholder preferences. A stakeholder preference cannot
override a higher source. Each configurable schedule, document template,
due date, penalty ceiling, payment head and authority assignment must
record its source and effective dates.

| **Source provision**     | **Source-aligned requirement**                                                                                                       | **System treatment**                                                                                        |
|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Finance Act s.3(1)       | Annual levy for each financial year on the classes and rates in the Second Schedule.                                                 | Financial-year master from 1 July to 30 June; effective-dated schedule and annual liability record.         |
| Finance Act s.3(2)       | Where a person has more than one profession, trade, calling or employment, tax is paid only for the activity with the highest rate.  | Store all applicable activities; calculate and charge the maximum applicable rate once; preserve reasoning. |
| Finance Act s.3(2a)-(2c) | DDO/principal officer deducts and deposits employment tax; defaulting officer can be ordered to pay after an opportunity of hearing. | Employer, employee schedule, deduction, deposit, default case, notice/hearing and recovery-order workflow.  |
| Finance Act s.3(3)       | Government may exempt any person or class.                                                                                           | Effective-dated exemption instruments with source document and affected class/person.                       |
| Finance Act s.3(5)       | Failure to pay within prescribed time may attract a penalty not exceeding the tax.                                                   | Penalty ceiling = tax; no other charge unless separately authorized; reasoned order and source required.    |
| Rule 2(e)                | A form includes a plain-paper statement/communication with the same particulars.                                                     | Accept structured digital submission or scanned equivalent while preserving mandatory particulars.          |
| Rule 2(i)                | Year means 1 July to 30 June.                                                                                                        | Financial-year date validation and prevention of inconsistent issue dates/schedules.                        |
| Rule 3                   | Liable person furnishes name, address and nature of profession/trade/calling/employment before 31 August.                            | Annual statement workflow, due-date monitoring and evidence of submission/non-submission.                   |
| Rule 4(1)-(2)            | ETO/DDETO has authority to determine where, from whom and how much tax is recoverable and may require particulars/documents.         | Assessment case, inquiry request, evidence checklist, legal-authority field and reasoned order.             |
| Rule 4(3)-(4)            | Appeal within thirty days from service; opportunity of hearing before orders/decisions under the rule.                               | Service date drives appeal deadline; hearing scheduling, attendance/non-attendance and decision record.     |
| Rule 5                   | Director and ETO may order refund or adjustment of wrongly collected tax on written application with reasons.                        | Application, verification, reasoned order, refund/adjustment ledger and maker-checker controls.             |
| Rule 6                   | Tax is paid on receipt of notice in Form PFT-1, in the manner and time stated.                                                       | PFT-1 notice generated from the authorized assessment/order and separately served.                          |
| Rules 7-8                | Employment deductions/deposits and annual statement of persons assessed, collected and recoverable.                                  | Deduction schedule, installment/lump-sum option, deposit allocation and year-end return.                    |
| Rule 9                   | Other persons pay through treasury on PFT-2 or by approved postal order/cheque channels.                                             | Configurable payment instrument and authorized receiving channel; PFT-2 remains the official payment form.  |
| Rule 10                  | Discontinuance must be notified within thirty days.                                                                                  | Closure/discontinuance notification and verification; no automatic tax remission without valid authority.   |
| Rule 11                  | ETO/DDETO maintains PFT-3 register of persons assessed.                                                                              | PFT-3 generated from the immutable liability and payment ledger.                                            |

**Source note:** Supplied consolidated Punjab Finance Act, 1977;
supplied Punjab Professions & Trades Tax Rules, 1977; supplied
provisional PFT-2 specimen. Current amendments and departmental
circulars must be verified before go-live.

## 3.1 Current Digital-Service and Web-Research Baseline

The following findings refine the programme baseline. They are
operational and integration evidence; they do not displace primary
legislation, valid Rules, Gazette forms or binding departmental
instructions.

| **Source / finding**                                    | **Planning implication**                                                                                                                                                       | **Validation status**                                                                   |
|---------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Excise Professional Tax page supplied by the department | Capture the complete page, anchor sections, downloads and last-updated metadata into the controlled repository; map each operational instruction to an owner and source level. | Manual capture and departmental sign-off required because automated access was blocked. |
| ePay Punjab official portal and FAQ                     | Professional Tax payments must support a unique 17-digit PSID, multiple banking channels, payment status/history and idempotent confirmation handling.                         | Current official digital-service baseline; API/data contract still required.            |
| ePay Professional Tax user guide                        | Preserve and migrate the legacy Assessee Code and provide registration/linking before a new payment intent is created.                                                         | Current public guide; confirm production validation rules and ownership.                |
| PITB e-Khidmat announcement dated 3 June 2026           | Model e-Khidmat as an assisted payment/service channel with operator identity, receipt handoff and reconciliation rather than as an unrelated manual payment.                  | Current official service announcement; SOP/API details pending.                         |
| Punjab Code: Punjab Finance Act 2026, Act L of 2026     | Perform a clause-by-clause delta against the 1977 Act, Rules and tax schedule before configuration freeze for FY 2026-27.                                                      | Enacted 1 July 2026; professional-tax impact not assumed until full legal review.       |
| Official 2001 rules/forms amendment PDF                 | Use as evidence of PFT-1 field structure and historical head B01600, but not as the current rate schedule. Resolve B01600/B01601 by form, channel and effective date.          | Official historical source; current form/head approval pending.                         |
| Indexed reproductions of the Excise operational page    | Validate self-assessment/manual routes, evidence checklists, clearance certificate and notice sequence through current SOPs.                                                   | Operational lead only; not authoritative until department confirms.                     |
| PITB professional-tax digitization description          | Inventory the existing professional-tax database, owners, identifiers and interfaces before designing a parallel registry.                                                     | Official programme context; current system boundary and data quality pending.           |

Research control: every web-derived requirement must record retrieval
date, URL, page title, publisher, screenshot/PDF hash where available,
source level, reviewer and supersession status. Search snippets and
third-party reproductions may identify questions but must not configure
tax, authority or enforcement rules.

# 4. Legal Issue Register and Design Decisions

| **Issue**                               | **Source observation**                                                                                                                                   | **Required decision / safe design**                                                                                                                                                        |
|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Form roles                              | Rule 6 identifies PFT-1 as notice of demand; Rule 9 identifies PFT-2 as payment form; Rule 11 identifies PFT-3 as register.                              | Rename the internal assessment screen “Assessment Worksheet/Order”. Generate and track PFT-1 separately before PFT-2 payment processing.                                                   |
| Hearing vs ex-parte wording             | Rule 4(4) requires opportunity of hearing. The provisional PFT-2 footer refers to ex-parte maximum tax and 100% penalty.                                 | Record notice, service and hearing opportunity. An ex-parte order may only follow documented non-response and approved legal wording; the footer must be legally approved.                 |
| Employer deduction after 2025 amendment | The Act now uses mandatory “shall deduct”; older Rule 7(2) says a principal officer acts “if so directed”.                                               | Primary legislation prevails. Obtain post-amendment operational instructions and make employer obligations effective-dated.                                                                |
| Refunds                                 | Rule 5 expressly allows refund or adjustment of wrongly collected tax.                                                                                   | Include controlled refund/adjustment in legal MVP; do not rely only on ad hoc adjustments.                                                                                                 |
| Discontinuance                          | Rule 10 requires notification within thirty days but does not state automatic cancellation, cut-off or pro-rata relief.                                  | Capture notification and evidence. Financial effect must require an authorized, source-coded order and must not be assumed.                                                                |
| PFT-2 date consistency                  | The specimen shows FY 2025-2026, issue 15/07/2026 and due 31/07/2026, which may require clarification.                                                   | Validate financial-year, issue date and due date consistency. Do not hard-code the sample values.                                                                                          |
| PFT-2 serial and PIN                    | The specimen uses “July 2026 - PFT2-V-01-15-1-1000” and PIN “V-01-15”; meanings are not defined in the supplied rules.                                   | Use an immutable internal ID plus a configurable official serial. Obtain approved serial component definitions before rollout.                                                             |
| Head of account                         | The specimen prints B01601.                                                                                                                              | Store as effective-dated finance master data and print the value approved for the transaction date.                                                                                        |
| Province-wide duplicate control         | The Act charges one highest-rate liability, while Rule 4 gives the assessing officer authority over where tax is recoverable.                            | Provide province-wide search and payment crediting, but route jurisdiction disputes to the authorized officer rather than auto-merging.                                                    |
| Statutory vs operational fields         | Rule 3 requires name, address and nature of activity; the specimen adds locality, PIN, class and contact fields.                                         | Classify every field as statutory, official-form, operational mandatory or optional. Do not reject a legally sufficient filing solely for a non-statutory optional field.                  |
| Punjab Finance Act 2026                 | Punjab Code lists Act L of 2026 as promulgated on 1 July 2026, after the supplied consolidated 1977 Act was last updated.                                | Complete and sign a clause-by-clause statutory delta before FY 2026-27 schedule/configuration freeze; do not assume no change.                                                             |
| Live ePay and e-Khidmat channels        | Professional Tax is already payable through ePay; e-Khidmat announced the service in June 2026.                                                          | Make channel integration/reconciliation part of the MVP baseline. Avoid a duplicate citizen payment front end.                                                                             |
| Legacy Assessee Code                    | The ePay Professional Tax guide requires an Assessee Code before registration.                                                                           | Treat it as a first-class external identifier, preserve formatting/history, and link it to the internal party/demand unit after duplicate review.                                          |
| Payment identity and confirmation       | ePay generates a unique 17-digit PSID for each tax-generating transaction.                                                                               | Store PSID separately from PFT serial and internal payment ID; enforce idempotent callbacks, status history, expiry and one-time financial allocation.                                     |
| B01600 / B01601 conflict                | The official historical PFT-1 amendment shows B01600, while the supplied provisional PFT-2 shows B01601.                                                 | Configure head of account by document, payment channel and effective date; require Finance sign-off and block issuance when unresolved.                                                    |
| Clearance certificate                   | Indexed operational content describes a plain-paper application, CNIC copy and proof of paid Professional Tax.                                           | Create a controlled application, ledger verification, approval, QR/verification and revocation/reissue process; validate current template and conditions.                                  |
| Notice sequence and recovery            | Indexed operational content refers to first, second, third and final call/demand notices; recovery law may involve separate revenue-authority processes. | Make notice stages configurable and source-coded. Generate a referral package; do not automate attachment/arrest/sale or similar coercive action without current legal delegation and SOP. |

# 5. Organizational and Authority Model

| **Role / party**                                     | **Source-aligned responsibility**                                                                                                                                                                                                        |
|------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Director / District Officer, Excise and Taxation** | Appellate authority under Rule 4(3); may order refund or adjustment under Rule 5; regional/divisional monitoring and policy oversight subject to current designations.                                                                   |
| **ETO / DDETO, as legally designated**               | Determines where, from whom and how much tax is recoverable; requests particulars/documents; conducts or records hearing; issues reasoned assessment/order and PFT-1; may order refund/adjustment; maintains PFT-3.                      |
| **Excise & Taxation Inspector**                      | Surveys and verifies facts, prepares assessment worksheet and evidence, supports service, records payment evidence, recovery activity and field reports. Does not exercise final statutory approval unless separately authorized by law. |
| **Service officer / constable**                      | Serves PFT-1 and other notices and records delivery/refusal/not-found outcomes, date, place, recipient and evidence. PFT-2 may also be delivered operationally but is not a substitute for PFT-1 service.                                |
| **Drawing and Disbursing Officer**                   | For employment cases, deducts and deposits tax, supplies employee/deduction details and may be subject to recovery order for default after hearing.                                                                                      |
| **Principal officer**                                | Performs employer/local authority/company/public body obligations, including deduction/deposit and reporting, subject to the Act, Rules and current instructions.                                                                        |
| **Taxpayer / assessee**                              | Furnishes annual particulars, responds to inquiry/hearing, pays directly or receives credit for employer deduction, may appeal and may apply for refund/adjustment.                                                                      |
| **Treasury / authorized bank channel**               | Receives payment, completes receipt fields and supplies transaction evidence or reconciliation data.                                                                                                                                     |
| **System administrator**                             | Technical provisioning, configuration deployment and support. Cannot assess, hear, penalize, decide an appeal or authorize refund/adjustment.                                                                                            |
| Finance / payment reconciliation officer             | Maintains approved payment-channel/head masters; reviews unmatched/duplicate/wrong-amount settlements; recommends corrections/refunds; cannot decide tax liability unless separately designated.                                         |
| e-Khidmat / assisted-service operator                | Performs approved identity/document intake and payment assistance under a restricted channel role; cannot assess, waive, correct the ledger or issue statutory orders.                                                                   |
| Recovery referral / competent revenue authority      | Receives an approved referral package and acts only under its own legal powers and SOP; PTAS records the handoff and outcome.                                                                                                            |

| **Authority control:** Permissions must be based on role, jurisdiction, current designation and delegated authority. A technical role must never inherit statutory powers, and a monitoring role must not silently become an approving role. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 6. Current and Target Operating Models

## 6.1 Source-Aligned Current Process

> 1\. Taxpayer furnishes an annual statement of name, address and nature
> of profession/trade/calling/employment, or the department identifies a
> potentially liable party.
>
> 2\. ETO/DDETO or authorized staff request particulars and documents
> and establish the relevant party, activity, jurisdiction and
> applicable schedule entry.
>
> 3\. The concerned person receives an opportunity of hearing before the
> assessment/order required by Rule 4.
>
> 4\. ETO/DDETO records the reasoned assessment/order and issues PFT-1
> notice of demand with time and manner of payment.
>
> 5\. A direct-paying taxpayer uses PFT-2 at the treasury/authorized
> channel or another payment method permitted by Rule 9.
>
> 6\. Department receives payment evidence, posts and allocates it to
> the annual liability, and updates PFT-3.
>
> 7\. Where tax is deducted through employment, the DDO/principal
> officer deducts, deposits and reports employee amounts.
>
> 8\. Aggrieved persons may appeal within thirty days of service.
> Wrongly collected tax may be refunded or adjusted by a written
> reasoned order.
>
> 9\. Discontinuance is notified within thirty days and investigated;
> any financial adjustment requires separate authority.

10\. In the digital route, an assessee may register an existing Assessee
Code, generate or receive a PSID/PFT-2 payment intent, pay through
ePay-supported channels or obtain assisted service at e-Khidmat, and the
department reconciles the confirmation to the same annual liability.

11\. A taxpayer may apply for a Professional Tax clearance certificate;
the department verifies the ledger, unresolved demands, stays/appeals
and identity before issuing a verifiable certificate under the approved
SOP.

12\. Unpaid cases progress through approved reminder/call/demand stages
and, where authorized, a documented referral to the competent recovery
authority; each stage preserves service and evidence.

## 6.2 Target Digital Process

| **Register party / activities** | **Receive annual statement**            | **Open inquiry / evidence**    | **Serve hearing notice** | **ETO reasoned order**         |
|---------------------------------|-----------------------------------------|--------------------------------|--------------------------|--------------------------------|
| **Generate & serve PFT-1**      | **Generate PFT-2 / employer deduction** | **Receive & allocate payment** | **Update PFT-3 ledger**  | **Appeal / refund / recovery** |

PTAS automates validations, calculation suggestions, document
generation, routing, deadlines, PSID/payment-intent mapping,
multi-channel reconciliation, certificate verification, reporting and
audit evidence. It does not automatically decide statutory questions or
coercive recovery actions reserved for the authorized officer or another
competent authority.

# 7. Source-Aligned Business Rules

| **ID**    | **Rule**                                                                                       | **System control**                                                                                                                                                          |
|-----------|------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **BR-01** | A financial year runs from 1 July to 30 June.                                                  | All liabilities, schedules, documents and reports are financial-year bound.                                                                                                 |
| **BR-02** | A liable person furnishes annual particulars before 31 August.                                 | Create an annual statement record and due-status; preserve submissions received in equivalent form.                                                                         |
| **BR-03** | A party may have multiple activities but pays only the highest applicable rate.                | Calculate every applicable category, select the maximum, record excluded lower rates and prevent duplicate annual collection.                                               |
| **BR-04** | The annual liability belongs to the liable party, not merely to a single business location.    | Model party, businesses, locations and activities separately; one liability determination per party/year, subject to legal exceptions.                                      |
| **BR-05** | ETO/DDETO determines where, from whom and how much is recoverable.                             | Jurisdiction and liability are officer decisions with source, evidence and reasons; the system may flag but not decide disputes.                                            |
| **BR-06** | An opportunity of hearing is required for Rule 4 orders and appeal decisions.                  | No final adverse status without service/hearing record or approved ex-parte basis after documented opportunity.                                                             |
| **BR-07** | Appeal is filed within thirty days from service of the order.                                  | Deadline is computed from service date; late filing requires a reason and approved legal treatment.                                                                         |
| **BR-08** | PFT-1 is the notice of demand.                                                                 | Generate from an approved order and track issue, service, due date, supersession and appeal linkage.                                                                        |
| **BR-09** | PFT-2 is the payment form for direct payers.                                                   | Print approved three-copy layout and support current, arrears and total amounts plus receipt fields.                                                                        |
| **BR-10** | PFT-3 is the register of assessed persons.                                                     | Generate from authoritative liability, payment, penalty, refund and adjustment transactions; users do not edit balances directly.                                           |
| **BR-11** | Payment channels include treasury and approved postal order/cheque methods under Rule 9.       | Instrument type, issuing bank/office, receipt/reference, date and status are mandatory according to channel.                                                                |
| **BR-12** | Employment tax may be deducted and deposited by a DDO/principal officer.                       | Create employee schedules, deduction periods, deposits, allocations, differences and default cases.                                                                         |
| **BR-13** | A defaulting DDO/principal officer receives an opportunity of hearing before recovery order.   | Separate employer-default case with service, hearing, order and recovery ledger.                                                                                            |
| **BR-14** | Penalty for failure to pay cannot exceed the tax.                                              | No penalty above liability; reason, order, authority and date are mandatory. Do not calculate unsupported late fee or interest.                                             |
| **BR-15** | Government exemptions must be source-based.                                                    | No free-text exemption. Record instrument, class/person, scope, effective period and approving authority.                                                                   |
| **BR-16** | Wrongly collected tax may be refunded or adjusted by written reasoned order.                   | Original payment remains; create refund or offset transaction linked to application and order.                                                                              |
| **BR-17** | Discontinuance must be notified within thirty days.                                            | Record reported date, notification date, verification and order; do not auto-remove annual liability.                                                                       |
| **BR-18** | Approved orders and posted transactions are immutable.                                         | Corrections use versioning or equal-and-opposite entries; no hard deletion.                                                                                                 |
| **BR-19** | Schedules, forms, head of account and notices are effective-dated.                             | Past transactions always render with the version effective at their legal date.                                                                                             |
| **BR-20** | Official document serials are distinct from internal identifiers.                              | Keep immutable internal references; reissue and supersede official documents when legally material data changes.                                                            |
| **BR-21** | PFT-2 numeric values must reconcile.                                                           | Current tax + arrears = total due; payable amount and words match; three copies contain identical transaction data.                                                         |
| **BR-22** | Operational identifiers must not override legal sufficiency.                                   | CNIC/mobile/email validation improves matching but missing non-statutory optional data cannot silently invalidate a legally sufficient statement.                           |
| BR-23     | Legacy Assessee Code is an external identifier used by the current ePay Professional Tax flow. | Preserve exact and normalized values, source and history; one code may not silently create a second party or annual liability.                                              |
| BR-24     | Each ePay tax-generating transaction uses a unique 17-digit PSID.                              | Store PSID, generation time, amount, expiry, status and source response separately from PFT serial and PTAS internal IDs.                                                   |
| BR-25     | External payment confirmations are evidence, not editable balances.                            | Process signed/authorized callbacks or approved files idempotently; retain raw payload/hash and reject duplicate financial posting.                                         |
| BR-26     | A screenshot or citizen receipt alone is not authoritative electronic settlement.              | Mark as evidence pending until matched to an approved bank/treasury/ePay confirmation or separately verified under SOP.                                                     |
| BR-27     | Head of account is document-, channel- and effective-date specific.                            | Block PFT-1/PFT-2 or payment-intent issuance when the applicable head is missing or unapproved; retain historical printed value.                                            |
| BR-28     | PTAS must not create a duplicate citizen payment ecosystem where ePay/e-Khidmat are live.      | Use registration/deep link/API/coexistence patterns approved by PITB/Finance and reconcile all channels to the same ledger.                                                 |
| BR-29     | A clearance certificate is issued only against an approved eligibility determination.          | Verify party identity, covered period, paid/adjusted balances, unresolved cases and authorized exceptions; issue immutable version with verification and revocation status. |
| BR-30     | Recovery communication and referral stages require an approved source and service evidence.    | Configure stage, template, waiting period, authority and permitted next action; no automated coercive order or hard-coded notice count.                                     |
| BR-31     | Current web instructions are controlled operational sources, not self-executing law.           | Archive and approve the page/SOP version before implementing mandatory evidence, service level, certificate or notice sequence.                                             |

# 8. Functional Modules

| **Module**                                          | **Purpose**                                                                                                                                                                               |
|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1\. Identity and Access                             | Authentication, optional MFA, account lifecycle, role, jurisdiction, designation and delegation.                                                                                          |
| 2\. Organization and Jurisdiction                   | Regions/divisions, districts, ETO offices, circles/localities, tehsils, PIN masters and assignment history.                                                                               |
| 3\. Party and Business Registry                     | Individuals, legal entities, employers, principal officers, DDOs, businesses, addresses, identifiers and professional activities.                                                         |
| 4\. Annual Statement Intake                         | Rule 3 particulars, assisted entry, scan/equivalent communication, due-status and acknowledgement.                                                                                        |
| 5\. Survey, Inquiry and Evidence                    | Field survey, document request, source, photographs, GPS, professional registration and income-tax evidence.                                                                              |
| 6\. Tax Schedule and Rule Configuration             | Second Schedule categories, conditions, area tests, rates, exemption instruments and legal references.                                                                                    |
| 7\. Assessment Worksheet and Order                  | Applicable-category analysis, highest-rate calculation, reasons, attachments, submission and ETO decision.                                                                                |
| 8\. Notice, Service and Hearing                     | Show-cause/hearing notices, PFT-1 service, hearing attendance, adjournment, non-response and service evidence.                                                                            |
| 9\. PFT-1 Document Management                       | Approved notice-of-demand template, due date, service, reissue, supersession and appeal linkage.                                                                                          |
| 10\. PFT-2 Payment Form                             | Three-copy generation, current/arrears totals, authorized channel, receipt fields, head of account and bilingual notes.                                                                   |
| 11\. Direct Payment Posting                         | Treasury/bank/postal/cheque evidence, verification, duplicate control, allocation and correction.                                                                                         |
| 12\. Employer/DDO Deduction                         | Employee schedules, installments or lump sum, deposit challans, annual statements and default recovery.                                                                                   |
| 13\. Appeals                                        | Thirty-day filing, grounds, record transmission, hearing, decision and implementation.                                                                                                    |
| 14\. Refunds and Adjustments                        | Application, verification, reasoned order, refund payment/offset and reconciliation.                                                                                                      |
| 15\. Discontinuance                                 | Thirty-day notification, verification, future status and source-based financial treatment.                                                                                                |
| 16\. PFT-3 and Recovery Ledger                      | Opening balances, demand, penalty, payments, refunds, adjustments, closing balance and printable register.                                                                                |
| 17\. Recovery Management                            | Due/overdue cases, reminders, visits, promises, default actions and escalation.                                                                                                           |
| 18\. Documents and Templates                        | Versioned official forms, notices, attachments, scans, bilingual content, PDF and print QA.                                                                                               |
| 19\. Reporting and Dashboards                       | Operational, statutory, financial, appellate, employer and audit reports.                                                                                                                 |
| 20\. Offline Field Operations                       | Assigned records, survey/evidence/service capture, secure synchronization and conflict review.                                                                                            |
| 21\. Migration and Data Quality                     | Validated import templates, provenance, duplicate review, opening balance reconciliation and sign-off.                                                                                    |
| 22\. Integration Gateway                            | ePay/treasury, payroll, identity, FBR evidence, SSO, SMS/email and future services.                                                                                                       |
| 23\. Audit, Security and Administration             | Immutable audit events, configuration maker-checker, logs, backups, exports and health monitoring.                                                                                        |
| 24\. Digital Payment Intent and PSID                | Assessee-code linking, ePay registration/deep link/API, PSID lifecycle, amount lock, expiry, status and raw response archive.                                                             |
| 25\. Payment Reconciliation and Exceptions          | Idempotent confirmation intake, daily settlement files, unmatched/duplicate/wrong-amount cases, suspense and maker-checker resolution.                                                    |
| 26\. Assisted Service / e-Khidmat                   | Operator/session identity, consent, document capture, payment handoff, receipt, service outcome and channel performance.                                                                  |
| 27\. Clearance Certificate                          | Application, evidence, ledger check, approval/rejection, QR/public verification, reissue, expiry and revocation.                                                                          |
| 28\. Notice Campaign and Recovery Referral          | Configurable call/demand stages, service, promise-to-pay, stay, evidence bundle and referral to the legally competent authority.                                                          |
| 29\. Web Source and Systems Inventory               | Controlled URL/page snapshots, source classification, existing database/interface inventory, ownership and supersession review.                                                           |
| 30\. Platform Engineering and Cloud Operations      | Vercel projects/environments, CI/CD, infrastructure configuration, secrets, observability, backups, restore testing, incident/change/release management, cost monitoring and vendor exit. |
| 31\. Product Design System and Component Library    | Design tokens, responsive layouts, accessible React components, Figma library, Storybook documentation, content patterns, versioning and design QA.                                       |
| 32\. UX Research, Prototyping and Service Analytics | User interviews, service blueprint, journey tests, clickable prototypes, feedback, task success, error funnels, adoption and continuous improvement backlog.                              |
| 33\. Frontend Quality and Accessibility             | WCAG 2.2 AA controls, keyboard/screen-reader tests, cross-browser E2E, visual regression, Core Web Vitals, bundle budgets and release gates.                                              |

# 9. Detailed Workflow Requirements

## 9.1 Party Registration, Duplicate Prevention and Jurisdiction

- Search province-wide by name, CNIC or other identifier where
  available, business name, professional registration, mobile, address,
  employer and existing PFT/PIN/demand references.

- Create a “party” record for the liable individual or legal entity,
  with separate business/activity and location records. Do not use a
  business unit as the only taxpayer identity.

- Probable duplicates are routed for review; exact identifier conflicts
  are blocked unless resolved by an authorized merge/link decision.

- Assign one responsible office/circle to each annual case while
  preserving other locations and jurisdiction evidence. Transfer does
  not erase historical authority or service.

- Record whether each identifier is verified, self-declared, migrated or
  inferred. Legal assessment may proceed on legally sufficient
  particulars even when an optional identifier is absent.

## 9.2 Annual Statement under Rule 3

> 1\. Open the financial-year filing period and due date before 31
> August.
>
> 2\. Capture name, address and nature of
> profession/trade/calling/employment, plus approved form and
> operational fields.
>
> 3\. Accept structured entry, assisted departmental entry, uploaded
> scan or equivalent communication containing the same particulars.
>
> 4\. Issue an acknowledgement and record the submission channel and
> date.
>
> 5\. Flag non-filers for inquiry without automatically imposing tax or
> penalty.

## 9.3 Inquiry, Hearing and Assessment Order

> 1\. Inspector or authorized officer opens an assessment case from a
> statement, survey, employer list or other source.
>
> 2\. Record all professional activities and evaluate every potentially
> applicable Second Schedule category for the effective year.
>
> 3\. Issue requests for particulars/documents and a hearing notice
> where required. Record service and response deadlines.
>
> 4\. System calculates candidate rates and highlights the highest
> applicable rate; the officer confirms facts, exclusions and legal
> source.
>
> 5\. ETO/DDETO records hearing outcome and a reasoned order determining
> where, from whom and how much tax is recoverable.
>
> 6\. Approval creates the annual liability. Changes after approval
> require a revised order/version and ledger adjustment, not overwrite.

## 9.4 PFT-1 Notice of Demand

- Generate PFT-1 only from an approved assessment/order or other legally
  authorized demand.

- Include the amount, payment manner and due time required by Rule 6,
  together with order reference and appeal information if present in the
  approved form.

- Track issue, print, reprint, service attempt, served date, recipient,
  refusal/not-found and supersession.

- The service date is the reference date for the Rule 4 appeal deadline.
  Reissue must not silently reset a statutory deadline without approved
  legal treatment.

## 9.5 PFT-2 Generation, Direct Payment and Posting

> 1\. Generate the official PFT-2 from an open demand, using the
> template effective on the issue date.
>
> 2\. Populate three identical transactional copies labelled Assessee’s
> Copy, Department’s Copy and Treasury’s Copy.
>
> 3\. Validate current-year amount, arrears, total, payable amount and
> amount in words. Print effective head of account and approved
> bilingual notices.
>
> 4\. Record payment channel: treasury, authorized bank, postal order,
> cheque or approved electronic channel. Capture receipt/reference and
> date fields required for that channel.
>
> 5\. Verify evidence and prevent duplicate posting by PFT-2 serial plus
> external receipt/reference and amount/date matching.
>
> 6\. Allocate payment across current tax, arrears and penalty according
> to approved policy. Post to the PFT-3 ledger and retain the original
> document image.

## 9.6 Highest-Rate Determination for Multiple Activities

- Store each activity and its evidence independently, including area
  classification, employees, capital, turnover/value, professional
  status and other schedule-driving facts.

- Calculate all applicable rates for the financial year and select the
  highest. Lower applicable categories remain visible as “not charged -
  lower than selected rate”.

- If liability was already paid through an employer or another
  district/channel, credit the payment before issuing additional demand.

- A later discovery of a higher-rate activity creates a revised order
  and differential demand; it does not create a second full annual
  liability.

## 9.7 Employer / DDO / Principal-Officer Workflow

> 1\. Register the employer/public body, principal officer and DDO with
> effective dates and jurisdiction.
>
> 2\. Receive or create an employee liability schedule with identity,
> taxable basis, annual amount and evidence.
>
> 3\. Support two equal deductions for October and April and a lump-sum
> option where legally/operationally applicable, while allowing current
> instructions to override by effective date.
>
> 4\. Record each deduction, deposit instrument and employee allocation.
> Reconcile payroll deduction total to treasury deposit total.
>
> 5\. Before year close, capture the statement of assessed persons,
> amounts collected/deducted and amounts still recoverable.
>
> 6\. For non-deduction or non-deposit, open a default case, serve
> notice, provide hearing opportunity and record the recovery order
> against the responsible officer.

## 9.8 Appeal

> 1\. Accept an appeal linked to the served order and calculate thirty
> days from the recorded service date.
>
> 2\. Capture grounds, requested relief, filing channel, documents, fee
> if any under later instructions, and whether filing is in time.
>
> 3\. Transmit the complete assessment record and audit history to the
> Director/appellate authority without allowing alteration of the
> original order.
>
> 4\. Record hearing notice, service, attendance, submissions and
> reasoned decision.
>
> 5\. Implement the decision through a new order/ledger adjustment;
> retain both the appealed order and appellate decision.

## 9.9 Refund or Adjustment of Wrongly Collected Tax

> 1\. Receive a written application from the aggrieved person and link
> the disputed payment(s).
>
> 2\. Verify payment, liability, duplicate credit, appellate order and
> any prior adjustment.
>
> 3\. Authorized ETO/Director records a written order with reasons
> specifying refund, future offset or rejection.
>
> 4\. Create a refund payable or adjustment transaction. The original
> payment remains visible and is never deleted.
>
> 5\. Reconcile treasury/payment records and close the application only
> after financial implementation evidence is attached.

## 9.10 Discontinuance

- Capture date of discontinuance, date of notification and whether
  notification was within thirty days.

- Inspector verifies the facts and future status. The system may stop
  future case generation after authorized closure status.

- Do not automatically remove current-year demand. Any remission,
  cancellation or adjustment must cite a valid source and a reasoned
  order.

- Reactivation creates a new status period; it does not overwrite prior
  closure evidence.

## 9.11 Penalty and Recovery

- Penalty is linked to failure to pay within the prescribed time and
  cannot exceed the tax amount.

- System provides a suggested ceiling only. Imposition requires
  authorized officer, legal source, notice/hearing treatment as
  approved, reasons and order date.

- Recovery actions include reminder, visit, service, promise, employer
  follow-up, payment plan only if authorized, escalation and closure. No
  unsupported interest or late fee is calculated.

## 9.12 ePay PSID and Multi-Channel Payment

1\. Search/link the party using PTAS identifiers and the legacy Assessee
Code; unresolved duplicate matches stop payment-intent creation.

2\. Select the approved liability components and create a payment intent
with amount, financial year, head of account, validity/expiry and
authorized channel.

3\. Obtain or map the unique 17-digit ePay PSID through the approved
interface. The PSID is not reused for a materially different amount or
liability.

4\. Store the request, response, timestamps, status changes and hashes.
Display/deep-link the approved payment channels without collecting bank
credentials in PTAS.

5\. Receive confirmation by authenticated callback, approved API or
reconciliation file. Processing is idempotent and cannot post the same
settlement twice.

6\. Allocate the confirmed amount to current tax, arrears and penalty
according to the source transaction; route short, excess, late, expired
and unmatched payments to an exception queue.

7\. Preserve manual treasury/PFT-2 processing as a continuity channel,
but prevent a manual posting from duplicating an already confirmed PSID
settlement.

## 9.13 Assessee-Code Registration and e-Khidmat Assisted Service

1\. Capture the external Assessee Code exactly as presented and
normalize a search key without altering the original value.

2\. Match it against party, business, district/circle/PIN and prior
demand data. Conflicts require departmental review before registration
or payment.

3\. At e-Khidmat or another approved assisted channel, identify the
operator and service centre, record the applicant’s consent/authority,
capture only required documents and provide an acknowledgement.

4\. The assisted operator may initiate registration/payment steps but
cannot alter assessment, waive demand, approve refunds, issue recovery
orders or resolve identity conflicts.

5\. Channel receipt and final settlement confirmation are stored
separately; the PTAS ledger changes only on the approved financial
event.

## 9.14 Professional Tax Clearance Certificate

1\. Receive an application for a defined party, financial year or
clearance period and record the purpose and applicant authority.

2\. Check identity, linked activities, annual liabilities, employer
deductions, direct payments, arrears, penalties, approved
adjustments/refunds, appeals/stays and unresolved reconciliation
exceptions.

3\. Inspector/finance staff prepare a verification report; the
authorized officer approves, rejects or returns the application with
reasons.

4\. Issue a versioned certificate with unique reference, covered period,
issue/expiry date if approved, QR/public verification token,
officer/office snapshot and status.

5\. Reissue or revoke through a reasoned workflow; never overwrite a
previously issued certificate. Public verification discloses only
minimum non-sensitive data.

## 9.15 Notice Escalation and Recovery Referral

1\. Start only from a due, unpaid and legally enforceable balance after
accounting for payment, adjustment, appeal/stay and service status.

2\. Use a source-approved campaign definition for reminder/call/demand
stages, templates, waiting periods, service methods and escalation
authority.

3\. Record every service attempt, response, promise, dispute and
payment; stop or pause automatically when the legal status changes.

4\. Where recovery by another authority is required, generate a signed
referral package containing the order, PFT-1/service record, ledger
statement, notice history, identity/jurisdiction evidence and
certificate of outstanding balance.

5\. Record acknowledgement, action and outcome received from the
competent authority. PTAS must not itself issue attachment, detention,
sale or similar coercive instruments unless an approved legal instrument
expressly assigns that function.

# 10. Status Lifecycle

| **Area**              | **Proposed statuses**                                                                                                                    |
|-----------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Party                 | Draft; Active; Inactive; Duplicate-Linked; Merged; Deceased; Archived                                                                    |
| Business/activity     | Reported; Verified; Active; Discontinued; Transferred; Rejected                                                                          |
| Annual statement      | Not Due; Due; Submitted; Acknowledged; Deficient; Accepted; Late; Not Filed                                                              |
| Assessment case       | Draft; Inquiry Issued; Awaiting Evidence; Hearing Scheduled; Heard; Ex-Parte after Opportunity; Submitted; Decided; Under Appeal; Closed |
| Assessment/order      | Draft; Approved; Served; Revised; Superseded; Set Aside; Implemented                                                                     |
| PFT-1                 | Draft; Issued; Assigned for Service; Served; Refused; Not Found; Superseded; Withdrawn                                                   |
| PFT-2                 | Draft; Issued; Partially Paid; Paid; Expired; Reissued; Superseded; Cancelled by Order                                                   |
| Payment               | Entered; Evidence Pending; Verified; Posted; Allocated; Corrected; Reversed by Order; Refunded                                           |
| Employer return       | Draft; Submitted; Reconciled; Deficient; Default; Closed                                                                                 |
| Appeal                | Draft; Filed; Scrutiny; Hearing Scheduled; Decided; Implemented; Closed                                                                  |
| Refund/adjustment     | Applied; Under Verification; Approved; Rejected; Payable; Paid/Adjusted; Closed                                                          |
| Discontinuance        | Notified; Verification Pending; Verified; Order Pending; Implemented; Rejected                                                           |
| Recovery              | Not Due; Due; Overdue; Under Follow-up; Stayed; Partially Paid; Paid; Adjusted; Closed                                                   |
| Payment intent / PSID | Draft; Registration Required; Generated; Active; Paid; Expired; Cancelled; Replaced; Exception; Reconciled                               |
| External confirmation | Received; Authenticated; Duplicate; Unmatched; Amount Mismatch; Posted; Rejected; Reversed                                               |
| Clearance certificate | Applied; Verification Pending; Returned; Approved; Rejected; Issued; Reissued; Expired; Revoked                                          |
| Recovery referral     | Not Eligible; Prepared; Approved; Referred; Acknowledged; Action Pending; Stayed; Recovered; Returned; Closed                            |

# 11. Roles and Permission Model

| **Action**                                 | **Inspector**             | **ETO/DDETO**               | **Director**                   | **Service / assisted staff** | **System admin**                   |
|--------------------------------------------|---------------------------|-----------------------------|--------------------------------|------------------------------|------------------------------------|
| **Create/update party and activity**       | Yes - assigned            | Yes - jurisdiction          | Read/oversight                 | No                           | Support only                       |
| **Prepare assessment worksheet**           | Yes                       | Yes/review                  | Read on appeal                 | No                           | No                                 |
| **Issue inquiry/hearing notice**           | Prepare/serve             | Approve/issue               | Issue for appeal               | Serve                        | No                                 |
| **Decide assessment/order**                | No                        | Yes                         | No at first instance           | No                           | No                                 |
| **Generate/issue PFT-1**                   | Prepare/print after order | Approve/issue               | Read                           | Serve                        | No                                 |
| **Generate PFT-2**                         | Yes after demand          | Yes                         | Read                           | Deliver only                 | No                                 |
| **Post payment**                           | Enter/verify per policy   | Authorize correction        | Monitor                        | No                           | No                                 |
| **Employer schedule/reconciliation**       | Prepare/verify            | Approve/default order       | Appeal/monitor                 | No                           | No                                 |
| **Decide appeal**                          | No                        | No                          | Yes                            | No                           | No                                 |
| **Order refund/adjustment**                | Verify/recommend          | Yes within authority        | Yes within authority           | No                           | No                                 |
| **Record discontinuance**                  | Verify                    | Decide effect/status        | Appeal/monitor                 | Serve                        | No                                 |
| **Impose penalty**                         | Recommend/evidence        | Yes if authorized           | Appeal/oversight               | No                           | No                                 |
| **Manage schedule/templates**              | No                        | Policy view                 | Approve/policy view            | No                           | Deploy approved configuration only |
| **View audit log**                         | Own/assigned case         | Jurisdiction                | Region/appeal                  | Own service                  | Technical/security                 |
| **Manage users**                           | No                        | Request/limited policy role | Oversight                      | No                           | Technical provisioning             |
| **Link Assessee Code / initiate PSID**     | Prepare/link - assigned   | Approve conflict resolution | Monitor                        | Assisted initiation only     | No                                 |
| **Reconcile electronic payment exception** | Evidence only             | Authorize per finance SOP   | Monitor                        | No                           | Technical retry only               |
| **Issue clearance certificate**            | Verify/recommend          | Approve/issue               | Appeal/oversight if assigned   | Application intake only      | No                                 |
| **Approve recovery referral**              | Prepare evidence          | Approve within authority    | Approve/monitor where required | Serve/acknowledge only       | No                                 |

| **Segregation of duties:** Configuration deployment, assessment approval, payment correction, appellate decision and refund/adjustment approval should be separate permissions. High-risk actions require reason, linked source/order and, where approved, maker-checker confirmation. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

Payment reconciliation, assisted-service and recovery-referral
permissions must be implemented as separate least-privilege roles even
where the same employee holds more than one approved designation.
External channel operators never receive assessment or ledger-correction
authority.

# 12. Core Data Model and Constraints

| **Domain**                      | **Illustrative entities**                                                                                                                                              |
|---------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Organization**                | regions, divisions, districts, tehsils, offices, circles, localities, pins, jurisdiction_assignments, delegations                                                      |
| **Identity and authority**      | users, roles, permissions, designations, user_roles, sessions, authentication_events                                                                                   |
| **Parties**                     | parties, persons, legal_entities, identifiers, contacts, addresses, party_status_history                                                                               |
| **Businesses and activities**   | businesses, business_locations, professions_activities, professional_registrations, activity_evidence                                                                  |
| **Employers**                   | employers, principal_officers, ddos, employee_tax_schedules, deductions, employer_deposits, employer_returns                                                           |
| **Legal sources and tax rules** | legal_sources, source_versions, financial_years, tax_schedules, categories, conditions, rates, exemptions, payment_heads                                               |
| **Annual statements**           | annual_statements, statement_versions, statement_documents, acknowledgements, deficiencies                                                                             |
| **Cases and hearing**           | assessment_cases, inquiries, document_requests, notices, service_events, hearings, submissions                                                                         |
| **Orders and liability**        | assessment_orders, order_versions, liability_determinations, applicable_categories, annual_liabilities, adjustments                                                    |
| **Forms**                       | pft1_documents, pft2_documents, pft2_copies, pft3_register_runs, document_templates, template_versions                                                                 |
| **Payments**                    | payment_instruments, payments, receipts, payment_allocations, treasury_entries, reversals, reconciliation_items                                                        |
| **Appeals and relief**          | appeals, appeal_hearings, appeal_decisions, refund_applications, refund_orders, refunds, offsets                                                                       |
| **Discontinuance and recovery** | discontinuance_notices, verification_reports, recovery_cases, recovery_actions, penalties                                                                              |
| **Documents and audit**         | documents, attachments, document_hashes, audit_events, data_exports, import_batches, import_errors                                                                     |
| **Integrations**                | integration_requests, integration_responses, epay_transactions, identity_checks, payroll_files, fbr_evidence                                                           |
| Digital channels                | external_assessee_codes, payment_intents, psids, channel_sessions, epay_requests, epay_responses, settlement_confirmations, reconciliation_batches, payment_exceptions |
| Certificates                    | clearance_applications, clearance_checks, clearance_decisions, clearance_certificates, certificate_versions, verification_tokens, revocations                          |
| Notice/recovery referral        | campaign_definitions, campaign_steps, call_notices, service_events, promises, recovery_referrals, referral_documents, external_recovery_updates                        |
| Source and systems inventory    | web_sources, source_snapshots, source_reviews, existing_systems, data_owners, interface_catalogue, field_mappings                                                      |

## 12.1 Key Constraints

- One annual liability determination per liable party and financial
  year, with versions and differential adjustments rather than duplicate
  full charges.

- Every charged amount is linked to an effective schedule category,
  condition evaluation, legal source and approved order.

- All potentially applicable activities are retained; exactly one
  selected highest-rate basis is used unless an approved legal exception
  exists.

- No final Rule 4 order without a hearing opportunity record or an
  approved documented ex-parte path.

- Appeal deadline uses immutable service date and preserves subsequent
  service attempts separately.

- Payment cannot be allocated above unallocated instrument amount or
  create a negative demand without an authorized refund/adjustment
  order.

- Penalty cannot exceed the relevant tax amount.

- Approved orders, PFT documents and posted transactions cannot be
  edited in place.

- Official document serials are unique within their approved scope;
  internal IDs are globally unique and never reused.

- Financial-year and template closure prevents unauthorized back-dated
  changes.

# 13. Forms, Documents and Numbering

## 13.1 Form Treatment

| **Document**                                    | **Digital treatment**                                                                                                                                         |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Annual statement / equivalent communication** | Structured Rule 3 filing or uploaded equivalent containing name, address and nature of profession/trade/calling/employment; versioned and acknowledged.       |
| **Assessment worksheet and order**              | Internal structured analysis plus the legally approved reasoned order. It is not labelled PFT-1 unless the approved Gazette form requires that label.         |
| **PFT-1**                                       | Official notice of demand under Rule 6, generated from an approved order, with payment manner/time and service record.                                        |
| **PFT-2**                                       | Official direct-payment/treasury form under Rule 9 with three copies, current/arrears totals, receipt fields, head of account and approved bilingual notices. |
| **PFT-3**                                       | Register of assessed persons under Rule 11, generated from the annual liability and transaction ledger for the responsible office/circle.                     |
| **Employer/DDO annual statement**               | Names of assessable persons, tax amount, amount collected/deducted and amount still recoverable, with deposit reconciliation.                                 |
| **Inquiry/hearing/service documents**           | Versioned notices, service reports, hearing minutes, submissions and evidence.                                                                                |
| **Appeal decision and refund/adjustment order** | Reasoned, signed/approved documents linked to the original order and implementation transactions.                                                             |
| ePay PSID / digital payment receipt             | External payment intent and receipt linked to PFT-2/liability; raw confirmation preserved and not treated as an editable official form.                       |
| Professional Tax clearance certificate          | Approved, versioned certificate with covered period, unique reference, verification token/QR, minimal public verification and revocation history.             |
| Call/demand notice and recovery referral        | Only approved templates/stages; linked service evidence, outstanding statement and competent-authority handoff.                                               |

## 13.2 Dual-Identifier Strategy

| **Identifier**                  | **Recommended approach**                   | **Notes**                                                                                                                                                             |
|---------------------------------|--------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Internal party ID**           | PT-P-########                              | Immutable province-wide system identifier; not dependent on district or amount.                                                                                       |
| **Internal case ID**            | PT-CASE-FY-########                        | One assessment case may contain multiple activities, notices and hearings.                                                                                            |
| **Annual liability ID**         | PT-LIAB-FY-########                        | Unique by party + financial year; supports versions and differential adjustments.                                                                                     |
| **Order reference**             | PT-ORD-FY-########-V##                     | Reasoned order version; previous versions remain visible.                                                                                                             |
| **PFT-1 serial**                | Approved template rule                     | Must match Gazette/departmental numbering and be separately unique.                                                                                                   |
| **PFT-2 serial**                | Configurable approved rule                 | The provisional specimen format is supported but not assumed final. If the official serial embeds amount, material correction requires a new serial and supersession. |
| **Appeal reference**            | PT-APP-YYYY-########                       | Linked to the appealed order and service date.                                                                                                                        |
| **Refund/adjustment reference** | PT-RA-YYYY-########                        | Linked to application, order and financial implementation.                                                                                                            |
| **Payment posting reference**   | PT-PAY-YYYYMMDD-########                   | Internal reference; external treasury/bank/postal/cheque reference stored separately.                                                                                 |
| Legacy Assessee Code            | Preserve source format, e.g. ABC-ZI 2-1234 | External identifier used by ePay registration; mapped to a PTAS party/demand unit with history.                                                                       |
| ePay PSID                       | 17-digit value supplied by ePay            | External payment-intent identifier; never generated locally unless the approved ePay contract requires it.                                                            |
| Clearance certificate           | PT-CC-YYYY-########-V##                    | Versioned; public verification token stored separately from the human-readable reference.                                                                             |
| Recovery referral               | PT-RR-YYYY-########                        | Links the approved evidence bundle and external authority acknowledgement.                                                                                            |

| **Numbering decision:** Do not make the official printed serial the database primary key. Keep a stable internal identifier and separately reproduce the official serial convention approved for each template version. |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 14. PFT-2 Specimen Mapping and Print Controls

The supplied provisional PFT-2 is a single A4 page divided into three
vertical copies. The digital template must use one shared data object
for all copies so that only the copy label differs. The final layout,
Urdu wording, serial convention and legal notice must be approved
against the Gazette and departmental printer tests.

| **Specimen area / field**                   | **Observed value or role**                                                                 | **PTAS treatment**                                                                                                             |
|---------------------------------------------|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| **Header status**                           | “Provisional”                                                                              | Template metadata; remove or retain only according to approved production template.                                            |
| **Department and Government heading**       | Excise, Taxation & Narcotics Control Department / Government of the Punjab                 | Versioned static text and logo asset.                                                                                          |
| **Copy labels**                             | Assessee’s Copy; Department’s Copy; Treasury’s Copy                                        | Required labels; all financial and taxpayer data identical across copies.                                                      |
| **PFT-2 serial**                            | Month/year plus code string                                                                | Unique official serial generated by configurable rule; internal ID stored separately.                                          |
| **Legal citation**                          | Section 3 of Punjab Finance Act, 1977 read with Rule 09                                    | Versioned template text; exact citation legally approved.                                                                      |
| **Form type and due date**                  | FORM PFT-2: Current Year; due date                                                         | Form subtype and due date fields; support arrears/combined layouts only if approved.                                           |
| **Financial year / month / issued on**      | 2025-2026; July 2026; 15/07/2026                                                           | Validate year and issue-date consistency; sample values are not defaults.                                                      |
| **District / tehsil / locality / PIN**      | Vehari / Vehari / Vehari / V-01-15                                                         | Master-data selections; define the legal/operational meaning of PIN before migration.                                          |
| **Class**                                   | Lawyers                                                                                    | Selected schedule class/category label for the effective year.                                                                 |
| **Profession description**                  | Name/address/professional registration narrative                                           | Structured party/activity/address fields plus rendered approved narrative.                                                     |
| **Name / cell number**                      | Separate blanks/fields                                                                     | Operational contact fields; mandatory status set by approved data policy.                                                      |
| **Current year tax / arrears**              | 1,000 / 0                                                                                  | Separate monetary components from ledger.                                                                                      |
| **Total tax due / payable to due date**     | A+C and PKR total                                                                          | Arithmetic validation and no negative amount.                                                                                  |
| **Amount in words**                         | One Thousand Rupees Only                                                                   | Server-generated from numeric total and locale; must match.                                                                    |
| **Amount & bank receipt no./date**          | Receipt entry area                                                                         | External receipt/reference, amount and date; scanned copy retained.                                                            |
| **Treasury officer seal / amount received** | Manual certification area                                                                  | Printable blank area plus optional captured certification data/image.                                                          |
| **Treasury receipt no. & date**             | Manual receipt area                                                                        | Structured fields for posting/reconciliation.                                                                                  |
| **Head of Account**                         | B01601                                                                                     | Effective-dated payment-head master; printed from approved configuration.                                                      |
| **Inspector / contact / office**            | Sarmad Ali; 067-9201262; office address                                                    | Assigned officer and office contact snapshot at issue time.                                                                    |
| **Urdu and English notices**                | Payment location, objection/contact and legal warnings                                     | Exact approved bilingual text stored in the template version; Unicode font and print QA required.                              |
| External Assessee Code / PSID               | Not shown on the supplied provisional paper specimen; current ePay flow uses both concepts | Add only in an approved digital/print zone or companion receipt. Do not alter the official PFT-2 layout without form approval. |
| Head-of-account cross-check                 | Historical official PFT-1 amendment shows B01600; provisional PFT-2 shows B01601           | Resolve per document/channel/effective date with Finance. Preserve the actual printed and settled head on each transaction.    |

## 14.1 Mandatory Print and Validation Controls

- The same PFT-2 data object renders all three copies; no copy-specific
  manual editing.

- Current tax + arrears = total tax due; payable amount and amount in
  words must match.

- The financial year, issue date, due date and schedule version must be
  logically consistent.

- A reprint preserves the original serial and records reprint
  count/time/user; a material correction creates a new serial and
  supersedes the old form.

- The template stores logo, legal citation, Urdu/English notices, head
  of account and authorized payment location by effective date.

- Print tests must confirm copy widths, perforation/cut alignment,
  readable Urdu, receipt writing space, QR/barcode placement if later
  approved, and output on actual departmental printers.

**Source note:** Supplied “Professional Tax Master - PFT2” provisional
specimen, dated/issued 15 July 2026.

Additional source control: the official historical PFT-1 amendment
available through Punjab Laws shows PFT-1 fields such as Demand No., Tax
No., Circle, District, Due Date, Tax Year, current/arrears/penalty/total
and Head of Account B01600. It is useful for field traceability but
contains historical rates and must not be used as the current schedule.
The difference from B01601 on the provisional PFT-2 is a blocking
Finance/form decision.

# 15. Reports and Dashboards

| **Audience / register**             | **Minimum requirements**                                                                                                                                                                 |
|-------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Inspector**                       | Assigned cases, annual statements due/not filed, inquiry and service tasks, hearing support, PFT-1/PFT-2 status, daily receipts, unallocated payments and recovery actions.              |
| **ETO/DDETO**                       | Pending decisions, hearing/service aging, annual liability by category, employer deduction reconciliation, payments, penalties, appeals filed, refund/adjustment applications and PFT-3. |
| **Director**                        | Appeal inventory and outcomes, ETO/district comparisons, recovery, adjustment/refund trends, unresolved jurisdiction/duplicate cases and compliance exceptions.                          |
| **Employer/DDO**                    | Employee schedule, deductions by period, deposits, unallocated difference, annual statement and default notices, delivered through assisted or future portal workflow.                   |
| **Finance/treasury reconciliation** | PFT-2 receipts by head of account, external reference, date, district, amount, unmatched items, reversals and refunds.                                                                   |
| **System administration**           | Login failures, authorization denials, sync errors, integration failures, backups, storage, template/configuration changes and import errors.                                            |

## 15.1 Minimum Standard Reports

- PFT-3 register by office/circle and financial year, reproducible from
  the ledger.

- Annual statement filing and non-filer report.

- Assessment/order, hearing and service pendency report.

- Current demand, arrears, penalty, collection, refund/adjustment and
  closing balance report.

- PFT-1 service and appeal-deadline report.

- PFT-2 issued/paid/unpaid/superseded and receipt reconciliation report.

- Employer/DDO deduction, deposit, employee allocation and default
  report.

- Appeal filed/decided/implemented and outcome report.

- Refund/adjustment application, order and implementation report.

- Highest-rate rule exception and possible double-collection report.

- Legal-source/version usage and configuration change report.

- PSID generated/active/expired/paid, channel usage, confirmation
  latency and payment exception report.

- ePay/e-Khidmat/treasury daily settlement and ledger reconciliation
  report with unmatched, duplicate and wrong-amount cases.

- Assessee Code link/conflict and legacy identifier quality report.

- Clearance certificate applications, rejections, issuance, reissue,
  expiry, revocation and public-verification report.

- Notice campaign stage aging, service outcomes, promises, stays and
  recovery-referral outcome report.

- Web-source review, current-system inventory and unresolved source/SOP
  decision report.

# 16. Offline Field Operations

Offline capability should be limited to evidence and service functions.
The server remains the legal system of record, and final assessment,
appeal, penalty, refund/adjustment and configuration decisions require
an online authoritative transaction.

| **Requirement**                   | **Proposed behaviour**                                                                                       |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------|
| **Assigned data**                 | Download only necessary assigned parties, cases, service tasks and reference masters with expiry.            |
| **Offline capture**               | Survey, address, activity facts, documents, photographs, GPS, service outcome, hearing attendance and notes. |
| **No offline statutory approval** | Orders, penalties, appeal decisions and refunds remain disabled offline.                                     |
| **Queue and signing**             | Store encrypted, device-bound, hashed transaction packages until sync.                                       |
| **Conflict control**              | Approved server versions are immutable. Conflicts enter a review queue; no silent overwrite.                 |
| **Data minimization**             | CNIC and sensitive identifiers masked unless necessary for the assigned action.                              |
| **Device loss**                   | Remote account/session revocation, encrypted local storage and controlled wipe where supported.              |
| **Evidence integrity**            | Original capture timestamp, device, user and file hash retained; edited copies stored as new versions.       |

# 17. Recommended Technical Architecture

The technology choices below are implementation recommendations, not
legal requirements. Because no government data centre is currently
available, v0.5 adopts a Vercel-first managed-cloud/PaaS baseline. The
architecture preserves a modular monolith/domain design while separating
web delivery, durable state, asynchronous processing, integrations,
security telemetry and backups. Provider-specific features must be
revalidated during procurement and before production.

| **Layer**                                | **Recommended approach**                                                                                                                                                                                                       |
|------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Web portal**                           | Next.js with TypeScript/React deployed on Vercel. Use CDN/edge delivery for public assets and short-lived, authenticated server functions for request-response work.                                                           |
| **Field application**                    | Android application or installable PWA with encrypted offline store and controlled sync.                                                                                                                                       |
| **Backend API**                          | Server-enforced modular TypeScript domain APIs. Pilot may run as Vercel Functions/Next.js route handlers; modules must remain deployable to a managed container service if workload, networking or duration limits require it. |
| **Workflow and legal rule engine**       | Effective-dated rule/configuration service that records source provision, approval, dates and test cases.                                                                                                                      |
| **Database**                             | PostgreSQL with strong relational constraints, transaction ledger and application-enforced jurisdiction; database row-level controls where practical.                                                                          |
| **Document service**                     | Server-side rendering of versioned PFT and notice templates, bilingual font support, PDF/A consideration and document hashes.                                                                                                  |
| **Object storage**                       | Private managed S3-compatible or equivalent object storage with encryption, versioning, signed access, malware scanning, retention controls and an off-provider backup path.                                                   |
| **Queue/cache**                          | Managed Redis plus durable HTTP queue/workflow service for idempotency, locks, rate limits, retries, reports, documents, sync and reconciliation. Redis is not a system of record.                                             |
| **Integration gateway**                  | Adapters for live ePay Professional Tax, e-Khidmat assisted service, treasury, identity, payroll, FBR evidence, SSO and messaging, isolated from core legal logic.                                                             |
| **Deployment**                           | Vercel-first managed-cloud/PaaS deployment. Separate Vercel projects and separate data stores for preview, development/integration, UAT, staging/pilot and production; no dependency on a government data centre.              |
| **Monitoring**                           | Vercel runtime/firewall/audit telemetry plus application, database, queue and storage metrics drained to an external retained observability/security platform with alerts and runbooks.                                        |
| Payment orchestration and reconciliation | Channel-neutral payment-intent service, PSID mapping, authenticated/idempotent confirmation processor, settlement-file importer, exception queue and ledger allocator.                                                         |
| Public certificate verification          | Read-only, rate-limited verification endpoint exposing minimum certificate status data; no unrestricted taxpayer search.                                                                                                       |

## 17.1 Architecture Principles

- Legal sources, schedules and templates are data with approval and
  effective dates, not hard-coded constants.

- The ledger is append-only for material financial events; balances are
  derived.

- Workflow transitions are enforced on the server and cannot be bypassed
  by a client or import.

- Document generation uses a snapshot of party, officer, office,
  schedule and template data at issue time.

- Integrations are optional adapters; failure of an external service
  must not corrupt the legal record.

- Reports read from reconciled transactional views and can be reproduced
  for a past date.

## 17.2 Confirmed Managed-Cloud Deployment Baseline

The following baseline is adopted for planning and development because a
government data centre is not currently available. It is a deployment
decision, not a statutory requirement, and may be replaced by another
approved cloud provider if the portability controls below are preserved.

| **Decision area**        | **v0.5 baseline**                                                                                                                                                                                                               | **Implementation consequence**                                                                                          |
|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **Commercial platform**  | Vercel-first managed cloud. Use at least a paid production plan; Hobby/free plans are prohibited for live departmental data.                                                                                                    | Procurement must cover production support, access control, security controls, usage limits, log retention and rollback. |
| **Web and edge tier**    | Next.js/TypeScript on Vercel with custom departmental domain, managed TLS, CDN, DDoS protection, WAF/rate limiting and deployment protection.                                                                                   | Public/static content may be cached; authenticated taxpayer/case responses and PII must be private/no-store.            |
| **Application compute**  | Short request-response APIs on Vercel Functions. Durable or long-running work is executed through a managed queue/workflow callback and, if needed, a portable managed container worker.                                        | No workflow may depend on an in-memory process, local disk, sticky session or a function remaining alive.               |
| **Primary data**         | Managed PostgreSQL located in the same or nearest approved region to application compute.                                                                                                                                       | All statutory state changes use ACID transactions, connection pooling, migrations, PITR and external backup.            |
| **Documents**            | Private object storage external to function local storage.                                                                                                                                                                      | Generated and uploaded files use versioning, hash, signed access, malware scanning, retention and backup controls.      |
| **Queue/cache**          | Managed Redis plus durable serverless messaging/workflow.                                                                                                                                                                       | Use for idempotency, locks, retry, scheduling and cache; never as the sole ledger or legal record.                      |
| **Region**               | Candidate Vercel compute regions are Mumbai (bom1) or Dubai (dxb1), subject to latency testing, vendor availability, legal/data-residency review and approval. Database and workers must be co-located as closely as practical. | Do not accept Vercel default compute in the United States; explicitly configure and test the approved region.           |
| **Production ownership** | Department-controlled domain, source repository, cloud team, billing account and break-glass access, with implementation-partner access time-bound and auditable.                                                               | Avoid personal accounts and vendor-only credentials.                                                                    |

## 17.3 Logical Production Topology

The production topology separates the internet-facing web tier from
durable statutory records. Vercel provides the delivery and request
layer, while PostgreSQL, object storage and queue/workflow services
provide durable state. The application must treat every external
callback, import and offline synchronization as an untrusted, retryable
message.

<img src="media/image4.png" style="width:6.45in;height:4.29597in" />

*Figure 1 - Recommended Vercel-first managed-cloud production topology.*

## 17.4 Runtime and Service Allocation

| **Workload**                             | **Default runtime**                                                        | **Mandatory design treatment**                                                                                                |
|------------------------------------------|----------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| **Web interface and static assets**      | Vercel Next.js/CDN                                                         | Server-render protected pages where required; no sensitive responses in shared/public cache.                                  |
| **Interactive commands and queries**     | Vercel Functions / Next.js route handlers                                  | Short transactions, schema validation, server authorization, correlation ID and explicit timeouts.                            |
| **Payment and integration webhooks**     | Dedicated Vercel endpoints                                                 | Signature/authentication, replay window, raw payload hash, idempotency key, fast acknowledgement and queued processing.       |
| **PDF/PFT generation and large reports** | Durable queue/workflow and worker callback                                 | Asynchronous status, retry, deterministic template version, object-storage output and dead-letter handling.                   |
| **Bulk migration/import**                | Presigned object upload plus queued worker                                 | Stream/chunk processing; never load a large workbook entirely into a function request; batch reconciliation and resumability. |
| **Offline synchronization**              | Versioned HTTPS sync API                                                   | Client transaction IDs, optimistic concurrency, per-record result, retry-safe writes and conflict queue.                      |
| **Notifications**                        | Durable queue/workflow                                                     | Provider adapter, retries, delivery status, template version and suppression/consent rules.                                   |
| **Scheduled tasks**                      | Durable scheduler/workflow; Vercel Cron only for non-critical housekeeping | Financial cut-offs and reconciliation must not depend on imprecise or single-shot cron execution.                             |
| **Public certificate verification**      | Rate-limited Vercel read endpoint                                          | Minimal fields, no bulk search, no PII cache, abuse monitoring and independent availability checks.                           |

## 17.5 Environment and Data-Separation Model

| **Environment**               | **Platform arrangement**                                                                                                       | **Data and integration policy**                                                   | **Promotion/access**                                             |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|------------------------------------------------------------------|
| **Local**                     | Developer workstation with containerized dependencies or approved dev services.                                                | Synthetic data and local mocks; no production credentials.                        | Developer only; pre-commit checks.                               |
| **Preview**                   | Automatic protected Vercel deployment for each pull request; optional isolated PostgreSQL preview branch.                      | Synthetic fixtures only. External services mocked or sandboxed.                   | Created from PR; expires/cleans up after merge.                  |
| **Development / Integration** | Dedicated Vercel project and dedicated managed data stores.                                                                    | Synthetic/integration test data; sandbox connectors.                              | Automatic deployment from integration branch after checks.       |
| **UAT**                       | Dedicated protected project and database.                                                                                      | Masked rehearsal data only; controlled sandbox or approved test endpoints.        | Release candidate; departmental testers and QA.                  |
| **Staging / Pilot rehearsal** | Production-like project and configuration.                                                                                     | Masked or approved pilot rehearsal copy; no uncontrolled production exports.      | Manual approval; migration and rollback rehearsal.               |
| **Pilot Production**          | Dedicated production-grade project/data stores for selected districts, or logically isolated production tenant after approval. | Live data; live approved integrations; full monitoring and backup.                | Change approval and named release manager.                       |
| **Punjab Production**         | Production project with approved region, plan, domain, support and DR controls.                                                | Live data only; least privilege; no developer direct DB access.                   | Signed release, maker-checker config and post-deploy validation. |
| **Recovery / Restore**        | Isolated restore target or alternate project/provider.                                                                         | Latest verified database/document backup; integrations disabled until validation. | Operations/security authorization.                               |

Environment rule: production data must never be copied into Preview or
Development. UAT data must be synthetic or irreversibly masked, and each
environment must have separate credentials, database, storage
prefix/bucket, queue, encryption context and external-service keys.

## 17.6 Development Architecture and Repository Standards

A TypeScript monorepo is recommended so the web interface, domain
services, worker callbacks, form renderer and shared contracts are
versioned together while remaining independently deployable.

| **Repository area**        | **Contents / control**                                                                                                         |
|----------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| **apps/web**               | Next.js portal, public verification and request-response API/BFF routes.                                                       |
| **apps/worker**            | Portable queue/workflow handlers for reports, forms, imports, sync, notifications and reconciliation.                          |
| **packages/domain**        | Pure business rules, workflow transitions, ledger commands, legal source references and deterministic calculations.            |
| **packages/api-contracts** | OpenAPI schemas, request/response models, webhook contracts and generated clients.                                             |
| **packages/database**      | Schema, migrations, seed data, row/jurisdiction helpers and database tests.                                                    |
| **packages/documents**     | PFT/notice templates, bilingual fonts/references, rendering tests and visual baselines.                                        |
| **packages/security**      | Authorization policies, masking, audit helpers, encryption interfaces and secure logging.                                      |
| **infra**                  | Vercel project configuration, provider setup scripts/IaC where supported, DNS, WAF, drains, backup and monitoring definitions. |
| **docs**                   | Architecture Decision Records, data dictionary, threat model, runbooks, API catalogue and release evidence.                    |

Every pull request must pass formatting/linting, type checking, unit
tests, domain-rule tests, database migration validation, API contract
tests, dependency/secret scanning and authorization tests. Changes to
PFT layouts must also pass visual-regression comparison against approved
reference pages.

## 17.7 CI/CD, Release, Database Migration and Rollback

<img src="media/image5.png" style="width:6.45in;height:3.75822in" />

*Figure 2 - Development, quality-gate, promotion and rollback flow.*

| **Gate**                  | **Required evidence / action**                                                                                                                                                                            |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Commit / pull request** | Signed or attributable commit; ticket/requirement reference; peer review; no direct production-branch changes.                                                                                            |
| **Automated quality**     | Lint, type check, unit/integration/contract tests, SAST, dependency and secret scans, migration dry run and test coverage threshold.                                                                      |
| **Preview**               | Protected Vercel preview URL, isolated test data, automated smoke/e2e tests and accessibility/form visual checks.                                                                                         |
| **UAT release candidate** | Immutable artifact/tag, release notes, approved test catalogue, migration plan, configuration delta and rollback plan.                                                                                    |
| **Production approval**   | Named business owner, technical release manager and security/operations approval for material changes. Legal schedule/form changes additionally require maker-checker approval in PTAS.                   |
| **Deployment**            | Promote a tested deployment where practical; run backward-compatible database migration first, deploy application, execute smoke tests and observe error/latency/payment indicators.                      |
| **Rollback**              | Use Vercel rollback/promote for application code. Database changes must follow expand/contract or a tested forward-fix/down-migration strategy; disable affected jobs/integrations before restoring data. |
| **Emergency hotfix**      | Restricted branch, two-person approval where available, mandatory incident ticket and retrospective review within two working days.                                                                       |

## 17.8 Configuration, Secrets and Cryptographic Key Management

| **Control**                   | **Required implementation**                                                                                                                                                          |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Environment configuration** | Separate configuration by environment. Non-secret defaults are version controlled; environment-specific endpoints and flags are injected during deployment.                          |
| **Sensitive variables**       | Mark production/preview secrets as sensitive in Vercel or use an approved external secret manager. Values must not be readable after creation where platform support exists.         |
| **No secret leakage**         | No keys in source, templates, logs, screenshots, client bundles, mobile package, database exports or CI artifacts. Automated secret scanning is blocking.                            |
| **Provider access**           | Prefer short-lived OIDC/service identities over static cloud keys. Restrict database/storage/queue credentials to the minimum environment and function/service.                      |
| **Rotation**                  | Rotate on staff/vendor change, suspected exposure and provider recommendation; otherwise at least annually, with higher-risk integration keys reviewed quarterly.                    |
| **Application encryption**    | Department-approved encryption for especially sensitive fields where database encryption alone is insufficient; keys separated from encrypted data.                                  |
| **Legal configuration**       | Rates, categories, heads, notices and templates are not ordinary environment variables. They use in-application effective-dated maker-checker workflow, impact testing and rollback. |
| **Break-glass**               | Two named custodians, MFA, time-bound use, alerting and post-use review. No shared administrator password.                                                                           |

## 17.9 Data, Document, Queue and Caching Architecture

| **Service**                | **Production requirements**                                                                                                                                                                                                                                     |
|----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Managed PostgreSQL**     | Primary source of truth; ACID transactions; connection pooling suitable for serverless compute; unique/idempotency constraints; encrypted connections; no public unrestricted endpoint; PITR; performance metrics; automated vacuum/maintenance; tested export. |
| **Schema migration**       | Versioned migrations in repository; expand/contract compatibility; production backup/restore point before destructive change; no manual schema edits except audited emergency procedure.                                                                        |
| **Private object storage** | Private-by-default buckets; unique immutable object keys; hash/size/MIME metadata; antivirus/malware scan; signed short-lived URLs; versioning; retention lock for approved classes; lifecycle rules only after retention approval.                             |
| **Redis/cache**            | Sessions where applicable, rate limits, short locks, non-authoritative cache and idempotency acceleration. Every critical lock/write also has a database constraint or durable queue guarantee.                                                                 |
| **Durable queue/workflow** | Signed messages, automatic retry with exponential backoff, deduplication, maximum attempts, dead-letter/exception queue, operator replay and correlation to audit/ledger records.                                                                               |
| **Search/reporting**       | Start with indexed PostgreSQL and read-optimized views/materialized views. Add a separate search/analytics service only after measured need and reconciliation controls.                                                                                        |

## 17.10 Observability, Operations and Support Model

| **Operational capability** | **Minimum requirement**                                                                                                                                                                                          |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Telemetry**              | Structured application logs, Vercel runtime/firewall/audit telemetry, database metrics, queue metrics, storage events and integration outcomes.                                                                  |
| **External retention**     | Drain logs/traces/audit events to an external retained platform or object archive so investigation is not limited by the hosting platform retention window.                                                      |
| **Correlation**            | One correlation/trace ID across browser, Vercel request, queue message, database transaction, document job and external integration.                                                                             |
| **Privacy in logs**        | Never log full CNIC, passwords, OTPs, tokens, unmasked bank references, document contents or raw secrets. Use controlled payload hashes and masked identifiers.                                                  |
| **Dashboards**             | Availability, p50/p95/p99 latency, error rate, database saturation, queue age/dead letters, document failures, sync conflicts, payment confirmations, reconciliation backlog, backup age and certificate expiry. |
| **Alerts**                 | Actionable thresholds with owner, severity, notification path and linked runbook; alert on failed backups, unusual payment corrections, WAF attacks, authorization denials and cost spikes.                      |
| **Support levels**         | L1 departmental/help-desk triage; L2 application/operations support; L3 engineering; cloud/database/security escalation; Finance owns reconciliation decisions.                                                  |
| **Service review**         | Daily operational checks during pilot; weekly defect/backlog review; monthly availability/security/cost/capacity report; quarterly access and restore review.                                                    |

## 17.11 Service Levels, Backup, Recovery and Continuity

The following are proposed initial targets and must be converted into
contractual service levels during procurement. They are stricter than a
simple business-hours pilot because the payment and certificate channels
may be used outside office hours.

| **Measure**                                            | **Pilot target**                                                                                          | **Punjab-wide target / approval note**                                                                    |
|--------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| **Availability - authenticated PTAS**                  | 99.5% monthly excluding approved maintenance.                                                             | 99.9% monthly or higher after measured pilot and provider SLA review.                                     |
| **Availability - public verification/payment handoff** | 99.9% monthly target.                                                                                     | 99.9% or approved channel-equivalent target.                                                              |
| **Common API performance**                             | p95 under 2 seconds for ordinary searches/commands at normal network conditions.                          | Same, with separate targets for bulk/report jobs.                                                         |
| **Database RPO**                                       | 15 minutes or better using provider PITR.                                                                 | 15 minutes or better; contract and test evidence required.                                                |
| **Service RTO**                                        | 4 hours for P1 restoration.                                                                               | 2-4 hours according to approved criticality and support contract.                                         |
| **Document RPO**                                       | Near-zero after successful durable upload; independent copy within 24 hours.                              | Provider replication/versioning plus daily off-provider copy or approved equivalent.                      |
| **Backup retention**                                   | PITR window at least 7 days during pilot plus daily logical backup for 35 days and monthly archival copy. | Increase according to legal retention and risk assessment; keep at least one off-provider encrypted copy. |
| **Restore testing**                                    | Monthly database sample restore; full system restore before pilot and quarterly thereafter.               | Quarterly full restore and annual alternate-region/provider continuity exercise.                          |
| **Maintenance notice**                                 | At least 3 working days for normal maintenance.                                                           | Department-approved window; emergency changes follow incident process.                                    |

Continuity principle: ePay/treasury confirmations and manual continuity
payments may be received while PTAS is degraded, but they must enter a
controlled suspense/reconciliation queue and must never be posted twice
when service returns.

## 17.12 Production Operations, Incident Management and Runbooks

| **Role**                                 | **Primary responsibility**                                                                                            |
|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| **Department product/process owner**     | Business priority, legal/process decisions, acceptance, service communications and change approval.                   |
| **Department cloud/account owner**       | Commercial account, domain, billing, team membership, production approvals and vendor relationship.                   |
| **L1 help desk / district focal person** | User intake, identity verification, known-issue guidance, ticket classification and escalation.                       |
| **L2 application operations**            | Monitoring, job replay, configuration support, user provisioning workflow, routine reports and incident coordination. |
| **L3 engineering**                       | Defect diagnosis, code/database fix, performance tuning, release and root-cause analysis.                             |
| **Database/storage/platform provider**   | Managed service availability, backup platform and provider incident response under contract.                          |
| **Security function**                    | Security monitoring, access review, vulnerability response, breach assessment and evidence preservation.              |
| **Finance/reconciliation owner**         | Unmatched, duplicate, reversal, suspense and settlement decisions; no technical team may invent financial treatment.  |

**Mandatory tested runbooks:**

- Application unavailable or severe latency; Vercel/provider outage and
  status communication.

- Database unavailable, connection exhaustion, failed migration or
  point-in-time restore.

- ePay callback failure, duplicate/replay, delayed settlement, wrong
  amount or reconciliation backlog.

- PFT/PDF generation failure, object-storage outage or corrupted/unsafe
  upload.

- Offline synchronization backlog, duplicate submission or lost/stolen
  field device.

- Unauthorized access, exposed credential, suspicious export or
  WAF/security alert.

- Incorrect legal rate, head of account or template deployed; immediate
  freeze, impact identification and controlled correction.

- Backup failure, restore exercise, alternate-region/provider recovery
  and return to normal service.

- Production release rollback, queue pause/replay and user
  communication.

- Unexpected cloud cost spike, quota exhaustion, certificate/domain
  expiry and provider account lockout.

## 17.13 Capacity, Scaling and Cost Controls

| **Area**               | **Control**                                                                                                                                                                                    |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Capacity baseline      | Design and test for at least 100 concurrent departmental users, province-wide public verification bursts and agreed migration/report volumes. Re-test before each rollout wave.                |
| Database connections   | Use serverless-compatible pooling, bounded concurrency, query timeouts, indexes and slow-query review.                                                                                         |
| Asynchronous workload  | Queue document generation, bulk imports, notifications and reports; set per-tenant/jurisdiction concurrency and back-pressure.                                                                 |
| Rate limits            | Separate limits for login, search, public verification, file upload, webhook and integration endpoints; allow-list trusted callbacks only when contractually stable.                           |
| Cost budgets           | Monthly budgets and alerts by provider/environment; owner for forecast and anomaly review; prohibit unbounded logs, exports, image processing or retry loops.                                  |
| Quotas and degradation | Track function duration, bandwidth, storage, database compute, connection, queue and log quotas. Define safe degradation: pause non-critical reports/notifications before financial commands.  |
| Production plan        | Do not use free/Hobby tiers. Select paid plans based on support, WAF, RBAC, deployment protection, log/audit retention, region/failover and contractual needs rather than only request volume. |

## 17.14 Portability, Vendor Exit and Source-Code Ownership

The managed-cloud approach must not make the Department dependent on a
single implementation partner or hosting vendor. The following are
mandatory exit controls:

- Department ownership of source repositories, domains, production
  accounts, encryption/key policy, billing records and architecture
  documentation.

- PostgreSQL-standard schema and regular pg_dump or equivalent
  off-provider exports; no sole reliance on proprietary database restore
  mechanisms.

- S3-compatible document interface or documented export tooling, with
  hashes and metadata preserved.

- Versioned REST/OpenAPI contracts and portable TypeScript domain
  modules; critical business rules must not exist only in proprietary
  edge configuration.

- Infrastructure/configuration inventory, environment-variable
  catalogue, provider dependency register and tested rebuild procedure.

- Annual export/restore exercise and a documented route to move the core
  API/worker to another serverless or container PaaS without changing
  statutory records.

## 17.15 World-Class Frontend and UI/UX Architecture

PTAS must feel like one coherent government service rather than a
collection of forms and dashboards. The frontend architecture combines
user research, service design, a reusable visual language, coded
components, automated quality checks and production telemetry. It draws
on established public-sector design-system practice while remaining
specific to Punjab terminology, authority, bilingual content and field
conditions. The design system must be owned by the Department and
delivered as reusable assets, not as screenshots controlled only by an
implementation partner.

<img src="media/image6.png" style="width:6.5in;height:3.61111in" />

Figure 3 - PTAS frontend and experience delivery architecture.

## 17.16 Product Experience Principles

| **Principle**                           | **Required design behaviour**                                                                                                                                                                                 |
|-----------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Start with user tasks**               | Organize screens around jobs such as find a taxpayer, prepare an assessment, review an order, serve a notice, post a payment or resolve an exception - not around database entities or departmental branches. |
| **Make the next action obvious**        | Each page has one clearly prioritized primary action. Secondary and dangerous actions are visually distinct and never rely on icon-only controls.                                                             |
| **Progressive disclosure**              | Show the minimum needed to make the current decision; reveal legal detail, history, evidence and advanced filters when requested without hiding material consequences.                                        |
| **Consistency over novelty**            | Reuse approved templates, language, controls and status patterns. A new component requires evidence that the design system cannot meet the need.                                                              |
| **Trust through transparency**          | Always show jurisdiction, financial year, case status, source/version, last update, responsible officer and what a submission or approval will do.                                                            |
| **Prevent errors before recovery**      | Validate early, preserve drafts, show duplicate candidates, reconcile totals and explain corrections. Never destroy entered data after a recoverable validation failure.                                      |
| **Safe legal and financial actions**    | Approvals, penalties, refunds, reversals, schedule publication and payment posting require a review screen, explicit confirmation, server result and immutable reference.                                     |
| **Accessible and inclusive by default** | Keyboard, screen-reader, zoom, high-contrast, target-size, plain-language and low-digital-skill needs are built into components, not added at the end.                                                        |
| **Fast on ordinary devices**            | Prioritize server rendering, small bundles, pagination and resilient loading for office PCs, shared Android devices and constrained networks.                                                                 |
| **Joined-up channels**                  | The digital interface, printed PFT documents, ePay/e-Khidmat handoff, call centre/help desk and in-person support use the same terminology and case status.                                                   |

## 17.17 User Groups and Priority Journeys

| **User / context**                       | **Priority journeys**                                                                                                                  | **Experience requirement**                                                                                              |
|------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **Inspector - office and field**         | Province-wide search; survey/evidence; party/activity registration; assessment draft; PFT issue; payment evidence; recovery follow-up. | Fast keyboard data entry in office; mobile-friendly tasks in field; save/resume; clear duplicate and sync handling.     |
| **ETO / DDETO - decision maker**         | Approval queue; side-by-side revision review; hearing/order; penalty; appeal record; refund/adjustment; closure/discontinuance.        | Decision-focused workspace with evidence summary, legal source, changes, consequences and audit-ready confirmation.     |
| **Service staff / constable**            | Assigned service tasks; route/contact context; delivered/refused/not found/closed outcomes; evidence and sync.                         | Large touch targets, minimal typing, offline capture, visible privacy limits and one-handed mobile use.                 |
| **Director / appellate authority**       | Regional oversight; appeal decision; exception trends; recovery and service quality; drill-down to source records.                     | Actionable summaries with comparison and aging; no decorative charts; every metric links to an auditable case list.     |
| **Finance / reconciliation user**        | PSID/payment exceptions; settlement matching; refunds; suspense; head-of-account and closing balance checks.                           | Dense but legible data tables, saved filters, batch review, reconciliation evidence and strict maker-checker controls.  |
| **System / configuration administrator** | Users, jurisdictions, schedules, templates, feature flags, integrations, logs and operational health.                                  | Separated technical and statutory privileges, strong warnings, version diffs, publish workflow and rollback visibility. |
| **Assisted-service operator**            | Search/link Assessee Code; capture minimum details; hand off payment; issue receipt/status without assessment authority.               | Guided script, consent, minimal PII, clear handoff and no access to internal decision or recovery functions.            |

## 17.18 Information Architecture and Navigation

| **Area**                 | **Required architecture**                                                                                                                                                                               |
|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Global shell             | Government/department identity, PTAS service name, current role and jurisdiction, active financial year, notifications, help, profile and sign-out. Environment banner is mandatory outside production. |
| Role navigation          | Persistent left navigation on desktop; compact drawer on tablet; bottom or task navigation only for approved field journeys. Menu items are permission-derived but stable within a role.                |
| Global search            | Province-wide search with exact and probable matches across identifiers, names, business, mobile, address, demand/PFT/Assessee Code and PSID. Results explain why each record matched.                  |
| Work queues              | My work, returned items, approvals, service tasks, payment exceptions, appeals and overdue actions use sortable queues with aging, owner and next action.                                               |
| Party and case workspace | A consistent 360-degree workspace with summary, activities, annual cases, notices, payments, documents, service, appeals/adjustments and audit timeline.                                                |
| Page hierarchy           | Breadcrumbs show organization and case context. Deep links preserve the record and tab. Filters and pagination live in the URL so views can be shared and restored.                                     |
| Financial-year context   | The active year is always visible. Switching year requires an explicit control; historic records are visually distinct and protected from accidental current-year actions.                              |
| Status language          | Use controlled human-readable statuses with text plus icon/shape, not colour alone. Each status includes meaning, owner, last event and available next actions.                                         |

## 17.19 Punjab Government Digital Design System

A project design system - working name Punjab Government Digital Design
System for PTAS - will be established during Phase 0/1. It may adopt
proven accessibility and interaction patterns from leading government
design systems, but the visual identity, terminology and legal patterns
must be approved for Punjab. The source of truth is a linked Figma
library, machine-readable design tokens and a coded React/Storybook
library. A screen mock-up that cannot be reproduced from the component
library is not complete.

| **Layer**             | **Required content / control**                                                                                                                                                                                                       |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Foundations**       | Brand assets, typography, spacing, grid, elevation, icons, focus treatment, motion, data density, breakpoints and English/Urdu content rules.                                                                                        |
| **Token model**       | Primitive tokens feed semantic tokens such as background, surface, text, border, action, success, warning, error, information and focus. Component tokens may not hard-code raw colours.                                             |
| **Core components**   | Header, navigation, breadcrumb, page title, button/link, input, textarea, select/autocomplete, checkbox/radio, date, currency, identifier, address, file upload, alert, error summary, modal/drawer, tabs, stepper and pagination.   |
| **Domain components** | Status badge, jurisdiction/year selector, party match card, activity/rate comparison, evidence viewer, service timeline, revision diff, approval panel, ledger table, payment allocation, PSID status, form preview and audit event. |
| **Page templates**    | Search/list, record workspace, multi-step transaction, decision/review, dashboard, exception queue, configuration editor, public verification and printable-document preview.                                                        |
| **Component states**  | Default, hover, focus, active, disabled, read-only, loading, empty, error, success, permission-denied, offline, conflict and superseded states documented in Storybook.                                                              |
| **Governance**        | Named design-system owner; versioned releases; change log; accessibility evidence; deprecation window; documented exceptions; and contribution workflow across vendors.                                                              |

## 17.20 Visual Language, Responsive Layout and Data Density

| **Area**             | **Standard**                                                                                                                                                                                                                            |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Brand and colour     | Use the approved Punjab/Excise identity after brand review. Until approval, use semantic tokens rather than fixed marketing colours. Text and interactive contrast must meet WCAG 2.2 AA; status is never communicated by colour alone. |
| Typography           | Readable government-service typeface with Urdu-compatible companion font. Default body text at least 16 CSS px; clear heading hierarchy; tabular numerals for amounts and ledgers; no condensed fonts for transactional content.        |
| Spacing and grid     | Eight-point spacing scale; four-column mobile, eight-column tablet and twelve-column desktop layout; constrained reading width for prose and flexible full-width workspace for approved data tables.                                    |
| Responsive behaviour | Design mobile-first, then enhance. Forms become single-column on narrow screens; secondary panels move below primary content; touch targets normally at least 44 by 44 CSS px.                                                          |
| Data density         | Comfortable default and approved compact mode for trained finance/operations users. Compact mode cannot reduce legibility, focus visibility or target sizes below accessibility requirements.                                           |
| Motion               | Use motion only to explain state or navigation; respect prefers-reduced-motion; avoid parallax, auto-rotating content and animations that delay task completion.                                                                        |
| Icons                | Use a single accessible icon set. Icons support labels but do not replace labels for legal, financial or destructive actions. Directional icons mirror correctly in RTL; brand and non-directional icons do not.                        |

## 17.21 Transactional Forms and High-Risk Interaction Patterns

| **Pattern**                   | **Required behaviour**                                                                                                                                                                                               |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Long forms**                | Break into meaningful steps only where it reduces cognitive load. Show progress, save draft, last-saved time, resume, and a final review page. Do not hide all questions behind an arbitrary wizard.                 |
| **Validation**                | Validate on submit and, where helpful, after a field is completed. Show an error summary linked to fields, plain-language correction, accepted format and preserved input. Server validation remains authoritative.  |
| **Data entry**                | Support keyboard-first entry, logical tab order, appropriate input modes, masks that do not trap users, manual date entry, normalized identifiers and amount-in-words verification.                                  |
| **Evidence upload**           | Explain accepted type/size, scan status, classification and retention. Show progress, retry, preview and removal before submission; scan files before making them available.                                         |
| **Duplicate handling**        | Show match reason and confidence, compare key fields, and route merge/link decisions to authorized users. Never silently create or silently merge a party.                                                           |
| **Review and submit**         | Summarize facts, rate/source, financial impact, attachments, service/hearing state and responsible authority. Require an explicit declaration/confirmation and return a permanent reference.                         |
| **Dangerous actions**         | Use reason entry and confirmation for reject, withdraw, reverse, refund, publish schedule, revoke certificate and deactivate account. The confirmation states the exact consequence and whether it can be corrected. |
| **Optimistic UI**             | Permitted only for non-financial, easily reversible personal preferences. Legal and financial commands wait for server acknowledgement and display pending/confirmed/failed state.                                   |
| **Revision comparison**       | Show old and proposed values side by side, highlight changed fields, identify resulting demand difference and preserve links to both versions.                                                                       |
| **Concurrency and conflicts** | Warn when a record changed since it was opened; provide refresh/compare options. Never overwrite an approved or posted version from stale browser state.                                                             |

## 17.22 Dashboards, Data Tables and Analytical UX

| **Capability**                 | **Standard**                                                                                                                                                                                      |
|--------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Role dashboards**            | Show only actionable measures tied to a role: pending work, aging, exceptions, service/reconciliation quality and outcomes. Every card links to the filtered underlying records.                  |
| **Tables**                     | Server-side filter/sort/pagination for large data; sticky header where useful; explicit column labels and units; row selection summary; saved views; export subject to permission and watermark.  |
| **Accessibility**              | Use semantic table markup for genuine tables; provide captions, sortable-state announcements and keyboard-operable controls. Virtualization must not break screen-reader or keyboard access.      |
| **Charts**                     | Use sparingly for trend/comparison. Provide title, period, data source, accessible summary and a table/download alternative. Do not use 3D charts, gauges without context or colour-only legends. |
| **Filters**                    | Expose common filters, keep advanced filters collapsible, show active-filter chips, allow clear-all and persist filters in the URL. Date ranges and financial year are never ambiguous.           |
| **Empty/error/loading states** | Explain whether there are no records, no records match the filters, permission is restricted or data failed to load. Offer the next useful action rather than a blank card.                       |
| **Financial display**          | Use Pakistani rupee label/format consistently, align decimals, preserve exact ledger amounts, distinguish debit/credit and never abbreviate a material amount without an exact value available.   |

## 17.23 English, Urdu and Content Design

| **Area**                        | **Requirement**                                                                                                                                                                                                                               |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Internationalization foundation | All interface text comes from translation resources, not hard-coded components. Layout uses CSS logical properties so Urdu RTL can be enabled without redesign.                                                                               |
| Language scope                  | English may remain the initial operational UI, but approved public instructions, notices and PFT documents must support Urdu from the first release. Expansion to bilingual staff screens is a configuration/release decision, not a rewrite. |
| Mixed-direction content         | CNIC, Assessee Code, PSID, PFT numbers, phone numbers, dates, amounts and URLs remain readable LTR within Urdu content using explicit direction handling.                                                                                     |
| Translation governance          | Maintain approved glossary for legal/departmental terms, translator/reviewer roles, source and target version, effective date and fallback. Machine translation cannot publish statutory text without human approval.                         |
| Plain language                  | Use short sentences, direct verbs, descriptive labels and clear consequences. Avoid unexplained acronyms, developer terms and internal status codes in user-facing text.                                                                      |
| Help content                    | Provide contextual help at the decision point, examples for complex schedule facts and a consistent route to SOP/help-desk support. Help must not substitute for necessary field labels or legal notices.                                     |
| Dates and numbers               | Store ISO/authoritative values; render approved local formats consistently. Never rely on ambiguous numeric dates. Financial-year labels must be explicit, for example 2026-27.                                                               |

## 17.24 Accessibility and Inclusive Design Standard

WCAG 2.2 Level AA is the mandatory web baseline. Automated tools are
necessary but insufficient; the project must combine component tests,
keyboard and screen-reader assessment, zoom/reflow checks, contrast
review and inclusive usability testing. Where the exact official PFT
print form is inherently inaccessible as a digital document, PTAS must
provide an equivalent accessible HTML view containing the same material
information and a link to the official printable PDF.

| **Control area**             | **Minimum acceptance**                                                                                                                                                                                                 |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Structure**                | Semantic HTML landmarks, logical heading order, descriptive page titles, skip link, breadcrumbs and labels associated with controls.                                                                                   |
| **Keyboard and focus**       | Every function operable without a mouse; visible focus; no keyboard traps; focus moves predictably after navigation, modal, error and dynamic update; focus is not obscured by sticky content.                         |
| **Forms and authentication** | Error identification and suggestions, redundant-entry reduction, accessible authentication, paste support for passwords/OTP where policy allows and no cognitive puzzle as the only authentication method.             |
| **Visual**                   | Text contrast at least 4.5:1 except valid large-text cases; user-interface/focus contrast at least 3:1; 200% zoom and 320 CSS px reflow without loss, except approved two-dimensional data tables with an alternative. |
| **Touch and motor**          | Target size and spacing meet WCAG 2.2 and project touch guidance; no drag-only operation; time limits are avoided or extendable.                                                                                       |
| **Screen readers**           | Test representative journeys with current NVDA/Chrome and at least one additional approved assistive-technology/browser combination; announce loading, errors, status and route changes.                               |
| **Media and documents**      | Alt text for informative images; decorative images ignored; accessible names for icons; tagged/accessible PDFs where feasible; HTML equivalent for critical forms and reports.                                         |
| **Testing evidence**         | Zero unresolved critical/serious accessibility defects at release; documented manual test record; independent accessibility audit before Punjab-wide rollout.                                                          |

## 17.25 Frontend Implementation Architecture

| **Area**                   | **Recommended implementation**                                                                                                                                                                                |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Framework                  | Next.js App Router with current supported React and TypeScript strict mode. Prefer React Server Components for data-heavy read views; introduce Client Components only where browser interaction is required. |
| Project structure          | Monorepo packages for ui, design-tokens, icons, forms, domain-formatters, typed-api-client, i18n, analytics and test utilities. Product routes compose these packages rather than copying components.         |
| Styling                    | CSS custom properties generated from versioned design tokens. Tailwind CSS or another utility layer may be used only as an implementation tool; tokens and semantic component APIs remain provider-neutral.   |
| Component development      | Storybook documents every state, responsive breakpoint, English/Urdu example and accessibility result. Components expose semantic props rather than raw visual overrides.                                     |
| Forms and schemas          | Shared Zod or equivalent schemas for client guidance and server validation; React Hook Form or equivalent for performant accessible form state; server remains authoritative.                                 |
| Data and state             | Server-render initial views; URL state for filters/sort/page; typed API client generated from OpenAPI where practical; client query cache only for interactive server state; avoid a large global store.      |
| Security                   | HTTP-only secure cookies/tokens; no secrets or full PII in browser storage, analytics or console logs; Content Security Policy, secure headers and output encoding.                                           |
| Resilience                 | Route-level error boundaries, recoverable retry, loading skeletons with reserved dimensions, offline/poor-network status where applicable and feature flags with audit/expiry.                                |
| Browser support            | Current approved Chrome and Edge on office desktops; supported Android Chrome/WebView for field; test Firefox for standards/accessibility; Safari/WebKit where public or iOS access is approved.              |
| Print and document preview | Dedicated print CSS and server-rendered official PDFs. Browser preview clearly identifies draft/final, template version and print assumptions and never replaces server-generated official output.            |

## 17.26 Performance, Low-Bandwidth and Resilient Experience

| **Measure**               | **Target / control**                                                                                                                                                                                                                         |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Core Web Vitals**       | At the 75th percentile for supported production traffic: LCP \<= 2.5 seconds, INP \<= 200 milliseconds and CLS \<= 0.1 for representative high-use routes.                                                                                   |
| **Route budgets**         | Critical route JavaScript and third-party scripts have explicit budgets reviewed in CI. Use code splitting, server rendering and lazy loading for non-critical panels; avoid shipping chart/editor libraries to routes that do not use them. |
| **Network behaviour**     | Test on realistic constrained 4G/high-latency profiles. Essential forms remain usable when images or secondary analytics fail. Show offline/pending state for field tasks and never imply that an unsynchronized action is complete.         |
| **Images and fonts**      | Optimize and size images, reserve layout dimensions, subset/self-host approved fonts where licensing permits, preload only critical assets and provide Urdu font fallbacks.                                                                  |
| **Data volume**           | Use server-side search, pagination, asynchronous export and progressive rendering. Do not download entire province datasets or large audit histories to the browser.                                                                         |
| **Perceived performance** | Show immediate acknowledgement, stable skeletons, progress for uploads/reports and clear completion. Prevent duplicate clicks while a high-risk command is pending without trapping the user.                                                |
| **Monitoring**            | Collect privacy-safe real-user performance by route, device and network class; alert on regression and block rollout when key journeys exceed approved budgets.                                                                              |

## 17.27 UX Research, Prototyping and Product Analytics

| **Stage**                       | **Required activity / evidence**                                                                                                                                                                                                              |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Discovery**                   | Contextual interviews and observation with inspectors, ETOs, service staff, finance/reconciliation users, directors, administrators and assisted-service staff; document pain points, workarounds, devices, literacy and connectivity.        |
| **Service blueprint**           | Map online, paper, bank/treasury, ePay/e-Khidmat, field and support touchpoints, including failure paths and ownership.                                                                                                                       |
| **Prototype**                   | Test low-fidelity flow before visual polish, then high-fidelity responsive prototypes for search, registration, assessment, approval, PFT-2/payment, service, reconciliation and configuration.                                               |
| **Iterative usability testing** | At least one moderated round for each major journey before build completion, including representative low-digital-skill and accessibility-needs participants where available. Record task success, errors, time, confidence and observations. |
| **Pilot measurement**           | Establish baseline and target for task completion without assistance, first-time success, correction rate, support contact, abandonment and System Usability Scale or another approved standardized measure.                                  |
| **Product analytics**           | Collect event names linked to service outcomes, not sensitive field values. Examples: search success, duplicate review, draft saved, validation error category, submission, approval turnaround, reconciliation exception and sync failure.   |
| **Privacy and governance**      | Analytics schema, purpose, retention, access and consent/legal basis are approved. Do not send CNIC, names, addresses, free text, document content, PSID or full identifiers to third-party analytics.                                        |
| **Continuous improvement**      | Combine analytics, support tickets, operational reports, accessibility findings and research into a prioritized product backlog with owner, evidence and outcome measure.                                                                     |

## 17.28 Frontend Quality Assurance and Release Gates

| **Quality gate**             | **Required evidence**                                                                                                                                                          |
|------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Design review**            | Approved journey, responsive Figma design, content review, legal terminology review and component mapping before development.                                                  |
| **Component tests**          | Storybook/Vitest interaction, state and accessibility tests for shared components; no undocumented component state.                                                            |
| **Visual regression**        | Automated snapshots for critical components/pages at desktop, tablet, mobile and Urdu/RTL examples; approved baseline and human review for intentional change.                 |
| **End-to-end tests**         | Playwright tests user-visible behaviour across supported browsers for core role journeys, permissions, errors, stale data, upload, print preview and network failure.          |
| **Accessibility**            | Automated axe-equivalent checks plus manual keyboard, screen-reader, zoom, reflow and contrast tests; unresolved critical/serious findings block release.                      |
| **Performance**              | Lighthouse/route budget in CI and real-user monitoring after release; major regression blocks promotion or triggers rollback.                                                  |
| **Content and localization** | Spelling, plain language, approved terminology, truncation, overflow, Urdu direction and mixed LTR identifiers checked in context.                                             |
| **UAT usability**            | Representative users complete approved tasks on production-like data/devices. No severity-1/2 usability defect and no known path that can cause hidden legal/financial action. |
| **Production observation**   | Feature rollout uses telemetry, support readiness and rollback. Monitor error, task completion, performance and accessibility feedback after release.                          |

## 17.29 Minimum Screen and Prototype Inventory

| **Experience area**             | **Minimum screens / prototypes before build sign-off**                                                                                                    |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Common shell**                | Sign-in/MFA, home/dashboard, global search/results, notifications, help, profile, access denied, session expiry, error and maintenance.                   |
| **Party and case**              | New party/activity, duplicate comparison, 360-degree profile, annual case summary, evidence/documents, timeline and transfer/jurisdiction.                |
| **Assessment and decision**     | Annual statement, inquiry, rate comparison, hearing, assessment worksheet, ETO review, revision diff, reasoned order and PFT-1 preview/service.           |
| **Payment and ledger**          | PFT-2 preview, payment intent/PSID, manual evidence, payment allocation, exception queue/detail, PFT-3 ledger and refund/adjustment review.               |
| **Field/service**               | Task list, service detail, outcome capture, photo/GPS evidence, offline queue, sync result and conflict.                                                  |
| **Appeal/recovery/certificate** | Appeal intake/review, notice stages, recovery referral, clearance application/decision and public verification.                                           |
| **Administration**              | User/jurisdiction, legal source, schedule/rate, template, head of account, feature flag, integration health, audit log and environment/operations status. |

Design-source note: The accessibility baseline follows W3C WCAG 2.2. The
service-design and component-governance approach is informed by the
GOV.UK Service Standard/Design System and the U.S. Web Design System.
Frontend implementation and testing controls use current official
Next.js, Storybook, Playwright and web performance guidance, subject to
revalidation at procurement and release.

# 18. Security, Audit and Governance

| **Control**                  | **Requirement**                                                                                                                                                                    |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Authentication**           | Strong password policy, MFA for sensitive roles where approved, session timeout, account lockout and device/session visibility.                                                    |
| **Authorization**            | Role + jurisdiction + designation + delegation + case assignment; least privilege and explicit denial by default.                                                                  |
| **Segregation**              | Separate configuration deployer, assessment decision-maker, payment correction approver, appellate authority and refund approver.                                                  |
| **Approval integrity**       | Server-side workflow, immutable approved versions, signed/hash-linked document snapshots and reason fields.                                                                        |
| **Audit trail**              | Actor, designation, role, office, timestamp, device/IP, previous/new values, source/order, reason and linked evidence.                                                             |
| **Sensitive data**           | Mask identifiers in lists/exports, minimize offline cache and log access to full identifiers.                                                                                      |
| **Documents**                | Hash generated and uploaded files; retain original and transformed versions; malware scan uploads.                                                                                 |
| **Deletion**                 | No hard deletion of orders, notices, PFT forms, payments, appeals, refund orders or audit events.                                                                                  |
| **Configuration governance** | Maker-checker, legal source attachment, effective date, impact analysis, test evidence and rollback plan.                                                                          |
| **Backups and DR**           | Automated backups, immutable/offline copy where approved, periodic restore test and documented RPO/RTO.                                                                            |
| **Exports**                  | Permission-controlled, purpose/reason capture, watermark, timestamp, user and audit event.                                                                                         |
| **Privacy and retention**    | Department-approved field collection and retention schedule; separate statutory history from unnecessary contact data.                                                             |
| External callback integrity  | Mutual authentication/signature or approved secure channel, replay protection, idempotency key, raw payload hash, timestamp validation and allow-listed source.                    |
| Payment evidence trust       | Citizen screenshots/receipts remain unverified evidence until matched to an approved settlement source; manual overrides require reason and maker-checker.                         |
| Public verification privacy  | Expose only certificate reference/status, covered period, masked party identity and issuing office as approved; rate-limit and audit verification requests.                        |
| Assisted-service controls    | Restricted operator role, centre/device/session identity, consent/purpose capture, no local retention beyond policy and no assessment/ledger authority.                            |
| **Cloud account governance** | Department-controlled organization/team, MFA for all privileged users, least-privilege RBAC, no shared accounts, time-bound vendor access, quarterly review and break-glass audit. |
| **Environment isolation**    | Separate Vercel projects and separate data/service credentials; production data prohibited in preview/development; preview deployments protected.                                  |
| **Web perimeter**            | Managed TLS, WAF, DDoS mitigation, rate limiting, security headers, upload limits and allow-listed/authenticated integration endpoints.                                            |
| **Supply chain and CI**      | Protected branches, peer review, dependency/SAST/secret/container scans where applicable, pinned versions, signed/tagged artifacts and auditable production promotion.             |

## 18.1 Minimum Audit Events

- Legal source, schedule, rate, exemption, payment head and template
  creation/change/approval.

- Party merge/link, identifier correction, jurisdiction assignment and
  delegation.

- Annual statement submission/deficiency and inquiry/document request.

- Notice generation, service attempt, hearing and order decision.

- PFT-1 and PFT-2 generation, reprint, reissue and supersession.

- Payment entry, verification, allocation, correction, reversal, refund
  and adjustment.

- Employer schedule, deduction, deposit, default notice, hearing and
  recovery order.

- Appeal filing, hearing, decision and implementation.

- Import, export, report generation, login failures, authorization
  denials and offline sync conflicts.

# 19. Integrations

| **Integration**                                   | **Purpose**                                                                         | **Stage / control**                                                                                                                                                     |
|---------------------------------------------------|-------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **ePay Punjab / treasury feed**                   | Electronic payment initiation and confirmation/reconciliation.                      | Mandatory discovery and coexistence in MVP. Use approved API/deep link/file interfaces; preserve manual continuity and reconcile every confirmation to the PTAS ledger. |
| **Bank/treasury master**                          | Authorized locations, branches, receipt formats and head of account.                | Pilot master data; effective-dated and finance-approved.                                                                                                                |
| **Payroll / HR systems**                          | Employee schedules, deductions and deposit reconciliation.                          | File-based pilot; API later. Never accept totals without employee-level reconciliation where required.                                                                  |
| **FBR or income-tax evidence**                    | Verify category based on prior-year income-tax assessment.                          | Manual evidence first; API only with legal/data-sharing approval.                                                                                                       |
| **Professional councils/registries**              | Verify lawyers, doctors and other regulated professions.                            | Future optional evidence connector; officer remains responsible for decision.                                                                                           |
| **Identity verification**                         | CNIC/identity match and duplicate reduction.                                        | Future subject to lawful basis, approvals and availability.                                                                                                             |
| **Government SSO**                                | Staff authentication and account lifecycle.                                         | Adopt when official service and role mapping are available.                                                                                                             |
| **SMS/email**                                     | Service reminders, hearing notices and operational alerts.                          | Supplementary only unless legally recognized for service; verified contact and consent/policy required.                                                                 |
| **Digital signature**                             | Authentication/signing of orders and forms.                                         | Deferred until approved signature policy and service.                                                                                                                   |
| e-Khidmat Markaz                                  | Assisted Professional Tax registration/payment intake and receipt support.          | Current live service announced 3 June 2026. Obtain SOP, operator roles, service-centre identifiers, data exchange and reconciliation contract before pilot.             |
| ePay Assessee Code registry                       | Link legacy taxpayer/enrolment identity used by the current Professional Tax guide. | MVP discovery/migration requirement; exact validation, ownership, uniqueness and update API require PITB/Excise confirmation.                                           |
| 1-Link / banking network                          | Underlying multi-channel payment reach through ePay.                                | Prefer ePay as government aggregator; direct bank/1-Link integration only if Finance/PITB formally require it.                                                          |
| Existing Professional Tax digital record/database | Avoid duplicate taxpayer masters and preserve current enrolment/payment history.    | Phase 0 systems and data inventory; agree system of record, migration/coexistence and decommissioning before build.                                                     |
| Public certificate verification                   | Allow relying parties to verify an issued clearance certificate.                    | Pilot only after certificate SOP, disclosure policy, security review and approved public fields.                                                                        |

# 20. Data Migration

Migration must preserve source provenance and must not transform an
unverified manual entry into an apparently authoritative digital fact.
Every imported value needs a batch, file, register/page reference,
verification status and responsible sign-off.

## 20.1 Migration Steps

> 1\. Inventory PFT-3 registers, PFT-1 notices, PFT-2 copies, employer
> statements, appeal/refund records and supporting files by
> office/circle/year.
>
> 2\. Define field classification, code lists, date/amount formats,
> approved identifiers and source references.
>
> 3\. Create separate templates for parties, businesses/activities,
> annual liabilities, notices, payments, employer deductions, appeals,
> refunds/adjustments and opening arrears.
>
> 4\. Clean and normalize names, addresses, identifiers, districts,
> tehsils, localities, PINs, categories and head-of-account values
> without losing original text.
>
> 5\. Run exact and probable duplicate matching at party and payment
> levels; route unresolved cases for officer decision.
>
> 6\. Load rehearsal batches into UAT and produce row errors, duplicate
> candidates, category exceptions and financial reconciliation.
>
> 7\. Obtain inspector/ETO sign-off for party counts, annual demand,
> arrears, collection, refunds/adjustments and closing balances.
>
> 8\. Import production batches with file hash, source location, user,
> timestamp and rollback/reload controls.
>
> 9\. Reconcile imported ledger totals to signed manual register totals
> and archive the original source files/read-only scans.

10\. Extract and reconcile legacy Assessee Codes, ePay
registration/payment history and unresolved channel exceptions before
cutover.

11\. Inventory existing Professional Tax databases, spreadsheets and
ePay/e-Khidmat interfaces; agree the authoritative owner and
cutover/coexistence boundary.

12\. Migrate issued clearance certificates and active recovery referrals
only with source documents, status and approving officer verification.

## 20.2 Migration Field Policy

| **Field class**                 | **Examples**                                                                                 | **Migration rule**                                                                                                          |
|---------------------------------|----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **Statutory minimum**           | Name, address, nature of profession/trade/calling/employment                                 | Must be present or marked as legacy deficiency requiring review.                                                            |
| **Official-form fields**        | District, tehsil, locality, PIN, class, PFT serial, amounts, head of account, receipt fields | Map exactly where available; retain original printed value and normalized code.                                             |
| **Operational identifiers**     | CNIC, NTN/company number, mobile, email, professional registration                           | Import with verification status; do not fabricate missing values.                                                           |
| **Financial balances**          | Current demand, arrears, penalty, payment, refund/adjustment                                 | Load as dated opening/transaction entries with signed reconciliation; never as an editable single balance.                  |
| **Legal process evidence**      | Service date, hearing, order, appeal, refund order                                           | Import document/reference and confidence level; unresolved dates cannot be guessed.                                         |
| External digital identifiers    | Legacy Assessee Code, ePay PSID, channel receipt/reference, e-Khidmat centre/session         | Preserve exact source values and status history; match to party/liability/payment without inventing or reusing identifiers. |
| Certificates and recovery cases | Clearance reference/status, covered period, notices, referral and outcome                    | Import only with document/source and authorized verification; unresolved cases remain visibly pending.                      |
| Existing-system provenance      | Database/table/file owner, extract date, field meaning, record key and hash                  | Mandatory for every source system; no silent consolidation of conflicting records.                                          |

# 21. Non-Functional Requirements

| **Area**                    | **Initial target**                                                                                                                                                                                           |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Capacity                    | Pilot for 5-20 concurrent users; load test at least 100 concurrent departmental users and planned batch/report volumes before wider rollout.                                                                 |
| Availability                | Pilot authenticated service target 99.5% monthly and public verification/payment handoff 99.9%, excluding approved maintenance; province-wide target at least 99.9% subject to provider contract.            |
| Performance                 | Common party/case searches under 2 seconds at normal connectivity; document and complex reports processed asynchronously with visible status.                                                                |
| Accuracy                    | All schedule calculations, highest-rate selection, totals, words and ledger balances deterministic and reproducible.                                                                                         |
| Offline                     | Core evidence/service capture without connectivity; no offline statutory approval.                                                                                                                           |
| Usability                   | Terminology matches Act/Rules/forms; clear distinction between assessment order, PFT-1 and PFT-2.                                                                                                            |
| Language                    | English interface with mandatory Urdu-capable document rendering for approved bilingual form text; Urdu UI labels can be phased.                                                                             |
| Accessibility               | Keyboard navigation, readable contrast, labelled controls, clear validation and accessible PDFs where feasible.                                                                                              |
| Device/browser              | Current government-approved desktop browsers and supported Android versions with device policy.                                                                                                              |
| Interoperability            | Versioned APIs and import/export schemas; integration failures isolated and retryable.                                                                                                                       |
| Retention                   | Permanent or department-approved statutory transaction history; separate retention for raw contact/evidence data.                                                                                            |
| Disaster recovery           | Proposed database RPO 15 minutes or better and P1 RTO 4 hours for pilot; off-provider encrypted backup, monthly sample restore, quarterly full restore after go-live and annual alternate recovery exercise. |
| Auditability                | Every decision and balance can be reconstructed from source version, evidence, order and transaction history.                                                                                                |
| Print quality               | PFT forms and notices render consistently on approved printers with bilingual text and no clipping/alignment defects.                                                                                        |
| Payment idempotency         | Repeated callback/file rows cannot create a second posting; duplicate detection works across API, file and manual channels.                                                                                  |
| Reconciliation timeliness   | Channel confirmations and settlement files processed within an approved operational window; aging and backlog visible to Finance/ETO.                                                                        |
| External-channel resilience | Queue and retry transient failures, preserve request/response evidence and support manual continuity without double posting.                                                                                 |
| Source freshness            | Production configuration records the latest legal/SOP/web-source review date and blocks go-live when a mandatory source review is overdue.                                                                   |
| Public verification         | Certificate verification service is highly available, privacy-minimized, rate-limited and does not expose bulk taxpayer data.                                                                                |
| Cloud platform              | Paid commercial Vercel/PaaS and managed-data plans only; explicit region, custom domain, TLS, WAF, deployment protection, RBAC, usage/cost alerts and support ownership.                                     |
| Environment isolation       | Separate projects, databases, storage, queues, credentials and integrations. No production data in development/preview; UAT data synthetic or irreversibly masked.                                           |
| Release engineering         | Every production release is reproducible from version control, passes automated quality/security gates, includes migration and rollback plans, and is approved by named owners.                              |
| Observability               | Structured logs, metrics, traces, correlation IDs, external telemetry retention, actionable alerts and privacy-safe logging across application, database, queue, storage and integrations.                   |
| Portability                 | Core rules, ledger and records use portable PostgreSQL/S3/OpenAPI/TypeScript patterns; regular off-provider exports and documented rebuild/migration procedure.                                              |
| User-centred design         | Every major journey has observed user needs, a service blueprint, tested prototype, named product owner and measurable outcome before production rollout.                                                    |
| Design-system consistency   | 100% of production screens use approved design-system foundations/components or a documented, reviewed exception. Figma and Storybook versions are traceable to the release.                                 |
| Accessibility compliance    | WCAG 2.2 AA for the web application; zero unresolved critical/serious accessibility defects; manual keyboard/screen-reader evidence and independent audit before province-wide rollout.                      |
| Responsive usability        | Core journeys usable at 320 CSS px through large desktop; no unintended horizontal scrolling; approved tables provide responsive/scroll or alternate views without loss of action.                           |
| Frontend performance        | Production p75 targets for representative routes: LCP \<=2.5 s, INP \<=200 ms and CLS \<=0.1, segmented by mobile/desktop where traffic allows; budgets enforced in CI and monitored in field.               |
| Localization and content    | All UI strings externalized; approved Urdu RTL and mixed-direction rendering for required content; controlled legal glossary, human review and no unapproved machine-translated statutory text.              |
| Usability outcome           | Pilot target after baseline research: at least 90% unassisted success on approved core tasks, no severity-1/2 usability defect, and an approved standardized usability score target such as SUS \>=80.       |
| Product analytics privacy   | Service analytics records event/outcome metadata without CNIC, names, addresses, free text, document content, PSID or full identifiers; schema, retention and access are approved.                           |

# 22. Implementation Roadmap

The added statutory workflows increase scope compared with v0.1.
Durations remain indicative and assume timely legal, form, data and
infrastructure decisions.

| **Phase**                                         | **Main outputs**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Indicative duration** |
|---------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------|
| Phase 0 - Legal and Form Validation               | Current amendment/circular check including Punjab Finance Act 2026; manual capture of the Excise page; Gazette PFT forms; existing-systems/ePay/e-Khidmat inventory; legal issue decisions; source traceability; approved workflows and data dictionary. Conduct user research, service blueprint, information architecture, content glossary, accessibility baseline and tested low-fidelity prototypes. Approve cloud procurement baseline, candidate region, DPA/security questionnaire, ownership and production service levels. | 5-7 weeks               |
| Phase 1 - Platform and Governance Foundation      | Identity, organization/jurisdiction, party registry, legal source/rule masters, audit and document foundations; Vercel projects/domains/WAF; managed PostgreSQL, queue and object storage; monorepo; CI/CD; secrets; telemetry; backup/restore. Establish approved design tokens, responsive page templates, Figma library, coded React/Storybook component library, i18n foundation and automated accessibility/visual testing.                                                                                                     | 6-8 weeks               |
| Phase 2 - Core Direct-Assessment MVP              | Annual statement, inquiry/hearing, assessment order, highest-rate engine, PFT-1/PFT-2, Assessee Code linking, ePay PSID/payment intent, confirmation/reconciliation and PFT-3. Deliver and usability-test core search, party, assessment, decision, document and payment journeys across desktop and mobile breakpoints.                                                                                                                                                                                                             | 8-10 weeks              |
| Phase 3 - Statutory Relief and Employer Workflows | Appeals, refund/adjustment, discontinuance, penalty/recovery, employer/DDO schedules, deposits and returns, with high-risk review/confirmation patterns and revision/ledger comparisons.                                                                                                                                                                                                                                                                                                                                             | 7-9 weeks               |
| Phase 4 - Field, Reporting and Migration          | Offline evidence/service, clearance certificate, configurable notice/recovery referral, accessible role dashboards/reports, migration tools, notifications and multi-channel reconciliation; Urdu/RTL QA for approved content and product analytics instrumentation.                                                                                                                                                                                                                                                                 | 6-8 weeks               |
| Phase 5 - UAT and Pilot Go-Live                   | Rehearsal migration, form print approval, security/performance/accessibility tests, moderated usability UAT, production-readiness review, support/runbook training, full restore and rollback exercise, user training, parallel register check and one/two-district go-live.                                                                                                                                                                                                                                                         | 5-7 weeks               |
| Phase 6 - Stabilization and Rollout               | Pilot fixes and design-system hardening; continuous research/analytics; accessibility remediation; legal/configuration freeze; agreed support coverage; capacity/cost tuning; quarterly restore/access/design reviews; vendor service review; phased district onboarding and approved integrations.                                                                                                                                                                                                                                  | 8-16 weeks              |

| Indicative total: Approximately 45-65 weeks depending on legal/form validation, user-research access, design-system maturity, team size, data quality, employer workflow scope, integrations and departmental review speed. Product design and frontend work run in parallel with domain/backend delivery. This is a planning range, not a contractual estimate. |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

Phase-gate addition: no payment-channel build may proceed beyond
interface prototyping until Excise, Finance and PITB agree the existing
ePay/e-Khidmat process, Assessee Code ownership, PSID contract,
settlement source, exception ownership and system-of-record boundary.

## 22.1 Pilot Scope

- One compact and one complex district where feasible, with different
  locality/corporation conditions.

- Representative direct payers, overlapping activity categories,
  arrears, employer/DDO cases, appeal and refund/adjustment scenarios.

- At least one signed opening PFT-3 migration and one employer deduction
  reconciliation.

- Actual PFT-1/PFT-2/PFT-3 print testing and parallel manual register
  reconciliation for an agreed period.

- Predefined success measures and rollback/continuity plan.

- At least one end-to-end Assessee Code registration/linking, PSID
  generation, ePay payment and settlement reconciliation scenario.

- At least one e-Khidmat-assisted payment, one
  expired/unmatched/duplicate confirmation and one manual continuity
  payment without double posting.

- Clearance certificate issue/verification/revocation and
  recovery-referral package scenarios.

# 23. Testing and Acceptance

| **Test type**                              | **Coverage**                                                                                                                                                                   |
|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Legal traceability                         | Every rule, rate, authority and document text maps to an approved source/version and effective date.                                                                           |
| Schedule calculation                       | Every Second Schedule rate/condition, area split, boundary and overlapping-activity highest-rate scenario.                                                                     |
| Hearing and service                        | Service failures, refusal, adjournment, non-response/ex-parte path, reasoned order and immutable service date.                                                                 |
| Appeal                                     | Thirty-day computation, complete record, hearing, decision and ledger implementation.                                                                                          |
| Refund/adjustment                          | Wrong collection, duplicate payment, offset, refund, rejection and reconciliation.                                                                                             |
| Employer/DDO                               | Employee schedule, October/April or lump-sum treatment, deposit matching, annual statement and default recovery after hearing.                                                 |
| Forms                                      | PFT-1/PFT-2/PFT-3 field accuracy, bilingual text, copy alignment, head of account, serial, amount words and printer output.                                                    |
| Payments and ledger                        | Treasury/bank/postal/cheque/electronic channels, duplicate posting, allocation, reversals and closing balances.                                                                |
| Migration                                  | Counts, duplicates, source provenance, opening balances, appeals/refunds and re-import control.                                                                                |
| Offline                                    | No network, interrupted sync, device loss, duplicate submission, evidence hash and conflict resolution.                                                                        |
| Security                                   | Authentication, authorization, jurisdiction, segregation, audit tampering, OWASP controls and penetration testing.                                                             |
| Performance and DR                         | Search, batch reports, document generation, 100-user load, backup and full restore.                                                                                            |
| User acceptance                            | Inspectors, ETO/DDETOs, Director/appellate staff, service staff and finance/employer representatives execute approved scenarios.                                               |
| ePay/PSID                                  | Assessee Code linking, 17-digit PSID format, amount/expiry, deep link/API failure, paid callback, duplicate/replay, delayed and out-of-order status.                           |
| Reconciliation                             | API/file/manual overlap, wrong amount, short/excess payment, expired PSID, unmatched reference, reversal and suspense resolution.                                              |
| e-Khidmat assisted service                 | Operator least privilege, consent, centre/session audit, registration/payment handoff, receipt and no assessment/ledger authority.                                             |
| Clearance certificate                      | Eligibility with paid/adjusted/stayed/disputed balances, approval/rejection, QR verification, privacy, reissue, expiry and revocation.                                         |
| Notice/recovery referral                   | Configurable stages, service, pause on appeal/stay/payment, evidence bundle, approval and external acknowledgement; no unauthorized coercive action.                           |
| 2026 legal delta and source freshness      | All FY 2026-27 rules/forms/rates trace to the reviewed Act/circular/SOP version; stale or unapproved configuration blocks release.                                             |
| Cloud deployment and environment isolation | Protected preview, separate data stores/credentials, configured region, WAF/rate limits, no production data leakage, TLS/domain and least-privilege cloud access.              |
| CI/CD and rollback                         | Blocking quality/security gates, immutable release, migration rehearsal, production promotion, Vercel rollback, queue pause/replay and database forward-fix/restore procedure. |
| Observability and operations               | Correlation IDs, alert routing, external log drain, P1/P2 incident simulation, runbook execution, support escalation and audit evidence.                                       |
| Cloud continuity and vendor exit           | PITR, off-provider logical restore, document backup restore, alternate project/provider rebuild and verification of exported hashes/ledger totals.                             |
| Service design and usability               | Representative role research, service blueprint, prototype task tests, error recovery, plain language, assisted-digital path and production-like UAT.                          |
| Design system and visual regression        | Token/component coverage, all states/breakpoints, Figma-to-code traceability, visual snapshots, no uncontrolled one-off styles and documented exceptions.                      |
| WCAG 2.2 accessibility                     | Automated and manual keyboard, focus, screen reader, zoom/reflow, contrast, target size, accessible authentication, reduced motion and HTML alternatives for critical PDFs.    |
| Responsive and localization                | 320px to large desktop, supported Android, English/Urdu/RTL, mixed-direction identifiers, font fallback, content expansion, print preview and no clipped/overlapping controls. |
| Frontend performance                       | Core Web Vitals, route bundle budgets, low-bandwidth profiles, large tables, upload/report progress, loading stability and real-user performance telemetry.                    |
| Product analytics privacy                  | Approved event schema, no prohibited PII, correct funnel/outcome events, retention/access, consent/legal basis and analytics failure not affecting transactions.               |

## 23.1 Pilot Acceptance Criteria

- 100% of approved calculation cases match the verified schedule and
  highest-rate rule.

- No second full annual liability can be charged to the same liable
  party/year without an approved legal basis; prior direct or employer
  payment is credited.

- No final Rule 4 order is produced without recorded hearing opportunity
  and service evidence.

- PFT-1 is separately issued/served and the appeal deadline is correctly
  calculated from service.

- PFT-2 three-copy output matches the approved form, totals and amount
  in words, and prints legibly in English and Urdu.

- PFT-3 and all dashboards reconcile to the ledger, including payments,
  penalty, refunds and adjustments.

- Employer deduction/deposit totals reconcile at employee and treasury
  levels.

- Appeal and refund/adjustment decisions are implemented without
  altering original orders/payments.

- No user can act outside authorized role, designation and jurisdiction.

- Backup restoration, offline sync and audit reconstruction are
  demonstrated.

- The same ePay settlement cannot be posted twice through callback, file
  import or manual entry, and every posted electronic payment traces to
  one PSID and raw confirmation.

- Legacy Assessee Codes link to the correct party without creating
  duplicate annual liability; unresolved conflicts are blocked and
  auditable.

- e-Khidmat-assisted transactions reconcile to the ledger and the
  operator cannot access or exercise assessment, refund or recovery
  powers.

- Clearance certificate verification returns the approved minimum data
  and revoked/superseded certificates cannot appear valid.

- The FY 2026-27 legal and operational configuration has signed evidence
  of review against the Punjab Finance Act 2026 and current
  Excise/ePay/e-Khidmat sources.

- The approved Vercel/managed-data region is explicitly configured,
  production traffic does not use the default United States function
  region, and measured latency is acceptable.

- Preview/UAT/production isolation is demonstrated; no production data
  or credentials are available in a pull-request preview.

- A failed application release is rolled back and a database migration
  failure is safely recovered without losing or duplicating a financial
  transaction.

- External logs and audit evidence remain available after the
  hosting-platform retention window, and alerts reach the named support
  owner.

- Database PITR, off-provider logical backup and document restore meet
  the approved RPO/RTO, and the system can be rebuilt from
  source/configuration documentation.

- All core role journeys can be completed by keyboard only; route
  changes, validation errors, loading and status changes are announced
  to assistive technology.

- The web application passes WCAG 2.2 AA acceptance with no unresolved
  critical/serious accessibility issue and an independent audit plan
  before province-wide rollout.

- At least 90% of representative pilot participants complete approved
  core tasks without assistance, no severity-1/2 usability defect
  remains, and the approved standardized usability target is met.

- Production p75 Core Web Vitals meet LCP \<=2.5 seconds, INP \<=200
  milliseconds and CLS \<=0.1 for representative high-use routes, or a
  signed exception and remediation plan is approved.

- Every production screen uses the approved design system or has a
  documented exception; visual regression and responsive English/Urdu
  examples are stored with the release evidence.

- No legal or financial action can be accidentally triggered by an
  icon-only, ambiguous, stale or optimistic interface; server-confirmed
  result and audit reference are displayed.

- No approved analytics event contains CNIC, name, address, free text,
  document content, PSID or another prohibited identifier.

# 24. Risks and Mitigations

| **Risk**                                                                       | **Impact**  | **Mitigation**                                                                                                                                                                                |
|--------------------------------------------------------------------------------|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Current amendments/circulars not included in supplied sources                  | High        | Legal wing validates a consolidated source pack and signs the traceability matrix before configuration freeze.                                                                                |
| PFT-1/PFT-3 originals not supplied; PFT-2 is provisional                       | High        | Obtain Gazette/approved originals, field map and printer sign-off before UAT exit.                                                                                                            |
| Incorrect interpretation of PFT-1/PFT-2 roles                                  | High        | Use source-aligned workflow and terminology; prohibit release if form mapping is unresolved.                                                                                                  |
| Hearing/service evidence incomplete                                            | High        | Mandatory service and hearing checkpoints, document evidence and supervisory exception reports.                                                                                               |
| Employer deduction rules not operationally harmonized after 2025 amendment     | High        | Obtain legal/departmental instructions; effective-date employer configurations and pilot with selected DDOs.                                                                                  |
| Multiple activities cause double assessment                                    | High        | Party-level annual liability, highest-rate engine, province-wide search and cross-channel payment crediting.                                                                                  |
| Wrongly collected tax cannot be implemented financially                        | High        | Approve refund/adjustment SOP, finance roles and treasury reconciliation before go-live.                                                                                                      |
| Legacy data lacks identifiers or reliable service dates                        | High        | Provenance/confidence flags, probable matching, officer verification and no fabricated values.                                                                                                |
| PFT-2 date/serial/PIN semantics unclear                                        | Medium/High | Template and numbering decision register; immutable internal IDs; validation and supersession.                                                                                                |
| Urdu text/fonts or copy alignment fail in printing                             | Medium/High | Approved fonts, server-side rendering, printer-specific UAT and visual regression tests.                                                                                                      |
| Users continue parallel paper outside PTAS                                     | High        | Approved administrative instruction, mandatory system references, exception monitoring and controlled continuity forms.                                                                       |
| Integration delay or downtime                                                  | Medium      | Manual verified channels remain operational; adapter queues and reconciliation.                                                                                                               |
| Unauthorized payment/configuration manipulation                                | High        | Segregation, maker-checker, immutable ledger, audit alerts and periodic access review.                                                                                                        |
| Punjab Finance Act 2026 or later circular changes are missed                   | High        | Mandatory legal delta, source freshness dashboard, effective-dated configuration and release gate for FY 2026-27.                                                                             |
| Parallel PTAS/ePay/legacy registries create duplicate parties or demand        | High        | Phase 0 systems inventory, authoritative-ID map, Assessee Code migration, duplicate review and agreed system-of-record boundary.                                                              |
| Electronic confirmation is duplicated, delayed or mismatched                   | High        | Idempotency, authenticated raw messages, settlement reconciliation, suspense/exception queue and maker-checker correction.                                                                    |
| B01600/B01601 or another head is applied to the wrong form/channel             | High        | Finance-approved effective-dated head matrix; issuance/payment blocked when unresolved; reconcile by actual settled head.                                                                     |
| e-Khidmat operator is given excessive authority or retains sensitive data      | High        | Restricted assisted-service role, consent, centre/device audit, data minimization and no assessment/ledger privileges.                                                                        |
| Clearance certificate is issued despite arrears or a later correction          | High        | Point-in-time eligibility snapshot, unresolved-exception checks, versioning, public verification and revocation/reissue.                                                                      |
| Recovery workflow embeds unsupported coercive powers                           | High        | Configurable notices and referral only; legal/delegation/SOP sign-off for every instrument and competent-authority action.                                                                    |
| Web page changes silently alter operational requirements                       | Medium/High | Controlled snapshots, hashes, review dates, source classification and human approval before implementation.                                                                                   |
| Unapproved cross-border data location or provider contract                     | High        | Approve data classification, processing locations, DPA/security review and contractual ownership before live data; configure region explicitly and prohibit uncontrolled edge caching of PII. |
| Vercel or managed-service outage                                               | High        | Durable external stores, provider-status monitoring, manual payment continuity, queue replay, tested rollback/restore and alternate project/provider recovery plan.                           |
| Serverless duration, connection or concurrency limits disrupt bulk work        | Medium/High | Use connection pooling, asynchronous durable workflows, chunking/back-pressure and a portable container worker fallback.                                                                      |
| Preview deployment exposes live data or credentials                            | High        | Separate projects/credentials, protected previews, synthetic data, automated environment checks and no production database route from preview.                                                |
| Cloud account takeover or loss of departmental control                         | High        | Department-owned team/domain/billing, MFA, RBAC, no shared accounts, break-glass controls, audit drains and prompt offboarding.                                                               |
| Vendor lock-in or implementation-partner dependency                            | High        | Portable Postgres/S3/OpenAPI design, department-owned source/accounts, off-provider backups, IaC/config inventory and annual restore/migration exercise.                                      |
| Cloud costs or quotas grow unexpectedly                                        | Medium/High | Budgets, alerts, plan/usage reviews, log and retry limits, rate controls, cost owner and safe degradation for non-critical workloads.                                                         |
| Application rollback is incompatible with database change                      | High        | Expand/contract migrations, backward compatibility window, migration rehearsal, restore point and separate application/data rollback decision.                                                |
| Inconsistent vendor-built screens create errors and high training/support cost | High        | Department-owned design tokens and Storybook library; component coverage gate; design authority; no one-off production UI without approved exception.                                         |
| Frontend reflects database structure rather than real officer tasks            | High        | Contextual research, service blueprint, task-based navigation, prototype testing and product-owner acceptance before build.                                                                   |
| Accessibility is treated as a final audit and blocks rollout                   | High        | WCAG 2.2 AA components, automated checks in CI, manual testing each release, disabled-user research and independent audit before scale.                                                       |
| Urdu/RTL and mixed identifiers break layouts or legal meaning                  | Medium/High | i18n foundation from Phase 1, logical CSS, approved glossary/font, bilingual Storybook cases and human legal/content QA.                                                                      |
| Dense dashboards hide action and encourage misleading management metrics       | Medium/High | Role-specific actionable measures, source-linked drill-down, accessible table alternatives and analytics governance.                                                                          |
| Large client bundles or tables make Vercel frontend slow on ordinary devices   | Medium/High | Server components, code splitting, bundle budgets, pagination, low-bandwidth testing, Core Web Vitals monitoring and regression gates.                                                        |
| Analytics leaks taxpayer or payment data                                       | High        | Approved event dictionary, PII deny-list, server-side redaction, restricted access/retention and test assertions against sensitive payloads.                                                  |
| Design assets remain with implementation partner and cannot be maintained      | High        | Department-owned Figma, Storybook, tokens, repository and licenses; documented handover, version history and contribution process.                                                            |

# 25. Pending Inputs and Immediate Actions

## 25.1 Pending Inputs and Decisions

| **Pending item**                                                                                     | **Why it matters**                                                                                                                                                                                                   |
|------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Current consolidated Act, Rules, amendments and binding circulars through go-live date               | Confirms employer deduction, schedule, authority, penalty, appeal and form wording.                                                                                                                                  |
| Official Gazette/approved PFT-1, PFT-2 and PFT-3                                                     | Finalizes fields, numbering, copies, service, print layout and register format.                                                                                                                                      |
| Approved legal treatment of PFT-2 ex-parte/penalty footer                                            | Must align with hearing requirements and current law.                                                                                                                                                                |
| PFT-2 financial-year/date, PIN and serial definitions                                                | Prevents inconsistent documents and migration errors.                                                                                                                                                                |
| Head of account and authorized payment channels/locations                                            | Required for valid payment forms and reconciliation.                                                                                                                                                                 |
| Post-2025 employer/DDO operational instructions and return format                                    | Defines mandatory deductions, timing, deposits, default and reporting.                                                                                                                                               |
| Closure/discontinuance financial treatment                                                           | Rule 10 alone does not establish cancellation or pro-rata relief.                                                                                                                                                    |
| Refund/adjustment financial SOP and authorities                                                      | Required to implement Rule 5 orders in treasury/ledger.                                                                                                                                                              |
| Appeal filing/service computation and late-appeal policy                                             | Required for deadline and workflow validation.                                                                                                                                                                       |
| Statutory vs operational mandatory data fields                                                       | Prevents unlawful rejection and supports duplicate control.                                                                                                                                                          |
| District/tehsil/locality/PIN/circle and officer master data                                          | Required for jurisdiction, form population and pilot configuration.                                                                                                                                                  |
| Commercial cloud procurement, approved region, data-processing/security review and support ownership | The Vercel-first baseline is confirmed, but the paid plan, contract/DPA, Mumbai/Dubai or other region, managed providers, billing owner, support coverage and vendor-access model must be approved before live data. |
| Punjab Finance Act 2026 full clause-by-clause impact on professional tax                             | Required for FY 2026-27 schedule, payment, authority and form configuration.                                                                                                                                         |
| Complete manual capture of https://excise.punjab.gov.pk/professional_tax#a15 and linked downloads    | Automated access was blocked; a signed snapshot is needed to validate current operational instructions.                                                                                                              |
| ePay Professional Tax API/deep-link, Assessee Code, PSID, callback and settlement-file contract      | Defines integration, identity mapping, confirmation trust and reconciliation ownership.                                                                                                                              |
| e-Khidmat Professional Tax SOP, service-centre role, receipt and data exchange                       | The service is live, but PTAS must know what is performed, by whom and how payment is reconciled.                                                                                                                    |
| Existing Professional Tax digital database and PITB digitization boundary                            | Prevents a parallel registry and determines migration, coexistence and decommissioning.                                                                                                                              |
| Current clearance certificate template, eligibility, signatory, validity and verification policy     | Required to implement a legally and operationally valid certificate.                                                                                                                                                 |
| Current call/demand notice sequence, service methods, waiting periods and recovery delegation        | Required before configuring escalation or referral.                                                                                                                                                                  |
| Finance-approved matrix for B01600/B01601 and all form/channel payment heads                         | Blocks incorrect forms and treasury allocation.                                                                                                                                                                      |
| Departmental Vercel/cloud organization, domain and billing owner                                     | Prevents production ownership from remaining with an individual developer or implementation partner.                                                                                                                 |
| Managed PostgreSQL, queue/workflow and private object-storage provider/plan                          | Determines region, backup/PITR, encryption, retention, connection limits, support and cost.                                                                                                                          |
| Approved SLA, RPO/RTO, maintenance window and incident escalation                                    | Required to contract and test operational service, continuity and support.                                                                                                                                           |
| External observability/security archive and retention period                                         | Required because platform-native log retention may be insufficient for audit and incident investigation.                                                                                                             |
| Cloud exit, data export and account handover acceptance criteria                                     | Required to avoid vendor/partner lock-in and confirm Department ownership.                                                                                                                                           |
| Official Punjab/Excise digital brand assets, logo rules, palette and typography                      | Required to finalize semantic tokens and government trust cues without copying an unrelated design system.                                                                                                           |
| Urdu interface scope, approved legal glossary, translation/review owner and fonts                    | Required for RTL architecture, bilingual forms, accurate terminology and ongoing content governance.                                                                                                                 |
| Access to representative users, offices, field devices and low-connectivity contexts                 | Required for contextual research, prototype testing, performance budgets and realistic acceptance.                                                                                                                   |
| Approved desktop/browser/Android device inventory and assistive-technology test matrix               | Required to define support, procurement, manual testing and release evidence.                                                                                                                                        |
| Product analytics, session replay, cookie/consent and telemetry policy                               | Required to measure outcomes without exposing taxpayer, employee, case or payment data.                                                                                                                              |
| Design authority, product owner, content designer and accessibility owner                            | Required to approve journeys/components, resolve cross-vendor inconsistencies and accept releases.                                                                                                                   |

## 25.2 Immediate Actions

> 1\. Constitute a legal/business/form validation group and approve the
> source hierarchy.
>
> 2\. Obtain and compare the current consolidated legal source pack,
> including the Punjab Finance Act 2026 and all professional-tax
> amendments/circulars through the go-live date.
>
> 3\. Manually archive and sign the current Excise Professional Tax page
> and linked forms/SOPs; approve the expanded legal and operational
> issue register.
>
> 4\. Complete a field-by-field map for PFT-1, PFT-2, PFT-3, annual
> statement and employer return.
>
> 5\. Approve the party-level annual liability and highest-rate
> calculation design.
>
> 6\. Finalize authority, designation, delegation and jurisdiction
> matrices.
>
> 7\. Resolve PFT-1/PFT-2 serial, PIN, Assessee Code, PSID and
> B01600/B01601 head-of-account rules; perform prototype print and
> payment-channel tests.
>
> 8\. Prepare migration templates with provenance and ledger
> opening-balance rules.
>
> 9\. Conduct contextual research and produce the service blueprint,
> task-based information architecture, responsive clickable prototypes
> and detailed SRS/acceptance catalogue, including ePay/e-Khidmat,
> clearance certificate and recovery-referral workflows.
>
> 10\. Select pilot districts/DDOs/e-Khidmat centres and establish
> signed baseline counts, Assessee Code mappings and financial totals.
>
> 11\. Approve the Vercel-first managed-cloud procurement baseline, paid
> plan, candidate region, managed database/queue/storage providers,
> DPA/security review, production ownership, SLA, RPO/RTO and support
> model.
>
> 12\. Start Phase 1 only after the legal/form baseline is signed.

13\. Conduct a joint Excise-Finance-PITB systems/interface workshop and
approve the ePay/e-Khidmat/system-of-record architecture before Phase 1
procurement/build.

14\. Approve the clearance-certificate and recovery-referral SOPs,
templates, authority and public-disclosure controls.

15\. Establish the Department-owned cloud team, domain/DNS, source
repository, billing controls, privileged-access roles and break-glass
procedure before any production deployment.

16\. Build the Preview, Development/Integration, UAT and Staging
environments with separate data stores and demonstrate automated CI/CD,
secret scanning, protected previews and no production-data access.

17\. Complete production-readiness review: threat model, WAF/rate
limits, load test, backup/PITR, full restore, rollback, log drain, alert
routing, support rota and mandatory runbooks.

18\. Conduct a vendor-exit drill by exporting PostgreSQL and document
metadata/files, restoring them to an isolated target and reconciling
counts, hashes and ledger totals.

19\. Appoint the Department product owner, UX/service-design lead,
content/Urdu owner, accessibility owner and design-system technical
owner.

20\. Establish Department-owned Figma and Storybook workspaces, approve
semantic design tokens and build the first accessible
component/page-template release before feature teams scale.

21\. Prototype and test the minimum screen inventory with representative
users on actual office/field devices and constrained networks; approve
findings and remediation before build sign-off.

22\. Approve WCAG 2.2 AA test matrix, supported browsers/devices,
Urdu/RTL scope, Core Web Vitals budgets and product-analytics privacy
schema.

23\. Integrate Storybook component tests, visual regression, Playwright
E2E, automated accessibility checks and performance budgets into the
blocking CI pipeline.

24\. Run a moderated usability and accessibility readiness review before
pilot go-live, then publish the measured task-success, error, support
and performance baseline for continuous improvement.

# Appendix A - Legal Traceability Matrix

| **Requirement area**                      | **Source**                                                                       | **PTAS module/control**                                                                       |
|-------------------------------------------|----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| **Annual tax and financial year**         | Finance Act s.3(1); Rule 2(i)                                                    | Annual liability, financial-year master, effective schedule                                   |
| **Multiple activities - highest rate**    | Finance Act s.3(2)                                                               | Applicable-category set and maximum-rate selection                                            |
| **Employer deduction/deposit**            | Finance Act s.3(2a)-(2c); Rules 7-8                                              | Employer/DDO schedule, deposit, return and default case                                       |
| **Government exemption**                  | Finance Act s.3(3)                                                               | Effective-dated exemption instrument                                                          |
| **Penalty ceiling**                       | Finance Act s.3(5)                                                               | Penalty order, ceiling and reasons                                                            |
| **Equivalent form/communication**         | Rule 2(e)                                                                        | Digital/scan statement acceptance                                                             |
| **Annual statement due**                  | Rule 3                                                                           | Annual filing and non-filer workflow                                                          |
| **ETO authority and evidence**            | Rule 4(1)-(2)                                                                    | Inquiry, assessment case and order                                                            |
| **Appeal and hearing**                    | Rule 4(3)-(4)                                                                    | Service date, hearing and appellate workflow                                                  |
| **Refund/adjustment**                     | Rule 5                                                                           | Application, reasoned order and financial implementation                                      |
| **PFT-1 notice**                          | Rule 6                                                                           | Notice of demand and service                                                                  |
| **PFT-2 payment**                         | Rule 9                                                                           | Direct payment form and channels                                                              |
| **Discontinuance**                        | Rule 10                                                                          | Thirty-day notice and verification                                                            |
| **PFT-3 register**                        | Rule 11                                                                          | Ledger-generated register                                                                     |
| **PFT-2 fields/copies**                   | Supplied provisional PFT-2 specimen                                              | Template map, three-copy print and validation                                                 |
| ePay PSID and payment channels            | ePay Punjab official portal/FAQ and Professional Tax user guide                  | Assessee Code link, payment intent, PSID, confirmation, reconciliation and exception handling |
| e-Khidmat assisted payment                | PITB announcement dated 3 June 2026; current SOP to be supplied                  | Restricted assisted-service role, channel audit and payment reconciliation                    |
| PFT-1 field/head evidence                 | Official 2001 Punjab Rules/forms amendment PDF; current form approval pending    | Historical field map, template versioning and B01600/B01601 decision                          |
| Clearance certificate and notice sequence | Indexed Excise operational-page reproductions; current departmental SOP required | Certificate workflow, configurable campaigns and source approval gate                         |
| Punjab Finance Act 2026 review            | Punjab Code Act L of 2026, promulgated 1 July 2026                               | Mandatory legal delta and FY 2026-27 release gate                                             |
| Existing digitization/system inventory    | PITB description of professional-taxpayer record digitization                    | System-of-record, migration/coexistence and duplicate-registry control                        |

**Source note:** Section and rule references use the supplied documents.
Legal reviewers should update this matrix for later amendments, Gazette
forms and departmental circulars.

# Appendix B - Working Second Schedule and Rates

The following table is a requirements working copy of the Second
Schedule contained in the supplied consolidated Act. It must be verified
against the current official law/circulars before configuration or
collection. “Metro/Municipal” means the area condition stated in the
source; the system requires an approved geographic master.

| **Ref.**          | **Class / condition**                                                                                                 | **Annual rate (Rs)** |
|-------------------|-----------------------------------------------------------------------------------------------------------------------|----------------------|
| **1(i)**          | Companies - paid-up capital up to Rs 5 million                                                                        | 10,000               |
| **1(ii)**         | Companies - over Rs 5m up to Rs 50m                                                                                   | 30,000               |
| **1(iii)**        | Companies - over Rs 50m up to Rs 100m                                                                                 | 70,000               |
| **1(iv)**         | Companies - over Rs 100m up to Rs 200m                                                                                | 100,000              |
| **1(v)**          | Companies - over Rs 200m                                                                                              | 100,000              |
| **2(i)**          | Non-company factory owners - employees not exceeding 10                                                               | 1,500                |
| **2(ii)**         | Non-company factory owners - employees over 10 up to 25                                                               | 5,000                |
| **2(iii)**        | Non-company factory owners - employees over 25                                                                        | 7,500                |
| **3(i)(a)**       | Non-company commercial establishment with 10+ employees - Metro/Municipal Corporation limits                          | 6,000                |
| **3(i)(b)**       | Same - other areas                                                                                                    | 4,000                |
| **3(ii)**         | All other commercial establishments other than wholesalers and retailers                                              | 2,000                |
| **4(i)**          | Import/export preceding-year value over Rs 0.1m up to Rs 1m                                                           | 2,000                |
| **4(ii)**         | Import/export over Rs 1m up to Rs 5m                                                                                  | 3,000                |
| **4(iii)**        | Import/export over Rs 5m                                                                                              | 5,000                |
| **5(i)**          | Contractors/builders/property developers - preceding-year supplies not exceeding Rs 1m                                | 1,000                |
| **5(ii)**         | Same - over Rs 1m up to Rs 10m                                                                                        | 6,000                |
| **5(iii)**        | Same - over Rs 10m up to Rs 50m                                                                                       | 10,000               |
| **5(iv)**         | Same - over Rs 50m                                                                                                    | 20,000               |
| **6(i)**          | Medical consultants/specialists/dental surgeons                                                                       | 5,000                |
| **6(ii)**         | Registered medical practitioners                                                                                      | 4,000                |
| **6(iii)(a)**     | Other medical systems incl. homoeopaths/hakeems/ayurvedics - Metro/Municipal                                          | 3,000                |
| **6(iii)(b)**     | Same - other areas                                                                                                    | 1,000                |
| **6(iv)(a)**      | Auditing firms per professionally qualified person - Metro/Municipal                                                  | 6,000                |
| **6(iv)(b)**      | Same - other areas                                                                                                    | 4,000                |
| **6(v)(a)**       | Management/tax consultants, architects, engineering/technical/scientific consultants - Metro/Municipal                | 6,000                |
| **6(v)(b)**       | Same - other areas                                                                                                    | 4,000                |
| **6(vi)**         | Lawyers                                                                                                               | 1,000                |
| **6(vii)(a)**     | Members of stock exchanges                                                                                            | 10,000               |
| **6(vii)(b)(i)**  | Money changers - Metro/Municipal                                                                                      | 6,000                |
| **6(vii)(b)(ii)** | Money changers - other areas                                                                                          | 2,000                |
| **6(vii)(c)(i)**  | Motorcycle/scooter dealers - Metro/Municipal                                                                          | 10,000               |
| **6(vii)(c)(ii)** | Motorcycle/scooter dealers - other areas                                                                              | 6,000                |
| **6(vii)(d)(i)**  | Motor vehicle dealers and real estate agents - Metro/Municipal                                                        | 20,000               |
| **6(vii)(d)(ii)** | Same - other areas                                                                                                    | 10,000               |
| **6(vii)(e)(i)**  | Recruiting agents - Metro/Municipal                                                                                   | 20,000               |
| **6(vii)(e)(ii)** | Recruiting agents - other areas                                                                                       | 10,000               |
| **6(viii)(i)**    | Carriage of goods/passengers by road - Metro/Municipal                                                                | 4,000                |
| **6(viii)(ii)**   | Same - other areas                                                                                                    | 2,000                |
| **6(ix)(i)**      | Health clubs and gymnasiums - Metro/Municipal                                                                         | 4,000                |
| **6(ix)(ii)**     | Same - other areas                                                                                                    | 2,000                |
| **6(x)**          | Jewelers, departmental stores, electronic goods stores, cable operators, printing presses and pesticide dealers       | 2,000                |
| **6(xi)**         | Tobacco vendors - wholesalers                                                                                         | 4,000                |
| **7**             | Franchisees, authorized dealers/agents and distributors                                                               | 5,000                |
| **8**             | Property developers/builders and marketing agent/company engaged in development, marketing and management of property | 50,000               |
| **9**             | Hotels, specified hostels, guest houses, motels and resorts providing lodging                                         | 5,000                |
| **10**            | Air-conditioned restaurants/eateries/fast food points/ice cream parlors/bakeries/confectioners/sweets shops           | 5,000                |
| **11**            | Persons in a profession, trade, calling or employment assessed to income tax during preceding financial years         | 200                  |

**Source note:** Second Schedule in the supplied Punjab Finance Act,
1977 consolidated copy, including amendments identified in that copy.
Verify current legal text before use.

# Appendix C - Minimum Data Classification

| **Data element**                                            | **Classification**                     | **Mandatory policy**                                                                            |
|-------------------------------------------------------------|----------------------------------------|-------------------------------------------------------------------------------------------------|
| **Party name**                                              | Statutory minimum / official form      | Mandatory                                                                                       |
| **Address**                                                 | Statutory minimum / official form      | Mandatory; retain historical and service addresses                                              |
| **Nature of profession/trade/calling/employment**           | Statutory minimum                      | Mandatory                                                                                       |
| **Financial year**                                          | Statutory/system                       | Mandatory                                                                                       |
| **District/tehsil/locality/PIN/class**                      | Official-form/master data              | Mandatory where required by approved form and jurisdiction                                      |
| **CNIC**                                                    | Operational identifier for individuals | Required when available/approved; verified status required; not a substitute for legal evidence |
| **Company/registration/NTN**                                | Operational/legal evidence by category | Conditional according to party/category                                                         |
| **Professional registration number**                        | Category evidence                      | Conditional for regulated profession                                                            |
| **Mobile/email**                                            | Operational contact                    | Mobile recommended; email optional unless policy makes it required                              |
| **Employee count / paid-up capital / preceding-year value** | Schedule-driving fact                  | Mandatory when the selected or evaluated category uses it                                       |
| **Metro/Municipal area flag**                               | Schedule-driving geographic fact       | Mandatory for area-split categories; derived from approved master                               |
| **Order, source and reasons**                               | Legal decision data                    | Mandatory for every assessment, penalty, appeal and refund/adjustment decision                  |
| **Service date/method/recipient**                           | Legal process data                     | Mandatory for PFT-1/order/appeal deadline and hearing notices                                   |
| **PFT-2 receipt/head of account**                           | Official-form/financial data           | Mandatory according to payment channel                                                          |

# Appendix D - Core Ledger and Correction Model

PFT-3 and all balances must be generated from append-only transactions.
Corrections do not erase the original event.

| **Transaction type**               | **Effect**                                           | **Required authority/source**                         |
|------------------------------------|------------------------------------------------------|-------------------------------------------------------|
| **Opening arrears**                | Increase arrears balance                             | Signed migration/opening balance approval             |
| **Approved annual liability**      | Increase current demand                              | Assessment/order and schedule source                  |
| **Differential revision increase** | Increase demand                                      | Revised reasoned order                                |
| **Differential revision decrease** | Reduce demand                                        | Revised reasoned order/appeal/refund-adjustment order |
| **Penalty**                        | Increase penalty demand up to tax ceiling            | Authorized penalty order and legal source             |
| **Direct payment**                 | Reduce allocated current/arrears/penalty             | Verified PFT-2 or other approved instrument           |
| **Employer deposit allocation**    | Reduce employee liability                            | Verified employer deposit and employee schedule       |
| **Refund**                         | Create cash/refund payable and reduce net collection | Rule 5 or appellate reasoned order                    |
| **Adjustment/offset**              | Transfer credit to approved liability/period         | Rule 5 or appellate reasoned order                    |
| **Correction/reversal**            | Equal and opposite entry; original remains visible   | Authorized correction order/reason                    |
| **Write-off/cancellation**         | Reduce demand only if legally authorized             | Specific legal/departmental source and reasoned order |

| **Reconciliation invariant:** For every party and financial year: opening demand + approved additions - approved reductions - allocated payments = closing balance. Reports, PFT-3 and dashboards must use the same ledger view. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# Appendix E - Web Research and Current Digital-Service Source Register

The register below records the additional web research used for v0.5.
Official sources inform the legal, integration, cloud-platform,
frontend, accessibility, design-system and operations baseline.
Third-party/indexed reproductions are included only to identify
questions that require confirmation from an authoritative source.

<table>
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Source / URL</strong></th>
<th><strong>Finding used in v0.5</strong></th>
<th><strong>Control / status</strong></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>Excise Professional Tax page<br />
https://excise.punjab.gov.pk/professional_tax#a15</td>
<td>Departmental operational page supplied for review.</td>
<td>Automated retrieval blocked; manually capture, hash and sign the
current page and downloads before implementation.</td>
</tr>
<tr class="even">
<td>ePay Punjab portal and FAQ<br />
https://epay.punjab.gov.pk/<br />
https://epay.punjab.gov.pk/latest-faqs</td>
<td>17-digit unique PSID for each tax-generating transaction and
multiple banking/payment channels.</td>
<td>Official current service; obtain Professional Tax interface,
settlement and exception contract.</td>
</tr>
<tr class="odd">
<td>ePay Professional Tax user guide<br />
https://storage.epay.punjab.gov.pk/user_guide/Professional%20Tax.pdf</td>
<td>Professional Tax registration begins with an Assessee Code.</td>
<td>Official public guide; confirm current validation rules, identifier
owner and API.</td>
</tr>
<tr class="even">
<td>PITB e-Khidmat announcement<br />
https://pitb.gov.pk/node/11149</td>
<td>Professional Tax payment available at e-Khidmat Markaz from June
2026 announcement.</td>
<td>Official current service; obtain SOP, role and reconciliation
details.</td>
</tr>
<tr class="odd">
<td>Punjab Code 2026 laws<br />
https://punjablaws.punjab.gov.pk/en/list_gazette_by_year/2026</td>
<td>Punjab Finance Act 2026 is Act L of 2026, promulgated 1 July
2026.</td>
<td>Official legal index; full professional-tax delta must be signed
before configuration freeze.</td>
</tr>
<tr class="even">
<td>Official historical PFT forms amendment<br />
https://punjablaws.punjab.gov.pk/uploads/articles/Amendment_in_the_Punjab_Professions_and_Trades_Tax_Rules%2C_1977.doc.pdf</td>
<td>PFT-1 field structure and Head of Account B01600; historical
schedule embedded.</td>
<td>Use for traceability only; not the current rate schedule. Resolve
against current forms and provisional PFT-2 B01601.</td>
</tr>
<tr class="odd">
<td>PITB Excise digitization overview<br />
https://www.pitb.gov.pk/node/5303</td>
<td>Professional-taxpayer record digitization described as
underway.</td>
<td>Official programme context; inventory current database, owners and
interfaces.</td>
</tr>
<tr class="even">
<td>Indexed operational reproduction<br />
https://shoukatlawassociatesdgkhan.blogspot.com/2020/09/collection-of-provincial-taxesfees-e.html</td>
<td>Self/manual routes, PFT-2 deposit, clearance-certificate evidence
and notice/appeal practices.</td>
<td>Non-authoritative lead only; validate against current Excise page,
Gazette forms and SOPs.</td>
</tr>
<tr class="odd">
<td>Vercel deployments and environments /
https://vercel.com/docs/deployments /
https://vercel.com/docs/deployments/environments</td>
<td>Git-connected deployments create unique preview URLs and support
preview/production environment separation.</td>
<td>Official platform source; use protected previews and separate
production promotion.</td>
</tr>
<tr class="even">
<td>Vercel regions / https://vercel.com/docs/regions</td>
<td>Vercel lists Mumbai (bom1) and Dubai (dxb1) compute regions and
advises functions to run near the database; the default is Washington,
D.C.</td>
<td>Official platform source; explicitly configure approved region and
co-locate data/compute.</td>
</tr>
<tr class="odd">
<td>Vercel Firewall/WAF and Deployment Protection /
https://vercel.com/docs/vercel-firewall/vercel-waf /
https://vercel.com/docs/deployment-protection</td>
<td>Managed WAF/firewall and access controls are available for
deployments.</td>
<td>Official platform source; production plan and rules require
security/procurement approval.</td>
</tr>
<tr class="even">
<td>Vercel sensitive environment variables and RBAC /
https://vercel.com/docs/environment-variables/sensitive-environment-variables
/ https://vercel.com/docs/rbac/access-roles</td>
<td>Sensitive variables can be unreadable after creation and Vercel
provides team/project access roles.</td>
<td>Official platform source; supplement with Department access policy,
MFA and break-glass controls.</td>
</tr>
<tr class="odd">
<td>Vercel Drains, logs and rollback / https://vercel.com/docs/drains /
https://vercel.com/docs/deployments/rollback-production-deployment</td>
<td>Telemetry can be forwarded externally and production deployments can
be rolled back/promoted.</td>
<td>Official platform source; retain logs externally and test rollback
with database compatibility.</td>
</tr>
<tr class="even">
<td>Vercel Marketplace storage /
https://vercel.com/docs/marketplace-storage /
https://vercel.com/docs/postgres</td>
<td>PostgreSQL and other managed storage are provided through external
Marketplace integrations rather than an embedded application
filesystem.</td>
<td>Official platform source; approve provider, region, contract and
backup separately.</td>
</tr>
<tr class="odd">
<td>Neon Vercel integration and backup/restore /
https://neon.com/docs/guides/vercel-overview /
https://neon.com/docs/guides/backup-restore</td>
<td>Managed PostgreSQL can integrate with Vercel, including preview
branching and point-in-time restore/snapshots subject to plan.</td>
<td>Official example provider; final database provider remains a
procurement decision and requires off-provider backup.</td>
</tr>
<tr class="even">
<td>Upstash QStash /
https://upstash.com/docs/qstash/overall/getstarted</td>
<td>Serverless messaging provides delivery guarantees and automatic
retries without maintaining a persistent worker.</td>
<td>Official example provider; use for durable asynchronous work only
after security, region, cost and SLA review.</td>
</tr>
<tr class="odd">
<td>AWS S3 encryption and Object Lock /
https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html
/
https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html</td>
<td>S3 supports encryption at rest and WORM-style object retention
controls.</td>
<td>Official example storage controls; equivalent approved provider may
be used.</td>
</tr>
<tr class="even">
<td>W3C WCAG 2.2 https://www.w3.org/TR/WCAG22/</td>
<td>WCAG 2.2 is the normative accessibility baseline, including focus
visibility, target size, redundant entry and accessible authentication
requirements.</td>
<td>Official W3C Recommendation; adopt Level AA and revalidate testing
interpretation at each major release.</td>
</tr>
<tr class="odd">
<td>GOV.UK Service Standard and Design System
https://www.gov.uk/service-manual/service-standard
https://design-system.service.gov.uk/</td>
<td>Research user needs, solve whole journeys, make services
simple/inclusive, reuse consistent patterns and operate a reliable
service.</td>
<td>Official public-sector reference; use principles/pattern discipline,
not UK branding or legal assumptions.</td>
</tr>
<tr class="even">
<td>U.S. Web Design System https://designsystem.digital.gov/</td>
<td>Accessible, mobile-friendly government components, design principles
and component-in-context accessibility testing.</td>
<td>Official public-sector reference; inform governance and testing
while PTAS maintains Punjab identity.</td>
</tr>
<tr class="odd">
<td>Next.js App Router, accessibility and production guidance
https://nextjs.org/docs/app
https://nextjs.org/docs/architecture/accessibility
https://nextjs.org/docs/app/guides/production-checklist</td>
<td>Current Next.js supports App Router, server/client component
composition, route announcements and production performance
guidance.</td>
<td>Official framework source; pin supported versions and revalidate
before implementation/upgrade.</td>
</tr>
<tr class="even">
<td>Storybook testing and accessibility
https://storybook.js.org/docs/writing-tests
https://storybook.js.org/docs/writing-tests/accessibility-testing</td>
<td>Stories can document and test component states, interactions,
accessibility and visual behaviour in isolation and CI.</td>
<td>Official tool source; use as coded design-system evidence, not as a
substitute for end-to-end/user testing.</td>
</tr>
<tr class="odd">
<td>Playwright accessibility and testing guidance
https://playwright.dev/docs/accessibility-testing
https://playwright.dev/docs/best-practices</td>
<td>Automated accessibility finds only some issues; combine it with
manual/inclusive testing and test user-visible behaviour.</td>
<td>Official tool source; apply cross-browser E2E and accessibility
checks in CI.</td>
</tr>
<tr class="even">
<td>Core Web Vitals https://web.dev/articles/vitals
https://web.dev/articles/defining-core-web-vitals-thresholds</td>
<td>Current good thresholds at p75 are LCP &lt;=2.5s, INP &lt;=200ms and
CLS &lt;=0.1.</td>
<td>Official web performance guidance; monitor real-user data and
revalidate metrics/thresholds as standards evolve.</td>
</tr>
</tbody>
</table>

Web research cut-off: 15 July 2026. Legal sources, design-system
guidance, accessibility interpretations, framework features, platform
regions, plan entitlements, limits, prices and provider contracts can
change; procurement and each production release must revalidate the
referenced official documentation and approved architecture decisions.

END OF FRONTEND-AND-UI/UX-INTEGRATED DRAFT PLAN
