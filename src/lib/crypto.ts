import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/**
 * MERQADO_SECRET_KEY is ideally 32 random bytes in base64. Any other random string of at
 * least 32 characters (for example one from Render's "Generate" button) is accepted and
 * stretched to 32 bytes with SHA-256, so the exact format doesn't trip people up.
 */
function key(): Buffer {
  const raw = process.env.MERQADO_SECRET_KEY?.trim();
  if (!raw) throw new Error("MERQADO_SECRET_KEY is not set");
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) return Buffer.from(raw, "base64");
  if (raw.length < 32) throw new Error("MERQADO_SECRET_KEY must be at least 32 random characters");
  return createHash("sha256").update(raw, "utf8").digest();
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, each part base64url. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptJson<T = unknown>(payload: string): T {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognized secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
