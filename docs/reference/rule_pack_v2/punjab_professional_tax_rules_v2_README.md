# Punjab Professional Tax Rule Pack v2 — with Tertiary Classification

## Recommended integration

Use **`punjab_professional_tax_rules_v2.json`** as the primary rule source. It preserves the 47 statutory rate rules and adds a separate **tertiary allocation layer** for entries that bundle multiple entity/profession/establishment types under the same tax rate.

## Three-level hierarchy

1. **Category** — broad Second Schedule class (e.g. Professions and service providers).
2. **Subclassification** — the statutory schedule/slab code (e.g. `10`, `6(v)(a)`, `5(iii)`).
3. **Tertiary classification** — entity type inside a bundled statutory entry (e.g. `Bakery`, `Restaurant`, `Confectioner`).

The tertiary code is **not a new statutory tax slab**. It is an implementation/analytics allocation only. The parent subclassification continues to determine `annual_rate_pkr`.

## Example — entry 10

Statutory subclassification: `10` — AC food establishments — Rs 5,000 per annum.
Allowed tertiary types:

- `PFT-T10-RESTAURANT` — Restaurant
- `PFT-T10-EATERY` — Eatery
- `PFT-T10-FAST-FOOD` — Fast Food Point
- `PFT-T10-ICE-CREAM-PARLOR` — Ice Cream Parlor
- `PFT-T10-BAKERY` — Bakery
- `PFT-T10-CONFECTIONER` — Confectioner
- `PFT-T10-SWEETS-SHOP` — Sweets Shop

All retain the same statutory rate of Rs 5,000 per annum because the PDF lists them under the same entry.

## Agent matching rule

First determine the **statutory subclassification**. Then, if `tertiary.applicable` is true, use entity name/nature to select one of `tertiary.allowed_codes`. If the entity type cannot be identified reliably, leave the tertiary code blank/null and flag for review. Do not choose a tertiary type from tax amount because all tertiary types under a given parent rule share the same rate.

## Multi-year recovery

The PDF rates are annual. After the statutory subclassification is established, your separate project logic may test exact whole-year multiples (`recovery_amount = annual_rate_pkr × years`). This must not alter the statutory subclassification or tertiary type.

## Files

- `punjab_professional_tax_rules_v2.json` — recommended AI/IDE rule source.
- `punjab_professional_tax_rules_v2.csv` — exploded flat table; one row per statutory rule/tertiary option combination.
- `punjab_professional_tax_tertiary_taxonomy.csv` — unique tertiary-code dictionary.
- `PFT_AI_IMPLEMENTATION_GUIDE.md` — detailed agent instructions covering decision order, ambiguity handling, tertiary allocation, multi-year matching, safeguards and validation.

## Counts

- Statutory rate rules: 47
- Unique tertiary classifications: 56
- Flat rule/allocation rows: 108
