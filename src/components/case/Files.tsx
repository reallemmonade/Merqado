"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/components/experts/useApi";
import { isJunk } from "@/lib/files/junk";

export interface PendingFile {
  id: string;
  filename: string;
  suggestions: string[];
  links: string[];
  batchId: string | null;
  relPath: string | null;
  /** "v3" when this looks like a newer copy of an existing file. */
  newVersion: string | null;
}

interface Dropped {
  file: File;
  relPath: string;
}

/** Matches the server's limit, so a too-big file fails at once instead of after uploading. */
const MAX_BYTES = 100 * 1024 * 1024;

/** Reads every file inside dropped folders, keeping each file's path inside the folder. */
async function readDrop(dt: DataTransfer): Promise<Dropped[]> {
  const entries = [...dt.items].map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null)).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files].filter((f) => !isJunk(f.name)).map((file) => ({ file, relPath: file.name }));
  const out: Dropped[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)).catch(() => null);
      if (file && !isJunk(file.name)) out.push({ file, relPath: entry.fullPath.replace(/^\/+/, "") });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      // An unreadable folder is skipped rather than failing the whole drop.
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej)).catch(() => []);
      if (!batch.length) break;
      for (const e of batch) await walk(e);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

const NEW = "\u0000new";

/** A file skipped because the same bytes are already in the case, and where that copy is. */
interface Duplicate {
  name: string;
  folder: string;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * The Files page around its table: drop files or folders anywhere (or on a folder in the
 * tree), upload them, then confirm where each one goes.
 */
export function FilesWorkspace({
  engagementId,
  folders,
  pending,
  canUpload,
  children,
}: {
  engagementId: string;
  folders: string[];
  pending: PendingFile[];
  canUpload: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batch, setBatch] = useState<{ id: string; targets: Record<string, string>; skipped: Duplicate[]; failed: string[] } | null>(null);
  const depth = useRef(0);
  // Files still to send; a second drop while sending joins the same batch.
  const queue = useRef<{ files: (Dropped & { target: string })[]; id: string; done: number } | null>(null);

  const upload = useCallback(
    async (dropped: Dropped[], target = "") => {
      const files = dropped.map((d) => ({ ...d, target }));
      if (!files.length) return;
      if (queue.current) {
        queue.current.files.push(...files);
        setProgress({ done: queue.current.done, total: queue.current.files.length });
        return;
      }
      const id = crypto.randomUUID();
      const q = { files: [...files], id, done: 0 };
      queue.current = q;
      const skipped: Duplicate[] = [];
      const failed: string[] = [];
      // Each file goes to the folder it was dropped on, even when a later drop joins the batch.
      const targets: Record<string, string> = {};
      // Open the confirm drawer now and fill it as each file lands.
      setBatch({ id, targets: {}, skipped: [], failed: [] });
      setProgress({ done: 0, total: q.files.length });
      let next = 0;
      let lastRefresh = 0;
      const worker = async () => {
        while (next < q.files.length) {
          const { file, relPath, target: to } = q.files[next++]!;
          let res: Response | null = null;
          let data: { error?: string; duplicate?: boolean; source?: { id: string; folder: string; filing: string } } = {};
          if (file.size > MAX_BYTES) data = { error: "Files are limited to 100 MB." };
          else {
            const form = new FormData();
            form.set("file", file);
            form.set("relPath", relPath);
            form.set("batchId", id);
            // Big files on a slow connection need longer than a few minutes.
            res = await fetch(`/api/engagements/${engagementId}/sources`, { method: "POST", body: form, signal: AbortSignal.timeout(15 * 60_000) }).catch(() => null);
            data = res ? await res.json().catch(() => ({})) : {};
          }
          if (!res?.ok) failed.push(`${file.name}${data.error ? `: ${data.error}` : ""}`);
          else if (data.duplicate) skipped.push({ name: file.name, folder: data.source?.filing === "filed" ? data.source.folder || "Unfiled" : "To review" });
          else if (data.source && to) targets[data.source.id] = to;
          setProgress({ done: ++q.done, total: q.files.length });
          setBatch((b) => (b?.id === id ? { ...b, targets: { ...targets }, skipped: [...skipped], failed: [...failed] } : b));
          if (Date.now() - lastRefresh > 1500) {
            lastRefresh = Date.now();
            router.refresh();
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      queue.current = null;
      setProgress(null);
      router.refresh();
    },
    [engagementId, router],
  );

  useEffect(() => {
    // Without upload rights, still stop the browser from leaving the page to open a dropped file.
    if (!canUpload) {
      const block = (e: DragEvent) => e.dataTransfer?.types.includes("Files") && e.preventDefault();
      window.addEventListener("dragover", block);
      window.addEventListener("drop", block);
      return () => {
        window.removeEventListener("dragover", block);
        window.removeEventListener("drop", block);
      };
    }
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-folder]")?.dataset.dropFolder ?? "";
      upload(await readDrop(e.dataTransfer).catch(() => []), target);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [canUpload, upload]);

  const batchRows = batch ? pending.filter((p) => p.batchId === batch.id) : [];

  return (
    <div className={`files-ws${over ? " is-over" : ""}`}>
      {canUpload && (
        <div className="toolbar files-actions">
          {progress && (
            <span className="muted mono">
              {progress.done} / {progress.total}
            </span>
          )}
          <PickButton label="Upload folder" folder onPick={(f) => upload(f)} />
          <PickButton label="Upload" onPick={(f) => upload(f)} primary />
        </div>
      )}
      {children}
      {over && (
        <div className="drop-overlay" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          <strong>Drop to file</strong>
        </div>
      )}
      {batch && (progress || batchRows.length > 0 || batch.skipped.length > 0 || batch.failed.length > 0) && (
        <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && setBatch(null)}>
          <aside className="drawer" aria-label="Confirm folders">
            <ReviewTable
              engagementId={engagementId}
              folders={folders}
              rows={batchRows}
              targets={batch.targets}
              skipped={batch.skipped}
              failed={batch.failed}
              progress={progress}
              onClose={() => setBatch(null)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function PickButton({ label, folder, primary, onPick }: { label: string; folder?: boolean; primary?: boolean; onPick: (f: Dropped[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={primary ? "small" : "secondary small"} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        multiple
        {...(folder ? { webkitdirectory: "" } : {})}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].filter((f) => !isJunk(f.name));
          onPick(files.map((file) => ({ file, relPath: file.webkitRelativePath || file.name })));
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Each waiting file with its suggested folder; one click files them all. */
export function ReviewTable({
  engagementId,
  folders,
  rows,
  targets = {},
  skipped = [],
  failed = [],
  progress = null,
  onClose,
}: {
  engagementId: string;
  folders: string[];
  rows: PendingFile[];
  targets?: Record<string, string>;
  skipped?: Duplicate[];
  failed?: string[];
  progress?: { done: number; total: number } | null;
  onClose?: () => void;
}) {
  const { call, busy, error } = useApi();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [asVersion, setAsVersion] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  // Dropped on a folder: that folder, unless a suggestion is one of its subfolders.
  const folderOf = (r: PendingFile) => {
    const target = targets[r.id];
    return choice[r.id] ?? (target ? (r.suggestions.find((s) => s.startsWith(target + "/")) ?? target) : r.suggestions[0] || "");
  };
  const ready = rows.filter((r) => folderOf(r).trim());
  const url = `/api/engagements/${engagementId}/files`;
  const listId = `folders-${engagementId}`;

  return (
    <div className="review">
      <header className="review-head">
        <h2>{plural(progress ? progress.total : rows.length + skipped.length + failed.length, "item")}</h2>
        <div className="chips">
          {progress && (
            <span className="tag mono">
              {progress.done} / {progress.total}
            </span>
          )}
          {rows.length > 0 && <span className="tag tag-good">{rows.length} to file</span>}
          {skipped.length > 0 && <span className="tag">{skipped.length} duplicate</span>}
          {failed.length > 0 && <span className="tag tag-bad">{failed.length} failed</span>}
        </div>
        {onClose && (
          <button type="button" className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <div className="scroll-x">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: "45%", minWidth: 240 }}>Folder</th>
              <th>Linked to</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = folderOf(r);
              return (
                <tr key={r.id}>
                  <td title={r.relPath ?? undefined}>{r.filename}</td>
                  <td>
                    {typing[r.id] ? (
                      <input
                        type="text"
                        list={listId}
                        aria-label={`Folder for ${r.filename}`}
                        value={f}
                        placeholder="Folder"
                        className={f ? undefined : "needs"}
                        onChange={(e) => setChoice({ ...choice, [r.id]: e.target.value })}
                        autoFocus
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <select
                        aria-label={`Folder for ${r.filename}`}
                        value={f}
                        className={f ? undefined : "needs"}
                        onChange={(e) =>
                          e.target.value === NEW ? setTyping({ ...typing, [r.id]: true }) : setChoice({ ...choice, [r.id]: e.target.value })
                        }
                        style={{ width: "100%" }}
                      >
                        {!f && <option value="">Folder</option>}
                        {/* The AI's picks first, then every folder. */}
                        {[...new Set([...r.suggestions, f, ...folders])].filter(Boolean).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                        <option value={NEW}>New folder…</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <div className="chips">
                      {r.links.map((l) => (
                        <span key={l} className="tag tag-accent">
                          {l}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.newVersion && (
                      <label className="check">
                        <input type="checkbox" checked={asVersion[r.id] ?? true} onChange={(e) => setAsVersion({ ...asVersion, [r.id]: e.target.checked })} />
                        {r.newVersion}
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
            {skipped.map((d, i) => (
              <tr key={`dup-${i}`} className="muted-row">
                <td>{d.name}</td>
                <td>{d.folder}</td>
                <td colSpan={2}>Duplicate</td>
              </tr>
            ))}
            {failed.map((msg, i) => (
              <tr key={`fail-${i}`} className="muted-row">
                <td colSpan={4} className="error">
                  {msg}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id={listId}>
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
      <footer className="review-foot">
        {error && <span className="error">{error}</span>}
        {rows.length > 0 && (
          <button
            type="button"
            className="secondary"
            disabled={busy !== null || !!progress}
            onClick={async () => {
              if (await call("discard", url, { json: { op: "discard", sourceIds: rows.map((r) => r.id) } })) onClose?.();
            }}
          >
            Discard
          </button>
        )}
        {rows.length > 0 ? (
          <button
            type="button"
            disabled={busy !== null || !!progress || ready.length === 0}
            onClick={async () => {
              const items = ready.map((r) => ({ sourceId: r.id, folder: folderOf(r), asVersion: !!r.newVersion && (asVersion[r.id] ?? true) }));
              if (await call("file", url, { json: { op: "file", items } })) onClose?.();
            }}
          >
            {busy === "file" ? "Filing…" : `File ${ready.length}`}
          </button>
        ) : (
          onClose && (
            <button type="button" onClick={onClose}>
              Done
            </button>
          )
        )}
      </footer>
    </div>
  );
}

export function MoveFile({ engagementId, sourceId, folder }: { engagementId: string; sourceId: string; folder: string }) {
  const { call, busy } = useApi();
  const [value, setValue] = useState(folder);
  return (
    <input
      type="text"
      aria-label="Folder"
      list={`folders-${engagementId}`}
      value={value}
      disabled={busy !== null}
      placeholder="Unfiled"
      className="cell-input"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== folder && call("mv", `/api/engagements/${engagementId}/files`, { json: { op: "move", sourceId, folder: value } })}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function NewFolder({ engagementId, parent }: { engagementId: string; parent: string }) {
  const { call, busy, error } = useApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open)
    return (
      <button type="button" className="linkbtn" onClick={() => setOpen(true)}>
        + Folder
      </button>
    );
  return (
    <form
      className="new-folder"
      onSubmit={async (e) => {
        e.preventDefault();
        const path = parent ? `${parent}/${name}` : name;
        if (await call("add", `/api/engagements/${engagementId}/files`, { json: { op: "folder.add", path } })) {
          setName("");
          setOpen(false);
        }
      }}
    >
      <input type="text" aria-label="Folder name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <button type="submit" className="small" disabled={busy !== null || !name.trim()}>
        Add
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}
