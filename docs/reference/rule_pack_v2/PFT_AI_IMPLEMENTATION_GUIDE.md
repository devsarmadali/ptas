# Punjab Professional Tax Rule Pack v2 — AI / IDE Implementation Guide

## 1. Purpose

This document explains how an AI agent or software rule engine should use the accompanying Punjab Professional Tax (PFT) rule files.

The statutory source is the user-provided **Second Schedule (See section 3)** in `punjab-finance-act-1977-doc-pdf (1).pdf`. The JSON and CSV files normalize that schedule for implementation. The **tertiary classification layer is analytical only**: it separates distinct entity/profession/establishment types that the Schedule itself groups under one statutory entry and one tax rate.

Do **not** treat tertiary codes as new legal tax slabs.

---

## 2. Files and precedence

Use the files in this order:

1. **`punjab_professional_tax_rules_v2.json`** — canonical machine-readable rule source.
2. **`punjab_professional_tax_tertiary_taxonomy.csv`** — dictionary of tertiary codes, labels, source terms and aliases.
3. **`punjab_professional_tax_rules_v2.csv`** — flattened/exploded representation for inspection, SQL imports, BI tools and tabular workflows.
4. **`punjab_professional_tax_rules_v2_README.md`** — concise package overview.
5. **`PFT_AI_IMPLEMENTATION_GUIDE.md`** — implementation, matching, ambiguity and validation guidance.

If the CSV and JSON ever disagree, treat the **JSON as canonical** and flag the package for review.

---

## 3. Classification hierarchy

Always preserve these three separate levels:

### Level 1 — Category

Broad statutory class from the Second Schedule.

Examples:

- Companies
- Factories (persons other than companies)
- Commercial Establishments
- Importers / Exporters
- Contractors / Builders / Property Developers
- Professions and Service Providers
- Franchisees / Authorized Dealers / Agents / Distributors
- Property Development / Marketing / Management
- Lodging Establishments
- AC Food Establishments
- Income-tax-assessed persons

### Level 2 — Statutory Subclassification

The actual Schedule entry/slab that determines the statutory annual tax rate.

Examples:

- `1(ii)` — company paid-up capital > Rs 5m and <= Rs 50m
- `2(iii)` — factory with more than 25 employees
- `6(v)(b)` — specified consultants, outside Metropolitan/Municipal Corporation limits
- `10` — AC food establishments listed in entry 10

`subclassification_code` is the controlling statutory code.

### Level 3 — Tertiary Classification

A finer entity-type allocation inside a statutory rule that lists more than one type.

Examples under statutory entry `10`:

- Restaurant
- Eatery
- Fast Food Point
- Ice Cream Parlor
- Bakery
- Confectioner
- Sweets Shop

All of those remain under statutory subclassification `10` and all retain the same Rs 5,000 annual rate. The tertiary classification is for analytics, filtering and more precise entity labelling.

---

## 4. Required decision order

The engine should classify in this order. Do not reverse the order merely to obtain a rate match.

### Step 1 — Preserve original input

Keep the raw taxpayer/entity name, assessment/recovery amount, payment date and any source description unchanged in audit fields.

### Step 2 — Normalize input for matching

For matching only, normalize common spelling and formatting noise, for example:

- case differences;
- punctuation;
- repeated spaces;
- `&` versus `and`;
- harmless singular/plural differences;
- accepted aliases contained in the tertiary taxonomy.

Do not overwrite the original name.

### Step 3 — Determine statutory category

Use the strongest available evidence about the entity's actual nature, legal form or profession.

Examples:

- `ABC (Pvt.) Ltd.` may support the Company family, subject to legal-form evidence and the available record.
- `XYZ Filling Station` may support a commercial-establishment classification if the underlying facts support that treatment.
- `Dr. ... Dental Surgeon` directly supports the relevant professional type.
- `... Bakery` directly supports the Bakery tertiary type under statutory entry `10`, provided the statutory AC condition is satisfied where required.

Name-based evidence can identify nature, but the agent must not invent missing legal facts such as employee count, paid-up capital or location scope.

### Step 4 — Determine statutory subclassification

Apply the parent rule's structured `criteria` using known facts such as:

- paid-up capital;
- employee count;
- preceding-financial-year import/export value;
- preceding-financial-year supply value;
- Metropolitan/Municipal Corporation versus Other location;
- profession/service type;
- statutory establishment type.

If a required discriminator is unknown, use an unresolved/unknown subclassification state in the application rather than forcing a statutory slab.

### Step 5 — Assign tertiary classification, if applicable

Only after a statutory rule is selected:

1. Check `tertiary.applicable`.
2. If `false`, leave `tertiary_code = null`.
3. If `true`, select **only** from that rule's `tertiary.allowed_codes`.
4. Match using explicit entity-name/nature evidence and the aliases in `tertiary_taxonomy`.
5. If more than one type is plausible, leave the tertiary classification unresolved and flag it for review.

**Never use the tax amount to choose between tertiary types under the same statutory rule.** The tertiary layer does not affect the rate.

### Step 6 — Compare assessment/recovery with the annual rate

The Schedule rates are annual. After the statutory rule has been established, compare the transaction amount with `annual_rate_pkr`.

Recommended statuses:

- `EXACT_1Y` — amount equals one annual rate.
- `EXACT_MULTIYEAR` — amount equals the annual rate multiplied by an exact whole number of years.
- `AMBIGUOUS_MULTIYEAR` — more than one statutory slab/year combination remains possible because the underlying subclassification is not independently known.
- `MISMATCH` — no permitted exact annual or multi-year match.
- `AMOUNT_MISSING` — no usable amount.
- `UNRESOLVED_RULE` — category/subclassification not sufficiently established.

### Step 7 — Apply multi-year logic conservatively

Use multi-year matching **only after the statutory category is independently supported**. If the category is confirmed but its rate-based subclassification/slab is unresolved, the engine may test every legally available slab inside that confirmed category against exact whole-year multiples. A subclassification may be rectified from this test only when exactly one slab × year combination fits and no required non-rate condition contradicts it. If two or more combinations fit, keep the subclassification doubtful/ambiguous.

Formula:

`recovery_amount = annual_rate_pkr × whole_number_of_years`

Recommended default test range: **1 to 10 years**, configurable by the application.

Example:

- Confirmed factory subclassification `2(iii)`
- Annual rate = Rs 7,500
- Recovery = Rs 22,500
- `22,500 / 7,500 = 3`
- Result: `EXACT_MULTIYEAR`, `years = 3`

Do not invent combinations such as adding different slabs, applying arbitrary percentages, dividing into partial years, or mixing unrelated categories merely to make an amount fit.

If an unusually long exact multiple is found outside the configured range, report it as a review signal rather than automatically confirming it.

---

## 5. Amount matching must not override nature evidence

A rate is often shared by several unrelated statutory rules. Therefore:

- Do not infer a profession or business type solely because the amount equals that type's rate.
- Do not change a confirmed entity nature merely because another category gives a cleaner numerical match.
- Within a **confirmed category**, amount may be used to resolve an otherwise-undetermined statutory slab when exactly one legal slab × whole-year combination fits.
- If more than one slab/year combination fits, keep the result ambiguous; do not choose the most convenient one.
- Use the amount as a **validation/reconciliation signal**, never as the sole basis for jumping to an unrelated category.

Example: Rs 5,000 appears in multiple Schedule entries. It cannot by itself prove that an entity is a medical consultant, factory, importer/exporter, franchisee, hotel or AC food establishment.

---

## 6. Tertiary-classification rules

### 6.1 Allowed values only

A tertiary code must exist in `tertiary_taxonomy` and must also appear in the selected rule's `tertiary.allowed_codes`.

Do not create new tertiary codes dynamically during routine classification.

### 6.2 Source-enumerated types

The tertiary taxonomy is derived from distinct types expressly listed inside the source entry. Examples include:

- Importer / Exporter;
- Contractor / Builder / Property Developer;
- Medical Consultant / Specialist / Dental Surgeon;
- Management Consultant / Tax Consultant / Architect / Engineering Consultant / Technical Consultant / Scientific Consultant;
- Motor Vehicle Dealer / Real Estate Agent;
- Goods Carriage / Passenger Carriage;
- Jeweler / Departmental Store / Electronic Goods Store / Cable Operator / Printing Press / Pesticide Dealer;
- Franchisee / Authorized Dealer / Agent / Distributor;
- Hotel / Hostel / Guest House / Motel / Resort;
- Restaurant / Eatery / Fast Food Point / Ice Cream Parlor / Bakery / Confectioner / Sweets Shop.

### 6.3 Residual tertiary types

Some statutory wording contains an explicit residual class, for example `Others including ...`. A residual tertiary code may therefore exist in the taxonomy.

Use a residual code only when the record is known to belong to that statutory entry but does not match one of its specifically enumerated types. Do not use a residual code as a generic fallback for an unknown category.

### 6.4 Unknown tertiary type

If the statutory subclassification is known but the finer type is not identifiable:

- retain the statutory classification and annual rate;
- set `tertiary_code = null`;
- set an application review flag such as `TERTIARY_UNRESOLVED`.

This is preferable to a guessed tertiary allocation.

---

## 7. Important statutory ambiguities and safeguards

### Company entries 1(iv) and 1(v)

Both carry the same annual rate of Rs 100,000. The rate alone cannot distinguish them. Paid-up capital is required.

If paid-up capital is unavailable, do not manufacture a precise `1(iv)` or `1(v)` choice from the amount.

### Location-sensitive rules

Where the Schedule distinguishes:

- `METROPOLITAN_OR_MUNICIPAL_CORPORATION`, and
- `OTHER`,

the location scope must come from reliable location/jurisdiction data. Do not infer the location band from amount alone if the entity's location scope is unknown.

### Employee-band rules

Factories and certain commercial establishments require employee-count facts. Entity name alone does not establish the employee band.

### Value-band rules

Importer/exporter and contractor/builder/property-developer slabs depend on preceding-financial-year value. Current recovery amount is not that value and should not be substituted for it.

### Entry 10 AC condition

The source entry covers the listed food businesses **with air-conditioning facility**. Identifying `Bakery` or `Restaurant` by name does not by itself prove the AC condition. If AC status is unknown, retain the candidate nature but flag the statutory applicability condition for review rather than silently assuming it.

---

## 8. Recommended output object

The following is an application recommendation, not statutory wording:

```json
{
  "raw_name": "Example Bakery",
  "normalized_name": "example bakery",
  "category_code": "10",
  "category": "AC Food Establishments",
  "subclassification_code": "10",
  "rule_id": "PFT-10",
  "tertiary_code": "PFT-T10-BAKERY",
  "tertiary_classification": "Bakery",
  "annual_rate_pkr": 5000,
  "recovery_amount_pkr": 15000,
  "rate_match_status": "EXACT_MULTIYEAR",
  "matched_years": 3,
  "classification_confidence": "HIGH",
  "review_required": false,
  "evidence": [
    "Entity name explicitly contains 'Bakery'",
    "Selected tertiary code is allowed by statutory rule 10",
    "Recovery equals Rs 5,000 × 3 years"
  ]
}
```

Recommended confidence values:

- `HIGH` — direct nature evidence plus all required statutory discriminators are known.
- `MEDIUM` — strong nature evidence but one non-rate detail is inferred from a trusted structured field or prior confirmed record.
- `LOW` — plausible candidate only; human review required.

Do not label a classification `HIGH` if a required statutory condition is unknown.

---

## 9. Recommended matching behaviour for entity names

Use name matching as evidence of **nature**, not as a substitute for statutory facts.

Preferred order:

1. Exact normalized phrase match to a taxonomy alias.
2. Strong token/phrase match where the business descriptor is explicit.
3. Previously verified mapping for the exact same taxpayer/entity, if your application maintains one.
4. Fuzzy spelling match only as a review aid.

Examples:

- `ABC Bakers` may be a candidate for Bakery, but `Bakers` versus `Bakery` should be handled through an approved alias/normalization policy.
- `XYZ Restaurant` strongly supports Restaurant.
- A person's name such as `Muhammad Ashraf` does not identify a profession and should not be assigned a profession merely from a matching tax amount.

Avoid false positives from common words such as `services`, `enterprises`, `traders`, `international`, `company`, `agency` or `group` unless the statutory nature is genuinely established.

---

## 10. Duplicate detection is a separate layer

Do not mix statutory classification with duplicate detection.

A record may be correctly classified and still be:

- a confirmed duplicate;
- the same taxpayer paying the same amount on a different date;
- the same taxpayer with a different transaction;
- a name match with incomplete counterpart data.

Keep duplicate/repetition statuses in separate fields. They must not change the PFT category, subclassification, tertiary code or annual rate.

---

## 11. Suggested validation checks

Run these checks whenever rules are loaded or updated:

1. Every `rule_id` is unique.
2. Every `subclassification_code` maps to the intended statutory rule.
3. Every `annual_rate_pkr` is a positive integer.
4. Every rule marked `tertiary.applicable=true` has at least one `allowed_code`.
5. Every `allowed_code` exists in `tertiary_taxonomy`.
6. No tertiary code is used under a parent rule where it is not allowed.
7. Tertiary selection never changes `annual_rate_pkr`.
8. Multi-year matching uses whole-number multiplication only.
9. A multi-year match never creates an unknown category. It may resolve a slab only inside an independently confirmed category when the slab × year result is unique and non-contradictory.
10. Company `1(iv)` versus `1(v)` is not decided from the shared Rs 100,000 rate alone.
11. Location-sensitive rules are not resolved from amount alone when location scope is missing.
12. Missing required statutory facts produce a review/unresolved state rather than a fabricated value.

---

## 12. Minimal rule-engine pseudocode

```text
INPUT record

preserve raw fields
normalize name for matching

candidate_rules = identify statutory family from verified nature facts

IF no reliable statutory family:
    return UNRESOLVED_RULE

rule = evaluate structured statutory criteria within candidate family

IF no unique rule AND recovery amount exists:
    test legal rules inside the confirmed family against exact whole-year multiples
    IF exactly one rule × year combination fits within configured range
       AND no known statutory fact contradicts it:
        select that rule and record that it was resolved by multi-year reconciliation
    ELSE:
        return review-required result

IF no unique rule:
    return review-required result

tertiary_code = null
IF rule.tertiary.applicable:
    tertiary_code = match name/nature against allowed tertiary codes only
    IF multiple plausible matches:
        tertiary_code = null
        set TERTIARY_UNRESOLVED

annual_rate = rule.annual_rate_pkr

IF recovery amount exists:
    IF recovery == annual_rate:
        rate_status = EXACT_1Y
        years = 1
    ELSE IF recovery / annual_rate is an exact positive integer
            AND years is within configured multi-year range:
        rate_status = EXACT_MULTIYEAR
        years = recovery / annual_rate
    ELSE:
        rate_status = MISMATCH
ELSE:
    rate_status = AMOUNT_MISSING

return statutory rule + tertiary allocation + rate reconciliation + evidence
```

---

## 13. Examples

### Example A — Bakery with three-year recovery

Known facts:

- Name: `S Example Bakery`
- Establishment satisfies statutory entry 10 conditions
- Recovery: Rs 15,000

Result:

- Category: AC Food Establishments
- Subclassification: `10`
- Tertiary: `PFT-T10-BAKERY`
- Annual rate: Rs 5,000
- Multi-year: 3 years
- Rate status: `EXACT_MULTIYEAR`

### Example B — Restaurant versus Confectioner

If a taxpayer is explicitly named `ABC Restaurant`, choose Restaurant.
If explicitly named `ABC Confectioners`, choose Confectioner.
If the name is only `ABC Foods` and no nature field resolves the type, keep statutory entry 10 only if independently established and leave the tertiary code null.

### Example C — Factory recovery Rs 22,500

If the taxpayer is independently confirmed as a **Factory** but the employee band is unknown, test all factory slabs against exact whole-year multiples. For Rs 22,500:

- `2(i)` Rs 1,500 × 15 years — outside the recommended 1–10 year default range;
- `2(ii)` Rs 5,000 — no exact whole-year match;
- `2(iii)` Rs 7,500 × 3 years = Rs 22,500.

With the default 1–10 year range, this uniquely supports `2(iii)` as a 3-year recovery, provided no known employee-count evidence contradicts it. If more than one in-range factory slab produced an exact match, keep the subclassification ambiguous.

### Example D — Company recovery Rs 100,000

Rs 100,000 matches both `1(iv)` and `1(v)` annual rates. Without paid-up capital, the precise statutory slab remains unresolved.

---

## 14. What the agent must never do

- Do not invent statutory categories, subclassification codes or tax rates.
- Do not create new tertiary types during ordinary classification.
- Do not use tertiary type to alter the statutory annual rate.
- Do not use amount alone to assign a profession/business nature when several statutory rules share that rate.
- Do not force a location band, employee band, capital band or value band when the necessary fact is missing.
- Do not combine different rates or use arbitrary percentages to manufacture a multi-year match.
- Do not silently treat approximate numerical matches as exact matches.
- Do not overwrite the raw taxpayer name or transaction values.
- Do not treat duplicate-detection status as a tax-classification rule.

---

## 15. Versioning

- `schema_version: 2.0` introduces the tertiary allocation layer.
- Keep statutory rules and analytical/implementation fields distinguishable.
- When the legal Schedule changes, create a new rule-pack version rather than silently editing historical rules used for prior assessments.
- Record the legal source/amendment basis for any future statutory change.
