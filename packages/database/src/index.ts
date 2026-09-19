import postgres from "postgres";

export * from "./audit-repository.js";
export * from "./taxpayer-repository.js";
export * from "./legal-configuration-repository.js";

export function createDatabaseClient(databaseUrl: string) {
  if (!databaseUrl.startsWith("postgresql://")) {
    throw new Error("A PostgreSQL connection URL is required");
  }
  return postgres(databaseUrl, { max: 10, idle_timeout: 20 });
}
