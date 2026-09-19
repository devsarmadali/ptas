import { describe, expect, it } from "vitest";
import { InMemoryTaxpayerRepository, InMemoryAuditRepository } from "../src/index.js";
import { createTaxpayer } from "@ptas/domain";
import type { AuditActor, AuditContext, Jurisdiction } from "@ptas/domain";

const TEST_ACTOR: AuditActor = {
  userId: "usr-insp-10",
  roleCode: "INSPECTOR",
  jurisdictionId: "circle-01"
};

const TEST_AUDIT_CTX: AuditContext = {
  correlationId: "corr-tp-123",
  actor: TEST_ACTOR
};

const MOCK_JURISDICTIONS: Jurisdiction[] = [
  {
    id: "dist-01",
    type: "DISTRICT",
    code: "DIST-01",
    name: "District 1",
    parentId: null,
    activeFrom: "2020-01-01"
  },
  {
    id: "off-01",
    type: "OFFICE",
    code: "OFF-01",
    name: "Office 1",
    parentId: "dist-01",
    activeFrom: "2020-01-01"
  },
  {
    id: "circle-01",
    type: "CIRCLE",
    code: "CIRC-01",
    name: "Circle 1",
    parentId: "off-01",
    activeFrom: "2020-01-01"
  },
  {
    id: "circle-02",
    type: "CIRCLE",
    code: "CIRC-02",
    name: "Circle 2",
    parentId: "off-01",
    activeFrom: "2020-01-01"
  }
];

describe("InMemoryTaxpayerRepository", () => {
  it("creates taxpayer, stores record, and emits an immutable audit event", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryTaxpayerRepository(auditRepo);

    const taxpayer = createTaxpayer(
      {
        displayName: "Ravi Enterprises",
        currentCircleId: "circle-01",
        identifiers: [
          {
            identifierType: "CNIC",
            value: "35201-1234567-9"
          }
        ]
      },
      TEST_ACTOR,
      new Date("2026-07-01T12:00:00.000Z")
    );

    const created = await repo.create(taxpayer, TEST_AUDIT_CTX);
    expect(created.id).toBe(taxpayer.id);

    const found = await repo.findById(taxpayer.id);
    expect(found).not.toBeNull();
    expect(found?.displayName).toBe("Ravi Enterprises");
    expect(found?.identifiers[0]?.maskedValue).toBe("35201*******9");

    // Verify audit event emission
    const auditEvents = await auditRepo.queryByCorrelationId("corr-tp-123");
    expect(auditEvents).toHaveLength(1);
    const event = auditEvents[0]!;
    expect(event.eventType).toBe("TAXPAYER_CREATED");
    expect(event.aggregateType).toBe("TAXPAYER");
    expect(event.aggregateId).toBe(taxpayer.id);
    expect(event.actorId).toBe("usr-insp-10");
    expect(event.payload.displayName).toBe("Ravi Enterprises");
  });

  it("rejects duplicate taxpayer ID on creation", async () => {
    const repo = new InMemoryTaxpayerRepository();
    const taxpayer = createTaxpayer(
      {
        id: "duplicate-id-1",
        displayName: "Unique Trading",
        currentCircleId: "circle-01"
      },
      TEST_ACTOR
    );

    await repo.create(taxpayer, TEST_AUDIT_CTX);
    await expect(repo.create(taxpayer, TEST_AUDIT_CTX)).rejects.toThrow("already exists");
  });

  it("surfaces duplicate candidates across stored taxpayers", async () => {
    const repo = new InMemoryTaxpayerRepository();
    const tp1 = createTaxpayer(
      {
        displayName: "Chenab Flour Mills",
        currentCircleId: "circle-01",
        identifiers: [
          {
            identifierType: "CNIC",
            value: "35201-9988776-5"
          }
        ]
      },
      TEST_ACTOR
    );
    await repo.create(tp1, TEST_AUDIT_CTX);

    // Query candidate with same CNIC
    const candidate = {
      displayName: "Chenab Mills New",
      currentCircleId: "circle-02",
      identifiers: [
        {
          identifierType: "CNIC" as const,
          value: "3520199887765"
        }
      ]
    };

    const candidates = await repo.findDuplicateCandidates(candidate);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.existingTaxpayerId).toBe(tp1.id);
    expect(candidates[0]?.confidence).toBe("EXACT");
  });

  it("performs jurisdiction-filtered search returning masked projections", async () => {
    const repo = new InMemoryTaxpayerRepository();
    const tp1 = createTaxpayer(
      {
        displayName: "Chenab Flour Mills",
        currentCircleId: "circle-01",
        identifiers: [{ identifierType: "CNIC", value: "35201-9988776-5" }]
      },
      TEST_ACTOR
    );
    const tp2 = createTaxpayer(
      {
        displayName: "Jhelum Cotton Ginners",
        currentCircleId: "circle-02",
        identifiers: [{ identifierType: "NTN", value: "1122334-5" }]
      },
      TEST_ACTOR
    );
    await repo.create(tp1, TEST_AUDIT_CTX);
    await repo.create(tp2, TEST_AUDIT_CTX);

    // Inspector in circle-01 only sees circle-01
    const inspectorResults = await repo.search({
      actor: TEST_ACTOR, // jurisdictionId is circle-01
      jurisdictions: MOCK_JURISDICTIONS
    });
    expect(inspectorResults).toHaveLength(1);
    expect(inspectorResults[0]?.displayName).toBe("Chenab Flour Mills");
    expect(inspectorResults[0]?.identifiers[0]?.maskedValue).toBe("35201*******5");

    // ETO in dist-01 sees both circle-01 and circle-02
    const etoResults = await repo.search({
      actor: {
        userId: "usr-eto-1",
        roleCode: "ETO",
        jurisdictionId: "dist-01"
      },
      jurisdictions: MOCK_JURISDICTIONS
    });
    expect(etoResults).toHaveLength(2);
  });
});
