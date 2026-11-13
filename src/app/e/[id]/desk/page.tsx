import Link from "next/link";
import { CaseShell } from "@/components/case/CaseShell";
import { loadWorkplan } from "@/lib/case/data";
import { buildDesk, type Workstream } from "@/lib/case/desk";
import { loadCase } from "@/lib/case/page";
import { shortDate, TASK_STATUS_LABEL } from "@/lib/case/progress";
import { localTime } from "@/lib/cron/time-zone";
import { flagLabel } from "@/lib/inbox/flags";

export const dynamic = "force-dynamic";

function initials(name: string | undefined) {
  const p = (name ?? "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]![0] : "")).toUpperCase();
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export default async function DeskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ws?: string; view?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const mineOnly = sp.view === "mine";
  const ctx = await loadCase(id, "/desk");
  const me = ctx.user.id;
  const now = new Date();
  const wp = await loadWorkplan(ctx.db, id);
  let desk: Workstream[] = buildDesk(wp, me, now, localTime(now, ctx.user.timeZone).date);
  if (mineOnly) {
    desk = desk
      .map((w) => ({ ...w, tasks: w.tasks.filter((t) => t.assigneeId === me || t.mineToReview) }))
      .filter((w) => w.leadId === me || w.tasks.length > 0);
  }
  const nameOf = new Map(ctx.members.map((m) => [m.id, m.name]));
  const base = `/e/${id}/desk`;
  const href = (ws: string | undefined, view = mineOnly ? "mine" : undefined) => {
    const q = new URLSearchParams();
    if (ws) q.set("ws", ws);
    if (view) q.set("view", view);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const sel = desk.find((w) => w.id === sp.ws) ?? desk[0];

  return (
    <CaseShell ctx={ctx} section="desk" title="Desk">
      <nav className="seg" aria-label="Desk view" style={{ alignSelf: "flex-start" }}>
        <Link href={href(sp.ws, undefined)} className="seg-link" aria-current={!mineOnly ? "page" : undefined}>
          All
        </Link>
        <Link href={href(sp.ws, "mine")} className="seg-link" aria-current={mineOnly ? "page" : undefined}>
          Mine
        </Link>
      </nav>
      {!sel ? (
        <div className="empty">
          <strong>No workstreams</strong>
          <Link href={`/e/${id}/workplan`} className="button-link">
            Workplan
          </Link>
        </div>
      ) : (
        <div className="desk">
          <nav className="card desk-list" aria-label="Workstreams">
            {desk.map((w) => (
              <Link key={w.id} href={href(w.id)} className="desk-ws" aria-current={w.id === sel.id ? "page" : undefined}>
                <span className="avatar sm" title={w.leadId ? nameOf.get(w.leadId) : undefined}>
                  {w.leadId ? initials(nameOf.get(w.leadId)) : ""}
                </span>
                <span className="desk-ws-main">
                  <span className="desk-ws-name">
                    {w.name}
                    {w.needs > 0 && <span className="seg-count">{w.needs}</span>}
                  </span>
                  <span className="desk-bar" title={`${w.counts.done}/${w.counts.total}`}>
                    <span className="ts-done" style={{ width: `${pct(w.counts.done, w.counts.total)}%` }} />
                    <span className="ts-in_progress" style={{ width: `${pct(w.counts.in_progress + w.counts.almost_done, w.counts.total)}%` }} />
                  </span>
                </span>
                <span className="mono">
                  {w.counts.done}/{w.counts.total}
                </span>
              </Link>
            ))}
          </nav>
          <section className="desk-focus" aria-label={sel.name}>
            <div className="card desk-tasks">
              <div className="desk-head">
                <h2>{sel.name}</h2>
                <span className="mono">
                  {sel.counts.done}/{sel.counts.total}
                </span>
              </div>
              {sel.tasks.length === 0 ? (
                <div className="empty">
                  <strong>No tasks</strong>
                </div>
              ) : (
                <ul className="desk-task-list">
                  {sel.tasks.map((t) => (
                    <li key={t.id} className={t.mineToReview ? "mine" : undefined}>
                      <span className={`pill ts-${t.status}`}>{TASK_STATUS_LABEL[t.status]}</span>
                      <span className="desk-task-title">{t.title}</span>
                      {t.flag ? (
                        <span className={`mono${t.flag.flag === "overdue" ? " late" : ""}`}>{flagLabel(t.flag)}</span>
                      ) : (
                        t.due && <span className="mono">{shortDate(t.due)}</span>
                      )}
                      <span className="avatar sm" title={t.assigneeId ? nameOf.get(t.assigneeId) : undefined}>
                        {t.assigneeId ? initials(nameOf.get(t.assigneeId)) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/e/${id}/workplan`} className="desk-more">
                Workplan
              </Link>
            </div>
            <div className="card desk-team">
              <h3>Team</h3>
              <ul>
                {sel.people.map((p) => (
                  <li key={p}>
                    <span className="avatar sm">{initials(nameOf.get(p))}</span>
                    <span>{nameOf.get(p)}</span>
                    {p === sel.leadId && <span className="mono">Lead</span>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </CaseShell>
  );
}
