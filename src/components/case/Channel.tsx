"use client";

import { useRef, useState } from "react";
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

export interface ChatFile {
  id: string;
  filename: string;
  folder: string;
  pending: boolean;
  mine: boolean;
  suggestions: string[];
  links: string[];
}

/** A file in a message: its folder, or (for the sender) a suggested folder to confirm. */
function ChatFileCard({ engagementId, file, folders }: { engagementId: string; file: ChatFile; folders: string[] }) {
  const { call, busy, error } = useApi();
  const [folder, setFolder] = useState(file.suggestions[0] ?? "");
  return (
    <div className="chat-file">
      <div className="name">
        <a href={`/api/engagements/${engagementId}/sources/${file.id}`} target="_blank" rel="noreferrer">
          {file.filename}
        </a>
        <div className="chips">
          {!file.pending && file.folder && <span className="tag tag-good">{file.folder}</span>}
          {file.links.map((l) => (
            <span key={l} className="tag tag-accent">
              {l}
            </span>
          ))}
        </div>
      </div>
      {file.pending && file.mine && (
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            call("place", `/api/engagements/${engagementId}/channel`, { json: { op: "file.place", sourceId: file.id, folder } });
          }}
        >
          <input type="text" list={`folders-${engagementId}`} aria-label="Folder" placeholder="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <button type="submit" className="small" disabled={busy !== null || !folder.trim()}>
            File
          </button>
          {error && <span className="error">{error}</span>}
        </form>
      )}
    </div>
  );
}

export interface ChatLine {
  id: string;
  body: string;
  pinned: boolean;
  mine: boolean;
  files: ChatFile[];
  author: string;
  initials: string;
  time: string;
}

export function RoomView({ engagementId, roomId, lines, folders }: { engagementId: string; roomId: string; lines: ChatLine[]; folders: string[] }) {
  const { call, busy, error, setError } = useApi();
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const url = `/api/engagements/${engagementId}/channel`;

  async function attach(files: File[]) {
    setUploading((n) => n + files.length);
    for (const file of files) {
      const form = new FormData();
      form.set("file", file);
      form.set("roomId", roomId);
      const res = await fetch(`/api/engagements/${engagementId}/sources`, { method: "POST", body: form }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && data.duplicate) setError(`${file.name} is already in Files.`);
      else if (res?.ok && data.source?.id) setAttached((a) => (a.some((x) => x.id === data.source.id) ? a : [...a, { id: data.source.id, filename: data.source.filename }]));
      else setError(data.error ?? `Couldn't attach ${file.name}.`);
      setUploading((n) => n - 1);
    }
  }
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
              {m.body && <div className="chat-body">{m.body}</div>}
              {m.files.length > 0 && (
                <div className="chat-files">
                  {m.files.map((f) => (
                    <ChatFileCard key={f.id} engagementId={engagementId} file={f} folders={folders} />
                  ))}
                </div>
              )}
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
      <datalist id={`folders-${engagementId}`}>
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <form
        className={`composer${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          attach([...e.dataTransfer.files]);
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if ((!body.trim() && !attached.length) || uploading) return;
          const res = await call("post", url, { json: { op: "message.post", roomId, body, sourceIds: attached.map((a) => a.id) } });
          if (res) {
            setBody("");
            setAttached([]);
          }
        }}
      >
        {(attached.length > 0 || uploading > 0) && (
          <div className="composer-files">
            {attached.map((a) => (
              <span key={a.id} className="tag">
                {a.filename}{" "}
                <button type="button" className="x" aria-label={`Remove ${a.filename}`} onClick={() => setAttached(attached.filter((x) => x.id !== a.id))}>
                  ×
                </button>
              </span>
            ))}
            {uploading > 0 && <span className="muted">…</span>}
          </div>
        )}
        <button type="button" className="secondary small" aria-label="Attach" onClick={() => picker.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7" />
          </svg>
        </button>
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          onChange={(e) => {
            attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
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
        <button type="submit" disabled={busy !== null || uploading > 0 || (!body.trim() && !attached.length)}>
          Send
        </button>
      </form>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
