import { describe, expect, it } from "vitest";
import { createAuditEvent } from "@ptas/domain";
import { InMemoryAuditRepository } from "../src/audit-repository.js";

describe("InMemoryAuditRepository", () => {
  it("appends and queries audit events by correlationId", async () => {
    const repo = new InMemoryAuditRepository();
    const event = createAuditEvent({
      eventType: "USER_LOGGED_IN",
      actor: {
        userId: "usr-1",
        roleCode: "INSPECTOR",
        jurisdictionId: "circ-a"
      },
      correlationId: "corr-login-1",
      occurredAt: new Date("2026-07-01T08:00:00.000Z"),
      payload: { clientIp: "127.0.0.1" }
    });

    await repo.append(event);

    const queried = await repo.queryByCorrelationId("corr-login-1");
    expect(queried).toHaveLength(1);
    expect(queried[0]?.eventType).toBe("USER_LOGGED_IN");
    expect(queried[0]?.actorId).toBe("usr-1");
  });

  it("enforces append-only integrity: rejects duplicate event IDs", async () => {
    const repo = new InMemoryAuditRepository();
    const event = createAuditEvent({
      id: "fixed-audit-id-1",
      eventType: "ASSESSMENT_APPROVED",
      actor: {
        userId: "usr-eto",
        roleCode: "ETO"
      },
      correlationId: "corr-appr-1",
      occurredAt: new Date("2026-07-01T09:00:00.000Z"),
      payload: { decision: "APPROVED" }
    });

    await repo.append(event);
    await expect(repo.append(event)).rejects.toThrow(
      "Audit event with id fixed-audit-id-1 already exists"
    );
  });

  it("queries events by aggregateType and aggregateId", async () => {
    const repo = new InMemoryAuditRepository();
    const event1 = createAuditEvent({
      eventType: "ASSESSMENT_DRAFTED",
      aggregateType: "ASSESSMENT",
      aggregateId: "asmt-999",
      actor: { userId: "usr-1", roleCode: "INSPECTOR" },
      correlationId: "corr-asmt-1",
      occurredAt: new Date("2026-07-01T10:00:00.000Z"),
      payload: { status: "DRAFT" }
    });

    const event2 = createAuditEvent({
      eventType: "ASSESSMENT_SUBMITTED",
      aggregateType: "ASSESSMENT",
      aggregateId: "asmt-999",
      actor: { userId: "usr-1", roleCode: "INSPECTOR" },
      correlationId: "corr-asmt-2",
      occurredAt: new Date("2026-07-01T10:30:00.000Z"),
      payload: { status: "SUBMITTED" }
    });

    const event3 = createAuditEvent({
      eventType: "TAXPAYER_REGISTERED",
      aggregateType: "TAXPAYER",
      aggregateId: "tax-555",
      actor: { userId: "usr-1", roleCode: "INSPECTOR" },
      correlationId: "corr-tax-1",
      occurredAt: new Date("2026-07-01T11:00:00.000Z"),
      payload: { status: "ACTIVE" }
    });

    await repo.appendBatch([event1, event2, event3]);

    const asmtEvents = await repo.queryByAggregate("ASSESSMENT", "asmt-999");
    expect(asmtEvents).toHaveLength(2);
    expect(asmtEvents[0]?.eventType).toBe("ASSESSMENT_DRAFTED");
    expect(asmtEvents[1]?.eventType).toBe("ASSESSMENT_SUBMITTED");

    const taxEvents = await repo.queryByAggregate("TAXPAYER", "tax-555");
    expect(taxEvents).toHaveLength(1);
    expect(taxEvents[0]?.eventType).toBe("TAXPAYER_REGISTERED");
  });

  it("preserves immutability of stored audit events", async () => {
    const repo = new InMemoryAuditRepository();
    const event = createAuditEvent({
      eventType: "CONFIG_UPDATED",
      actor: { userId: "usr-admin", roleCode: "ADMIN" },
      correlationId: "corr-cfg-1",
      occurredAt: new Date("2026-07-01T12:00:00.000Z"),
      payload: { version: 1 }
    });

    await repo.append(event);
    const queried = await repo.queryByCorrelationId("corr-cfg-1");
    expect(Object.isFrozen(queried[0])).toBe(true);
  });
});
