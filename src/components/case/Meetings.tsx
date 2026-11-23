"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useApi } from "@/components/experts/useApi";

export interface MeetingRow {
  id: string;
  title: string;
  when: string;
  minutes: number;
  source: "Teams" | "Outlook";
  matchedBy: string;
  transcript: "none" | "waiting" | "ready" | "unavailable";
  recording: boolean;
  takeaways: string[];
}

type Tab = "KTAs" | "Transcript" | "Files";

export function Meetings(props: {
  engagementId: string;
  pending: MeetingRow[];
  added: MeetingRow[];
  selected: MeetingRow | null;
  transcript: { id: string; filename: string; folder: string; text: string } | null;
  auto: boolean;
  link: { account: string; transcripts: boolean; broken: boolean } | null;
  notice: string | null;
  itLink: string | null;
}) {
  const { engagementId: id, pending, added, selected, transcript, link } = props;
  const { call, busy, error } = useApi();
  const [tab, setTab] = useState<Tab>("KTAs");
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const api = `/api/engagements/${id}/meetings`;
  const connect = (basic = false) => `/api/meetings/microsoft/start?returnTo=${encodeURIComponent(`/e/${id}/meetings`)}${basic ? "&basic=1" : ""}`;
  const base = `/e/${id}/meetings`;

  async function sync() {
    const res = await call("sync", api, { json: { op: "sync" } });
    if (res) setFlash(res.found ? `${res.found} new` : "Up to date");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="toolbar">
        {link && !link.broken ? (
          <>
            <span className="muted" style={{ fontSize: 13 }}>{link.account}</span>
            {!link.transcripts && (
              <a className="button-link secondary-link" href={connect()}>
                Allow transcripts
              </a>
            )}
          </>
        ) : (
          <a className="button-link meeting-connect" href={connect()}>
            {link?.broken ? "Reconnect Microsoft" : "Connect Microsoft"}
          </a>
        )}
        <span className="grow" />
        <label className="check" style={{ gap: 8 }}>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={props.auto}
            aria-label="Auto"
            disabled={busy !== null}
            onClick={() => call("auto", api, { json: { op: "auto", on: !props.auto } })}
          />
          Auto
        </label>
        <button type="button" onClick={sync} disabled={busy !== null || !link || link.broken} style={{ minWidth: 96 }}>
          {busy === "sync" ? "Syncing" : "↻ Sync"}
        </button>
      </div>

      {props.notice === "consent" && (
        <div className="notice toolbar">
          <strong>Needs IT approval</strong>
          <span className="grow" />
          {props.itLink && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                navigator.clipboard.writeText(props.itLink!).then(
                  () => setFlash("Copied"),
                  () => setFlash(props.itLink),
                )
              }
            >
              Copy IT link
            </button>
          )}
          <a className="button-link secondary-link" href={connect(true)}>
            Calendar only
          </a>
        </div>
      )}
      {props.notice && props.notice !== "consent" && <p className="error">{NOTICE[props.notice] ?? "Microsoft sign-in failed"}</p>}
      {error && <p className="error">{error}</p>}
      {flash && !error && <p className="muted" role="status">{flash}</p>}

      <section className="group">
        <div className="group-head">
          <h2>To confirm</h2>
          <span className="muted" style={{ fontSize: 13 }}>{pending.length}</span>
        </div>
        {pending.map((m) => (
          <div key={m.id} className="meeting-row">
            <span className="meeting-title">{m.title}</span>
            <span className="meta">{m.when}</span>
            <span className="meta">{m.matchedBy}</span>
            <span className="meeting-acts">
              <button type="button" disabled={busy !== null} onClick={() => call(`add:${m.id}`, api, { json: { op: "add", id: m.id } })}>
                {busy === `add:${m.id}` ? "Adding" : "Add"}
              </button>
              <button type="button" className="secondary" disabled={busy !== null} onClick={() => call(`skip:${m.id}`, api, { json: { op: "skip", id: m.id } })}>
                Not this case
              </button>
            </span>
          </div>
        ))}
        {pending.length === 0 && <div className="meeting-row muted">None</div>}
      </section>

      <div className="split">
        <section className="group primary">
          <div className="group-head">
            <h2>Added</h2>
            <span className="muted" style={{ fontSize: 13 }}>{added.length}</span>
          </div>
          {added.map((m) => (
            <Link key={m.id} href={`${base}?m=${m.id}`} scroll={false} className="meeting-row" aria-current={selected?.id === m.id ? "true" : undefined}>
              <span className="meeting-title">{m.title}</span>
              <span className="meta">{m.when}</span>
              <span className="meta">
                {m.minutes}m · {m.source}
              </span>
              <span className="meeting-acts">
                {m.transcript === "ready" && <span className="tag tag-good">Transcript</span>}
                {m.transcript === "waiting" && <span className="tag">Waiting</span>}
                {m.recording && <span className="tag tag-good">Recording</span>}
              </span>
            </Link>
          ))}
          {added.length === 0 && <div className="meeting-row muted">No meetings</div>}
        </section>

        {selected && (
          <aside className="side">
            <section className="card" style={{ gap: 12 }}>
              <h2 style={{ fontSize: 16 }}>{selected.title}</h2>
              <div className="meta">
                {selected.when} · {selected.minutes}m · {selected.source}
              </div>
              <div className="seg" role="tablist">
                {(["KTAs", "Transcript", "Files"] as Tab[]).map((t) => (
                  <button key={t} type="button" role="tab" aria-pressed={tab === t} aria-selected={tab === t} onClick={() => setTab(t)} style={{ minWidth: 92 }}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === "KTAs" &&
                (selected.takeaways.length ? (
                  <ul className="meeting-ktas">
                    {selected.takeaways.map((k, i) => (
                      <li key={i} className="kta">
                        {k}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None</p>
                ))}
              {tab === "KTAs" && transcript && (
                <button type="button" className="secondary" disabled={busy !== null} onClick={() => call("ktas", api, { json: { op: "takeaways", id: selected.id } })} style={{ alignSelf: "flex-start" }}>
                  {busy === "ktas" ? "Writing" : "Redo KTAs"}
                </button>
              )}

              {tab === "Transcript" &&
                (transcript ? (
                  <div className="transcript" style={{ maxHeight: 420, fontSize: 13 }}>
                    {transcript.text}
                  </div>
                ) : (
                  <div className="toolbar">
                    <span className="muted">{selected.transcript === "waiting" ? "Waiting" : "No transcript"}</span>
                    <span className="grow" />
                    {selected.source === "Teams" && (
                      <button type="button" className="secondary" disabled={busy !== null} onClick={() => call("check", api, { json: { op: "transcript", id: selected.id } })}>
                        {busy === "check" ? "Checking" : "Check again"}
                      </button>
                    )}
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                      {busy === "upload" ? "Uploading" : "Upload"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      accept=".vtt,.txt,.docx,.srt,.pdf"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        const form = new FormData();
                        form.set("id", selected.id);
                        form.set("file", f);
                        await call("upload", api, { form });
                      }}
                    />
                  </div>
                ))}

              {tab === "Files" && (
                <div className="meeting-files">
                  <span className="muted">Transcript</span>
                  {transcript ? (
                    <a href={`/api/engagements/${id}/sources/${transcript.id}`} target="_blank" rel="noreferrer">
                      {transcript.folder}/{transcript.filename}
                    </a>
                  ) : (
                    <span>None</span>
                  )}
                  <span className="muted">Recording</span>
                  {selected.recording ? (
                    <a href={`/api/engagements/${id}/meetings/${selected.id}/recording`} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    <span>None</span>
                  )}
                </div>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

const NOTICE: Record<string, string> = {
  denied: "Microsoft sign-in cancelled",
  personal: "Use a work Microsoft account",
  state: "Microsoft sign-in expired",
  setup: "Microsoft sign-in is not set up",
  failed: "Microsoft sign-in failed",
};
