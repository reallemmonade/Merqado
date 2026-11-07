"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/components/experts/useApi";
import { SampleButton } from "./SampleButton";

export interface SlideRow {
  id: string;
  n: number;
  section: string;
  headline: string;
  body: string;
  sourceNote: string;
  moduleId: string | null;
  status: "draft" | "final";
  openIssues: number;
}

export interface IssueRow {
  id: string;
  kind: "qc" | "contradiction";
  severity: "high" | "medium" | "low";
  slideId: string | null;
  slideN: number | null;
  slideHeadline: string;
  claim: string;
  otherRef: string;
  otherClaim: string;
  detail: string;
  fix: string;
  status: "open" | "resolved" | "dismissed";
}

const SEV_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

function SlidePreview({ s }: { s: Pick<SlideRow, "section" | "headline" | "body" | "sourceNote" | "n"> }) {
  return (
    <div className="slide">
      <div className="slide-section">{s.section}</div>
      <h3 className="slide-headline">{s.headline}</h3>
      <ul>
        {s.body
          .split("\n")
          .filter((p) => p.trim())
          .map((p, i) => (
            <li key={i}>{p}</li>
          ))}
      </ul>
      <div className="slide-foot">
        <span>{s.sourceNote}</span>
        <span>{s.n}</span>
      </div>
    </div>
  );
}

function Generate({ engagementId, hasSlides }: { engagementId: string; hasSlides: boolean }) {
  const { call, busy, error } = useApi();
  const [open, setOpen] = useState(!hasSlides);
  const [brief, setBrief] = useState("");
  const [replace, setReplace] = useState(false);
  if (!open)
    return (
      <button type="button" className="small" onClick={() => setOpen(true)}>
        Generate
      </button>
    );
  return (
    <form
      className="card"
      style={{ gap: 10, width: "100%" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await call("gen", `/api/engagements/${engagementId}/deck`, { json: { op: "generate", brief, replace } })) setOpen(false);
      }}
    >
      <textarea rows={3} value={brief} placeholder="Brief" aria-label="Brief" onChange={(e) => setBrief(e.target.value)} />
      <div className="toolbar">
        {hasSlides && (
          <label className="check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace drafts
          </label>
        )}
        <span className="grow" />
        {hasSlides && (
          <button type="button" className="secondary small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        <button type="submit" className="small" disabled={busy !== null}>
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

function SlideEditor({ engagementId, s, modules, onDone }: { engagementId: string; s: SlideRow | null; modules: { id: string; name: string }[]; onDone: () => void }) {
  const { call, busy, error } = useApi();
  const [f, setF] = useState({ section: s?.section ?? "", headline: s?.headline ?? "", body: s?.body ?? "", sourceNote: s?.sourceNote ?? "", moduleId: s?.moduleId ?? "" });
  return (
    <form
      className="card"
      style={{ gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const json = s ? { op: "slide.update", id: s.id, ...f, moduleId: f.moduleId || null } : { op: "slide.add", ...f, moduleId: f.moduleId || null };
        if (await call("save", `/api/engagements/${engagementId}/deck`, { json })) onDone();
      }}
    >
      <div className="form-grid">
        <label className="field">
          Section
          <input type="text" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
        </label>
        <label className="field">
          Module
          <select value={f.moduleId} onChange={(e) => setF({ ...f, moduleId: e.target.value })}>
            <option value="">None</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Headline
        <input type="text" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} />
      </label>
      <label className="field">
        Points
        <textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </label>
      <label className="field">
        Source
        <input type="text" value={f.sourceNote} onChange={(e) => setF({ ...f, sourceNote: e.target.value })} />
      </label>
      <div className="toolbar">
        <button type="submit" className="small" disabled={busy !== null || !f.headline.trim()}>
          Save
        </button>
        <button type="button" className="secondary small" onClick={onDone}>
          Cancel
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}

export function DeckSlides({
  engagementId,
  slides,
  modules,
  selected,
  canEdit,
}: {
  engagementId: string;
  slides: SlideRow[];
  modules: { id: string; name: string }[];
  selected?: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/deck`;
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [instruction, setInstruction] = useState("");
  const current = slides.find((s) => s.id === selected) ?? slides[0];
  const moduleName = new Map(modules.map((m) => [m.id, m.name]));
  const go = (id: string) => router.replace(`/e/${engagementId}/deck?slide=${id}`, { scroll: false });

  if (slides.length === 0)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {canEdit ? (
          <>
            <Generate engagementId={engagementId} hasSlides={false} />
            <div className="toolbar">
              <button type="button" className="secondary small" onClick={() => setEditing("new")}>
                + Slide
              </button>
              <SampleButton engagementId={engagementId} />
            </div>
            {editing === "new" && <SlideEditor engagementId={engagementId} s={null} modules={modules} onDone={() => setEditing(null)} />}
          </>
        ) : (
          <p className="muted">No slides</p>
        )}
      </div>
    );

  let lastSection = "";
  return (
    <div className="deck">
      <nav className="panel storyline" aria-label="Storyline">
        {canEdit && (
          <div className="toolbar" style={{ padding: 8 }}>
            <Generate engagementId={engagementId} hasSlides />
            <button type="button" className="secondary small" onClick={() => setEditing("new")}>
              + Slide
            </button>
          </div>
        )}
        <ol>
          {slides.map((s) => {
            const head = s.section && s.section !== lastSection ? s.section : null;
            lastSection = s.section || lastSection;
            return (
              <li key={s.id}>
                {head && <div className="gpt-folder-name">{head}</div>}
                <button type="button" className="story-item" aria-current={s.id === current?.id ? "true" : undefined} onClick={() => go(s.id)}>
                  <span className="mono">{s.n}</span>
                  <span style={{ flex: 1 }}>{s.headline}</span>
                  {s.openIssues > 0 && <span className="dot" aria-label={`${s.openIssues} open issues`} />}
                  {s.status === "final" && <span className="tag">Final</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="deck-main">
        {editing === "new" && <SlideEditor engagementId={engagementId} s={null} modules={modules} onDone={() => setEditing(null)} />}
        {current && editing === "edit" ? (
          <SlideEditor key={current.id} engagementId={engagementId} s={current} modules={modules} onDone={() => setEditing(null)} />
        ) : (
          current && (
            <>
              <SlidePreview s={current} />
              <div className="toolbar">
                <span className="meta">
                  {current.moduleId && moduleName.get(current.moduleId) && <span className="tag">{moduleName.get(current.moduleId)}</span>}
                  {current.openIssues > 0 && (
                    <Link href={`/e/${engagementId}/deck/contradictions`} className="tag sev-high">
                      {current.openIssues} {current.openIssues === 1 ? "issue" : "issues"}
                    </Link>
                  )}
                </span>
                <span className="grow" />
                {canEdit && (
                  <>
                    <button type="button" className="secondary small" aria-label="Move up" disabled={busy !== null || current.n === 1} onClick={() => call("mv", url, { json: { op: "slide.move", id: current.id, dir: -1 } })}>
                      ↑
                    </button>
                    <button type="button" className="secondary small" aria-label="Move down" disabled={busy !== null || current.n === slides.length} onClick={() => call("mv", url, { json: { op: "slide.move", id: current.id, dir: 1 } })}>
                      ↓
                    </button>
                    <button type="button" className="secondary small" onClick={() => setEditing("edit")}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      disabled={busy !== null}
                      onClick={() => call("st", url, { json: { op: "slide.update", id: current.id, status: current.status === "final" ? "draft" : "final" } })}
                    >
                      {current.status === "final" ? "Final" : "Mark final"}
                    </button>
                    <button type="button" className="secondary small" disabled={busy !== null} onClick={() => call("del", url, { json: { op: "slide.delete", id: current.id } })}>
                      Delete
                    </button>
                  </>
                )}
              </div>
              {canEdit && (
                <form
                  className="composer redo"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await call("redo", url, { json: { op: "redo", id: current.id, instruction } })) setInstruction("");
                  }}
                >
                  <input type="text" value={instruction} placeholder="Change" aria-label="Change" onChange={(e) => setInstruction(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit" disabled={busy !== null}>
                    {busy === "redo" ? "Redoing…" : "Redo"}
                  </button>
                </form>
              )}
            </>
          )
        )}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

function IssueActions({ engagementId, i }: { engagementId: string; i: IssueRow }) {
  const { call, busy } = useApi();
  const url = `/api/engagements/${engagementId}/deck`;
  const set = (status: IssueRow["status"]) => call(i.id + status, url, { json: { op: "issue.update", id: i.id, status } });
  return (
    <div className="toolbar">
      {i.slideId && (
        <Link href={`/e/${engagementId}/deck?slide=${i.slideId}`} className="secondary-link">
          Open slide
        </Link>
      )}
      {i.status === "open" ? (
        <>
          <button type="button" className="small" disabled={busy !== null} onClick={() => set("resolved")}>
            Resolve
          </button>
          <button type="button" className="secondary small" disabled={busy !== null} onClick={() => set("dismissed")}>
            Dismiss
          </button>
        </>
      ) : (
        <button type="button" className="secondary small" disabled={busy !== null} onClick={() => set("open")}>
          Reopen
        </button>
      )}
    </div>
  );
}

function StatusSeg({ value, onChange, counts }: { value: IssueRow["status"]; onChange: (v: IssueRow["status"]) => void; counts: Record<IssueRow["status"], number> }) {
  return (
    <div className="seg" role="group" aria-label="Status">
      {(["open", "resolved", "dismissed"] as const).map((s) => (
        <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(s)}>
          {s[0]!.toUpperCase() + s.slice(1)} {counts[s]}
        </button>
      ))}
    </div>
  );
}

function SevLegend() {
  return (
    <div className="legend">
      {(["high", "medium", "low"] as const).map((s) => (
        <span key={s}>
          <i className={`sev-${s}`} />
          {SEV_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

function counts(issues: IssueRow[]) {
  return {
    open: issues.filter((i) => i.status === "open").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    dismissed: issues.filter((i) => i.status === "dismissed").length,
  };
}

const SEV_ORDER = { high: 0, medium: 1, low: 2 };

/** The contradictions tracker: pairs of claims in the deck (or against the case) that can't both be true. */
export function Contradictions({ engagementId, issues, hasSlides, canEdit, lastScan }: { engagementId: string; issues: IssueRow[]; hasSlides: boolean; canEdit: boolean; lastScan: string }) {
  const { call, busy, error } = useApi();
  const [status, setStatus] = useState<IssueRow["status"]>("open");
  const shown = issues.filter((i) => i.status === status).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.slideN ?? 0) - (b.slideN ?? 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="toolbar">
        <StatusSeg value={status} onChange={setStatus} counts={counts(issues)} />
        <SevLegend />
        <span className="grow" />
        {lastScan && <span className="muted" style={{ fontSize: 12 }}>Last scan {lastScan}</span>}
        {canEdit && (
          <button type="button" disabled={busy !== null || !hasSlides} onClick={() => call("scan", `/api/engagements/${engagementId}/deck`, { json: { op: "contradictions.scan" } })}>
            {busy ? "Scanning…" : "Scan deck"}
          </button>
        )}
      </div>
      {error && <span className="error">{error}</span>}
      {!hasSlides && <p className="muted">No slides</p>}
      {shown.map((i) => (
        <article key={i.id} className={`panel contra sev-border-${i.severity}`}>
          <div className="group-head">
            <span className={`pill sev-${i.severity}`}>{SEV_LABEL[i.severity]}</span>
            <span style={{ fontWeight: 600, flex: 1 }}>{i.detail}</span>
          </div>
          <div className="contra-pair">
            <div className="contra-side">
              <div className="meta">
                <span className="tag">Slide {i.slideN}</span>
                <span className="clamp" style={{ WebkitLineClamp: 1 }}>{i.slideHeadline}</span>
              </div>
              <blockquote>{i.claim}</blockquote>
            </div>
            <div className="contra-vs" aria-hidden="true">
              ≠
            </div>
            <div className="contra-side">
              <div className="meta">
                <span className="tag">{i.otherRef}</span>
              </div>
              <blockquote>{i.otherClaim}</blockquote>
            </div>
          </div>
          {canEdit && (
            <div style={{ padding: "0 16px 14px" }}>
              <IssueActions engagementId={engagementId} i={i} />
            </div>
          )}
        </article>
      ))}
      {hasSlides && shown.length === 0 && <p className="muted">None</p>}
    </div>
  );
}

export function QualityCheck({
  engagementId,
  issues,
  learnings,
  hasSlides,
  canEdit,
}: {
  engagementId: string;
  issues: IssueRow[];
  learnings: { id: string; rule: string; origin: string }[];
  hasSlides: boolean;
  canEdit: boolean;
}) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/deck`;
  const [status, setStatus] = useState<IssueRow["status"]>("open");
  const [rule, setRule] = useState("");
  const shown = issues.filter((i) => i.status === status).sort((a, b) => (a.slideN ?? 0) - (b.slideN ?? 0) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return (
    <div className="split">
      <div className="primary">
        <div className="toolbar">
          <StatusSeg value={status} onChange={setStatus} counts={counts(issues)} />
          <SevLegend />
          <span className="grow" />
          {canEdit && (
            <button type="button" disabled={busy !== null || !hasSlides} onClick={() => call("qc", url, { json: { op: "qc.run" } })}>
              {busy === "qc" ? "Checking…" : "Run check"}
            </button>
          )}
        </div>
        {error && <span className="error">{error}</span>}
        {!hasSlides && <p className="muted">No slides</p>}
        {shown.map((i) => (
          <div key={i.id} className="item">
            <div className="meta">
              <span className={`pill sev-${i.severity}`}>{SEV_LABEL[i.severity]}</span>
              <span className="tag">Slide {i.slideN}</span>
              <span className="clamp" style={{ WebkitLineClamp: 1 }}>{i.slideHeadline}</span>
            </div>
            <div>{i.detail}</div>
            {i.fix && <div className="muted" style={{ fontSize: 13 }}>Fix: {i.fix}</div>}
            {canEdit && <IssueActions engagementId={engagementId} i={i} />}
          </div>
        ))}
        {hasSlides && shown.length === 0 && <p className="muted">None</p>}
      </div>
      <aside className="side">
        <section className="card">
          <h2 style={{ fontSize: 16 }}>Learnings</h2>
          {learnings.map((l) => (
            <div key={l.id} className="row" style={{ padding: "6px 0" }}>
              <span>
                {l.rule}
                {l.origin && <span className="muted" style={{ fontSize: 12 }}> · {l.origin}</span>}
              </span>
              {canEdit && (
                <button type="button" className="x" aria-label="Delete rule" disabled={busy !== null} onClick={() => call(l.id, url, { json: { op: "learning.delete", id: l.id } })}>
                  ×
                </button>
              )}
            </div>
          ))}
          {learnings.length === 0 && <p className="muted">None</p>}
          {canEdit && (
            <form
              className="toolbar"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await call("rule", url, { json: { op: "learning.add", rule } })) setRule("");
              }}
            >
              <input type="text" value={rule} placeholder="New rule" aria-label="New rule" onChange={(e) => setRule(e.target.value)} style={{ flex: 1 }} />
              <button type="submit" className="small" disabled={busy !== null || !rule.trim()}>
                Add
              </button>
            </form>
          )}
        </section>
      </aside>
    </div>
  );
}
