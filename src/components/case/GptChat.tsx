"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/components/experts/useApi";
import type { SourceKind } from "@/lib/case/gptSources";
import { splitCitations } from "@/lib/case/search";
import { Greeting, GptAsk, ScopeMenu } from "./GptAsk";
import styles from "./GptChat.module.css";

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
  initialKinds,
}: {
  engagementId: string;
  chat: { id: string; title: string; shared: boolean; mine: boolean };
  lines: GptLine[];
  name: string;
  initialKinds: SourceKind[];
}) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/gpt`;
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<SourceKind[]>(initialKinds);
  const [pending, setPending] = useState<string | null>(null);
  const [title, setTitle] = useState(chat.title);
  const asked = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const waiting = lines[lines.length - 1]?.role === "user";

  useEffect(() => {
    if (waiting && chat.mine && !asked.current) {
      asked.current = true;
      call("answer", url, { json: { op: "answer", chatId: chat.id, kinds } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, pending]);

  async function ask() {
    const question = q;
    setPending(question);
    setQ("");
    await call("ask", url, { json: { op: "ask", chatId: chat.id, question, kinds } });
    setPending(null);
  }

  return (
    <section className="panel gpt-main">
      <div className={`gpt-head ${styles.head}`}>
        {chat.mine ? (
          <input
            type="text"
            className={`title-input ${styles.title}`}
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={() => {
              if (!title.trim()) setTitle(chat.title);
              else if (title !== chat.title) call("rename", url, { json: { op: "rename", chatId: chat.id, title } });
            }}
          />
        ) : (
          <h2 className="gpt-head-title">{chat.title}</h2>
        )}
        {chat.mine && <ScopeMenu shared={chat.shared} disabled={busy !== null} onChange={(shared) => call("share", url, { json: { op: "share", chatId: chat.id, shared } })} />}
      </div>
      <div className="gpt-log">
        <div className="gpt-col">
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
                <button type="button" className="secondary small" onClick={() => call("answer", url, { json: { op: "answer", chatId: chat.id, kinds } })}>
                  Retry
                </button>
              )}
            </div>
          )}
          <div ref={end} />
        </div>
      </div>
      {chat.mine && (
        <div className="gpt-foot">
          <GptAsk name={name} value={q} onChange={setQ} onSubmit={ask} disabled={busy !== null} kinds={kinds} onKinds={setKinds} />
        </div>
      )}
    </section>
  );
}

/** The GPT home: greeting and a fresh ask box. */
export function GptStart({ engagementId, name, first }: { engagementId: string; name: string; first: string }) {
  const router = useRouter();
  const { call, busy, error } = useApi();
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<SourceKind[]>([]);
  const [shared, setShared] = useState(true);
  return (
    <section className="panel gpt-main gpt-start">
      <div className="gpt-start-top">
        <ScopeMenu shared={shared} onChange={setShared} />
      </div>
      <div className="gpt-start-mid">
        <Greeting first={first} />
        <GptAsk
          name={name}
          value={q}
          onChange={setQ}
          rows={3}
          autoFocus
          disabled={busy !== null}
          kinds={kinds}
          onKinds={setKinds}
          onSubmit={async () => {
            const res = await call("new", `/api/engagements/${engagementId}/gpt`, { json: { op: "new", question: q, shared } });
            if (res?.id) router.push(`/e/${engagementId}/gpt/${res.id}${kinds.length ? `?src=${kinds.join(",")}` : ""}`);
          }}
        />
        {error && <span className="error">{error}</span>}
      </div>
    </section>
  );
}
