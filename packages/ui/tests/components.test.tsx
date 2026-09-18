import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button,
  TextField,
  ErrorSummary,
  StatusBadge,
  DataTable,
  PageShell,
  tokens
} from "../src/index.js";

describe("Button component", () => {
  it("renders a native button with primary variant by default", () => {
    const html = renderToStaticMarkup(<Button>Submit Assessment</Button>);
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("Submit Assessment");
  });

  it("applies danger variant background and color tokens", () => {
    const html = renderToStaticMarkup(<Button variant="danger">Delete Record</Button>);
    expect(html).toContain(tokens.color.danger.default);
  });

  it("enforces accessibility for disabled state", () => {
    const html = renderToStaticMarkup(
      <Button disabled ariaLabel="Submit form (disabled)">
        Submit
      </Button>
    );
    expect(html).toContain("disabled");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Submit form (disabled)"');
  });
});

describe("TextField component", () => {
  it("binds label to input via htmlFor and id", () => {
    const html = renderToStaticMarkup(
      <TextField id="taxpayer-name" label="Taxpayer Name" name="name" />
    );
    expect(html).toContain('<label for="taxpayer-name"');
    expect(html).toContain('<input id="taxpayer-name"');
  });

  it("links hint text via aria-describedby", () => {
    const html = renderToStaticMarkup(
      <TextField id="cnic-field" label="CNIC" name="cnic" hint="13 digits without hyphens" />
    );
    expect(html).toContain('id="cnic-field-hint"');
    expect(html).toContain('aria-describedby="cnic-field-hint"');
    expect(html).toContain("13 digits without hyphens");
  });

  it("links errorMessage with role=alert and sets aria-invalid=true", () => {
    const html = renderToStaticMarkup(
      <TextField
        id="tax-rate-field"
        label="Tax Rate"
        name="rate"
        errorMessage="Tax rate is required"
      />
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="tax-rate-field-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-describedby="tax-rate-field-error"');
    expect(html).toContain("Tax rate is required");
  });

  it("supports simultaneous hint and error in aria-describedby", () => {
    const html = renderToStaticMarkup(
      <TextField
        id="pin-field"
        label="PIN"
        name="pin"
        hint="4-digit PIN"
        errorMessage="Invalid PIN"
      />
    );
    expect(html).toContain('aria-describedby="pin-field-hint pin-field-error"');
  });

  it("marks required inputs programmatically and visually", () => {
    const html = renderToStaticMarkup(
      <TextField id="email-field" label="Email" name="email" required />
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain("required");
    expect(html).toContain("*");
  });
});

describe("ErrorSummary component", () => {
  it("renders nothing when errors array is empty", () => {
    const html = renderToStaticMarkup(<ErrorSummary errors={[]} />);
    expect(html).toBe("");
  });

  it("renders role=alert with aria-labelledby and tabIndex=-1", () => {
    const html = renderToStaticMarkup(
      <ErrorSummary
        title="Validation Errors"
        errors={[
          { fieldId: "cnic-input", message: "CNIC is invalid" },
          { message: "General system error without field" }
        ]}
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-labelledby="error-summary-title"');
    expect(html).toContain('id="error-summary-title"');
    expect(html).toContain('href="#cnic-input"');
    expect(html).toContain("CNIC is invalid");
    expect(html).toContain("General system error without field");
  });
});

describe("StatusBadge component", () => {
  it("renders with tone styling and rounded pill shape", () => {
    const tones = ["neutral", "success", "warning", "danger"] as const;
    for (const tone of tones) {
      const html = renderToStaticMarkup(<StatusBadge tone={tone}>TEST STATUS</StatusBadge>);
      expect(html).toContain("TEST STATUS");
      expect(html).toContain("border-radius:9999px");
    }
  });
});

describe("DataTable component", () => {
  interface Row {
    id: string;
    code: string;
    name: string;
  }

  const columns = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" }
  ];

  it("renders table with caption and column headers with scope=col", () => {
    const data: Row[] = [{ id: "1", code: "C1", name: "Circle 1" }];

    const html = renderToStaticMarkup(
      <DataTable caption="Circle Directory" keyField="id" columns={columns} data={data} />
    );

    expect(html).toContain("<caption");
    expect(html).toContain("Circle Directory");
    expect(html).toContain('<th scope="col"');
    expect(html).toContain("Circle 1");
  });

  it("displays emptyMessage when no rows exist", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Empty List"
        keyField="id"
        columns={columns}
        data={[]}
        emptyMessage="No records available."
      />
    );

    expect(html).toContain("No records available.");
  });
});

describe("PageShell component", () => {
  it("includes accessible skip link targeting #main-content", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Dashboard">
        <p>Main content area</p>
      </PageShell>
    );

    expect(html).toContain('href="#main-content"');
    expect(html).toContain("Skip to main content");
    expect(html).toContain('<main id="main-content" tabindex="-1"');
    expect(html).toContain("Main content area");
  });

  it("includes draft non-branded notice banner", () => {
    const html = renderToStaticMarkup(<PageShell title="Dashboard">Content</PageShell>);

    expect(html).toContain('role="region"');
    expect(html).toContain(
      "Draft Non-Branded Engineering Prototype. Official Punjab Government branding is approval-gated."
    );
  });

  it("renders role and jurisdiction badges when provided", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Assessment Review" roleContext="ETO" jurisdictionContext="Lahore Zone 1">
        Content
      </PageShell>
    );

    expect(html).toContain("Role: ETO");
    expect(html).toContain("Jurisdiction: Lahore Zone 1");
  });
});
