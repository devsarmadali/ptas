import { describe, expect, it } from "vitest";
import type { AuditContext, DocumentRecord } from "@ptas/domain";
import { InMemoryAuditRepository, InMemoryDocumentRepository } from "../src/index.js";

describe("InMemoryDocumentRepository", () => {
  const actorId = "11111111-1111-4111-8111-111111111111";
  const auditContext: AuditContext = {
    actor: {
      userId: actorId,
      roleCode: "ETO",
      jurisdictionId: "22222222-2222-4222-8222-222222222222"
    },
    correlationId: "corr-doc-test-01"
  };

  const sampleDoc: DocumentRecord = {
    id: "33333333-3333-4333-8333-333333333333",
    aggregateType: "ASSESSMENT",
    aggregateId: "44444444-4444-4444-8444-444444444444",
    templateConfigId: "55555555-5555-4555-8555-555555555555",
    objectKey: "documents/assessment/4444/doc-1-abc12345.txt",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    generatedAt: "2026-07-01T10:00:00.000Z",
    generatedBy: actorId,
    snapshot: { taxpayerName: "Test Taxpayer", amount: 5000 },
    isProvisional: false,
    renderedContent: "DOCUMENT CONTENT"
  };

  it("saves and retrieves a document by id and by objectKey", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryDocumentRepository(auditRepo);

    const saved = await repo.saveDocument(sampleDoc, auditContext);
    expect(saved.id).toBe(sampleDoc.id);

    const byId = await repo.findById(sampleDoc.id);
    expect(byId?.id).toBe(sampleDoc.id);
    expect(byId?.sha256).toBe(sampleDoc.sha256);
    expect(byId?.objectKey).toBe(sampleDoc.objectKey);

    const byKey = await repo.findByObjectKey(sampleDoc.objectKey);
    expect(byKey?.id).toBe(sampleDoc.id);

    // Audit event check
    const auditEvents = await auditRepo.queryByCorrelationId(auditContext.correlationId);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.eventType).toBe("DOCUMENT_GENERATED");
    expect(auditEvents[0]?.payload.documentId).toBe(sampleDoc.id);
  });

  it("rejects invalid sha256 hashes", async () => {
    const repo = new InMemoryDocumentRepository();
    const invalidDoc: DocumentRecord = {
      ...sampleDoc,
      id: crypto.randomUUID(),
      objectKey: "documents/assessment/invalid-hash.txt",
      sha256: "too-short"
    };

    await expect(repo.saveDocument(invalidDoc, auditContext)).rejects.toThrow(/64-character hash/);
  });

  it("rejects duplicate objectKey", async () => {
    const repo = new InMemoryDocumentRepository();
    await repo.saveDocument(sampleDoc, auditContext);

    const duplicateDoc: DocumentRecord = {
      ...sampleDoc,
      id: crypto.randomUUID()
    };

    await expect(repo.saveDocument(duplicateDoc, auditContext)).rejects.toThrow(
      /objectKey .* already exists/
    );
  });

  it("lists documents by aggregate", async () => {
    const repo = new InMemoryDocumentRepository();
    await repo.saveDocument(sampleDoc, auditContext);

    const doc2: DocumentRecord = {
      ...sampleDoc,
      id: crypto.randomUUID(),
      objectKey: "documents/assessment/4444/doc-2-def67890.txt",
      sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
    };
    await repo.saveDocument(doc2, auditContext);

    const docs = await repo.listByAggregate(sampleDoc.aggregateType, sampleDoc.aggregateId);
    expect(docs).toHaveLength(2);

    const otherDocs = await repo.listByAggregate("ASSESSMENT", crypto.randomUUID());
    expect(otherDocs).toHaveLength(0);
  });

  it("returns null for unknown id or objectKey", async () => {
    const repo = new InMemoryDocumentRepository();
    expect(await repo.findById(crypto.randomUUID())).toBeNull();
    expect(await repo.findByObjectKey("unknown/key.txt")).toBeNull();
  });
});
