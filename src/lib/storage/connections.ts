import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { storageConnections } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { storageConfigSchema, type StorageConfig } from "./config";

/** The firm's default storage, decrypted, or null when files are kept in Merqado. */
export async function firmStorage(db: DB, firmId: string): Promise<{ id: string; label: string; config: StorageConfig } | null> {
  const row = await db.query.storageConnections.findFirst({
    where: and(eq(storageConnections.firmId, firmId), eq(storageConnections.isDefault, true)),
    orderBy: desc(storageConnections.createdAt),
  });
  if (!row) return null;
  try {
    return { id: row.id, label: row.label, config: storageConfigSchema.parse(decryptJson(row.encryptedConfig)) };
  } catch {
    return null;
  }
}

/**
 * Makes a new connection the firm's default for new files. Older connections stay, so files
 * already saved through them can still be opened.
 */
export async function setFirmStorage(db: DB, firmId: string, label: string, config: StorageConfig): Promise<string> {
  await db.update(storageConnections).set({ isDefault: false }).where(eq(storageConnections.firmId, firmId));
  const [row] = await db
    .insert(storageConnections)
    .values({ firmId, label, kind: config.kind, encryptedConfig: encryptJson(config), isDefault: true })
    .returning({ id: storageConnections.id });
  return row!.id;
}

export async function updateFirmStorage(db: DB, firmId: string, id: string, config: StorageConfig) {
  await db
    .update(storageConnections)
    .set({ encryptedConfig: encryptJson(config) })
    .where(and(eq(storageConnections.id, id), eq(storageConnections.firmId, firmId)));
}

/** New files go back to Merqado's own storage; files already in the firm's cloud stay readable. */
export async function clearFirmStorage(db: DB, firmId: string) {
  await db.update(storageConnections).set({ isDefault: false }).where(eq(storageConnections.firmId, firmId));
}
