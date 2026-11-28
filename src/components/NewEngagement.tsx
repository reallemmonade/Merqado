"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ARCHETYPES, type Archetype } from "@/db/schema";
import { ROOM_TEMPLATES } from "@/lib/case/rooms";
import { targetCount, type Onboarding, type Standard } from "@/lib/onboarding/model";
import { buildOnboarding } from "@/lib/onboarding/newcase";
import { ROLE_LABEL } from "@/lib/roles";

const STEPS = ["Name", "Code", "Scope", "Team", "Experts", "Chats"] as const;
const SCOPE_TYPES = ".pdf,.docx,.pptx,.txt,.md";

export interface FirmPerson {
  id: string;
  name: string;
  archetype: Archetype;
}

interface TeamPick {
  userId: string;
  caseRole: Archetype;
}

const muted = "var(--muted, #6d6a80)";

export function NewEngagement({ me, people, standard }: { me: string; people: FirmPerson[]; standard: Standard }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [caseCode, setCaseCode] = useState("");
  const [market, setMarket] = useState("");
  const [weeks, setWeeks] = useState("");
  const [objective, setObjective] = useState("");
  const [sample, setSample] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fill, setFill] = useState<Partial<Onboarding>>({});
  const [filled, setFilled] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [team, setTeam] = useState<TeamPick[]>([]);
  const [angles, setAngles] = useState<{ name: string; n: string }[]>([{ name: "", n: "" }]);
  const [networks, setNetworks] = useState<string[]>(standard.networks.map((n) => n.name));
  const [rooms, setRooms] = useState<string[]>(ROOM_TEMPLATES.map((t) => t.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setStep(0);
    setError(null);
  };

  if (!open)
    return (
      <div>
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          + New case
        </button>
      </div>
    );

  const canNext = step === 0 ? clientName.trim() !== "" && title.trim() !== "" : true;
  const last = step === STEPS.length - 1;
  const meRow = people.find((p) => p.id === me);
  const others = people.filter((p) => p.id !== me && !team.some((t) => t.userId === p.id));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const expertsTotal = angles.reduce((sum, a) => sum + (a.name.trim() ? targetCount(a.n) : 0), 0);

  /** Reads the dropped scope documents and fills fields that are still empty. */
  const readScope = async (picked: File[]) => {
    const all = [...files, ...picked].slice(0, 5);
    setFiles(all);
    setReading(true);
    setError(null);
    const form = new FormData();
    all.forEach((f) => form.append("file", f));
    form.append("codeName", clientName);
    const res = await fetch("/api/engagements/scope-fill", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setReading(false);
    if (!res?.ok) return setError(data.error ?? "Couldn't read the file.");
    const f: Partial<Onboarding> = data.fill ?? {};
    setFill(f);
    let n = 0;
    const put = (cur: string, val: string | undefined, set: (v: string) => void) => {
      if (!cur.trim() && val?.trim()) {
        set(val.trim());
        n++;
      }
    };
    put(market, f.market, setMarket);
    put(weeks, f.weeks, setWeeks);
    put(objective, f.objective, setObjective);
    if (f.angles?.length && !angles.some((a) => a.name.trim())) {
      setAngles(f.angles.map((a) => ({ name: a.name, n: a.n })));
      n += f.angles.length;
    }
    setFilled(n);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/engagements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientName, title, sample, team, rooms }),
    }).catch(() => null);
    if (!res) {
      setBusy(false);
      return setError("Couldn't reach Merqado. Try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.error ?? "Something went wrong.");
    }
    // The scope documents go into the case's Files.
    const docs: { id: string; filename: string }[] = [];
    for (const f of files) {
      const form = new FormData();
      form.append("file", f);
      const up = await fetch(`/api/engagements/${data.id}/sources`, { method: "POST", body: form }).catch(() => null);
      const s = up?.ok ? (await up.json().catch(() => ({}))).source : null;
      if (s?.id) docs.push({ id: s.id, filename: s.filename });
    }
    const onboarding = buildOnboarding(fill, { market, objective, weeks, angles, networks, docs }, standard);
    await fetch(`/api/engagements/${data.id}/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "save", caseCode: caseCode.trim(), data: onboarding }),
    }).catch(() => null);
    setBusy(false);
    router.push(`/e/${data.id}/onboarding`);
  };

  const toggle = (list: string[], set: (v: string[]) => void, name: string) =>
    set(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!last) return setStep(step + 1);
        void create();
      }}
      style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 20, alignItems: "stretch" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6 }} aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} style={{ width: 28, height: 4, borderRadius: 2, background: i <= step ? "var(--accent, #9a4a96)" : "var(--line, #e5e3ee)" }} />
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{STEPS[step]}</div>
        {step === 0 && (
          <>
            <label className="field">
              Code name
              <input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Project Resin" />
            </label>
            <label className="field">
              Title
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            </label>
            <label className="check">
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Sample data
            </label>
          </>
        )}
        {step === 1 && (
          <label className="field">
            Case code
            <input type="text" value={caseCode} onChange={(e) => setCaseCode(e.target.value)} placeholder="CASE000" />
          </label>
        )}
        {step === 2 && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length) void readScope(dropped);
              }}
              style={{
                border: `1.5px dashed ${dragging ? "var(--accent, #9a4a96)" : "var(--line, #e5e3ee)"}`,
                borderRadius: 12,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 14 }}>Drop SOW</strong>
              <span style={{ fontSize: 12, color: muted }}>PDF · DOCX</span>
              <button type="button" className="secondary" disabled={reading} onClick={() => fileInput.current?.click()}>
                {reading ? "Reading…" : "Browse"}
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={SCOPE_TYPES}
                hidden
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (picked.length) void readScope(picked);
                }}
              />
            </div>
            {files.map((f) => (
              <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, border: "1px solid var(--line, #e5e3ee)", borderRadius: 8, padding: "8px 12px", minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{f.name}</span>
                {filled !== null && !reading && (
                  <span style={{ fontSize: 11, color: "var(--accent, #9a4a96)", border: "1px solid currentColor", borderRadius: 99, padding: "1px 8px", whiteSpace: "nowrap" }}>AI filled {filled}</span>
                )}
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 10 }}>
              <label className="field">
                Market
                <input type="text" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Market" />
              </label>
              <label className="field">
                Weeks
                <input type="text" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="8" />
              </label>
            </div>
            <label className="field">
              Objective
              <textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective" rows={3} />
            </label>
          </>
        )}
        {step === 3 && (
          <>
            {meRow && (
              <div className="row" style={{ gap: 10 }}>
                <span>{meRow.name}</span>
                <span className="muted">{ROLE_LABEL[meRow.archetype]}</span>
              </div>
            )}
            {team.map((t) => (
              <div key={t.userId} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 140px 32px", gap: 8, alignItems: "center" }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(t.userId)}</span>
                <select
                  aria-label="Role"
                  value={t.caseRole}
                  onChange={(e) => setTeam(team.map((x) => (x.userId === t.userId ? { ...x, caseRole: e.target.value as Archetype } : x)))}
                >
                  {ARCHETYPES.map((a) => (
                    <option key={a} value={a}>
                      {ROLE_LABEL[a]}
                    </option>
                  ))}
                </select>
                <button type="button" className="secondary" aria-label="Remove" onClick={() => setTeam(team.filter((x) => x.userId !== t.userId))}>
                  ×
                </button>
              </div>
            ))}
            {others.length > 0 && (
              <select
                aria-label="Add person"
                value=""
                onChange={(e) => {
                  const p = people.find((x) => x.id === e.target.value);
                  if (p) setTeam([...team, { userId: p.id, caseRole: p.archetype }]);
                }}
              >
                <option value="">+ Add</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {step === 4 && (
          <>
            {angles.map((a, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 32px", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  aria-label="Interviewee type"
                  value={a.name}
                  onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="Interviewee type"
                />
                <input type="text" aria-label="Target" value={a.n} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} placeholder="~10" />
                <button type="button" className="secondary" aria-label="Remove" onClick={() => setAngles(angles.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="secondary" onClick={() => setAngles([...angles, { name: "", n: "" }])}>
                + Add
              </button>
            </div>
            {standard.networks.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: muted }}>Networks</div>
                <div className="chips">
                  {standard.networks.map((n) => (
                    <button key={n.name} type="button" className="chip" aria-pressed={networks.includes(n.name)} onClick={() => toggle(networks, setNetworks, n.name)}>
                      {n.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {step === 5 && (
          <div className="chips">
            {ROOM_TEMPLATES.map((t) => (
              <button key={t.name} type="button" className="chip" aria-pressed={rooms.includes(t.name)} onClick={() => toggle(rooms, setRooms, t.name)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto" }}>
          {step === 0 ? (
            <button type="button" className="secondary" onClick={reset}>
              Cancel
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="submit" disabled={busy || reading || !canNext}>
            {last ? (busy ? "Creating…" : "Create") : "Next →"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18 }} aria-label="Preview">
        <div style={{ fontSize: 11, color: muted, letterSpacing: ".06em" }}>{caseCode.trim() || "—"}</div>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{clientName.trim() || "Untitled"}</div>
        <dl style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr)", gap: "6px 10px", fontSize: 13, margin: 0 }}>
          <dt style={{ color: muted }}>Title</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{title.trim() || "—"}</dd>
          <dt style={{ color: muted }}>Market</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{market.trim() || "—"}</dd>
          <dt style={{ color: muted }}>Weeks</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{weeks.trim() || "—"}</dd>
          <dt style={{ color: muted }}>Objective</dt>
          <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{objective.trim() || "—"}</dd>
          <dt style={{ color: muted }}>Team</dt>
          <dd style={{ margin: 0 }}>{team.length + 1}</dd>
          <dt style={{ color: muted }}>Experts</dt>
          <dd style={{ margin: 0 }}>{expertsTotal || "—"}</dd>
          <dt style={{ color: muted }}>Chats</dt>
          <dd style={{ margin: 0 }}>{rooms.length}</dd>
        </dl>
      </div>
    </form>
  );
}
