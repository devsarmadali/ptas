import { describe, expect, it } from "vitest";
import { filterTaxpayersByJurisdiction } from "../src/taxpayer-search.js";
import { createTaxpayer } from "../src/taxpayer.js";
import type { Jurisdiction } from "../src/jurisdiction.js";
import type { AuditActor } from "../src/audit.js";

const JURISDICTIONS: Jurisdiction[] = [
  {
    id: "reg-lhr",
    type: "REGION",
    code: "REG-LHR",
    name: "Lahore Region",
    parentId: null,
    activeFrom: "2020-01-01"
  },
  {
    id: "dist-lhr",
    type: "DISTRICT",
    code: "DIST-LHR",
    name: "Lahore District",
    parentId: "reg-lhr",
    activeFrom: "2020-01-01"
  },
  {
    id: "off-lhr-east",
    type: "OFFICE",
    code: "OFF-LHR-E",
    name: "Lahore East Office",
    parentId: "dist-lhr",
    activeFrom: "2020-01-01"
  },
  {
    id: "circle-lhr-01",
    type: "CIRCLE",
    code: "CIRC-LHR-01",
    name: "Lahore Circle 1",
    parentId: "off-lhr-east",
    activeFrom: "2020-01-01"
  },
  {
    id: "circle-lhr-02",
    type: "CIRCLE",
    code: "CIRC-LHR-02",
    name: "Lahore Circle 2",
    parentId: "off-lhr-east",
    activeFrom: "2020-01-01"
  },
  {
    id: "reg-rwp",
    type: "REGION",
    code: "REG-RWP",
    name: "Rawalpindi Region",
    parentId: null,
    activeFrom: "2020-01-01"
  },
  {
    id: "dist-rwp",
    type: "DISTRICT",
    code: "DIST-RWP",
    name: "Rawalpindi District",
    parentId: "reg-rwp",
    activeFrom: "2020-01-01"
  },
  {
    id: "off-rwp",
    type: "OFFICE",
    code: "OFF-RWP",
    name: "Rawalpindi Office",
    parentId: "dist-rwp",
    activeFrom: "2020-01-01"
  },
  {
    id: "circle-rwp-01",
    type: "CIRCLE",
    code: "CIRC-RWP-01",
    name: "Rawalpindi Circle 1",
    parentId: "off-rwp",
    activeFrom: "2020-01-01"
  }
];

const ACTOR_CREATOR: AuditActor = {
  userId: "admin-1",
  roleCode: "ADMIN",
  jurisdictionId: "reg-lhr"
};

const tpCircle1 = createTaxpayer(
  {
    id: "tp-01",
    displayName: "Lahore Super Store",
    currentCircleId: "circle-lhr-01",
    identifiers: [{ identifierType: "CNIC", value: "35201-1112233-4" }]
  },
  ACTOR_CREATOR
);

const tpCircle2 = createTaxpayer(
  {
    id: "tp-02",
    displayName: "Lahore Textile Mills",
    currentCircleId: "circle-lhr-02",
    identifiers: [{ identifierType: "NTN", value: "8877665-1" }]
  },
  ACTOR_CREATOR
);

const tpRawalpindi = createTaxpayer(
  {
    id: "tp-03",
    displayName: "Margalla Goods Transport",
    currentCircleId: "circle-rwp-01",
    identifiers: [{ identifierType: "CNIC", value: "37405-5556677-8" }]
  },
  ACTOR_CREATOR
);

const ALL_TAXPAYERS = [tpCircle1, tpCircle2, tpRawalpindi];

describe("jurisdiction-filtered taxpayer search", () => {
  it("restricts circle-level inspector to only their assigned circle", () => {
    const inspectorCircle1: AuditActor = {
      userId: "usr-insp-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "circle-lhr-01"
    };

    const results = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      actor: inspectorCircle1,
      jurisdictions: JURISDICTIONS
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("tp-01");
    expect(results[0]?.displayName).toBe("Lahore Super Store");
  });

  it("denies circle inspector access to taxpayers in sibling or other circles", () => {
    const inspectorCircle1: AuditActor = {
      userId: "usr-insp-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "circle-lhr-01"
    };

    // Searching specifically for circle-02
    const results = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      actor: inspectorCircle1,
      currentCircleId: "circle-lhr-02",
      jurisdictions: JURISDICTIONS
    });

    expect(results).toHaveLength(0);
  });

  it("allows district-level ETO to search across all circles within district", () => {
    const etoDistrictLahore: AuditActor = {
      userId: "usr-eto-lhr",
      roleCode: "ETO",
      jurisdictionId: "dist-lhr"
    };

    const results = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      actor: etoDistrictLahore,
      jurisdictions: JURISDICTIONS
    });

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("tp-01");
    expect(ids).toContain("tp-02");
    expect(ids).not.toContain("tp-03"); // Rawalpindi is excluded
  });

  it("filters by query term on display name or identifier value", () => {
    const etoDistrictLahore: AuditActor = {
      userId: "usr-eto-lhr",
      roleCode: "ETO",
      jurisdictionId: "dist-lhr"
    };

    const textMatch = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      query: "Textile",
      actor: etoDistrictLahore,
      jurisdictions: JURISDICTIONS
    });
    expect(textMatch).toHaveLength(1);
    expect(textMatch[0]?.id).toBe("tp-02");

    const idMatch = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      query: "3520111122334",
      actor: etoDistrictLahore,
      jurisdictions: JURISDICTIONS
    });
    expect(idMatch).toHaveLength(1);
    expect(idMatch[0]?.id).toBe("tp-01");
  });

  it("projects masked identifier values and never exposes raw normalized values in results", () => {
    const etoDistrictLahore: AuditActor = {
      userId: "usr-eto-lhr",
      roleCode: "ETO",
      jurisdictionId: "dist-lhr"
    };

    const results = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      query: "Super Store",
      actor: etoDistrictLahore,
      jurisdictions: JURISDICTIONS
    });

    expect(results).toHaveLength(1);
    const res = results[0]!;
    expect(res.identifiers).toHaveLength(1);
    expect(res.identifiers[0]?.maskedValue).toBe("35201*******4");
    expect("normalizedValue" in res.identifiers[0]!).toBe(false);
  });

  it("denies access when actor does not have a jurisdictionId", () => {
    const actorWithoutJurisdiction: AuditActor = {
      userId: "usr-anon",
      roleCode: "VIEWER"
    };

    const results = filterTaxpayersByJurisdiction(ALL_TAXPAYERS, {
      actor: actorWithoutJurisdiction,
      jurisdictions: JURISDICTIONS
    });

    expect(results).toHaveLength(0);
  });
});
