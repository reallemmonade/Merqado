"use client";

import { useState } from "react";
import { ARCHETYPES, type Archetype } from "@/db/schema";
import { useApi } from "@/components/experts/useApi";
import { ARCHETYPE_LABEL, ROOM_TEMPLATES } from "@/lib/case/rooms";

/** First-time picker: which chats this case has. */
export function RoomSetup({ engagementId }: { engagementId: string }) {
  const { call, busy, error } = useApi();
  const [picked, setPicked] = useState<string[]>(ROOM_TEMPLATES.map((t) => t.name));
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        call("setup", `/api/engagements/${engagementId}/channel`, { json: { op: "rooms.setup", names: picked } });
      }}
    >
      <h2 style={{ fontSize: 16 }}>Chats</h2>
      {ROOM_TEMPLATES.map((t) => (
        <label key={t.name} className="check">
          <input
            type="checkbox"
            checked={picked.includes(t.name)}
            onChange={(e) => setPicked(e.target.checked ? [...picked, t.name] : picked.filter((n) => n !== t.name))}
          />
          <span style={{ minWidth: 220 }}>{t.name}</span>
          <span className="muted">{t.archetypes.map((a) => ARCHETYPE_LABEL[a]).join(" + ")}</span>
        </label>
      ))}
      <div className="toolbar">
        <button type="submit" disabled={busy !== null || picked.length === 0}>
          Create chats
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}

export function NewRoom({ engagementId }: { engagementId: string }) {
  const { call, busy, error } = useApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [who, setWho] = useState<Archetype[]>([]);
  if (!open)
    return (
      <button type="button" className="secondary small" onClick={() => setOpen(true)}>
        + New chat
      </button>
    );
  return (
    <form
      className="item"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await call("room", `/api/engagements/${engagementId}/channel`, { json: { op: "room.add", name, archetypes: who } });
        if (res) {
          setOpen(false);
          setName("");
          setWho([]);
        }
      }}
    >
      <label className="field">
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      {[...ARCHETYPES].reverse().map((a) => (
        <label key={a} className="check">
          <input type="checkbox" checked={who.includes(a)} onChange={(e) => setWho(e.target.checked ? [...who, a] : who.filter((x) => x !== a))} />
          {ARCHETYPE_LABEL[a]}
        </label>
      ))}
      <div className="toolbar">
        <button type="submit" className="small" disabled={busy !== null || !name.trim() || who.length === 0}>
          Create
        </button>
        <button type="button" className="secondary small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

export interface ChatLine {
  id: string;
  body: string;
  pinned: boolean;
  mine: boolean;
  author: string;
  initials: string;
  time: string;
}

export function RoomView({ engagementId, roomId, lines }: { engagementId: string; roomId: string; lines: ChatLine[] }) {
  const { call, busy, error } = useApi();
  const [body, setBody] = useState("");
  const url = `/api/engagements/${engagementId}/channel`;
  return (
    <div className="chat">
      <div className="chat-log">
        {lines.map((m) => (
          <div key={m.id} id={`m-${m.id}`} className={`chat-msg${m.pinned ? " pinned" : ""}`}>
            <span className="avatar">{m.initials}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="meta">
                <strong style={{ color: "var(--ink)" }}>{m.author}</strong>
                <span>{m.time}</span>
                {m.pinned && <span className="tag">Pinned</span>}
              </div>
              <div className="chat-body">{m.body}</div>
            </div>
            <div className="chat-actions">
              <button type="button" className="linkbtn" disabled={busy !== null} onClick={() => call(m.id, url, { json: { op: "message.pin", id: m.id, pinned: !m.pinned } })}>
                {m.pinned ? "Unpin" : "Pin"}
              </button>
              {m.mine && (
                <button type="button" className="x" aria-label="Delete message" disabled={busy !== null} onClick={() => call(m.id, url, { json: { op: "message.delete", id: m.id } })}>
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
        {lines.length === 0 && <p className="muted">No messages</p>}
      </div>
      <form
        className="composer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const res = await call("post", url, { json: { op: "message.post", roomId, body } });
          if (res) setBody("");
        }}
      >
        <textarea
          rows={2}
          value={body}
          placeholder="Message"
          aria-label="Message"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={busy !== null || !body.trim()}>
          Send
        </button>
      </form>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
