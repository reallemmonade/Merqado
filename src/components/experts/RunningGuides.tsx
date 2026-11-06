"use client";

import { useState } from "react";
import type { ExpertsData } from "@/lib/experts/data";
import { useApi } from "./useApi";

/** The team's running interview guides: one general guide plus one per interviewee type. */
export function RunningGuides({ engagementId, data, canEdit }: { engagementId: string; data: ExpertsData; canEdit: boolean }) {
  const slots = [{ id: null as string | null, name: "General (used when a type has no guide)" }, ...data.types.map((t) => ({ id: t.id as string | null, name: t.name }))];
  const [pick, setPick] = useState<string>("");
  const slot = slots.find((s) => (s.id ?? "") === pick) ?? slots[0]!;
  const saved = data.guides.find((g) => (g.typeId ?? null) === slot.id)?.body ?? "";
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Running guides</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        The questions you ask everyone of a type. Each expert&rsquo;s generated guide adds bespoke questions on top.
      </p>
      <label className="field">
        Guide for
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          {slots.map((s) => (
            <option key={s.id ?? ""} value={s.id ?? ""}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Editor key={slot.id ?? "general"} engagementId={engagementId} typeId={slot.id} saved={saved} canEdit={canEdit} />
    </section>
  );
}

function Editor({ engagementId, typeId, saved, canEdit }: { engagementId: string; typeId: string | null; saved: string; canEdit: boolean }) {
  const api = useApi();
  const [body, setBody] = useState(saved);
  return (
    <>
      <label className="sr-only" htmlFor="running-guide">
        Running guide
      </label>
      <textarea
        id="running-guide"
        rows={16}
        value={body}
        disabled={!canEdit}
        onChange={(e) => setBody(e.target.value)}
        placeholder={"1. Walk me through your role.\n2. How have prices moved over the last three years?\n3. What would it take to switch suppliers?"}
      />
      {canEdit && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            disabled={api.busy === "g" || body === saved}
            onClick={() => api.call("g", `/api/engagements/${engagementId}/expert-setup`, { json: { kind: "guide", typeId, body } })}
          >
            {api.busy === "g" ? "Saving…" : "Save guide"}
          </button>
          {body === saved && saved && <span className="muted" style={{ fontSize: 13 }}>Saved</span>}
        </div>
      )}
      {api.error && <p className="error">{api.error}</p>}
    </>
  );
}
