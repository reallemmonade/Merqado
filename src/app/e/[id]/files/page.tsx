import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { FilesWorkspace, MoveFile, NewFolder, ReviewTable, type PendingFile } from "@/components/case/Files";
import { experts, expertTranscripts, sources, users } from "@/db/schema";
import { loadCase } from "@/lib/case/page";
import { shortDate } from "@/lib/case/progress";
import { anonymizeTitle } from "@/lib/experts/calc";
import { sourceVisibility } from "@/lib/files/access";
import { loadCaseFolders } from "@/lib/files/folders";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

const TRANSCRIPTS = "__transcripts";
const REVIEW = "__review";
const UNFILED = "__unfiled";

function size(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const parse = (json: string): unknown[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export default async function FilesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/files");
  const { db, user } = ctx;
  const canUpload = can(ctx.access, "upload");
  const [all, transcripts, people, folders, visible] = await Promise.all([
    db.select().from(sources).where(eq(sources.engagementId, id)).orderBy(desc(sources.createdAt)),
    db
      .select({ id: expertTranscripts.id, filename: expertTranscripts.filename, kind: expertTranscripts.kind, expertId: expertTranscripts.expertId, sourceId: expertTranscripts.sourceId, createdAt: expertTranscripts.createdAt })
      .from(expertTranscripts)
      .where(eq(expertTranscripts.engagementId, id))
      .orderBy(desc(expertTranscripts.createdAt)),
    db.select({ id: experts.id, company: experts.company, title: experts.title, anonTitle: experts.anonTitle, isFormer: experts.isFormer }).from(experts).where(eq(experts.engagementId, id)),
    loadCaseFolders(db, id),
    sourceVisibility(db, id, user.archetype),
  ]);
  const files = all.filter(visible);
  const uploaderIds = [...new Set(files.map((f) => f.uploadedBy).filter((x): x is string => !!x))];
  const uploaders = uploaderIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uploaderIds)) : [];
  const nameOf = new Map(uploaders.map((u) => [u.id, u.name]));
  const who = new Map(people.map((p) => [p.id, p.anonTitle || anonymizeTitle(p.company, p.title, p.isFormer)]));
  const transcriptSourceIds = new Set(transcripts.map((t) => t.sourceId).filter(Boolean));

  // Chat files wait in their chat for the sender to file; everything else waits here.
  const pendingRows = files.filter((f) => f.filing === "pending");
  const pending: PendingFile[] = pendingRows
    .filter((f) => !f.messageId || f.uploadedBy === user.id)
    .map((f) => {
      const cand = f.versionCandidate ? all.find((x) => x.id === f.versionCandidate) : null;
      const top = cand ? Math.max(...all.filter((x) => x.id === (cand.versionOf ?? cand.id) || x.versionOf === (cand.versionOf ?? cand.id)).map((x) => x.version)) : 0;
      return {
        id: f.id,
        filename: f.filename,
        suggestions: parse(f.suggestions).filter((s): s is string => typeof s === "string"),
        links: parse(f.links).map((l) => (l as { label?: string }).label ?? "").filter(Boolean),
        batchId: f.batchId,
        relPath: f.relPath,
        newVersion: cand ? `v${top + 1}` : null,
      };
    });

  // Only the newest of each version stack is listed; older ones sit under its version number.
  const filed = files.filter((f) => f.filing === "filed" && !transcriptSourceIds.has(f.id));
  const stackOf = (f: (typeof filed)[number]) => f.versionOf ?? f.id;
  const newest = new Map<string, (typeof filed)[number]>();
  for (const f of filed) {
    const k = stackOf(f);
    const cur = newest.get(k);
    if (!cur || f.version > cur.version) newest.set(k, f);
  }
  const latest = [...newest.values()].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  const older = (f: (typeof filed)[number]) => filed.filter((x) => stackOf(x) === stackOf(f) && x.id !== f.id).sort((a, b) => b.version - a.version);

  const current = sp.folder ?? "";
  const inFolder = (f: { folder: string }, path: string) => f.folder === path || f.folder.startsWith(path + "/");
  const shown =
    current === UNFILED ? latest.filter((f) => !f.folder) : current && current !== TRANSCRIPTS && current !== REVIEW ? latest.filter((f) => inFolder(f, current)) : latest;
  const base = `/e/${id}/files`;
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const href = (key: string) => (key ? `${base}?folder=${encodeURIComponent(key)}` : base);
  const unfiled = latest.filter((f) => !f.folder).length;
  // Show a folder's children only when it, or one of its children, is open.
  const openRoot = current.split("/")[0];
  const tree = folders.filter((f) => !f.includes("/") || f.split("/")[0] === openRoot);

  return (
    <CaseShell ctx={ctx} section="files" title="Files">
      <FilesWorkspace engagementId={id} folders={folders} pending={pending} canUpload={canUpload}>
        <div className="channel">
          <nav className="panel room-list folder-tree" aria-label="Folders">
            {pending.length > 0 && (
              <Link href={href(REVIEW)} className="review-link" aria-current={current === REVIEW ? "page" : undefined}>
                <span className="row-between">
                  <span>To review</span>
                  <span className="mono">{pending.length}</span>
                </span>
              </Link>
            )}
            <Link href={base} aria-current={current === "" ? "page" : undefined}>
              <span className="row-between">
                <span>All files</span>
                <span className="muted mono">{latest.length}</span>
              </span>
            </Link>
            <hr />
            {tree.map((f) => {
              const depth = f.split("/").length - 1;
              const n = latest.filter((x) => inFolder(x, f)).length;
              return (
                <Link key={f} href={href(f)} data-drop-folder={f} aria-current={current === f ? "page" : undefined} style={{ paddingLeft: 10 + depth * 16 }}>
                  <span className="row-between">
                    <span style={{ fontWeight: depth ? 400 : 600 }}>{f.split("/").pop()}</span>
                    <span className="muted mono">{n || ""}</span>
                  </span>
                </Link>
              );
            })}
            {unfiled > 0 && (
              <Link href={href(UNFILED)} aria-current={current === UNFILED ? "page" : undefined}>
                <span className="row-between">
                  <span>Unfiled</span>
                  <span className="muted mono">{unfiled}</span>
                </span>
              </Link>
            )}
            <hr />
            <Link href={href(TRANSCRIPTS)} aria-current={current === TRANSCRIPTS ? "page" : undefined}>
              <span className="row-between">
                <span>Expert transcripts</span>
                <span className="muted mono">{transcripts.length}</span>
              </span>
            </Link>
            {canUpload && current !== TRANSCRIPTS && current !== REVIEW && current !== UNFILED && <NewFolder engagementId={id} parent={current} />}
          </nav>
          <section className="group" style={{ flex: 1, minWidth: 0 }}>
            {current === REVIEW ? (
              <ReviewTable engagementId={id} folders={folders} rows={pending} />
            ) : (
              <>
                {current && current !== TRANSCRIPTS && current !== UNFILED && (
                  <div className="group-head">
                    <h2 className="crumbs">
                      {current.split("/").map((part, i, arr) => (
                        <span key={i}>
                          {i > 0 && <span className="muted"> / </span>}
                          {i < arr.length - 1 ? <Link href={href(arr.slice(0, i + 1).join("/"))}>{part}</Link> : part}
                        </span>
                      ))}
                    </h2>
                  </div>
                )}
                <div className="scroll-x">
                  {current === TRANSCRIPTS ? (
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Expert</th>
                          <th>Type</th>
                          <th>Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transcripts.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <Link href={`/e/${id}/experts/transcripts?t=${t.id}`}>{t.filename}</Link>
                            </td>
                            <td>{who.get(t.expertId)}</td>
                            <td>{t.kind === "followup" ? "Follow-up" : "Call"}</td>
                            <td className="mono">{shortDate(iso(t.createdAt))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th style={{ width: 200 }}>Folder</th>
                          <th>Linked to</th>
                          <th>Added by</th>
                          <th>Added</th>
                          <th>Size</th>
                          <th>Ver.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((f) => {
                          const prev = older(f);
                          const links = parse(f.links).map((l) => (l as { label?: string }).label ?? "").filter(Boolean);
                          return (
                            <tr key={f.id}>
                              <td>
                                <a href={`/api/engagements/${id}/sources/${f.id}`} target="_blank" rel="noreferrer">
                                  {f.filename}
                                </a>
                              </td>
                              <td>{canUpload ? <MoveFile engagementId={id} sourceId={f.id} folder={f.folder} /> : f.folder}</td>
                              <td>
                                <div className="chips">
                                  {links.map((l) => (
                                    <span key={l} className="tag tag-accent">
                                      {l}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td>{f.uploadedBy ? nameOf.get(f.uploadedBy) : ""}</td>
                              <td className="mono">{shortDate(iso(f.createdAt))}</td>
                              <td className="mono">{size(f.sizeBytes)}</td>
                              <td className="mono">
                                {prev.length ? (
                                  <details className="versions">
                                    <summary>v{f.version}</summary>
                                    {prev.map((p) => (
                                      <a key={p.id} href={`/api/engagements/${id}/sources/${p.id}`} target="_blank" rel="noreferrer">
                                        v{p.version} · {shortDate(iso(p.createdAt))}
                                      </a>
                                    ))}
                                  </details>
                                ) : (
                                  `v${f.version}`
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {(current === TRANSCRIPTS ? transcripts.length : shown.length) === 0 && <p className="muted" style={{ padding: 16 }}>No files</p>}
              </>
            )}
          </section>
        </div>
      </FilesWorkspace>
    </CaseShell>
  );
}
