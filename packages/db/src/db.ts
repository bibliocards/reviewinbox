import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

const DEFAULT_DATABASE_URL = "postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox";

export function getDatabaseUrl(
  env: Partial<Record<"DATABASE_URL" | "NODE_ENV", string>> = process.env,
): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be configured in production.");
  }

  return DEFAULT_DATABASE_URL;
}

export function createDatabase(databaseUrl = getDatabaseUrl()) {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

export { schema };
