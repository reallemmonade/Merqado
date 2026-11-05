import { z } from "zod";

/** Where a firm keeps its documents. Files stay in the client's cloud; Merqado stores pointers. */
export const storageConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("s3"),
    bucket: z.string().min(1),
    region: z.string().min(1),
    prefix: z.string().default(""),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    /** For S3-compatible stores (MinIO, Cloudflare R2, Wasabi). */
    endpoint: z.url().optional(),
  }),
  z.object({
    kind: z.literal("azure-blob"),
    connectionString: z.string().min(1),
    container: z.string().min(1),
    prefix: z.string().default(""),
  }),
  z.object({
    kind: z.literal("gcs"),
    bucket: z.string().min(1),
    projectId: z.string().optional(),
    /** Service account JSON; omit to use the runtime's default credentials. */
    credentialsJson: z.string().optional(),
    prefix: z.string().default(""),
  }),
  z.object({
    kind: z.literal("local"),
    root: z.string().default(".data/uploads"),
  }),
]);

export type StorageConfig = z.infer<typeof storageConfigSchema>;
