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

/** Text you click to rename. Enter or clicking away saves, Escape cancels. */
function Inline({ value, label, onSave, strong }: { value: string; label: string; onSave: (v: string) => void; strong?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <button type="button" className="cell-edit" style={{ padding: "2px 4px", margin: "-2px -4px", minHeight: 0, width: "auto", fontWeight: strong ? 600 : undefined }} aria-label={`Rename ${label}`} onClick={() => setDraft(value)}>
        {value}
      </button>
    );
  const done = () => {
    const v = draft.trim();
    setDraft(null);
    if (v && v !== value) onSave(v);
  };
  return (
    <input
      type="text"
      className="cell-input"
      aria-label={label}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

type TaskDraft = { title: string; assigneeId: string; reviewerId: string; dueDate: string };

function TaskForm({ id, init, members, me, busy, submit, cancel, saveLabel }: { id: string; init: TaskDraft; members: CaseMember[]; me: string; busy: boolean; submit: (d: TaskDraft) => Promise<boolean>; cancel: () => void; saveLabel: string }) {
  const [draft, setDraft] = useState(init);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await submit(draft)) setDraft({ ...draft, title: "", dueDate: "" });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <label className="sr-only" htmlFor={`t-${id}`}>
        Task
      </label>
      <input id={`t-${id}`} type="text" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === "Escape" && cancel()} placeholder="Task" />
      <div style={{ display: "flex", gap: 6 }}>
        <select aria-label="Assign to" value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })} style={{ flex: 1, minWidth: 0 }}>
          <option value="">Unassigned</option>
          {members.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" aria-label="Due" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <select aria-label="Reviewer" value={draft.reviewerId} onChange={(e) => setDraft({ ...draft, reviewerId: e.target.value })} style={{ flex: 1, minWidth: 0 }}>
          {members.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === me ? "Review: me" : `Review: ${p.name}`}
            </option>
          ))}
        </select>
        <button type="submit" className="small" disabled={!draft.title.trim() || busy}>
          {saveLabel}
        </button>
        <button type="button" className="small secondary" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function WorkplanGrid({ engagementId, wp, members, canEdit, canAssign, canPlan, me }: { engagementId: string; wp: Workplan; members: CaseMember[]; canEdit: boolean; canAssign: boolean; canPlan: boolean; me: string }) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/workplan`;
  const [who, setWho] = useState<string>("all");
  const [newModule, setNewModule] = useState("");
  const [newDate, setNewDate] = useState({ label: "", date: "" });
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

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
                <th className="wp-mod-col">Module</th>
                {cols.map((c) => (
                  <th key={c.id ?? "none"} id={c.id ? `ms-${c.id}` : undefined} className={c.id && c.id === nextCol ? "wp-next" : undefined} style={{ minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>
                      {canPlan && c.id ? <Inline value={c.label} label={c.label} onSave={(label) => call("ms", url, { json: { op: "milestone.update", id: c.id, label } })} /> : c.label}
                      {canPlan && c.id && (
                        <button type="button" className="x" aria-label={`Delete ${c.label}`} disabled={busy !== null} onClick={() => confirm(`Delete ${c.label}?`) && call("ms", url, { json: { op: "milestone.delete", id: c.id } })}>
                          ×
                        </button>
                      )}
                    </div>
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
                      {canPlan ? <Inline value={m.name} label={m.name} strong onSave={(name) => call("mod", url, { json: { op: "module.update", id: m.id, name } })} /> : <strong>{m.name}</strong>}
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
                            if (editing === t.id)
                              return (
                                <TaskForm
                                  key={t.id}
                                  id={t.id}
                                  init={{ title: t.title, assigneeId: t.assigneeId ?? "", reviewerId: t.reviewerId ?? reviewer ?? me, dueDate: t.dueDate ?? "" }}
                                  members={members}
                                  me={me}
                                  busy={busy !== null}
                                  saveLabel="Save"
                                  cancel={() => setEditing(null)}
                                  submit={async (d) => {
                                    const res = await call("edit", url, { json: { op: "task.update", id: t.id, title: d.title, assigneeId: d.assigneeId || null, reviewerId: d.reviewerId || null, dueDate: d.dueDate || null } });
                                    if (res) setEditing(null);
                                    return false;
                                  }}
                                />
                              );
                            return (
                            <div key={t.id} id={`task-${t.id}`} className="wp-task" style={{ opacity: who === "all" || t.assigneeId === who ? 1 : 0.35 }}>
                              <span className="avatar" title={t.assigneeId ? memberName.get(t.assigneeId) : "Unassigned"}>
                                {t.assigneeId ? initials(memberName.get(t.assigneeId) ?? "?") : "–"}
                              </span>
                              {manages ? (
                                <button type="button" className="cell-edit" style={{ flex: 1, minHeight: 0, padding: 0, lineHeight: 1.35 }} aria-label={`Edit ${t.title}`} onClick={() => setEditing(t.id)}>
                                  {t.title}
                                </button>
                              ) : (
                                <span style={{ flex: 1, lineHeight: 1.35 }}>{t.title}</span>
                              )}
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
                                <button type="button" className="x" aria-label={`Delete ${t.title}`} onClick={() => confirm(`Delete ${t.title}?`) && call("del", url, { json: { op: "task.delete", id: t.id } })}>
                                  ×
                                </button>
                              )}
                            </div>
                            );
                          })}
                          {canAssign &&
                            (adding === key ? (
                              <TaskForm
                                id={key}
                                init={{ title: "", assigneeId: "", reviewerId: me, dueDate: "" }}
                                members={members}
                                me={me}
                                busy={busy !== null}
                                saveLabel="Add"
                                cancel={() => setAdding(null)}
                                submit={async (d) => {
                                  const res = await call("add", url, {
                                    json: { op: "task.add", moduleId: m.id, milestoneId: c.id, title: d.title, assigneeId: d.assigneeId || null, reviewerId: d.reviewerId || null, dueDate: d.dueDate || null },
                                  });
                                  if (res) setAdding(null);
                                  return !!res;
                                }}
                              />
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
