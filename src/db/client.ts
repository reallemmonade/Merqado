import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

let client: Client | undefined;
let db: DB | undefined;

/** Turso in production (libsql://...), a local SQLite file in dev (file:...). */
export function getDb(): DB {
  if (!db) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:.data/local.db",
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
    db = drizzle(client, { schema });
  }
  return db;
}

export { schema };
