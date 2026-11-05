export interface StoredObject {
  key: string;
  size: number;
}

export interface StorageProvider {
  readonly kind: string;
  put(key: string, body: Uint8Array, contentType?: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<StoredObject[]>;
}

/** Rejects keys that could escape a prefix or root. */
export function safeKey(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").some((p) => p === ".." || p === ".")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return clean;
}

export function joinPrefix(prefix: string, key: string): string {
  const p = prefix.replace(/^\/+|\/+$/g, "");
  return p ? `${p}/${safeKey(key)}` : safeKey(key);
}
