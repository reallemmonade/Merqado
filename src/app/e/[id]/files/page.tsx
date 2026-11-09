import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { FileUpload, MoveFile } from "@/components/case/Files";
import { experts, expertTranscripts, sources, users } from "@/db/schema";
import { loadCase } from "@/lib/case/page";
import { shortDate } from "@/lib/case/progress";
import { anonymizeTitle } from "@/lib/experts/calc";
import { allows } from "@/lib/roles";

export const dynamic = "force-dynamic";

const TRANSCRIPTS = "__transcripts";
const UNFILED = "__unfiled";

function size(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FilesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/files");
  const { db } = ctx;
  const canUpload = allows(ctx.membership, "upload");
  const [files, transcripts, people] = await Promise.all([
    db.select().from(sources).where(eq(sources.engagementId, id)).orderBy(desc(sources.createdAt)),
    db
      .select({ id: expertTranscripts.id, filename: expertTranscripts.filename, kind: expertTranscripts.kind, expertId: expertTranscripts.expertId, sourceId: expertTranscripts.sourceId, createdAt: expertTranscripts.createdAt })
      .from(expertTranscripts)
      .where(eq(expertTranscripts.engagementId, id))
      .orderBy(desc(expertTranscripts.createdAt)),
    db.select({ id: experts.id, company: experts.company, title: experts.title, anonTitle: experts.anonTitle, isFormer: experts.isFormer }).from(experts).where(eq(experts.engagementId, id)),
  ]);
  const uploaderIds = [...new Set(files.map((f) => f.uploadedBy).filter((x): x is string => !!x))];
  const uploaders = uploaderIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uploaderIds)) : [];
  const nameOf = new Map(uploaders.map((u) => [u.id, u.name]));
  const who = new Map(people.map((p) => [p.id, p.anonTitle || anonymizeTitle(p.company, p.title, p.isFormer)]));
  const transcriptSourceIds = new Set(transcripts.map((t) => t.sourceId).filter(Boolean));
  const plain = files.filter((f) => !transcriptSourceIds.has(f.id));

  const folders = [...new Set(plain.map((f) => f.folder).filter(Boolean))].sort();
  const current = sp.folder ?? "";
  const shown = current === UNFILED ? plain.filter((f) => !f.folder) : current && current !== TRANSCRIPTS ? plain.filter((f) => f.folder === current) : plain;
  const base = `/e/${id}/files`;
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  const nav = [
    { key: "", label: "All files", n: plain.length },
    ...folders.map((f) => ({ key: f, label: f, n: plain.filter((x) => x.folder === f).length })),
    ...(plain.some((f) => !f.folder) && folders.length ? [{ key: UNFILED, label: "Unfiled", n: plain.filter((f) => !f.folder).length }] : []),
    { key: TRANSCRIPTS, label: "Transcripts", n: transcripts.length },
  ];

  return (
    <CaseShell ctx={ctx} section="files" title="Files" actions={canUpload && current !== TRANSCRIPTS ? <FileUpload engagementId={id} folders={folders} folder={current === UNFILED ? "" : current} /> : undefined}>
      <div className="channel">
        <nav className="panel room-list" aria-label="Folders">
          {nav.map((f) => (
            <Link key={f.key || "all"} href={f.key ? `${base}?folder=${encodeURIComponent(f.key)}` : base} aria-current={current === f.key ? "page" : undefined}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{f.label}</span>
                <span className="muted mono">{f.n}</span>
              </span>
            </Link>
          ))}
        </nav>
        <section className="group" style={{ flex: 1, minWidth: 0 }}>
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
                    <th style={{ width: 160 }}>Folder</th>
                    <th>Added by</th>
                    <th>Added</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <a href={`/api/engagements/${id}/sources/${f.id}`} target="_blank" rel="noreferrer">
                          {f.filename}
                        </a>
                      </td>
                      <td>{canUpload ? <MoveFile engagementId={id} sourceId={f.id} folder={f.folder} /> : f.folder}</td>
                      <td>{f.uploadedBy ? nameOf.get(f.uploadedBy) : ""}</td>
                      <td className="mono">{shortDate(iso(f.createdAt))}</td>
                      <td className="mono">{size(f.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {(current === TRANSCRIPTS ? transcripts.length : shown.length) === 0 && <p className="muted" style={{ padding: 16 }}>No files</p>}
        </section>
      </div>
    </CaseShell>
  );
}
