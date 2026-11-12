"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationKind } from "@/db/schema";
import type { InboxView } from "@/lib/notifications/sync";
import { SNOOZE_CHOICES, SNOOZE_LABELS, type SnoozeChoice } from "@/lib/inbox/snooze";
import { Icon, type IconName } from "./case/icons";

export type NeedsYouItem = {
  key: string;
  kind: NotificationKind;
  unread: boolean;
  title: string;
  sub: string;
  /** Age, or wake time in the Snoozed view. */
  when: string;
  href: string;
  canReopen: boolean;
};

export type NeedsYouGroup = { caseId: string; name: string; items: NeedsYouItem[] };

const KIND_ICON: Record<NotificationKind, IconName> = { mention: "at", reply: "reply", task: "workplan", review: "check", todo: "check" };

type Act = { action: "read" | "done" | "reopen" } | { action: "snooze"; until: SnoozeChoice };

function send(key: string, act: Act) {
  return fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, ...act }), keepalive: true });
}

export function NeedsYouList({ groups, view }: { groups: NeedsYouGroup[]; view: InboxView }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  async function act(key: string, a: Act) {
    setGone((s) => new Set(s).add(key));
    const res = await send(key, a).catch(() => null);
    if (!res?.ok) setGone((s) => { const n = new Set(s); n.delete(key); return n; });
    startTransition(() => router.refresh());
  }

  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => !gone.has(i.key)) })).filter((g) => g.items.length);
  if (!shown.length) return <p className="muted">{view === "open" ? "All clear" : view === "snoozed" ? "Nothing snoozed" : "Nothing done"}</p>;

  return (
    <div className="inbox">
      {shown.map((g) => (
        <section className="group" key={g.caseId} aria-label={g.name}>
          <div className="group-head">
            <h2>{g.name}</h2>
            <span className="muted inbox-n">{g.items.length}</span>
          </div>
          {g.items.map((i) => (
            <div className={`inbox-row${i.unread ? " unread" : ""}`} key={i.key}>
              <span className="inbox-dot" aria-hidden="true" />
              <span className={`inbox-icon kind-${i.kind}`} aria-hidden="true">
                <Icon name={KIND_ICON[i.kind]} size={16} />
              </span>
              <Link href={i.href} className="inbox-text" onClick={() => i.unread && void send(i.key, { action: "read" })}>
                <span className="inbox-title">{i.title}</span>
                {i.sub && <span className="inbox-sub">{i.sub}</span>}
              </Link>
              <span className="inbox-when">{i.when}</span>
              <div className="inbox-actions">
                {view === "open" && <SnoozeMenu onPick={(until) => act(i.key, { action: "snooze", until })} />}
                {view !== "open" && i.canReopen && (
                  <button type="button" className="secondary small" onClick={() => act(i.key, { action: "reopen" })}>
                    <Icon name="undo" size={15} />
                    <span className="inbox-btn-label">Reopen</span>
                  </button>
                )}
                {view !== "done" && (
                  <button type="button" className="secondary small" onClick={() => act(i.key, { action: "done" })}>
                    <Icon name="check" size={15} />
                    <span className="inbox-btn-label">Done</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function SnoozeMenu({ onPick }: { onPick: (c: SnoozeChoice) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="inbox-snooze" ref={ref}>
      <button type="button" className="secondary small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="clock" size={15} />
        <span className="inbox-btn-label">Snooze</span>
      </button>
      {open && (
        <div className="inbox-menu" role="menu">
          {SNOOZE_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(c);
              }}
            >
              {SNOOZE_LABELS[c]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
