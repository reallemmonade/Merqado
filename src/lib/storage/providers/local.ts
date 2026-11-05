import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeKey, type StorageProvider, type StoredObject } from "../types";

/** Dev-only storage on the local disk. */
export class LocalStorage implements StorageProvider {
  readonly kind = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    return path.join(this.root, safeKey(key));
  }

  async put(key: string, body: Uint8Array): Promise<StoredObject> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { key: safeKey(key), size: body.byteLength };
  }

  async get(key: string) {
    return new Uint8Array(await readFile(this.resolve(key)));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async list(prefix = ""): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const key = path.relative(this.root, full).split(path.sep).join("/");
          if (key.startsWith(prefix)) out.push({ key, size: (await stat(full)).size });
        }
      }
    };
    await walk(this.root);
    return out;
  }
}
