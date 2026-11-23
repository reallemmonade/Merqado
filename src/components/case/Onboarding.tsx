"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSolicitation, draftLink } from "@/lib/onboarding/email";
import { DEFAULT_STANDARD, mergeFill, newAngle, type Angle, type Onboarding as Data, type Standard, type TeamRow } from "@/lib/onboarding/model";
import s from "./Onboarding.module.css";

const MAX_BYTES = 100 * 1024 * 1024;

export function Onboarding({
  engagementId,
  codeName,
  initialCode,
  initial,
  firmStandard,
  canEdit,
  canSetStandard,
}: {
  engagementId: string;
  codeName: string;
  initialCode: string;
  initial: Data;
  firmStandard: Standard;
  canEdit: boolean;
  canSetStandard: boolean;
}) {
  const url = `/api/engagements/${engagementId}/onboarding`;
  const [code, setCode] = useState(initialCode);
  const [data, setData] = useState<Data>(initial);
  const [firmStd, setFirmStd] = useState(firmStandard);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState<string | null>(null);
  const first = useRef(true);

  const std = data.standard ?? firmStd;
  const email = useMemo(() => buildSolicitation({ codeName, caseCode: code }, data, std), [codeName, code, data, std]);

  const post = useCallback(
    async (json: unknown) => {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) }).catch(() => null);
      const out = res ? await res.json().catch(() => ({})) : { error: "Couldn't reach Merqado." };
      if (!res?.ok) throw new Error(out.error ?? "Something went wrong.");
      return out;
    },
    [url],
  );

  // Saves a moment after each change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canEdit) return;
    setStatus("saving");
    const t = setTimeout(() => {
      post({ op: "save", caseCode: code, data })
        .then(() => {
          setStatus("saved");
          setError(null);
        })
        .catch((e: Error) => {
          setStatus("");
          setError(e.message);
        });
    }, 800);
    return () => clearTimeout(t);
  }, [code, data, canEdit, post]);

  const set = <K extends keyof Data>(k: K, v: Data[K]) => setData((d) => ({ ...d, [k]: v }));

  async function addDocs(files: File[]) {
    if (!files.length || !canEdit) return;
    setError(null);
    const added: { id: string; filename: string }[] = [];
    for (const [i, file] of files.entries()) {
      setFilling(`${i + 1}/${files.length}`);
      if (file.size > MAX_BYTES) {
        setError("Files are limited to 100 MB.");
        continue;
      }
      const form = new FormData();
      form.set("file", file);
      form.set("relPath", `Onboarding/${file.name}`);
      const res = await fetch(`/api/engagements/${engagementId}/sources`, { method: "POST", body: form }).catch(() => null);
      const out = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && out.source) added.push({ id: out.source.id, filename: out.source.filename });
      else setError(out.error ?? `Couldn't upload ${file.name}.`);
    }
    setData((d) => ({ ...d, started: true, docs: [...d.docs, ...added.filter((a) => !d.docs.some((x) => x.id === a.id))] }));
    if (added.length) {
      setFilling("ai");
      try {
        const out = await post({ op: "fill", sourceIds: added.map((a) => a.id) });
        setData((d) => mergeFill(d, out.fill ?? {}));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setFilling(null);
  }

  if (!data.started && canEdit) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <Drop onFiles={addDocs} busy={filling} big />
        <div>
          <button type="button" className="secondary small" onClick={() => set("started", true)}>
            Skip
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const sections = [
    ["Documents", "ob-docs"],
    ["Case", "ob-case"],
    ["Team", "ob-team"],
    ["Angles", "ob-angles"],
    ["Standard", "ob-standard"],
  ] as const;

  return (
    <div className={s.layout}>
      <nav className={s.jump} aria-label="Onboarding sections">
        {sections.map(([label, id]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <fieldset className={s.form} disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <section className="card" id="ob-docs">
          <div className={s.head}>
            <h2>Documents</h2>
            {status && <span className={s.saved}>{status === "saving" ? "Saving…" : "Saved"}</span>}
          </div>
          {data.docs.length > 0 && (
            <div className={s.docs}>
              {data.docs.map((d) => (
                <span key={d.id} className="tag">
                  {d.filename}
                </span>
              ))}
            </div>
          )}
          {canEdit && <Drop onFiles={addDocs} busy={filling} />}
          {error && <p className="error">{error}</p>}
        </section>

        <section className="card" id="ob-case">
          <h2 style={{ fontSize: 15, margin: 0 }}>Case</h2>
          <div className="form-grid">
            <Field label="Case code" value={code} onChange={setCode} placeholder="CASE001" />
            <Field label="Objective" value={data.objective} onChange={(v) => set("objective", v)} placeholder="Due diligence" />
            <div className={s.wide}>
              <Field label="Market" value={data.market} onChange={(v) => set("market", v)} />
            </div>
            <Field label="Weeks" value={data.weeks} onChange={(v) => set("weeks", v)} placeholder="6" />
            <Field label="Start" value={data.startsOn} onChange={(v) => set("startsOn", v)} placeholder="8/31" />
            <Field label="End" value={data.endsOn} onChange={(v) => set("endsOn", v)} placeholder="10/9" />
            <div className={s.wide}>
              <Field label="Geography" value={data.geography} onChange={(v) => set("geography", v)} placeholder="United States" />
            </div>
            <div className={s.wide}>
              <Area label="Also do not contact" value={data.doNotContactExtra} onChange={(v) => set("doNotContactExtra", v)} rows={2} />
            </div>
          </div>
        </section>

        <section className="card" id="ob-team">
          <h2 style={{ fontSize: 15, margin: 0 }}>Team</h2>
          <Team rows={data.team} onChange={(team) => set("team", team)} />
        </section>

        <section className="card" id="ob-angles">
          <h2 style={{ fontSize: 15, margin: 0 }}>Angles</h2>
          {data.angles.map((a, i) => (
            <AngleCard
              key={a.id}
              n={i + 1}
              angle={a}
              onChange={(next) => set("angles", data.angles.map((x) => (x.id === a.id ? next : x)))}
              onRemove={() => set("angles", data.angles.filter((x) => x.id !== a.id))}
            />
          ))}
          <div>
            <button type="button" className="secondary small" onClick={() => set("angles", [...data.angles, newAngle()])}>
              + Angle
            </button>
          </div>
        </section>

        <StandardCard
          id="ob-standard"
          std={std}
          caseOverride={data.standard !== null}
          canSetStandard={canSetStandard}
          onCase={(next) => set("standard", next)}
          onFirm={async (next) => {
            await post({ op: "standard", standard: next });
            setFirmStd(next);
            set("standard", null);
          }}
        />
      </fieldset>

      <aside className={`card ${s.email}`}>
        <div className={s.head}>
          <h2>Expert network email</h2>
          <CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} />
        </div>
        {std.networks.filter((n) => n.email.trim()).length > 0 && (
          <div className={s.networks}>
            {std.networks
              .filter((n) => n.email.trim())
              .map((n) => (
                <div key={n.email} className={s.network}>
                  <span>{n.name || n.email}</span>
                  <a
                    className="button secondary small"
                    style={{ display: "inline-flex", alignItems: "center", minHeight: 30, padding: "0 12px", fontSize: 13, textDecoration: "none" }}
                    href={draftLink(n.email, email, data.team.filter((t) => t.copy === "all" && t.email.trim()).map((t) => t.email))}
                  >
                    Draft
                  </a>
                </div>
              ))}
          </div>
        )}
        <div className={s.subject}>{email.subject}</div>
        <pre className={s.body}>{email.body}</pre>
      </aside>
    </div>
  );
}

function Drop({ onFiles, busy, big }: { onFiles: (f: File[]) => void; busy: string | null; big?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={s.drop}
      data-over={over}
      style={big ? { padding: "56px 20px" } : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) onFiles([...e.dataTransfer.files]);
      }}
    >
      {big && <strong style={{ fontSize: 16 }}>SOW, proposal, kickoff notes</strong>}
      <button type="button" className={big ? undefined : "secondary small"} disabled={!!busy} onClick={() => input.current?.click()}>
        {busy === "ai" ? "Filling…" : busy ? `Uploading ${busy}` : "Add documents"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.eml"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      {label}
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="field">
      {label}
      <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function AngleCard({ n, angle, onChange, onRemove }: { n: number; angle: Angle; onChange: (a: Angle) => void; onRemove: () => void }) {
  const up = (k: keyof Angle) => (v: string) => onChange({ ...angle, [k]: v });
  return (
    <div className={s.angle}>
      <div className={s.head}>
        <strong style={{ flex: 1, fontSize: 13 }}>Angle {n}</strong>
        <button type="button" className="x" aria-label={`Remove angle ${n}`} onClick={onRemove}>
          ×
        </button>
      </div>
      <div className="form-grid">
        <Field label="Name" value={angle.name} onChange={up("name")} placeholder="Customers" />
        <Field label="N" value={angle.n} onChange={up("n")} placeholder="~20" />
      </div>
      <Field label="Who" value={angle.who} onChange={up("who")} />
      <Field label="Target companies" value={angle.companies} onChange={up("companies")} />
      <Area label="Target roles" value={angle.roles} onChange={up("roles")} />
      <Area label="Screeners" value={angle.screeners} onChange={up("screeners")} rows={4} />
    </div>
  );
}

function Team({ rows, onChange }: { rows: TeamRow[]; onChange: (r: TeamRow[]) => void }) {
  const up = (i: number, patch: Partial<TeamRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : patch.lead ? { ...r, lead: false } : r)));
  return (
    <>
      <div className={s.scroll}>
        <table className={s.team}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>TZ</th>
              <th>Copy on</th>
              <th>Lead</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input type="text" aria-label="Name" value={r.name} onChange={(e) => up(i, { name: e.target.value })} />
                </td>
                <td>
                  <input type="text" aria-label="Email" value={r.email} onChange={(e) => up(i, { email: e.target.value })} />
                </td>
                <td>
                  <input type="text" aria-label="Time zone" className={s.tz} value={r.tz} onChange={(e) => up(i, { tz: e.target.value })} />
                </td>
                <td>
                  <select aria-label="Copy on" value={r.copy} onChange={(e) => up(i, { copy: e.target.value as TeamRow["copy"] })}>
                    <option value="all">All</option>
                    <option value="invites">Invites</option>
                    <option value="none">None</option>
                  </select>
                </td>
                <td style={{ textAlign: "center" }}>
                  <input type="radio" name="ob-lead" aria-label="Main contact" checked={r.lead} onChange={() => up(i, { lead: true })} />
                </td>
                <td>
                  <button type="button" className="x" aria-label={`Remove ${r.name || "person"}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button
          type="button"
          className="secondary small"
          onClick={() => onChange([...rows, { userId: null, name: "", email: "", role: "", tz: "", copy: "all", lead: false }])}
        >
          + Person
        </button>
      </div>
    </>
  );
}

function StandardCard({
  id,
  std,
  caseOverride,
  canSetStandard,
  onCase,
  onFirm,
}: {
  id: string;
  std: Standard;
  caseOverride: boolean;
  canSetStandard: boolean;
  onCase: (s: Standard | null) => void;
  onFirm: (s: Standard) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Standard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = <K extends keyof Standard>(k: K, v: Standard[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <section className="card" id={id}>
      <div className={s.head}>
        <h2>Standard</h2>
        <span className="tag">{caseOverride ? "Edited for this case" : "Firm standard"}</span>
        {!draft && (
          <button type="button" className="secondary small" onClick={() => setDraft(std)}>
            Edit
          </button>
        )}
        {!draft && caseOverride && (
          <button type="button" className="secondary small" onClick={() => onCase(null)}>
            Use firm standard
          </button>
        )}
      </div>
      {!draft ? (
        <div className="muted" style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="tag">Do not contact</span>
          <span className="tag">Client blinding</span>
          <span className="tag">Moderation</span>
          <span className="tag">Networks · {std.networks.length}</span>
        </div>
      ) : (
        <>
          <Area label="Do not contact" value={draft.doNotContact} onChange={(v) => up("doNotContact", v)} rows={2} />
          <Area label="Client blinding" value={draft.blinding} onChange={(v) => up("blinding", v)} rows={4} />
          <Area label="Moderation" value={draft.moderation} onChange={(v) => up("moderation", v)} rows={2} />
          <Field label="Sign-off" value={draft.signOff} onChange={(v) => up("signOff", v)} />
          <div className="field">
            Networks
            <div className={s.networks}>
              {draft.networks.map((n, i) => (
                <div key={i} className={s.netRow}>
                  <input
                    type="text"
                    aria-label="Network"
                    value={n.name}
                    placeholder="Network"
                    onChange={(e) => up("networks", draft.networks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <input
                    type="text"
                    aria-label="Network email"
                    value={n.email}
                    placeholder="Email"
                    onChange={(e) => up("networks", draft.networks.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                  />
                  <button type="button" className="x" aria-label="Remove network" onClick={() => up("networks", draft.networks.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div>
              <button type="button" className="secondary small" onClick={() => up("networks", [...draft.networks, { name: "", email: "" }])}>
                + Network
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canSetStandard && (
              <button
                type="button"
                className="small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await onFirm(draft);
                    setDraft(null);
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save for all cases
              </button>
            )}
            <button
              type="button"
              className={canSetStandard ? "secondary small" : "small"}
              onClick={() => {
                onCase(draft);
                setDraft(null);
              }}
            >
              This case only
            </button>
            <button type="button" className="secondary small" onClick={() => setDraft({ ...DEFAULT_STANDARD, networks: draft.networks })}>
              Reset text
            </button>
            <button type="button" className="secondary small" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
          {err && <p className="error">{err}</p>}
        </>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary small"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
