import { access, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const required = [
  "AGENTS.md",
  "README.md",
  "docs/handoff/readiness-and-authority.md",
  "docs/handoff/clarifications-required.md",
  "docs/backlog/backlog.yaml",
  "docs/api/openapi.yaml",
  "docs/legal/legal-traceability.md",
  "docs/legal/unresolved-items.md",
  "packages/database/migrations/0001_foundation.sql"
];

for (const filePath of required) {
  await access(filePath);
  const details = await stat(filePath);
  if (details.size === 0) {
    throw new Error(`Required file is empty: ${filePath}`);
  }
}

const agents = await readFile("AGENTS.md", "utf8");
for (const reference of [
  "docs/handoff/readiness-and-authority.md",
  "docs/product/scope.md",
  "docs/product/business-rules.md",
  "docs/legal/legal-traceability.md",
  "docs/architecture/solution-architecture.md",
  "docs/security/security-baseline.md",
  "docs/testing/quality-gates.md"
]) {
  if (!agents.includes(reference)) {
    throw new Error(`AGENTS.md does not reference required guidance: ${reference}`);
  }
}

const backlog = await readFile("docs/backlog/backlog.yaml", "utf8");
if (!backlog.includes("id: PTAS-000") || !backlog.includes("authority: RED")) {
  throw new Error("Backlog must include the first bootstrap story and RED approval gates");
}

const textExtensions = new Set([
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".json",
  ".yaml",
  ".yml",
  ".sql",
  ".feature"
]);
const forbiddenPatterns = [
  /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/,
  /production-password/i,
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@(?:prod|production)/i
];

async function walk(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "coverage"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(full)));
    else results.push(full);
  }
  return results;
}

for (const filePath of await walk(".")) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (normalizedPath.endsWith("scripts/validate-repo.mjs")) continue;
  if (!textExtensions.has(path.extname(filePath))) continue;
  const content = await readFile(filePath, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Potential secret or forbidden production credential in ${filePath}`);
    }
  }
}

const sourceHashPath = "docs/reference/source-sha256.txt";
await access(sourceHashPath);
for (const rawLine of (await readFile(sourceHashPath, "utf8")).trim().split("\n")) {
  const line = rawLine.trim();
  if (!line) continue;
  const [expected, ...nameParts] = line.split(/\s+/);
  const fileName = nameParts.join(" ").trim();
  const bytes = await readFile(path.join("docs/reference", fileName));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`Source hash mismatch: ${fileName}`);
}

console.log(
  `Repository validation passed (${required.length} required files and source hashes verified).`
);
