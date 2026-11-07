"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/components/experts/useApi";
import { splitCitations } from "@/lib/case/search";

export interface GptSource {
  n: number;
  label: string;
  href: string;
  text: string;
}
export interface GptLine {
  id: string;
  role: "user" | "assistant";
  body: string;
  sources: GptSource[];
}

function Answer({ m }: { m: GptLine }) {
  const known = new Set(m.sources.map((s) => s.n));
  return (
    <div className="gpt-answer">
      <div className="chat-body">
        {splitCitations(m.body).map((p, i) =>
          "cite" in p ? (
            known.has(p.cite) ? (
              <a key={i} href={`#src-${m.id}-${p.cite}`} className="cite">
                {p.cite}
              </a>
            ) : null
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
      {m.sources.length > 0 && (
        <ol className="gpt-sources">
          {m.sources.map((s) => (
            <li key={s.n} id={`src-${m.id}-${s.n}`}>
              <span className="cite">{s.n}</span>
              <div style={{ minWidth: 0 }}>
                <Link href={s.href} style={{ fontWeight: 600, fontSize: 12 }}>
                  {s.label}
                </Link>
                <div className="clamp muted">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One conversation with the case GPT. */
export function GptChat({
  engagementId,
  chat,
  lines,
  name,
}: {
  engagementId: string;
  chat: { id: string; title: string; folder: string; shared: boolean; pinned: boolean; mine: boolean };
  lines: GptLine[];
  name: string;
}) {
  const router = useRouter();
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/gpt`;
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [title, setTitle] = useState(chat.title);
  const [folder, setFolder] = useState(chat.folder);
  const asked = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const waiting = lines[lines.length - 1]?.role === "user";

  useEffect(() => {
    if (waiting && chat.mine && !asked.current) {
      asked.current = true;
      call("answer", url, { json: { op: "answer", chatId: chat.id } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, pending]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setPending(q);
    setQ("");
    await call("ask", url, { json: { op: "ask", chatId: chat.id, question: q } });
    setPending(null);
  }

  return (
    <section className="panel gpt-main">
      <div className="group-head">
        {chat.mine ? (
          <input
            type="text"
            className="title-input"
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== chat.title && call("rename", url, { json: { op: "rename", chatId: chat.id, title } })}
          />
        ) : (
          <h2 style={{ flex: 1 }}>{chat.title}</h2>
        )}
        {chat.mine && (
          <div className="toolbar">
            <input
              type="text"
              aria-label="Folder"
              placeholder="Folder"
              value={folder}
              list="gpt-folders"
              style={{ width: 120, minHeight: 34 }}
              onChange={(e) => setFolder(e.target.value)}
              onBlur={() => folder !== chat.folder && call("folder", url, { json: { op: "folder", chatId: chat.id, folder } })}
            />
            <button type="button" className="secondary small" aria-pressed={chat.shared} disabled={busy !== null} onClick={() => call("share", url, { json: { op: "share", chatId: chat.id, shared: !chat.shared } })}>
              {chat.shared ? "Shared" : "Share"}
            </button>
            <button type="button" className="secondary small" disabled={busy !== null || chat.pinned} onClick={() => call("pin", url, { json: { op: "pin", chatId: chat.id } })}>
              {chat.pinned ? "Pinned" : "Pin to Notes"}
            </button>
            <button
              type="button"
              className="secondary small"
              disabled={busy !== null}
              onClick={async () => {
                if (await call("delete", url, { json: { op: "delete", chatId: chat.id } })) router.push(`/e/${engagementId}/gpt`);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="gpt-log">
        {lines.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="gpt-q">
              {m.body}
            </div>
          ) : (
            <Answer key={m.id} m={m} />
          ),
        )}
        {pending && <div className="gpt-q">{pending}</div>}
        {(busy === "answer" || busy === "ask") && <div className="muted gpt-thinking">{name}…</div>}
        {error && (
          <div className="toolbar">
            <span className="error">{error}</span>
            {waiting && chat.mine && (
              <button type="button" className="secondary small" onClick={() => call("answer", url, { json: { op: "answer", chatId: chat.id } })}>
                Retry
              </button>
            )}
          </div>
        )}
        <div ref={end} />
      </div>
      {chat.mine && (
        <form className="composer" onSubmit={ask}>
          <label htmlFor="gpt-input" className="sr-only">
            Ask {name}
          </label>
          <textarea
            id="gpt-input"
            rows={2}
            value={q}
            placeholder={`Ask ${name}`}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={busy !== null || !q.trim()}>
            Ask
          </button>
        </form>
      )}
    </section>
  );
}

/** Starts a new chat from the GPT home. */
export function GptStart({ engagementId, name }: { engagementId: string; name: string }) {
  const router = useRouter();
  const { call, busy, error } = useApi();
  const [q, setQ] = useState("");
  return (
    <section className="panel gpt-main gpt-start">
      <h2 style={{ fontSize: 24 }}>{name}</h2>
      <form
        className="composer"
        style={{ border: "1.5px solid var(--line)", borderRadius: 14, width: "min(680px, 100%)" }}
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await call("new", `/api/engagements/${engagementId}/gpt`, { json: { op: "new", question: q } });
          if (res?.id) router.push(`/e/${engagementId}/gpt/${res.id}`);
        }}
      >
        <label htmlFor="gpt-input" className="sr-only">
          Ask {name}
        </label>
        <textarea
          id="gpt-input"
          rows={3}
          value={q}
          placeholder={`Ask ${name}`}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={busy !== null || !q.trim()}>
          Ask
        </button>
      </form>
      {error && <span className="error">{error}</span>}
    </section>
  );
}
