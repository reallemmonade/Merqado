import { mkdirSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "../src/db/client";

if ((process.env.TURSO_DATABASE_URL ?? "file:.data/local.db").startsWith("file:")) {
  mkdirSync(".data", { recursive: true });
}
await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
