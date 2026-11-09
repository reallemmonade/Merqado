"use client";

import { useState } from "react";
import type { TaskStatus } from "@/db/schema";
import type { Workplan } from "@/lib/case/data";
import type { CaseMember } from "@/lib/case/page";
import { shortDate, TASK_STATUS_LABEL, todayIso } from "@/lib/case/progress";
import { MOVE_LABEL, primaryMove, reviewerOf } from "@/lib/case/tasks";
import { useApi } from "@/components/experts/useApi";
import { SampleButton } from "./SampleButton";

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]![0] : "")).toUpperCase();
}

export function WorkplanGrid({ engagementId, wp, members, canEdit, canAssign, canPlan, me }: { engagementId: string; wp: Workplan; members: CaseMember[]; canEdit: boolean; canAssign: boolean; canPlan: boolean; me: string }) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/workplan`;
  const [who, setWho] = useState<string>("all");
  const [newModule, setNewModule] = useState("");
  const [newDate, setNewDate] = useState({ label: "", date: "" });
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", assigneeId: "", reviewerId: me, dueDate: "" });

  const columns = wp.milestones.filter((m) => m.isColumn);
  const hasUndated = wp.tasks.some((t) => !t.milestoneId || !columns.some((c) => c.id === t.milestoneId));
  const cols: { id: string | null; label: string; date: string }[] = [
    ...columns.map((c) => ({ id: c.id as string | null, label: c.label, date: c.date })),
    ...(hasUndated || columns.length === 0 ? [{ id: null, label: "No date", date: "" }] : []),
  ];
  const today = todayIso();
  const nextCol = columns.find((c) => c.date >= today)?.id;
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  if (wp.modules.length === 0 && !canPlan) return <p className="muted">No workplan</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Show tasks for">
          <button type="button" aria-pressed={who === "all"} onClick={() => setWho("all")}>
            All
          </button>
          {members.map((m) => (
            <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => setWho(m.id)}>
              {m.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <span className="grow" />
        <div className="legend">
          {(["not_yet", "in_progress", "almost_done", "done"] as TaskStatus[]).map((s) => (
            <span key={s}>
              <i className={`ts-${s}`} />
              {TASK_STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {wp.modules.length === 0 ? (
        <div className="empty">
          <strong>No workplan</strong>
          <SampleButton engagementId={engagementId} />
        </div>
      ) : (
        <div className="group scroll-x">
          <table className="grid workplan" style={{ minWidth: 300 + cols.length * 260 }}>
            <thead>
              <tr>
                <th style={{ width: 200 }}>Module</th>
                {cols.map((c) => (
                  <th key={c.id ?? "none"} id={c.id ? `ms-${c.id}` : undefined} className={c.id && c.id === nextCol ? "wp-next" : undefined}>
                    <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{c.label}</div>
                    <div className="mono">{c.date ? shortDate(c.date) : ""}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wp.modules.map((m) => (
                <tr key={m.id} id={`mod-${m.id}`}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <strong>{m.name}</strong>
                      {canPlan ? (
                        <select
                          aria-label={`Lead for ${m.name}`}
                          value={m.leadId ?? ""}
                          onChange={(e) => call("lead", url, { json: { op: "module.update", id: m.id, leadId: e.target.value || null } })}
                          style={{ fontSize: 12, padding: "4px 6px" }}
                        >
                          <option value="">Lead</option>
                          {members.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {m.leadId ? memberName.get(m.leadId) : ""}
                        </span>
                      )}
                      {canPlan && (
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={() => confirm(`Delete ${m.name} and its tasks?`) && call("del", url, { json: { op: "module.delete", id: m.id } })}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                  {cols.map((c) => {
                    const key = `${m.id}:${c.id ?? "none"}`;
                    const tasks = wp.tasks.filter(
                      (t) => t.moduleId === m.id && (c.id ? t.milestoneId === c.id : !t.milestoneId || !columns.some((x) => x.id === t.milestoneId)),
                    );
                    return (
                      <td key={key} className={c.id && c.id === nextCol ? "wp-next" : undefined}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {tasks.map((t) => {
                            const next = primaryMove(t, me, canEdit, m.leadId);
                            const reviewer = reviewerOf(t, m.leadId);
                            const manages = canAssign && (reviewer === null || reviewer === me || t.createdBy === me);
                            return (
                            <div key={t.id} id={`task-${t.id}`} className="wp-task" style={{ opacity: who === "all" || t.assigneeId === who ? 1 : 0.35 }}>
                              <span className="avatar" title={t.assigneeId ? memberName.get(t.assigneeId) : "Unassigned"}>
                                {t.assigneeId ? initials(memberName.get(t.assigneeId) ?? "?") : "–"}
                              </span>
                              <span style={{ flex: 1, lineHeight: 1.35 }}>{t.title}</span>
                              <button
                                type="button"
                                className={`ts-btn ts-${t.status}`}
                                disabled={!next || busy !== null}
                                title={next ? MOVE_LABEL[next] : undefined}
                                aria-label={next ? `${TASK_STATUS_LABEL[t.status]}. ${MOVE_LABEL[next]}` : TASK_STATUS_LABEL[t.status]}
                                onClick={() => next && call("st", url, { json: { op: "task.update", id: t.id, status: next } })}
                              >
                                {TASK_STATUS_LABEL[t.status]}
                              </button>
                              {manages && (
                                <button type="button" className="x" aria-label={`Delete ${t.title}`} onClick={() => call("del", url, { json: { op: "task.delete", id: t.id } })}>
                                  ×
                                </button>
                              )}
                            </div>
                            );
                          })}
                          {canAssign &&
                            (adding === key ? (
                              <form
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  const res = await call("add", url, {
                                    json: {
                                      op: "task.add",
                                      moduleId: m.id,
                                      milestoneId: c.id,
                                      title: draft.title,
                                      assigneeId: draft.assigneeId || null,
                                      reviewerId: draft.reviewerId || null,
                                      dueDate: draft.dueDate || null,
                                    },
                                  });
                                  if (res) {
                                    setDraft({ ...draft, title: "", dueDate: "" });
                                    setAdding(null);
                                  }
                                }}
                                style={{ display: "flex", flexDirection: "column", gap: 6 }}
                              >
                                <label className="sr-only" htmlFor={`t-${key}`}>
                                  Task
                                </label>
                                <input id={`t-${key}`} type="text" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Task" />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <select aria-label="Assign to" value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })} style={{ flex: 1 }}>
                                    <option value="">Unassigned</option>
                                    {members.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                  <input type="date" aria-label="Due" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} style={{ flex: 1 }} />
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <select aria-label="Reviewer" value={draft.reviewerId} onChange={(e) => setDraft({ ...draft, reviewerId: e.target.value })} style={{ flex: 1 }}>
                                    {members.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.id === me ? "Review: me" : `Review: ${p.name}`}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="submit" className="small" disabled={!draft.title.trim() || busy !== null}>
                                    Add
                                  </button>
                                  <button type="button" className="small secondary" onClick={() => setAdding(null)}>
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button type="button" className="linkbtn" onClick={() => setAdding(key)}>
                                + Add task
                              </button>
                            ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canPlan && (
        <div className="toolbar">
          <form
            className="toolbar"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call("mod", url, { json: { op: "module.add", name: newModule } })) setNewModule("");
            }}
          >
            <label className="sr-only" htmlFor="new-module">
              Module name
            </label>
            <input id="new-module" type="text" value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="Module" style={{ width: 200 }} />
            <button type="submit" className="secondary" disabled={!newModule.trim()}>
              + Add module
            </button>
          </form>
          <form
            className="toolbar"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call("ms", url, { json: { op: "milestone.add", label: newDate.label, date: newDate.date } })) setNewDate({ label: "", date: "" });
            }}
          >
            <label className="sr-only" htmlFor="new-ms">
              Client update
            </label>
            <input id="new-ms" type="text" value={newDate.label} onChange={(e) => setNewDate({ ...newDate, label: e.target.value })} placeholder="Client update" style={{ width: 180 }} />
            <label className="sr-only" htmlFor="new-ms-date">
              Date
            </label>
            <input id="new-ms-date" type="date" value={newDate.date} onChange={(e) => setNewDate({ ...newDate, date: e.target.value })} style={{ width: 160 }} />
            <button type="submit" className="secondary" disabled={!newDate.label.trim() || !newDate.date}>
              + Add date
            </button>
          </form>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
