import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { StorageConfig } from "../config";
import { joinPrefix, type StorageProvider, type StoredObject } from "../types";

type AzureConfig = Extract<StorageConfig, { kind: "azure-blob" }>;

export class AzureBlobStorage implements StorageProvider {
  readonly kind = "azure-blob";
  private readonly container: ContainerClient;

  constructor(private readonly config: AzureConfig) {
    this.container = BlobServiceClient.fromConnectionString(config.connectionString).getContainerClient(
      config.container,
    );
  }

  async put(key: string, body: Uint8Array, contentType?: string): Promise<StoredObject> {
    await this.container
      .getBlockBlobClient(joinPrefix(this.config.prefix, key))
      .uploadData(body, { blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined });
    return { key, size: body.byteLength };
  }

  async get(key: string) {
    const buf = await this.container.getBlobClient(joinPrefix(this.config.prefix, key)).downloadToBuffer();
    return new Uint8Array(buf);
  }

  async delete(key: string) {
    await this.container.getBlobClient(joinPrefix(this.config.prefix, key)).deleteIfExists();
  }

  async list(prefix = ""): Promise<StoredObject[]> {
    const base = this.config.prefix.replace(/^\/+|\/+$/g, "");
    const out: StoredObject[] = [];
    for await (const b of this.container.listBlobsFlat({ prefix: base ? `${base}/${prefix}` : prefix })) {
      out.push({ key: base ? b.name.slice(base.length + 1) : b.name, size: b.properties.contentLength ?? 0 });
    }
    return out;
  }
}
