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
export function ChatFileCard({ engagementId, file, folders }: { engagementId: string; file: ChatFile; folders: string[] }) {
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
