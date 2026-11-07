"use client";

import Link from "next/link";
import { useState } from "react";
import type { NoteKind } from "@/db/schema";
import { useApi } from "@/components/experts/useApi";

export const NOTE_KIND_LABEL: Record<NoteKind, string> = { note: "Note", decision: "Decision", open: "Open item" };

export function NoteForm({ engagementId, modules }: { engagementId: string; modules: { id: string; name: string }[] }) {
  const { call, busy, error } = useApi();
  const [kind, setKind] = useState<NoteKind>("note");
  const [body, setBody] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  return (
    <form
      className="card"
      style={{ gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await call("add", `/api/engagements/${engagementId}/notes`, { json: { op: "add", kind, body, moduleId: moduleId || null, isPrivate } });
        if (res) setBody("");
      }}
    >
      <textarea rows={2} value={body} placeholder="New note" aria-label="Note" onChange={(e) => setBody(e.target.value)} />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Kind">
          {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {NOTE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <select aria-label="Module" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          <option value="">No module</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
          Private
        </label>
        <span className="grow" />
        <button type="submit" disabled={busy !== null || !body.trim()}>
          Add
        </button>
      </div>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

export interface NoteRow {
  id: string;
  kind: NoteKind;
  body: string;
  origin: string;
  link: string | null;
  isPrivate: boolean;
  resolved: boolean;
  author: string;
  date: string;
  canChange: boolean;
}

export function NoteItem({ engagementId, n }: { engagementId: string; n: NoteRow }) {
  const { call, busy } = useApi();
  const url = `/api/engagements/${engagementId}/notes`;
  return (
    <div className={`item${n.resolved ? " off" : ""}`}>
      <div className="meta">
        <span className={`tag note-${n.kind}`}>{NOTE_KIND_LABEL[n.kind]}</span>
        {n.isPrivate && <span className="tag">Private</span>}
        {n.origin && <span>{n.origin}</span>}
        <span>{n.author}</span>
        <span>{n.date}</span>
        <span style={{ flex: 1 }} />
        {n.link && <Link href={n.link}>Open</Link>}
        {n.canChange && n.kind === "open" && (
          <button type="button" className="linkbtn" disabled={busy !== null} onClick={() => call(n.id, url, { json: { op: "update", id: n.id, resolved: !n.resolved } })}>
            {n.resolved ? "Reopen" : "Resolve"}
          </button>
        )}
        {n.canChange && (
          <button type="button" className="x" aria-label="Delete note" disabled={busy !== null} onClick={() => call(n.id, url, { json: { op: "delete", id: n.id } })}>
            ×
          </button>
        )}
      </div>
      <div className="chat-body">{n.body}</div>
    </div>
  );
}
