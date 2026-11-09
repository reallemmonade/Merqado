"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi } from "@/components/experts/useApi";
import { useDismiss } from "./GptAsk";
import { Icon } from "./icons";

export interface GptChatRow {
  id: string;
  title: string;
  folder: string;
  shared: boolean;
  pinned: boolean;
  mine: boolean;
  owner: string;
  updated: string;
}

type Edit = { id: string; field: "title" | "folder"; value: string } | null;

function ChatMenu({ c, onEdit, api, activeId, base }: { c: GptChatRow; onEdit: (e: Edit) => void; api: ReturnType<typeof useApi>; activeId?: string; base: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<React.CSSProperties>({});
  const ref = useDismiss(open, () => setOpen(false));
  // The list scrolls, so the menu is placed against the screen to avoid being clipped.
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const up = r.bottom + 200 > window.innerHeight;
    setAt({ position: "fixed", left: Math.max(8, r.right - 180), right: "auto", ...(up ? { top: "auto", bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4, bottom: "auto" }) });
    setOpen((o) => !o);
  }
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);
  const url = base.replace(/^\/e\//, "/api/engagements/");
  const run = async (key: string, json: object) => {
    setOpen(false);
    return api.call(key, url, { json: { ...json, chatId: c.id } });
  };
  return (
    <div className="pop-wrap chat-more" ref={ref}>
      <button type="button" className="ask-tool" aria-label="More" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div className="pop-menu" role="menu" style={at}>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onEdit({ id: c.id, field: "title", value: c.title }))}>
            Rename
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onEdit({ id: c.id, field: "folder", value: c.folder }))}>
            Folder
          </button>
          <button type="button" role="menuitem" onClick={() => run("share", { op: "share", shared: !c.shared })}>
            {c.shared ? "Only me" : "Share with team"}
          </button>
          <button type="button" role="menuitem" disabled={c.pinned} onClick={() => run("pin", { op: "pin" })}>
            {c.pinned ? "Pinned" : "Pin to Notes"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="pop-danger"
            onClick={async () => {
              if ((await run("delete", { op: "delete" })) && c.id === activeId) router.push(base);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ label, children, count }: { label: string; children: React.ReactNode; count: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="gpt-sec">
      <button type="button" className="gpt-sec-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <Icon name="chevron" size={14} />
      </button>
      {open && (count ? children : <p className="muted gpt-empty">No chats</p>)}
    </div>
  );
}

/** The case GPT's side panel: search, new chat, and collapsible My / Team chat lists. */
export function GptList({ engagementId, name, chats, activeId, folders }: { engagementId: string; name: string; chats: GptChatRow[]; activeId?: string; folders: string[] }) {
  const base = `/e/${engagementId}/gpt`;
  const api = useApi();
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");
  const [edit, setEdit] = useState<Edit>(null);
  const t = term.trim().toLowerCase();
  const hit = (c: GptChatRow) => !t || c.title.toLowerCase().includes(t);
  const mine = chats.filter((c) => c.mine && hit(c));
  const team = chats.filter((c) => !c.mine && c.shared && hit(c));
  const groups = [...new Set(mine.map((c) => c.folder))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  function save() {
    if (!edit) return;
    const c = chats.find((x) => x.id === edit.id);
    const v = edit.value.trim();
    setEdit(null);
    if (!c) return;
    const url = `/api/engagements/${engagementId}/gpt`;
    if (edit.field === "title" && v && v !== c.title) api.call("rename", url, { json: { op: "rename", chatId: c.id, title: v } });
    if (edit.field === "folder" && v !== c.folder) api.call("folder", url, { json: { op: "folder", chatId: c.id, folder: v } });
  }

  function row(c: GptChatRow) {
    if (edit?.id === c.id)
      return (
        <input
          key={c.id}
          type="text"
          className="gpt-row-edit"
          aria-label={edit.field === "title" ? "Title" : "Folder"}
          placeholder={edit.field === "folder" ? "Folder" : undefined}
          list={edit.field === "folder" ? "gpt-folders" : undefined}
          value={edit.value}
          autoFocus
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEdit(null);
          }}
        />
      );
    return (
      <div key={c.id} className="gpt-row" aria-current={c.id === activeId ? "page" : undefined}>
        <Link href={`${base}/${c.id}`} title={c.mine ? c.title : `${c.title} · ${c.owner}`} aria-current={c.id === activeId ? "page" : undefined}>
          {c.title}
        </Link>
        {c.mine && <ChatMenu c={c} onEdit={setEdit} api={api} activeId={activeId} base={base} />}
      </div>
    );
  }

  return (
    <nav className="panel gpt-list" aria-label="Chats">
      <div className="gpt-list-head">
        <span className="gpt-name">{name}</span>
        <button
          type="button"
          className="ask-tool"
          aria-label="Search chats"
          aria-pressed={searching}
          onClick={() => {
            setSearching((s) => !s);
            setTerm("");
          }}
        >
          <Icon name="search" size={16} />
        </button>
      </div>
      {searching && (
        <input type="search" className="gpt-find" aria-label="Search chats" value={term} autoFocus onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (setSearching(false), setTerm(""))} />
      )}
      <Link href={base} className="gpt-new" aria-current={!activeId ? "page" : undefined}>
        <Icon name="compose" size={16} />
        New chat
      </Link>
      <div className="gpt-scroll">
        <Section label="My chats" count={mine.length}>
          {groups.map((f) => (
            <div key={f || "none"} className="gpt-folder">
              {f && <div className="gpt-folder-name">{f}</div>}
              {mine.filter((c) => c.folder === f).map(row)}
            </div>
          ))}
        </Section>
        <Section label="Team chats" count={team.length}>
          <div className="gpt-folder">{team.map(row)}</div>
        </Section>
      </div>
      {api.error && <p className="error gpt-empty">{api.error}</p>}
      <datalist id="gpt-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </nav>
  );
}
