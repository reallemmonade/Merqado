import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { SampleButton } from "@/components/case/SampleButton";
import { TaskCheck } from "@/components/case/TaskCheck";
import { caseBudgets, chatRooms, experts, expertTypes, hypotheses, keyTakeaways, sources } from "@/db/schema";
import { loadDeck, loadNotes, loadWorkplan } from "@/lib/case/data";
import { loadCase } from "@/lib/case/page";
import { progressPct, shortDate, TASK_STATUS_LABEL, timelinePct, todayIso } from "@/lib/case/progress";
import { checkMove, dueOf, reviewerOf } from "@/lib/case/tasks";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ todo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id);
  const { db, user } = ctx;
  const team = sp.todo === "team";
  const canApprove = can(ctx.access, "approve_experts");

  const [wp, notes, deck, hyps, takeaways, expertRows, types, budget, rooms, files] = await Promise.all([
    loadWorkplan(db, id),
    loadNotes(db, id, user.id),
    loadDeck(db, id),
    db.select().from(hypotheses).where(eq(hypotheses.engagementId, id)).orderBy(asc(hypotheses.sort)),
    db.select().from(keyTakeaways).where(and(eq(keyTakeaways.engagementId, id), eq(keyTakeaways.included, true))),
    db.select().from(experts).where(eq(experts.engagementId, id)),
    db.select().from(expertTypes).where(eq(expertTypes.engagementId, id)).orderBy(asc(expertTypes.sort)),
    db.query.caseBudgets.findFirst({ where: eq(caseBudgets.engagementId, id) }),
    db.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.engagementId, id)),
    db.select({ id: sources.id }).from(sources).where(eq(sources.engagementId, id)),
  ]);

  const base = `/e/${id}`;
  const today = todayIso();
  const nameOf = new Map(ctx.members.map((m) => [m.id, m.name]));
  const milestones = wp.milestones;
  const start = milestones[0]?.date;
  const end = milestones[milestones.length - 1]?.date;
  const nextMilestone = milestones.find((m) => m.date >= today);

  const leadOf = new Map(wp.modules.map((m) => [m.id, m.leadId]));
  const openTasks = wp.tasks.filter(
    (t) =>
      t.status !== "done" &&
      (team || t.assigneeId === user.id || (t.status === "almost_done" && reviewerOf(t, leadOf.get(t.moduleId)) === user.id)),
  );
  const proposed = expertRows.filter((e) => e.status === "proposed");
  const openItems = notes.filter((n) => n.kind === "open" && !n.resolved);
  const decisions = notes.filter((n) => n.kind === "decision");
  const openContradictions = deck.issues.filter((i) => i.kind === "contradiction" && i.status === "open");
  const milestoneOf = new Map(milestones.map((m) => [m.id, m]));
  const milestoneDate = new Map(milestones.map((m) => [m.id, m.date]));

  const setup = [
    { label: "Workplan", done: wp.modules.length > 0, href: "/workplan" },
    { label: "Team chats", done: rooms.length > 0, href: "/channel" },
    { label: "Experts", done: expertRows.length > 0, href: "/experts" },
    { label: "Hypotheses", done: hyps.length > 0, href: "/experts/ktas" },
    { label: "Files", done: files.length > 0, href: "/files" },
    { label: "Deck", done: deck.slides.length > 0, href: "/deck" },
  ];
  const setupDone = setup.filter((s) => s.done).length;

  const completed = expertRows.filter((e) => e.status === "completed").length;
  const scheduled = expertRows.filter((e) => e.status === "scheduled").length;
  const planned = budget?.plannedInterviews ?? 0;

  return (
    <CaseShell ctx={ctx} section="overview" title="Overview">
      {setupDone === 0 && ctx.canEdit && (
        <div className="empty">
          <strong>Empty case</strong>
          <SampleButton engagementId={id} />
        </div>
      )}

      {milestones.length > 0 && start && end && (
        <section className="card">
          <div className="toolbar">
            <h2 style={{ fontSize: 16 }}>Timeline</h2>
            <span className="grow" />
            {nextMilestone && (
              <span className="muted" style={{ fontSize: 13 }}>
                Next: {nextMilestone.label} · {shortDate(nextMilestone.date)}
              </span>
            )}
          </div>
          <div className="tl" role="list">
            <div className="tl-track">
              <span className="tl-fill" style={{ width: `${timelinePct(today, start, end)}%` }} />
            </div>
            {milestones.map((m) => (
              <div key={m.id} role="listitem" className={`tl-point${m.date < today ? " past" : ""}`} style={{ left: `${timelinePct(m.date, start, end)}%` }}>
                <i />
                <span className="tl-label">{m.label}</span>
                <span className="mono">{shortDate(m.date)}</span>
              </div>
            ))}
            {today >= start && today <= end && (
              <div className="tl-today" style={{ left: `${timelinePct(today, start, end)}%` }}>
                Today
              </div>
            )}
          </div>
        </section>
      )}

      {wp.modules.length > 0 && (
        <section className="tiles" aria-label="Modules">
          {wp.modules.map((m) => {
            const tasks = wp.tasks.filter((t) => t.moduleId === m.id);
            const pct = progressPct(tasks);
            return (
              <Link key={m.id} href={`${base}/workplan`} className="card mod-card">
                <span style={{ fontWeight: 600 }}>{m.name}</span>
                <span className="tile-value" style={{ fontSize: 22 }}>{pct}%</span>
                <span className="bar">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{m.leadId ? nameOf.get(m.leadId) : ""}</span>
              </Link>
            );
          })}
        </section>
      )}

      <div className="split">
        <div className="primary">
          <section className="panel">
            <div className="group-head">
              <h2>To do</h2>
              <span className="grow" style={{ flex: 1 }} />
              <nav className="seg" aria-label="Whose to-dos">
                <Link href={base} className="seg-link" aria-current={!team ? "page" : undefined}>
                  Mine
                </Link>
                <Link href={`${base}?todo=team`} className="seg-link" aria-current={team ? "page" : undefined}>
                  Team
                </Link>
              </nav>
            </div>
            <div className="panel-body" style={{ gap: 0 }}>
              {openTasks.map((t) => (
                <div className="row todo" key={t.id}>
                  <label className="check" style={{ flex: 1 }}>
                    <TaskCheck
                      engagementId={id}
                      taskId={t.id}
                      next={checkMove(t, user.id, ctx.canEdit, leadOf.get(t.moduleId))}
                      label={t.title}
                    />
                    <span>{t.title}</span>
                  </label>
                  <span className="meta">
                    {team && t.assigneeId && <span>{nameOf.get(t.assigneeId)}</span>}
                    {dueOf(t, milestoneDate) && <span>{shortDate(dueOf(t, milestoneDate))}</span>}
                    <span className={`pill ts-${t.status}`}>{TASK_STATUS_LABEL[t.status]}</span>
                  </span>
                </div>
              ))}
              {(canApprove || team) &&
                proposed.map((e) => (
                  <div className="row todo" key={e.id}>
                    <Link href={`${base}/experts?expert=${e.id}`} style={{ flex: 1 }}>
                      Approve {[e.firstName, e.lastName].filter(Boolean).join(" ")}
                    </Link>
                    <span className="pill pill-proposed">Proposed</span>
                  </div>
                ))}
              {openContradictions.length > 0 && (
                <div className="row todo">
                  <Link href={`${base}/deck/contradictions`} style={{ flex: 1 }}>
                    Contradictions in the deck
                  </Link>
                  <span className="pill sev-high">{openContradictions.length}</span>
                </div>
              )}
              {openItems.map((n) => (
                <div className="row todo" key={n.id}>
                  <Link href={`${base}/notes`} style={{ flex: 1 }}>
                    {n.body}
                  </Link>
                  <span className="tag">Open</span>
                </div>
              ))}
              {openTasks.length + openItems.length + proposed.length + openContradictions.length === 0 && <p className="muted">Nothing open</p>}
            </div>
          </section>

          <section className="panel">
            <div className="group-head">
              <h2>Hypotheses</h2>
            </div>
            <div className="panel-body" style={{ gap: 0 }}>
              {hyps.map((h) => {
                const mine = takeaways.filter((k) => k.hypothesisId === h.id);
                const sup = mine.filter((k) => k.verdict === "supports").length;
                const chal = mine.filter((k) => k.verdict === "challenges").length;
                return (
                  <div className="row" key={h.id}>
                    <Link href={`${base}/experts/ktas`} style={{ flex: 1 }}>
                      {h.statement}
                    </Link>
                    <span className="meta">
                      <span className="tag v-supports">{sup} supports</span>
                      <span className="tag v-challenges">{chal} challenges</span>
                    </span>
                  </div>
                );
              })}
              {hyps.length === 0 && <p className="muted">No hypotheses</p>}
            </div>
          </section>
        </div>

        <div className="side" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="card">
            <div className="toolbar">
              <h2 style={{ fontSize: 16 }}>Interviews</h2>
              <span className="grow" />
              <span className="mono">
                {completed}/{planned || expertRows.length}
              </span>
            </div>
            <span className="covbar big">
              <span className="seg-completed" style={{ width: `${pctOf(completed, planned || expertRows.length)}%` }} />
              <span className="seg-scheduled" style={{ width: `${pctOf(scheduled, planned || expertRows.length)}%` }} />
            </span>
            <div className="legend">
              <span><i className="seg-completed" />Completed</span>
              <span><i className="seg-scheduled" />Scheduled</span>
            </div>
            {types.map((t) => {
              const rows = expertRows.filter((e) => e.typeId === t.id);
              return (
                <div className="row" key={t.id} style={{ padding: "6px 0" }}>
                  <span>{t.name}</span>
                  <span className="mono">
                    {rows.filter((e) => e.status === "completed").length}/{t.target || rows.length}
                  </span>
                </div>
              );
            })}
          </section>

          <section className="card">
            <h2 style={{ fontSize: 16 }}>Decisions</h2>
            {decisions.slice(0, 6).map((n) => (
              <div className="row" key={n.id} style={{ padding: "6px 0" }}>
                <span>{n.body}</span>
                <span className="mono">{shortDate(isoOf(n.createdAt))}</span>
              </div>
            ))}
            {decisions.length === 0 && <p className="muted">None</p>}
          </section>

          <section className="card">
            <div className="toolbar">
              <h2 style={{ fontSize: 16 }}>Case setup</h2>
              <span className="grow" />
              <span className="mono">
                {setupDone}/{setup.length}
              </span>
            </div>
            <div className="setup-list">
              {setup.map((s) => (
                <Link key={s.label} href={base + s.href} className={s.done ? "done" : undefined}>
                  <span aria-hidden="true">{s.done ? "✓" : "○"}</span>
                  {s.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </CaseShell>
  );
}

function pctOf(n: number, total: number) {
  return total > 0 ? Math.min(100, (n / total) * 100) : 0;
}

function isoOf(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}
