"use client";

import { CopyButton } from "@/components/CopyButton";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { coverage, money, shortDate, STATUS_LABEL, STATUS_ORDER, type Status } from "@/lib/experts/calc";
import type { ExpertRow, ExpertsData } from "@/lib/experts/data";
import { TRANSCRIPT_ACCEPT } from "@/lib/experts/transcript-text";
import { ExpertForm, type ExpertFormValues } from "./ExpertForm";
import { FullTable, useTableLayout } from "./FullTable";
import { SourceLink } from "./SourceLink";
import { useApi } from "./useApi";
import type { Focus } from "@/lib/experts/focus";
import { canPass, signoffFor, slots, type Signer } from "@/lib/experts/approval";

type Member = Signer & { name: string };

type Tab = "overview" | "guide" | "takeaways";
const VERDICT_LABEL = {
  supports: "Supports",
  challenges: "Challenges",
  new: "New point",
} as const;

export function PipelineView({
  engagementId,
  data,
  canEdit,
  canApprove,
  members,
  me,
  suggestedRequester,
  initialExpert,
  initialTab,
  focus,
}: {
  engagementId: string;
  data: ExpertsData;
  canEdit: boolean;
  canApprove: boolean;
  members: Member[];
  me: string;
  suggestedRequester: string | null;
  initialExpert?: string;
  initialTab?: Tab;
  focus?: Focus | null;
}) {
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sel, setSel] = useState<string | null>(initialExpert ?? data.experts[0]?.id ?? null);
  const [mode, setMode] = useState<"view" | "edit" | "new">(data.experts.length ? "view" : "new");
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  // Whether the expert details are showing. In Simple view they sit beside the table and start open;
  // closing them lets the table take the full width. In Full table they pop out over the table.
  const [drawer, setDrawer] = useState(true);
  const layout = useTableLayout(
    engagementId,
    useMemo(() => data.experts.map((e) => e.id), [data.experts]),
  );
  const api = useApi();
  const base = `/api/engagements/${engagementId}`;
  const sideRef = useRef<HTMLElement>(null);
  // On a phone the details sit below the list; bring them into view when a row is tapped.
  const revealDetails = () =>
    requestAnimationFrame(() => {
      const el = sideRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight - 120) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = focus ? new Map(focus.ids.map((id, i) => [id, i])) : null;
    const rows = data.experts.filter((e) => {
      if (rank && !rank.has(e.id)) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      const topicNames = data.topics.filter((t) => e.topicIds.includes(t.id)).map((t) => t.name);
      return [e.name, e.company, e.title, e.anonTitle, e.network, ...topicNames].join(" ").toLowerCase().includes(q);
    });
    // A focus from Metrics brings its own order (e.g. latest call first).
    return rank ? rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!) : rows;
  }, [data, query, statusFilter, focus]);

  const groups = useMemo(() => {
    const list = data.types.map((t) => ({
      id: t.id,
      name: t.name,
      target: t.target,
    }));
    if (data.experts.some((e) => !e.typeId || !data.types.some((t) => t.id === e.typeId))) {
      list.push({ id: "", name: "No type yet", target: 0 });
    }
    return list.map((g) => {
      const all = data.experts.filter((e) => (g.id ? e.typeId === g.id : !e.typeId || !data.types.some((t) => t.id === e.typeId)));
      return {
        ...g,
        cov: coverage(
          all.map((e) => e.status),
          g.target,
        ),
        rows: visible.filter((e) => all.includes(e)),
      };
    });
  }, [data, visible]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.experts.length };
    for (const e of data.experts) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [data]);

  const expert = data.experts.find((e) => e.id === sel) ?? null;
  const topicName = (id: string) => data.topics.find((t) => t.id === id)?.name;

  // A new expert shows up once the refreshed page data includes it; until then keep the form busy.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!pending || !data.experts.some((e) => e.id === pending)) return;
    setSel(pending);
    setMode("view");
    setTab("overview");
    setPending(null);
  }, [pending, data.experts]);
  async function create(v: ExpertFormValues) {
    const res = await api.call("create", `${base}/experts`, { json: v });
    if (res?.id) setPending(res.id);
  }
  async function save(v: ExpertFormValues) {
    if (!expert) return;
    const res = await api.call("save", `${base}/experts/${expert.id}`, {
      method: "PATCH",
      json: v,
    });
    if (res) setMode("view");
  }
  async function patch(id: string, fields: Partial<ExpertFormValues> & { status?: Status }) {
    return !!(await api.call("cell", `${base}/experts/${id}`, {
      method: "PATCH",
      json: fields,
    }));
  }
  function openExpert(id: string) {
    setSel(id);
    setMode("view");
    setDrawer(true);
    if (!full) revealDetails();
  }
  async function remove() {
    if (!expert || !window.confirm(`Delete ${expert.name}?`)) return;
    const res = await api.call("delete", `${base}/experts/${expert.id}`, { method: "DELETE" });
    if (res) {
      setSel(data.experts.find((e) => e.id !== expert.id)?.id ?? null);
      setMode(data.experts.length > 1 ? "view" : "new");
      setDrawer(false);
    }
  }

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    // Simple view: clicking anywhere outside the panel closes it, except on rows and controls,
    // so picking another expert or using the toolbar keeps it open.
    const onDown = (e: MouseEvent) => {
      if (full) return; // Full table uses its backdrop instead.
      const t = e.target as Element | null;
      if (!t || sideRef.current?.contains(t)) return;
      if (t.closest("button, a, input, select, textarea, label, tr, [role=dialog]")) return;
      setDrawer(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [full, drawer]);

  const setStatus = (e: ExpertRow, status: Status) =>
    api.call("status", `${base}/experts/${e.id}`, {
      method: "PATCH",
      json: { status },
    });

  const details =
    mode === "new" || !expert ? (
      <div className="panel-body">
        <h2 style={{ fontSize: 20 }}>Propose an expert</h2>
        {canEdit ? (
          <ExpertForm
            types={data.types}
            topics={data.topics}
            people={members}
            defaultRequester={suggestedRequester}
            submitLabel="Propose"
            busy={api.busy === "create" || !!pending}
            onSubmit={create}
            onCancel={() => {
              setMode("view");
              setSel(data.experts[0]?.id ?? null);
              if (full) setDrawer(false);
            }}
          />
        ) : (
          <p className="muted">View only</p>
        )}
        {api.error && <p className="error">{api.error}</p>}
      </div>
    ) : mode === "edit" ? (
      <div className="panel-body">
        <h2 style={{ fontSize: 20 }}>Edit {expert.name}</h2>
        <ExpertForm
          key={expert.id}
          types={data.types}
          topics={data.topics}
          initial={expert}
          people={expert.status === "proposed" ? members : undefined}
          submitLabel="Save"
          busy={api.busy === "save"}
          onSubmit={save}
          onCancel={() => setMode("view")}
        />
        <div>
          <button type="button" className="secondary small" disabled={!!api.busy} onClick={remove}>
            Delete expert
          </button>
        </div>
        {api.error && <p className="error">{api.error}</p>}
      </div>
    ) : (
      <ExpertTile
        key={expert.id}
        expert={expert}
        data={data}
        tab={tab}
        setTab={setTab}
        canEdit={canEdit}
        canApprove={canApprove}
        members={members}
        me={me}
        engagementId={engagementId}
        onEdit={() => setMode("edit")}
        onStatus={(s) => setStatus(expert, s)}
        api={api}
      />
    );

  const pct = (n: number, d: number) => (d > 0 ? `${(n / d) * 100}%` : "0%");

  return (
    <div className="split">
      <section className="primary" aria-label="Experts">
        <div className="toolbar">
          <label htmlFor="expert-search" className="sr-only">
            Search experts
          </label>
          <input
            id="expert-search"
            type="text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: "0 1 260px" }}
          />
          <label htmlFor="status-filter" className="sr-only">
            Status
          </label>
          <select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "all")}>
            <option value="all">All statuses ({counts.all ?? 0})</option>
            {[...STATUS_ORDER, "declined" as const].map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
          <div className="seg" role="group" aria-label="Columns">
            <button
              type="button"
              aria-pressed={!full}
              onClick={() => {
                setFull(false);
                setDrawer(true);
              }}
            >
              Simple
            </button>
            <button
              type="button"
              aria-pressed={full}
              onClick={() => {
                setFull(true);
                setDrawer(false);
              }}
            >
              Full table
            </button>
          </div>
          <span className="grow" />
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setMode("new");
                setSel(null);
                setDrawer(true);
                if (!full) revealDetails();
              }}
            >
              + Propose expert
            </button>
          )}
        </div>

        {data.types.length === 0 && (
          <p className="notice">
            <Link href={`/e/${engagementId}/experts/setup`}>Add interviewee types</Link>
          </p>
        )}

        {focus && (
          <div className="focus-chip" role="status">
            <span>
              Showing <strong>{focus.label}</strong> ({focus.ids.length})
            </span>
            <Link href={`/e/${engagementId}/experts`} aria-label="Clear filter and show all calls">
              ✕ Show all
            </Link>
          </div>
        )}
        {focus && focus.ids.length === 0 && <p className="muted">No experts</p>}

        {groups
          .filter((g) => !focus || g.rows.length > 0)
          .map((g) => (
            <div className="group copyable" key={g.id || "none"}>
              <div className="group-head">
                <h2>{g.name}</h2>
                <span className="grow" style={{ flex: 1 }} />
                {g.target > 0 && (
                  <div
                    className="covbar"
                    role="img"
                    aria-label={`${g.cov.completed} completed, ${g.cov.scheduled} scheduled, ${g.cov.approved} approved, ${g.cov.proposed} proposed, of ${g.target}`}
                  >
                    {(["completed", "scheduled", "approved", "proposed"] as const)
                      .filter((st) => g.cov[st] > 0)
                      .map((st) => (
                        <span key={st} className={`seg-${st}`} style={{ width: pct(g.cov[st], g.target) }} />
                      ))}
                  </div>
                )}
                {g.rows.length > 0 && <CopyButton inline title={g.name} />}
              </div>
              {g.rows.length === 0 ? (
                <p className="muted" style={{ padding: "12px 16px", margin: 0, fontSize: 13 }}>
                  {query || statusFilter !== "all" ? "No matches" : "No experts"}
                </p>
              ) : full ? (
                <div className="scroll-x">
                  <FullTable
                    rows={focus ? g.rows : layout.sortRows(g.rows)}
                    data={data}
                    sel={drawer ? sel : null}
                    canEdit={canEdit}
                    canApprove={canApprove}
                    cols={layout.cols}
                    onMoveColumn={layout.moveColumn}
                    onMoveRow={layout.moveRow}
                    onOpen={openExpert}
                    onPatch={patch}
                  />
                </div>
              ) : (
                <div className="scroll-x">
                  <table className="grid" style={{ minWidth: 760, tableLayout: "fixed" }}>
                    <colgroup>
                      <col />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 110 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" style={{ paddingLeft: 16 }}>
                          Expert
                        </th>
                        <th scope="col">Status</th>
                        <th scope="col">Date</th>
                        <th scope="col">Network</th>
                        <th scope="col" className="num">
                          Minutes
                        </th>
                        <th scope="col" className="num" style={{ paddingRight: 16 }}>
                          Honorarium
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((e) => {
                        const est = e.billed ? "" : "~";
                        return (
                          <tr key={e.id} className={drawer && e.id === sel ? "selected" : undefined}>
                            <td style={{ paddingLeft: 16 }}>
                              <button type="button" className="linklike" aria-pressed={drawer && e.id === sel} onClick={() => openExpert(e.id)}>
                                <span style={{ fontWeight: 500 }}>{e.anonTitle || e.name}</span>
                                <span className="muted" style={{ fontSize: 12 }}>
                                  {e.name}
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className={`pill pill-${e.status}`}>{STATUS_LABEL[e.status]}</span>
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{shortDate(e.interviewDate) || <span className="muted">Not booked</span>}</td>
                            <td>{e.network}</td>
                            <td className={`num ${e.billed ? "" : "est"}`}>
                              {est}
                              {e.minutes || (e.billed ? 0 : 60)}
                            </td>
                            <td className={`num ${e.billed ? "" : "est"}`} style={{ paddingRight: 16, fontWeight: 500 }}>
                              {e.status === "declined" ? "—" : est + money(e.honorarium)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        {full && layout.customised && (
          <div>
            <button type="button" className="secondary small" onClick={layout.reset}>
              Reset layout
            </button>
          </div>
        )}
        {full && !drawer && api.error && (
          <p className="error" style={{ margin: 0 }}>
            {api.error}
          </p>
        )}
      </section>

      {!full
        ? drawer && (
            <aside ref={sideRef} className="side panel" aria-label="Expert details" style={{ scrollMarginTop: 72 }}>
              <div className="drawer-close">
                <button type="button" className="secondary small" onClick={() => setDrawer(false)}>
                  Close
                </button>
              </div>
              {details}
            </aside>
          )
        : drawer && (
            <>
              <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
              <aside
                className="drawer panel"
                role="dialog"
                aria-modal="true"
                aria-label="Expert details"
                style={{ width: "min(520px, 100vw)", maxWidth: "100vw", height: "auto" }}
              >
                <div className="drawer-close">
                  <button type="button" className="secondary small" onClick={() => setDrawer(false)}>
                    Close
                  </button>
                </div>
                {details}
              </aside>
            </>
          )}
    </div>
  );
}

function ExpertTile({
  expert,
  data,
  tab,
  setTab,
  canEdit,
  canApprove,
  members,
  me,
  engagementId,
  onEdit,
  onStatus,
  api,
}: {
  expert: ExpertRow;
  data: ExpertsData;
  tab: Tab;
  setTab: (t: Tab) => void;
  canEdit: boolean;
  canApprove: boolean;
  members: Member[];
  me: string;
  engagementId: string;
  onEdit: () => void;
  onStatus: (s: Status) => void;
  api: ReturnType<typeof useApi>;
}) {
  const base = `/api/engagements/${engagementId}`;
  const type = data.types.find((t) => t.id === expert.typeId);
  const at = STATUS_ORDER.indexOf(expert.status);
  const takeaways = data.takeaways.filter((k) => k.expertId === expert.id);
  const transcripts = data.transcripts.filter((t) => t.expertId === expert.id);
  const [guideDraft, setGuideDraft] = useState<string | null>(null);
  const [newKta, setNewKta] = useState("");
  const signoff = { requestedBy: expert.requestedBy, approvals: expert.approvals };
  const mySignoff = expert.status === "proposed" ? signoffFor(signoff, me, members) : null;
  const mayPass = expert.status === "proposed" && canPass(signoff, me, members);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "";

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["guide", "Guide"],
    ["takeaways", `Takeaways${takeaways.length ? ` (${takeaways.length})` : ""}`],
  ];

  return (
    <>
      <div className="panel-body" style={{ paddingBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            {[type?.name, expert.network, shortDate(expert.interviewDate)].filter(Boolean).join(" · ")}
          </div>
          <h2 style={{ fontSize: 22 }}>{expert.name}</h2>
          <div>{[expert.title, expert.company].filter(Boolean).join(", ")}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Anonymized: <strong style={{ color: "var(--ink)" }}>{expert.anonTitle}</strong>
          </div>
        </div>
        {expert.status === "declined" ? (
          <p className="muted" style={{ margin: 0 }}>
            Passed on.{" "}
            {(canApprove || expert.requestedBy === me) && (
              <button type="button" className="secondary small" onClick={() => onStatus("proposed")}>
                Move back to proposed
              </button>
            )}
          </p>
        ) : (
          <ol className="steps" aria-label="Progress">
            {STATUS_ORDER.map((s, i) => (
              <li key={s} className={`${i <= at ? "done" : ""} ${i === at ? "current" : ""}`}>
                <span className={i <= at ? `seg-${s}` : undefined} />
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="ptabs" role="tablist" aria-label="Expert sections">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {tab === "overview" && (
          <>
            <div className="receipt">
              <div>
                <span className="muted">Call</span>
                <span>{expert.callMinutes} min</span>
              </div>
              <div>
                <span className="muted">Follow-up</span>
                <span>{expert.followupMinutes} min</span>
              </div>
              <div>
                <span className="muted">Survey</span>
                <span>{expert.surveyMinutes} min</span>
              </div>
              <div>
                <span className="muted">Hourly rate</span>
                <span>{money(expert.hourlyRate)} / hr</span>
              </div>
              <div>
                <span>{expert.billed ? "Honorarium" : "Estimated honorarium"}</span>
                <span>{money(expert.honorarium)}</span>
              </div>
            </div>
            {expert.topicIds.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {expert.topicIds.map((id) => {
                  const t = data.topics.find((x) => x.id === id);
                  return t ? (
                    <span key={id} className="tag">
                      {t.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {expert.notes && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{expert.notes}</p>}
            {expert.proposedByName && (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Proposed by {expert.proposedByName}
                {expert.requestedByName ? ` · Asked by ${expert.requestedByName}` : ""}
              </p>
            )}
            {expert.status === "proposed" && (
              <ul className="signoffs" aria-label="Approvals">
                {slots(signoff, members).map((s) => (
                  <li key={s.slot} className={s.done ? "done" : ""}>
                    <span aria-hidden>{s.done ? "✓" : "○"}</span>
                    {s.slot === "consultant" ? (s.done ? nameOf(s.by) : "Consultant") : nameOf(expert.requestedBy)}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {mySignoff && (
                  <button type="button" className="act" disabled={!!api.busy} onClick={() => onStatus("approved")}>
                    Approve
                  </button>
                )}
                {mayPass && (
                  <button type="button" className="secondary act" disabled={!!api.busy} onClick={() => onStatus("declined")}>
                    Pass
                  </button>
                )}
                {expert.status === "approved" && (
                  <button type="button" disabled={!!api.busy} onClick={() => onStatus("scheduled")}>
                    Mark scheduled
                  </button>
                )}
                {expert.status === "scheduled" && (
                  <button type="button" disabled={!!api.busy} onClick={() => onStatus("completed")}>
                    Mark completed
                  </button>
                )}
                {transcripts.length > 0 && (
                  <Link
                    className="button secondary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                    }}
                    href={`/e/${engagementId}/experts/transcripts?t=${transcripts[0]!.id}`}
                  >
                    Open transcript
                  </Link>
                )}
                <button type="button" className="secondary" onClick={onEdit}>
                  Edit
                </button>
              </div>
            )}
          </>
        )}

        {tab === "guide" && (
          <>
            {guideDraft !== null ? (
              <>
                <label className="sr-only" htmlFor="guide-edit">
                  Interview guide
                </label>
                <textarea id="guide-edit" rows={18} value={guideDraft} onChange={(e) => setGuideDraft(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={api.busy === "guide-save"}
                    onClick={async () => {
                      const ok = await api.call("guide-save", `${base}/experts/${expert.id}`, {
                        method: "PATCH",
                        json: { guide: guideDraft },
                      });
                      if (ok) setGuideDraft(null);
                    }}
                  >
                    Save guide
                  </button>
                  <button type="button" className="secondary" onClick={() => setGuideDraft(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : expert.guide ? (
              <div className="guide-text">{expert.guide}</div>
            ) : (
              <div className="empty">
                <strong>No guide yet</strong>
              </div>
            )}
            {canEdit && guideDraft === null && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" disabled={api.busy === "guide"} onClick={() => api.call("guide", `${base}/experts/${expert.id}/guide`)}>
                  {api.busy === "guide"
                    ? "Writing…"
                    : expert.guide
                      ? expert.status === "completed"
                        ? "Generate follow-up guide"
                        : "Regenerate"
                      : "Generate guide"}
                </button>
                <button type="button" className="secondary" onClick={() => setGuideDraft(expert.guide ?? "")}>
                  {expert.guide ? "Edit" : "Write my own"}
                </button>
                {expert.guide && (
                  <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(expert.guide ?? "")}>
                    Copy
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {tab === "takeaways" && (
          <>
            {takeaways.length === 0 && (
              <div className="empty">
                <strong>No takeaways yet</strong>
              </div>
            )}
            {takeaways.map((k) => {
              const h = data.hypotheses.find((x) => x.id === k.hypothesisId);
              return (
                <div key={k.id} className={`item ${k.included ? "" : "off"}`}>
                  <div className="kta" style={{ lineHeight: 1.5 }}>
                    {k.body}
                  </div>
                  <div className="meta">
                    <span className={`tag v-${k.verdict}`}>{VERDICT_LABEL[k.verdict]}</span>
                    {h && <span>{[h.slideRef, h.statement].filter(Boolean).join(" · ")}</span>}
                    {k.locator && <SourceLink engagementId={engagementId} transcripts={transcripts} locator={k.locator} />}
                    <span style={{ flex: 1 }} />
                    {canEdit && (
                      <label className="check" style={{ fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={k.included}
                          onChange={(e) =>
                            api.call("kta", `${base}/takeaways/${k.id}`, {
                              method: "PATCH",
                              json: { included: e.target.checked },
                            })
                          }
                        />
                        Use in hypotheses
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
            {canEdit && (
              <>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newKta.trim()) return;
                    const ok = await api.call("kta-add", `${base}/experts/${expert.id}/takeaways`, { json: { body: newKta } });
                    if (ok) setNewKta("");
                  }}
                  style={{ display: "flex", gap: 8 }}
                >
                  <label htmlFor="new-kta" className="sr-only">
                    Add a takeaway
                  </label>
                  <input id="new-kta" type="text" placeholder="New takeaway" value={newKta} onChange={(e) => setNewKta(e.target.value)} />
                  <button type="submit" className="secondary" disabled={api.busy === "kta-add"}>
                    Add
                  </button>
                </form>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {transcripts.length > 0 && (
                    <button
                      type="button"
                      disabled={api.busy === "kta-gen"}
                      onClick={async () => {
                        const res = await api.call("kta-gen", `${base}/experts/${expert.id}/takeaways?generate=1`);
                        if (res?.note) api.setError(res.note);
                      }}
                    >
                      {api.busy === "kta-gen"
                        ? "Reading the transcript…"
                        : takeaways.some((k) => k.source === "ai")
                          ? "Regenerate from transcript"
                          : "Generate from transcript"}
                    </button>
                  )}
                  <TranscriptUpload engagementId={engagementId} expertId={expert.id} api={api} />
                  <Link href={`/e/${engagementId}/experts/ktas`} style={{ alignSelf: "center", fontSize: 13 }}>
                    Open in KTAs
                  </Link>
                </div>
              </>
            )}
          </>
        )}
        {api.error && <p className="error">{api.error}</p>}
      </div>
    </>
  );
}

export function TranscriptUpload({ engagementId, expertId, api }: { engagementId: string; expertId: string; api: ReturnType<typeof useApi> }) {
  const inputId = `upload-${expertId}`;
  return (
    <label
      className="button secondary"
      htmlFor={inputId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        cursor: "pointer",
        border: "1px solid var(--line)",
        background: "var(--surface)",
        color: "var(--ink)",
      }}
    >
      {api.busy === "upload" ? "Uploading…" : api.busy === "clean" ? "Cleaning with AI…" : "Upload transcript"}
      <input
        id={inputId}
        type="file"
        accept={TRANSCRIPT_ACCEPT}
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.set("file", file);
          form.set("kind", "call");
          const res = await api.call("upload", `/api/engagements/${engagementId}/experts/${expertId}/transcripts`, { form });
          e.target.value = "";
          if (res?.id) await api.call("clean", `/api/engagements/${engagementId}/transcripts/${res.id}/clean`);
        }}
      />
    </label>
  );
}
