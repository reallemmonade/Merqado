import { Storage, type Bucket } from "@google-cloud/storage";
import type { StorageConfig } from "../config";
import { joinPrefix, type StorageProvider, type StoredObject } from "../types";

type GcsConfig = Extract<StorageConfig, { kind: "gcs" }>;

export class GcsStorage implements StorageProvider {
  readonly kind = "gcs";
  private readonly bucket: Bucket;

  constructor(private readonly config: GcsConfig) {
    const storage = new Storage({
      projectId: config.projectId,
      credentials: config.credentialsJson ? JSON.parse(config.credentialsJson) : undefined,
    });
    this.bucket = storage.bucket(config.bucket);
  }

  async put(key: string, body: Uint8Array, contentType?: string): Promise<StoredObject> {
    await this.bucket.file(joinPrefix(this.config.prefix, key)).save(Buffer.from(body), { contentType });
    return { key, size: body.byteLength };
  }

  async get(key: string) {
    const [buf] = await this.bucket.file(joinPrefix(this.config.prefix, key)).download();
    return new Uint8Array(buf);
  }

  async delete(key: string) {
    await this.bucket.file(joinPrefix(this.config.prefix, key)).delete({ ignoreNotFound: true });
  }

  async list(prefix = ""): Promise<StoredObject[]> {
    const base = this.config.prefix.replace(/^\/+|\/+$/g, "");
    const [files] = await this.bucket.getFiles({ prefix: base ? `${base}/${prefix}` : prefix });
    return files.map((f) => ({
      key: base ? f.name.slice(base.length + 1) : f.name,
      size: Number(f.metadata.size ?? 0),
    }));
  }
}
