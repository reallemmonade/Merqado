import { afterEach, describe, expect, it, vi } from "vitest";
import { folderIdFromLink, GDriveStorage } from "./gdrive";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

describe("Google Drive storage", () => {
  it("creates the folder path, uploads, and moves by id", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    const calls: { method: string; url: string; body?: string }[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: typeof init.body === "string" ? init.body : undefined });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tok" });
      if (method === "GET" && url.includes("/files?") && url.includes("mimeType")) return json({ files: [] });
      if (method === "POST" && url.includes("uploadType=resumable")) return new Response(null, { status: 200, headers: { location: "https://upload.example/session" } });
      if (method === "POST" && url.includes("/drive/v3/files?")) return json({ id: `folder${++n}` });
      if (method === "PUT" && url === "https://upload.example/session") return json({ id: "file1" });
      if (method === "GET" && url.includes("fields=parents")) return json({ parents: ["folder2"] });
      if (method === "PATCH") return json({ id: "file1" });
      throw new Error(`unexpected ${method} ${url}`);
    });

    const drive = new GDriveStorage({ refreshToken: "r", rootFolderId: "root" });
    const put = await drive.put("Project Atlas/To file/a.docx", new Uint8Array([1, 2]), "text/plain");
    expect(put.key).toBe("file1");
    const created = calls.filter((c) => c.method === "POST" && c.url.includes("/drive/v3/files?") && !c.url.includes("/upload/")).map((c) => JSON.parse(c.body!));
    expect(created).toEqual([
      { name: "Project Atlas", mimeType: "application/vnd.google-apps.folder", parents: ["root"] },
      { name: "To file", mimeType: "application/vnd.google-apps.folder", parents: ["folder1"] },
    ]);

    const key = await drive.move("file1", "Project Atlas/Interviews/Transcripts/a.docx");
    expect(key).toBe("file1");
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("addParents=folder4");
    expect(patch.url).toContain("removeParents=folder2");
  });

  it("creates a folder once when uploads run in parallel", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    const made: string[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tok" });
      if (method === "GET" && url.includes("mimeType")) {
        await new Promise((r) => setTimeout(r, 5));
        return json({ files: [] });
      }
      if (method === "POST" && url.includes("uploadType=resumable")) return new Response(null, { status: 200, headers: { location: "https://upload.example/s" } });
      if (method === "POST" && url.includes("/drive/v3/files?")) {
        made.push(JSON.parse(String(init.body)).name);
        return json({ id: `folder${++n}` });
      }
      if (method === "PUT") return json({ id: `file${++n}` });
      throw new Error(`unexpected ${method} ${url}`);
    });
    // Each upload resolves its own storage object, as the upload route does.
    const put = (name: string) => new GDriveStorage({ refreshToken: "r", rootFolderId: "root2" }).put(`Case/To file/${name}`, new Uint8Array([1]));
    await Promise.all([put("a.txt"), put("b.txt"), put("c.txt")]);
    expect(made).toEqual(["Case", "To file"]);
  });

  it("reads folder ids from links", () => {
    expect(folderIdFromLink("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing")).toBe("1AbCdEfGhIjKlMnOp");
    expect(folderIdFromLink("not a link")).toBeNull();
  });
});
