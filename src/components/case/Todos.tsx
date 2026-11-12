"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/components/experts/useApi";

export interface TodoView {
  id: string;
  title: string;
  assignee: string | null;
  due: string | null;
  sourceLabel: string;
  sourceLink: string | null;
  canDelete: boolean;
}

const url = (engagementId: string) => `/api/engagements/${engagementId}/todos`;

function Source({ t }: { t: TodoView }) {
  if (!t.sourceLabel) return null;
  return t.sourceLink ? (
    <Link href={t.sourceLink} className="tag">
      {t.sourceLabel}
    </Link>
  ) : (
    <span className="tag">{t.sourceLabel}</span>
  );
}

/** Hand-added and accepted to-dos, ticked off in place. */
export function TodoItem({ engagementId, t, showAssignee }: { engagementId: string; t: TodoView; showAssignee: boolean }) {
  const { call, busy, error } = useApi();
  return (
    <div className="row todo">
      <label className="check" style={{ flex: 1 }}>
        <input
          type="checkbox"
          aria-label={`Done: ${t.title}`}
          checked={false}
          disabled={busy !== null}
          onChange={() => call("d", url(engagementId), { json: { op: "done", id: t.id, done: true } })}
        />
        <span>{t.title}</span>
      </label>
      <span className="meta">
        {showAssignee && t.assignee && <span>{t.assignee}</span>}
        {t.due && <span>{t.due}</span>}
        <Source t={t} />
        {t.canDelete && (
          <button type="button" className="linkbtn" aria-label={`Remove: ${t.title}`} disabled={busy !== null} onClick={() => call("x", url(engagementId), { json: { op: "delete", id: t.id } })}>
            ×
          </button>
        )}
        {error && <span className="error">{error}</span>}
      </span>
    </div>
  );
}

export function TodoAdd({ engagementId, me, members, team }: { engagementId: string; me: string; members: { id: string; name: string }[]; team: boolean }) {
  const { call, busy, error } = useApi();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(team ? "" : me);
  const [due, setDue] = useState("");
  return (
    <form
      className="toolbar todo-add"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await call("add", url(engagementId), { json: { op: "add", title, assigneeId: assignee || null, dueDate: due || null } });
        if (res) {
          setTitle("");
          setDue("");
        }
      }}
    >
      <input type="text" value={title} placeholder="Add to-do" aria-label="To-do" onChange={(e) => setTitle(e.target.value)} />
      <select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
        <option value="">Anyone</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id === me ? "Me" : m.name}
          </option>
        ))}
      </select>
      <input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
      <button type="submit" className="small" disabled={busy !== null || !title.trim()}>
        Add
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

/** To-dos the model found in the chats, waiting to be added or dismissed. */
export function TodoSuggestions({ engagementId, items, showAssignee, canScan }: { engagementId: string; items: TodoView[]; showAssignee: boolean; canScan: boolean }) {
  const { call, busy, error } = useApi();
  return (
    <div className="todo-suggest">
      <div className="toolbar">
        <h3 style={{ fontSize: 14 }}>Suggested</h3>
        {items.length > 0 && <span className="mono">{items.length}</span>}
        <span className="grow" />
        {canScan && (
          <button type="button" className="small secondary" disabled={busy !== null} onClick={() => call("scan", url(engagementId), { json: { op: "scan" } })}>
            {busy === "scan" ? "Scanning…" : "Scan chats"}
          </button>
        )}
      </div>
      {error && <span className="error">{error}</span>}
      {items.map((t) => (
        <div className="row todo" key={t.id}>
          <span style={{ flex: 1 }}>{t.title}</span>
          <span className="meta">
            {showAssignee && t.assignee && <span>{t.assignee}</span>}
            {t.due && <span>{t.due}</span>}
            <Source t={t} />
            <button type="button" className="small" disabled={busy !== null} onClick={() => call(t.id, url(engagementId), { json: { op: "accept", id: t.id } })}>
              Add
            </button>
            <button type="button" className="small secondary" disabled={busy !== null} onClick={() => call(t.id, url(engagementId), { json: { op: "dismiss", id: t.id } })}>
              Dismiss
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
