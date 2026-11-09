import type { StorageProvider, StoredObject } from "../types";

const API = "https://www.googleapis.com/drive/v3";
export const DRIVE_STATE_COOKIE = "merqado_drive_state";
export const DRIVE_CALLBACK = "/api/storage/google/callback";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
/** Works for My Drive and shared drives alike. */
const ALL = "supportsAllDrives=true";

export interface GDriveConfig {
  refreshToken: string;
  /** The Drive folder that holds one folder per case. */
  rootFolderId: string;
}

/** Google's OAuth app for Drive is Merqado's own "Continue with Google" app. */
export function googleOAuthClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google sign-in is not set up.");
  return { clientId, clientSecret };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = googleOAuthClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google Drive sign-in expired (${data.error ?? res.status}). Reconnect it in Settings.`);
  return data.access_token;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * Files live in the firm's Google Drive as real folders: <root>/<case>/<folder>/<file>.
 * Keys passed to put() and move() are those paths; the key put() returns is the Drive file id.
 */
export class GDriveStorage implements StorageProvider {
  readonly kind = "gdrive";
  readonly pathKeys = true;
  private token: { value: string; until: number } | null = null;
  private folders = new Map<string, string>();

  constructor(private readonly config: GDriveConfig) {}

  private async auth(): Promise<Record<string, string>> {
    if (!this.token || this.token.until < Date.now()) {
      this.token = { value: await refreshAccessToken(this.config.refreshToken), until: Date.now() + 50 * 60 * 1000 };
    }
    return { authorization: `Bearer ${this.token.value}` };
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, { ...init, headers: { ...(await this.auth()), ...(init.headers as Record<string, string>) } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Drive ${res.status}: ${body.slice(0, 200)}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private static inFlight = new Map<string, Promise<string>>();

  private async findOrCreateFolder(parent: string, name: string): Promise<string> {
    const found = await this.call<{ files: { id: string }[] }>(
      `${API}/files?${ALL}&includeItemsFromAllDrives=true&fields=files(id)&q=${encodeURIComponent(`'${q(parent)}' in parents and name = '${q(name)}' and mimeType = '${FOLDER}' and trashed = false`)}`,
    );
    if (found.files[0]) return found.files[0].id;
    const made = await this.call<{ id: string }>(`${API}/files?${ALL}&fields=id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
    });
    return made.id;
  }

  /** The id of a folder path under the root, created as needed. */
  async folderId(parts: string[]): Promise<string> {
    let parent = this.config.rootFolderId;
    let path = "";
    for (const name of parts.filter(Boolean)) {
      path += "/" + name;
      const cached = this.folders.get(path);
      if (cached) {
        parent = cached;
        continue;
      }
      // Uploads run in parallel; they share one lookup-or-create per folder, or Drive ends up
      // with several "To file" folders side by side.
      const key = `${parent}\u0000${name}`;
      let work = GDriveStorage.inFlight.get(key);
      if (!work) {
        work = this.findOrCreateFolder(parent, name).finally(() => GDriveStorage.inFlight.delete(key));
        GDriveStorage.inFlight.set(key, work);
      }
      const id = await work;
      this.folders.set(path, id);
      parent = id;
    }
    return parent;
  }

  async put(key: string, body: Uint8Array, contentType?: string): Promise<StoredObject> {
    const parts = key.split("/");
    const name = parts.pop() || "upload";
    const parent = await this.folderId(parts);
    const start = await fetch(`${UPLOAD}/files?uploadType=resumable&${ALL}&fields=id`, {
      method: "POST",
      headers: { ...(await this.auth()), "content-type": "application/json; charset=UTF-8", ...(contentType ? { "x-upload-content-type": contentType } : {}) },
      body: JSON.stringify({ name, parents: [parent] }),
    });
    const session = start.headers.get("location");
    if (!start.ok || !session) throw new Error(`Google Drive upload failed (${start.status}).`);
    const done = await fetch(session, { method: "PUT", headers: contentType ? { "content-type": contentType } : {}, body: Buffer.from(body) });
    const data = (await done.json().catch(() => ({}))) as { id?: string };
    if (!done.ok || !data.id) throw new Error(`Google Drive upload failed (${done.status}).`);
    return { key: data.id, size: body.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await fetch(`${API}/files/${encodeURIComponent(key)}?alt=media&${ALL}`, { headers: await this.auth() });
    if (!res.ok) throw new Error(`Google Drive ${res.status}: file not found.`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Moves to the Drive trash, so a mistake can be undone from Drive. */
  async delete(key: string): Promise<void> {
    await this.call(`${API}/files/${encodeURIComponent(key)}?${ALL}&fields=id`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }

  async list(prefix = ""): Promise<StoredObject[]> {
    const parent = await this.folderId(prefix.split("/"));
    const res = await this.call<{ files: { id: string; size?: string }[] }>(
      `${API}/files?${ALL}&includeItemsFromAllDrives=true&pageSize=1000&fields=files(id,size)&q=${encodeURIComponent(`'${q(parent)}' in parents and trashed = false and mimeType != '${FOLDER}'`)}`,
    );
    return res.files.map((f) => ({ key: f.id, size: Number(f.size ?? 0) }));
  }

  /** Moves (and renames) a file to a new path; the id stays the same. */
  async move(key: string, newPath: string): Promise<string> {
    const parts = newPath.split("/");
    const name = parts.pop() || "upload";
    const parent = await this.folderId(parts);
    const cur = await this.call<{ parents?: string[] }>(`${API}/files/${encodeURIComponent(key)}?${ALL}&fields=parents`);
    const remove = (cur.parents ?? []).filter((p) => p !== parent).join(",");
    await this.call(`${API}/files/${encodeURIComponent(key)}?${ALL}&fields=id&addParents=${encodeURIComponent(parent)}${remove ? `&removeParents=${encodeURIComponent(remove)}` : ""}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return key;
  }

  /** A link that opens the file in Google Drive. */
  static webLink(fileId: string) {
    return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
  }
}

/** Creates a top-level "Merqado" folder in the person's Drive and returns its id. */
export async function createRootFolder(accessToken: string, name = "Merqado"): Promise<string> {
  const res = await fetch(`${API}/files?${ALL}&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  if (!res.ok || !data.id) throw new Error(`Couldn't create the Merqado folder in Drive (${res.status}).`);
  return data.id;
}

/** The folder id inside a Drive folder link, or the text itself if it already looks like an id. */
export function folderIdFromLink(link: string): string | null {
  const s = link.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}
