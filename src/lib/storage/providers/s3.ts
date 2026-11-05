import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageConfig } from "../config";
import { joinPrefix, type StorageProvider, type StoredObject } from "../types";

type S3Config = Extract<StorageConfig, { kind: "s3" }>;

export class S3Storage implements StorageProvider {
  readonly kind = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  async put(key: string, body: Uint8Array, contentType?: string): Promise<StoredObject> {
    const Key = joinPrefix(this.config.prefix, key);
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key, Body: body, ContentType: contentType }));
    return { key, size: body.byteLength };
  }

  async get(key: string) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: joinPrefix(this.config.prefix, key) }),
    );
    if (!res.Body) throw new Error(`Empty object: ${key}`);
    return res.Body.transformToByteArray();
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: joinPrefix(this.config.prefix, key) }));
  }

  async list(prefix = ""): Promise<StoredObject[]> {
    const base = this.config.prefix.replace(/^\/+|\/+$/g, "");
    const out: StoredObject[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: base ? `${base}/${prefix}` : prefix,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) {
        if (o.Key) out.push({ key: base ? o.Key.slice(base.length + 1) : o.Key, size: o.Size ?? 0 });
      }
      token = res.NextContinuationToken;
    } while (token);
    return out;
  }
}
