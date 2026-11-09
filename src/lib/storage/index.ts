import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { storageConnections } from "@/db/schema";
import { decryptJson } from "@/lib/crypto";
import { storageConfigSchema, type StorageConfig } from "./config";
import { AzureBlobStorage } from "./providers/azure-blob";
import { GcsStorage } from "./providers/gcs";
import { GDriveStorage } from "./providers/gdrive";
import { LocalStorage } from "./providers/local";
import { S3Storage } from "./providers/s3";
import type { StorageProvider } from "./types";

export * from "./types";
export { storageConfigSchema, type StorageConfig } from "./config";

export function createStorage(config: StorageConfig): StorageProvider {
  switch (config.kind) {
    case "s3":
      return new S3Storage(config);
    case "azure-blob":
      return new AzureBlobStorage(config);
    case "gcs":
      return new GcsStorage(config);
    case "gdrive":
      return new GDriveStorage(config);
    case "local":
      return new LocalStorage(config.root);
  }
}

/** The engagement's storage override, else the firm default, else local disk (dev only). */
export async function resolveStorage(
  db: DB,
  firmId: string,
  connectionId?: string | null,
): Promise<{ storage: StorageProvider; connectionId: string | null }> {
  const row = connectionId
    ? await db.query.storageConnections.findFirst({
        where: and(eq(storageConnections.id, connectionId), eq(storageConnections.firmId, firmId)),
      })
    : await db.query.storageConnections.findFirst({
        where: and(eq(storageConnections.firmId, firmId), eq(storageConnections.isDefault, true)),
      });
  if (row) {
    const config = storageConfigSchema.parse(decryptJson(row.encryptedConfig));
    return { storage: createStorage(config), connectionId: row.id };
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("No storage connected for this firm.");
  }
  return { storage: new LocalStorage(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads"), connectionId: null };
}
