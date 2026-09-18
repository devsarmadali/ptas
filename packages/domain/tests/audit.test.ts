import { describe, expect, it } from "vitest";
import {
  CommandContext,
  validateCommandContext,
  redactSensitiveData,
  createAuditEvent,
  maskCnic
} from "../src/audit.js";

describe("audit command context validation", () => {
  it("accepts a fully specified command context", () => {
    const validContext: CommandContext<{ taxpayerId: string }> = {
      commandId: "cmd-123",
      auditContext: {
        correlationId: "corr-abc",
        actor: {
          userId: "usr-inspector-1",
          roleCode: "INSPECTOR",
          jurisdictionId: "circ-a"
        }
      },
      input: { taxpayerId: "tax-1" }
    };

    expect(() => validateCommandContext(validContext)).not.toThrow();
  });

  it("rejects context missing correlationId", () => {
    const invalidContext = {
      commandId: "cmd-123",
      auditContext: {
        correlationId: "",
        actor: { userId: "usr-1", roleCode: "INSPECTOR" }
      },
      input: {}
    } as unknown as CommandContext;

    expect(() => validateCommandContext(invalidContext)).toThrow("correlationId is required");
  });

  it("rejects context missing actor or roleCode", () => {
    const missingRoleContext = {
      commandId: "cmd-123",
      auditContext: {
        correlationId: "corr-1",
        actor: { userId: "usr-1", roleCode: "" }
      },
      input: {}
    } as unknown as CommandContext;

    expect(() => validateCommandContext(missingRoleContext)).toThrow("actor.roleCode is required");
  });
});

describe("sensitive data redaction", () => {
  it("masks 13-digit CNIC numbers in both raw and hyphenated formats", () => {
    const raw = "Taxpayer CNIC is 3520112345671 for record";
    expect(maskCnic(raw)).toBe("Taxpayer CNIC is 35201*******1 for record");

    const hyphenated = "CNIC: 35201-1234567-1";
    expect(maskCnic(hyphenated)).toBe("CNIC: 35201-*******-1");
  });

  it("redacts credentials, passwords, tokens, and api keys by key name", () => {
    const payload = {
      action: "LOGIN",
      username: "officer_1",
      password: "user-super-secret-pw-123",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      apiKey: "ptas_live_abc123",
      pin: "9988"
    };

    const redacted = redactSensitiveData(payload) as Record<string, unknown>;
    expect(redacted.action).toBe("LOGIN");
    expect(redacted.username).toBe("officer_1");
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.pin).toBe("[REDACTED]");
  });

  it("redacts private keys and certificates", () => {
    const pemHeader = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
    const pemFooter = ["-----END", "RSA", "PRIVATE", "KEY-----"].join(" ");
    const payload = {
      keyMaterial: `${pemHeader}\nMIIEowIBAAKCAQEA...\n${pemFooter}`
    };

    const redacted = redactSensitiveData(payload) as Record<string, unknown>;
    expect(redacted.keyMaterial).toBe("[REDACTED PRIVATE KEY]");
  });

  it("recursively sanitizes deeply nested payloads and arrays", () => {
    const nestedPayload = {
      assessment: {
        id: "asmt-1",
        taxpayer: {
          name: "Muhammad Ali",
          cnic: "3520112345671",
          banking: [{ iban: "PK36SCBL0000001123456701", secret: "bank_secret_val" }]
        }
      }
    };

    const sanitized = redactSensitiveData(nestedPayload) as typeof nestedPayload;
    expect(sanitized.assessment.id).toBe("asmt-1");
    expect(sanitized.assessment.taxpayer.name).toBe("Muhammad Ali");
    expect(sanitized.assessment.taxpayer.cnic).toBe("35201*******1");
    expect(sanitized.assessment.taxpayer.banking[0]?.secret).toBe("[REDACTED]");
  });
});

describe("audit event factory", () => {
  it("creates an immutable audit event with sanitized payload", () => {
    const event = createAuditEvent({
      eventType: "ASSESSMENT_SUBMITTED",
      aggregateType: "ASSESSMENT",
      aggregateId: "asmt-100",
      actor: {
        userId: "usr-inspector",
        roleCode: "INSPECTOR",
        jurisdictionId: "circ-a"
      },
      correlationId: "corr-submit-99",
      occurredAt: new Date("2026-07-01T10:00:00.000Z"),
      payload: {
        amount: 2500,
        taxpayerCnic: "3520112345671",
        securityToken: "super-secret-auth-token"
      }
    });

    expect(event.eventType).toBe("ASSESSMENT_SUBMITTED");
    expect(event.actorId).toBe("usr-inspector");
    expect(event.actorRole).toBe("INSPECTOR");
    expect(event.jurisdictionId).toBe("circ-a");
    expect(event.correlationId).toBe("corr-submit-99");
    expect(event.occurredAt).toBe("2026-07-01T10:00:00.000Z");
    expect(event.payload.amount).toBe(2500);
    expect(event.payload.taxpayerCnic).toBe("35201*******1");
    expect(event.payload.securityToken).toBe("[REDACTED]");
    expect(Object.isFrozen(event)).toBe(true);
  });
});
