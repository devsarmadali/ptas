# @ptas/ui: Accessible Design System

Reusable, accessible component library for the **Punjab Professional Tax Administration System (PTAS)** built according to **WCAG 2.2 AA** guidelines and the draft design tokens in `docs/ui/design-tokens.json`.

> [!NOTE]
> **Draft Non-Branded Design Tokens**:
> Visuals use neutral, high-contrast, accessible styling. Official Punjab Government and Excise department branding remains an explicit approval gate (`RED` authority tier).

---

## Design Tokens

Tokens are exported from `@ptas/ui`:

```ts
import { tokens } from "@ptas/ui";

// Access color, spacing, radius, and typography tokens
const primaryAction = tokens.color.action.default;
const standardGap = tokens.spacing[4]; // 16px
```

---

## Component Suite

### 1. Button

Accessible button with keyboard activation and high-visibility focus states.

```tsx
import { Button } from "@ptas/ui";

<Button variant="primary" onClick={handleSubmit}>
  Save and Continue
</Button>
<Button variant="secondary" onClick={handleCancel}>
  Cancel
</Button>
<Button variant="danger" onClick={handleDelete}>
  Delete Record
</Button>
```

- **Accessibility**: Minimum 44px touch/click target, native keyboard operation (Enter/Space), high-contrast text ratios, `aria-disabled` handling.

---

### 2. TextField

Accessible text input tying together `<label>`, input, optional hint text, and field-level validation errors.

```tsx
import { TextField } from "@ptas/ui";

<TextField
  id="cnic-input"
  name="cnic"
  label="Citizen National Identity Card (CNIC)"
  hint="Enter 13 digits without dashes, e.g. 3520112345671"
  errorMessage={errors.cnic}
  required
  value={cnic}
  onChange={(e) => setCnic(e.target.value)}
/>;
```

- **Accessibility**: Explicit `<label htmlFor>`, hint linked via `aria-describedby`, error message marked with `role="alert"` and linked via `aria-describedby`, `aria-invalid="true"`.

---

### 3. ErrorSummary

High-visibility error alert box linking validation errors directly to the invalid inputs for immediate keyboard and screen-reader navigation.

```tsx
import { ErrorSummary } from "@ptas/ui";

<ErrorSummary
  title="There is a problem"
  errors={[
    { fieldId: "cnic-input", message: "CNIC must be exactly 13 digits" },
    { fieldId: "taxpayer-name", message: "Taxpayer display name is required" }
  ]}
/>;
```

- **Accessibility**: `role="alert"`, `tabIndex={-1}` for programmatic focus upon form validation failure, anchor links (`#fieldId`) for instant keyboard focus.

---

### 4. StatusBadge

Color-contrast compliant status indicator badge for case states, payment states, and roles.

```tsx
import { StatusBadge } from "@ptas/ui";

<StatusBadge tone="neutral">DRAFT</StatusBadge>
<StatusBadge tone="warning">PENDING APPROVAL</StatusBadge>
<StatusBadge tone="success">APPROVED</StatusBadge>
<StatusBadge tone="danger">REJECTED</StatusBadge>
```

- **Accessibility**: WCAG AA compliant text-to-background contrast (> 4.5:1), pill layout with clear visual hierarchy.

---

### 5. DataTable

Accessible data table with column headers, semantic markup, and empty state.

```tsx
import { DataTable } from "@ptas/ui";

<DataTable
  caption="Active Circles in District Lahore"
  keyField="id"
  columns={[
    { key: "code", header: "Circle Code" },
    { key: "name", header: "Circle Name" },
    { key: "inspector", header: "Assigned Inspector" }
  ]}
  data={circles}
  emptyMessage="No circles found."
/>;
```

- **Accessibility**: `<caption>` for screen reader overview, `<th scope="col">` for column associations, horizontal scroll wrapper.

---

### 6. PageShell

Semantic application layout shell with skip links, draft disclaimer banner, title row, and user context.

```tsx
import { PageShell, Button } from "@ptas/ui";

<PageShell
  title="Circle Overview"
  subtitle="Manage circle inspectors and taxpayer registry"
  roleContext="Inspector"
  jurisdictionContext="Circle A (Lahore Zone 1)"
  headerActions={<Button variant="primary">New Survey</Button>}
>
  <p>Page body content...</p>
</PageShell>;
```

- **Accessibility**: Skip link targeting `#main-content`, semantic `<header>`, `<main id="main-content" tabIndex={-1}>`, draft disclaimer notice.
