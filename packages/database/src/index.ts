import postgres from "postgres";

export function createDatabaseClient(databaseUrl: string) {
  if (!databaseUrl.startsWith("postgresql://")) {
    throw new Error("A PostgreSQL connection URL is required");
  }
  return postgres(databaseUrl, { max: 10, idle_timeout: 20 });
}
