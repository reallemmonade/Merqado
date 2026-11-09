"use client";

import Link from "next/link";
import { useState } from "react";
import type { TaskStatus } from "@/db/schema";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/roles";
import type { Workplan } from "@/lib/case/data";
import type { CaseMember } from "@/lib/case/page";
import { shortDate, TASK_STATUS_LABEL, todayIso } from "@/lib/case/progress";
import { allowedMoves, dueOf, MOVE_LABEL, primaryMove, reviewerOf } from "@/lib/case/tasks";
import { money } from "@/lib/experts/calc";
import { useApi } from "@/components/experts/useApi";

type Task = Workplan["tasks"][number];

export interface ReviewExpert {
  id: string;
  name: string;
  title: string;
  cost: number;
  proposedBy: string | null;
}

function initials(name: string | undefined) {
  const p = (name ?? "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]![0] : "")).toUpperCase();
}

function useLookups(wp: Workplan, members: CaseMember[]) {
  return {
    nameOf: new Map(members.map((m) => [m.id, m.name])),
    moduleOf: new Map(wp.modules.map((m) => [m.id, m])),
    dateOf: new Map(wp.milestones.map((m) => [m.id, m.date])),
  };
}

const COLUMNS: TaskStatus[] = ["not_yet", "in_progress", "almost_done", "done"];

/** The signed-in person's tasks, as cards in a column per status. */
export function MyTasks({ engagementId, wp, tasks, members, canEdit, me }: { engagementId: string; wp: Workplan; tasks: Task[]; members: CaseMember[]; canEdit: boolean; me: string }) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/workplan`;
  const { nameOf, moduleOf, dateOf } = useLookups(wp, members);
  const today = todayIso();

  if (tasks.length === 0) return <div className="empty"><strong>No tasks</strong></div>;

  return (
    <>
      <div className="kanban">
        {COLUMNS.map((s) => {
          const col = tasks.filter((t) => t.status === s);
          return (
            <section key={s} className="kanban-col" aria-label={TASK_STATUS_LABEL[s]}>
              <div className="kanban-head">
                <span className={`pill ts-${s}`}>{TASK_STATUS_LABEL[s]}</span>
                <span className="mono">{col.length}</span>
              </div>
              {col.map((t) => {
                const mod = moduleOf.get(t.moduleId);
                const lead = mod?.leadId ?? null;
                const next = primaryMove(t, me, canEdit, lead);
                const back = s === "almost_done" && allowedMoves(t, me, canEdit, lead).includes("in_progress");
                const due = dueOf(t, dateOf);
                const reviewer = reviewerOf(t, lead);
                const late = due && due < today && s !== "done";
                return (
                  <article key={t.id} id={`task-${t.id}`} className={`task-card${t.reviewNote && s === "in_progress" ? " sent-back" : ""}`}>
                    <div className="task-meta">
                      <span>{mod?.name}</span>
                      {reviewer && reviewer !== me && (
                        <span className="avatar sm" title={nameOf.get(reviewer)}>
                          {initials(nameOf.get(reviewer))}
                        </span>
                      )}
                    </div>
                    <strong>{t.title}</strong>
                    {t.reviewNote && s === "in_progress" && <p className="task-note">{t.reviewNote}</p>}
                    {due && <span className={`mono${late ? " late" : ""}`}>{shortDate(due)}</span>}
                    {next && (
                      <button type="button" className={next === "almost_done" ? "review-btn" : undefined} disabled={busy !== null} onClick={() => call(t.id, url, { json: { op: "task.update", id: t.id, status: next } })}>
                        {MOVE_LABEL[next]}
                      </button>
                    )}
                    {back && !next && (
                      <button type="button" className="secondary" disabled={busy !== null} onClick={() => call(t.id, url, { json: { op: "task.update", id: t.id, status: "in_progress" } })}>
                        Undo
                      </button>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** Work waiting on the signed-in person: tasks ready for review, and experts to approve. */
export function ReviewList({
  engagementId,
  wp,
  tasks,
  experts,
  members,
  canEdit,
}: {
  engagementId: string;
  wp: Workplan;
  tasks: Task[];
  experts: ReviewExpert[];
  members: CaseMember[];
  canEdit: boolean;
}) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/workplan`;
  const { nameOf, moduleOf, dateOf } = useLookups(wp, members);
  const [kind, setKind] = useState<"all" | "tasks" | "experts">("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (tasks.length + experts.length === 0) return <div className="empty"><strong>Nothing to review</strong></div>;

  const setExpert = (id: string, status: "approved" | "declined") =>
    call(id, `/api/engagements/${engagementId}/experts/${id}`, { method: "PATCH", json: { status } });

  return (
    <>
      <div className="seg" role="group" aria-label="Show" style={{ alignSelf: "flex-start" }}>
        {(
          [
            ["all", `All ${tasks.length + experts.length}`],
            ["tasks", `Tasks ${tasks.length}`],
            ["experts", `Experts ${experts.length}`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="group">
        <table className="grid review-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Kind</th>
              <th>From</th>
              <th>Due</th>
              <th style={{ width: 360 }} />
            </tr>
          </thead>
          <tbody>
            {kind !== "experts" &&
              tasks.map((t) => (
                <tr key={t.id} id={`task-${t.id}`}>
                  <td>
                    <strong>{t.title}</strong>
                    <div className="muted">{moduleOf.get(t.moduleId)?.name}</div>
                  </td>
                  <td>
                    <span className="pill ts-almost_done">Task</span>
                  </td>
                  <td>{t.assigneeId ? nameOf.get(t.assigneeId) : ""}</td>
                  <td className="mono">{shortDate(dueOf(t, dateOf))}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label className="sr-only" htmlFor={`note-${t.id}`}>
                        Note
                      </label>
                      <input
                        id={`note-${t.id}`}
                        type="text"
                        placeholder="Note"
                        value={notes[t.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" style={{ flex: 1 }} disabled={!canEdit || busy !== null} onClick={() => call(t.id, url, { json: { op: "task.update", id: t.id, status: "done" } })}>
                          Done
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          style={{ flex: 1 }}
                          disabled={!canEdit || busy !== null}
                          onClick={() => call(t.id, url, { json: { op: "task.update", id: t.id, status: "in_progress", note: notes[t.id] ?? "" } })}
                        >
                          Send back
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            {kind !== "tasks" &&
              experts.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/e/${engagementId}/experts?expert=${e.id}`}>
                      <strong>{e.name}</strong>
                    </Link>
                    <div className="muted">
                      {e.title} · ~{money(e.cost)}
                    </div>
                  </td>
                  <td>
                    <span className="pill pill-proposed">Expert</span>
                  </td>
                  <td>{e.proposedBy ?? ""}</td>
                  <td />
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" style={{ flex: 1 }} disabled={busy !== null} onClick={() => setExpert(e.id, "approved")}>
                        Approve
                      </button>
                      <button type="button" className="secondary" style={{ flex: 1 }} disabled={busy !== null} onClick={() => setExpert(e.id, "declined")}>
                        Pass
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** Who plays which role on this case. A blank role follows the person's firm title. */
export function TeamRoles({ engagementId, members, canSet }: { engagementId: string; members: CaseMember[]; canSet: boolean }) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/workplan`;
  return (
    <>
      <div className="group">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th style={{ width: 260 }}>Role on case</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="muted">{m.title}</td>
                <td>
                  {canSet ? (
                    <select
                      aria-label={`Role for ${m.name}`}
                      value={m.caseRole ?? ""}
                      disabled={busy !== null}
                      onChange={(e) => call(m.id, url, { json: { op: "member.role", userId: m.id, role: e.target.value || null } })}
                    >
                      <option value="">{ROLE_LABEL[m.firmArchetype]} (title)</option>
                      {ROLE_ORDER.map((a) => (
                        <option key={a} value={a}>
                          {ROLE_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABEL[m.archetype]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
