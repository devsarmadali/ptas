import { createHash } from "node:crypto";
import type { LegalConfigurationVersion } from "./legal-configuration.js";

export interface FormTemplatePayload {
  readonly title: string;
  readonly templateBody: string;
  readonly formCode?: string | undefined;
  readonly versionLabel?: string | undefined;
  readonly fields?: readonly string[] | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface DocumentRecord {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly templateConfigId: string;
  readonly objectKey: string;
  readonly sha256: string; // 64-character lowercase hex SHA-256 digest
  readonly generatedAt: string; // ISO 8601
  readonly generatedBy: string;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly isProvisional: boolean;
  readonly renderedContent: string;
}

export interface RenderDocumentParams {
  readonly id?: string | undefined;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly template: LegalConfigurationVersion<FormTemplatePayload | Record<string, unknown>>;
  readonly snapshot: Record<string, unknown>;
  readonly generatedBy: string;
  readonly objectKeyPrefix?: string | undefined;
  readonly isProvisional?: boolean | undefined;
  readonly generatedAt?: Date | string | undefined;
}

export const PROVISIONAL_DISCLAIMER =
  "*** PROVISIONAL - NOT A LEGALLY OPERATIVE NOTICE OR ASSESSMENT ***\n" +
  "[DRAFT / PROVISIONAL NOTICE: This document is generated for preview or administrative review only and carries no statutory force under the Punjab Professions and Trades Tax Rules, 1977.]";

export function computeContentSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").toLowerCase();
}

export function verifyDocumentIntegrity(content: string, expectedSha256: string): boolean {
  if (!expectedSha256 || expectedSha256.length !== 64) {
    return false;
  }
  const computed = computeContentSha256(content);
  return computed.toLowerCase() === expectedSha256.toLowerCase();
}

function interpolatePlaceholders(templateBody: string, snapshot: Record<string, unknown>): string {
  return templateBody.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const val = snapshot[key];
    if (val === undefined || val === null) {
      return "";
    }
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  });
}

export function renderDocument(params: RenderDocumentParams): DocumentRecord {
  const aggregateType = params.aggregateType.trim();
  if (!aggregateType) {
    throw new Error("aggregateType is required");
  }

  const aggregateId = params.aggregateId.trim();
  if (!aggregateId) {
    throw new Error("aggregateId is required");
  }

  if (!params.template) {
    throw new Error("template is required");
  }

  if (params.template.configType !== "FORM") {
    throw new Error(`Template configType must be 'FORM', got '${params.template.configType}'`);
  }

  if (!params.snapshot || typeof params.snapshot !== "object") {
    throw new Error("snapshot must be a non-null object");
  }

  const generatedBy = params.generatedBy.trim();
  if (!generatedBy) {
    throw new Error("generatedBy is required");
  }

  // Non-negotiable domain rule: Provisional templates and unapproved drafts must be visibly marked non-operative
  const isProvisional =
    params.isProvisional === true ||
    params.template.status === "DRAFT" ||
    !params.template.approvalEvidenceId;

  const templatePayload = params.template.payload as FormTemplatePayload | Record<string, unknown>;

  const title =
    typeof templatePayload["title"] === "string" && templatePayload["title"].trim()
      ? (templatePayload["title"] as string).trim()
      : `Statutory Form ${params.template.code}`;

  const rawBody =
    typeof templatePayload["templateBody"] === "string"
      ? (templatePayload["templateBody"] as string)
      : Object.entries(params.snapshot)
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join("\n");

  const populatedBody = interpolatePlaceholders(rawBody, params.snapshot);

  const lines: string[] = [];

  if (isProvisional) {
    lines.push(PROVISIONAL_DISCLAIMER);
    lines.push("--------------------------------------------------");
  }

  lines.push(`DOCUMENT: ${title}`);
  lines.push(`FORM CODE: ${params.template.code} (v${params.template.versionNo})`);
  lines.push(`TEMPLATE CONFIG ID: ${params.template.id}`);
  lines.push(`EFFECTIVE FROM: ${params.template.effectiveFrom}`);
  if (params.template.effectiveTo) {
    lines.push(`EFFECTIVE TO: ${params.template.effectiveTo}`);
  }
  lines.push(`AGGREGATE: ${aggregateType} [${aggregateId}]`);
  lines.push("==================================================");
  lines.push(populatedBody);
  lines.push("==================================================");
  lines.push("SNAPSHOT REPRODUCTION HASH CONTEXT:");
  lines.push(JSON.stringify(params.snapshot, Object.keys(params.snapshot).sort()));

  const renderedContent = lines.join("\n");
  const sha256 = computeContentSha256(renderedContent);

  const id = params.id ?? crypto.randomUUID();
  const prefix =
    params.objectKeyPrefix ?? `documents/${aggregateType.toLowerCase()}/${aggregateId}`;
  const objectKey = `${prefix}/${id}-${sha256.slice(0, 12)}.txt`;

  const generatedAt = params.generatedAt
    ? typeof params.generatedAt === "string"
      ? params.generatedAt
      : params.generatedAt.toISOString()
    : new Date().toISOString();

  return Object.freeze({
    id,
    aggregateType,
    aggregateId,
    templateConfigId: params.template.id,
    objectKey,
    sha256,
    generatedAt,
    generatedBy,
    snapshot: Object.freeze({ ...params.snapshot }),
    isProvisional,
    renderedContent
  });
}
