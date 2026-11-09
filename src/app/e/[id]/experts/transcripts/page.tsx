import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { expertTranscripts } from "@/db/schema";
import { CleanButton } from "@/components/experts/CleanButton";
import { TranscriptUploadForm } from "@/components/experts/TranscriptUploadForm";
import { parseIdList } from "@/lib/experts/calc";
import type { CleanFlag } from "@/lib/experts/clean";
import { shortDate } from "@/lib/experts/calc";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsTranscriptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; v?: string }>;
}) {
  const { id } = await params;
  const { t, v } = await searchParams;
  const { db, data, canEdit } = await loadExpertsPage(id);
  const openId = t ?? data.transcripts.at(-1)?.id;
  const open = openId
    ? await db.query.expertTranscripts.findFirst({ where: and(eq(expertTranscripts.id, openId), eq(expertTranscripts.engagementId, id)) })
    : undefined;
  const expertOf = (expertId: string) => data.experts.find((e) => e.id === expertId);
  const openExpert = open ? expertOf(open.expertId) : undefined;
  const showVerbatim = v === "verbatim" || !open?.cleanedBody;
  let flags: CleanFlag[] = [];
  try {
    flags = open ? (JSON.parse(open.cleanFlags) as CleanFlag[]) : [];
  } catch {}
  const topicNames = (ids: string[]) => ids.map((x) => data.topics.find((tp) => tp.id === x)?.name).filter(Boolean).join(", ");

  return (
    <div className="split">
      <aside className="side" style={{ display: "flex", flexDirection: "column", gap: 12, flexBasis: 300 }}>
        {canEdit && (
          <section className="card" aria-labelledby="up-h">
            <h2 id="up-h" style={{ fontSize: 16 }}>
              Upload a transcript
            </h2>
            <TranscriptUploadForm
              engagementId={id}
              experts={data.experts.filter((e) => e.status !== "declined").map((e) => ({ id: e.id, label: `${e.name} · ${e.anonTitle}` }))}
            />
          </section>
        )}
        <section className="card" aria-labelledby="list-h" style={{ padding: 0, gap: 0 }}>
          <h2 id="list-h" style={{ fontSize: 14, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            {data.transcripts.length} {data.transcripts.length === 1 ? "transcript" : "transcripts"}
          </h2>
          {[...data.transcripts].reverse().map((tr) => {
            const e = expertOf(tr.expertId);
            const current = tr.id === open?.id;
            return (
              <Link
                key={tr.id}
                href={`/e/${id}/experts/transcripts?t=${tr.id}`}
                aria-current={current ? "page" : undefined}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--line)",
                  textDecoration: "none",
                  color: "var(--ink)",
                  background: current ? "var(--selected)" : undefined,
                  boxShadow: current ? "inset 3px 0 0 var(--accent)" : undefined,
                }}
              >
                <strong style={{ fontWeight: 600, fontSize: 13 }}>{e?.anonTitle ?? "Unknown expert"}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {e?.name} · {tr.kind === "call" ? "Main call" : "Follow-up"}
                  {e?.interviewDate ? ` · ${shortDate(e.interviewDate)}` : ""}
                </span>
              </Link>
            );
          })}
        </section>
      </aside>

      <section className="primary card" aria-label="Transcript">
        {open && openExpert ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: 19 }}>{openExpert.anonTitle}</h2>
                <div className="muted" style={{ fontSize: 13 }}>
                  {openExpert.name} · {open.kind === "call" ? "Main call" : "Follow-up"} ·{" "}
                  <a
                    href={`/api/engagements/${id}/transcripts/${open.id}/file`}
                    target="_blank"
                    rel="noopener"
                    title={open.sourceId ? "Open the original file" : "Download the full transcript text"}
                  >
                    {open.filename}
                  </a>
                </div>
                {parseIdList(open.discussedTopicIds).length > 0 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Topics: {topicNames(parseIdList(open.discussedTopicIds))}
                  </div>
                )}
              </div>
              <Link href={`/e/${id}/experts?expert=${openExpert.id}&tab=takeaways`}>Key takeaways</Link>
            </div>
            <div className="toolbar">
              {open.cleanedBody ? (
                <div className="seg" role="group" aria-label="Version">
                  <Link
                    href={`/e/${id}/experts/transcripts?t=${open.id}`}
                    aria-current={!showVerbatim ? "page" : undefined}
                    className="button"
                    style={{ borderRadius: 0, display: "inline-flex", alignItems: "center", textDecoration: "none", fontSize: 13, background: !showVerbatim ? "var(--ink)" : "var(--surface)", color: !showVerbatim ? "var(--surface)" : "var(--ink)" }}
                  >
                    Cleaned
                  </Link>
                  <Link
                    href={`/e/${id}/experts/transcripts?t=${open.id}&v=verbatim`}
                    aria-current={showVerbatim ? "page" : undefined}
                    className="button"
                    style={{ borderRadius: 0, display: "inline-flex", alignItems: "center", textDecoration: "none", fontSize: 13, background: showVerbatim ? "var(--ink)" : "var(--surface)", color: showVerbatim ? "var(--surface)" : "var(--ink)" }}
                  >
                    Verbatim
                  </Link>
                </div>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>
                  {open.cleanStatus === "failed" ? "Cleaning failed" : open.cleanStatus === "cleaning" ? "Cleaning…" : "Verbatim"}
                </span>
              )}
              {canEdit && <CleanButton engagementId={id} transcriptId={open.id} again={!!open.cleanedBody} />}
            </div>
            {!showVerbatim && flags.length > 0 && (
              <details className="notice" open>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{flags.length} things to check</summary>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--ink)", lineHeight: 1.5 }}>
                  {flags.map((f, i) => (
                    <li key={i}>
                      <span className="serif" style={{ fontStyle: "italic", fontSize: 15 }}>&ldquo;{f.quote}&rdquo;</span> <span className="muted">{f.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="transcript">{showVerbatim ? open.body : open.cleanedBody}</div>
          </>
        ) : (
          <div className="empty">
            <strong>No transcripts yet</strong>
          </div>
        )}
      </section>
    </div>
  );
}
