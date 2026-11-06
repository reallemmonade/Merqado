"use client";

import { useState } from "react";
import { anonymizeTitle } from "@/lib/experts/calc";
import type { ExpertRow, ExpertsData } from "@/lib/experts/data";

export interface ExpertFormValues {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  anonTitle: string | null;
  isFormer: boolean;
  typeId: string | null;
  interviewDate: string | null;
  network: string;
  callMinutes: number;
  followupMinutes: number;
  surveyMinutes: number;
  hourlyRate: number;
  topicIds: string[];
  notes: string;
}

const NETWORKS = ["GLG", "AlphaSights", "Guidepoint", "Third Bridge", "Tegus", "Direct"];

export function ExpertForm({
  types,
  topics,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  types: ExpertsData["types"];
  topics: ExpertsData["topics"];
  initial?: ExpertRow;
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: ExpertFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ExpertFormValues>({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    company: initial?.company ?? "",
    title: initial?.title ?? "",
    anonTitle: initial?.anonOverride ?? null,
    isFormer: initial?.isFormer ?? false,
    typeId: initial?.typeId ?? types[0]?.id ?? null,
    interviewDate: initial?.interviewDate ?? null,
    network: initial?.network ?? "",
    callMinutes: initial?.callMinutes ?? 60,
    followupMinutes: initial?.followupMinutes ?? 0,
    surveyMinutes: initial?.surveyMinutes ?? 0,
    hourlyRate: initial?.hourlyRate ?? 0,
    topicIds: initial?.topicIds ?? [],
    notes: initial?.notes ?? "",
  });
  const set = <K extends keyof ExpertFormValues>(k: K, val: ExpertFormValues[K]) => setV((o) => ({ ...o, [k]: val }));
  const auto = anonymizeTitle(v.company, v.title, v.isFormer);
  const num = (s: string) => (s === "" ? 0 : Math.max(0, Math.round(Number(s)) || 0));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...v, anonTitle: v.anonTitle?.trim() ? v.anonTitle.trim() : null });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="form-grid">
        <label className="field">
          First name
          <input type="text" required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </label>
        <label className="field">
          Last name
          <input type="text" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </label>
        <label className="field">
          Company
          <input type="text" value={v.company} onChange={(e) => set("company", e.target.value)} />
        </label>
        <label className="field">
          Full title
          <input type="text" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior Director, Commercial Strategy" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={v.isFormer} onChange={(e) => set("isFormer", e.target.checked)} /> Former employee
      </label>
      <label className="field">
        Anonymized title (leave blank to use the automatic one)
        <input type="text" value={v.anonTitle ?? ""} placeholder={auto || "Company, seniority"} onChange={(e) => set("anonTitle", e.target.value)} />
      </label>
      <div className="form-grid">
        <label className="field">
          Type
          <select value={v.typeId ?? ""} onChange={(e) => set("typeId", e.target.value || null)}>
            <option value="">No type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Interview date
          <input type="date" value={v.interviewDate ?? ""} onChange={(e) => set("interviewDate", e.target.value || null)} />
        </label>
        <label className="field">
          Expert network
          <input type="text" list="networks" value={v.network} onChange={(e) => set("network", e.target.value)} />
          <datalist id="networks">
            {NETWORKS.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Hourly rate ($)
          <input type="number" min={0} value={v.hourlyRate || ""} onChange={(e) => set("hourlyRate", num(e.target.value))} />
        </label>
        <label className="field">
          Call minutes
          <input type="number" min={0} value={v.callMinutes || ""} onChange={(e) => set("callMinutes", num(e.target.value))} />
        </label>
        <label className="field">
          Follow-up minutes
          <input type="number" min={0} value={v.followupMinutes || ""} onChange={(e) => set("followupMinutes", num(e.target.value))} />
        </label>
        <label className="field">
          Survey minutes
          <input type="number" min={0} value={v.surveyMinutes || ""} onChange={(e) => set("surveyMinutes", num(e.target.value))} />
        </label>
      </div>
      {topics.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          <legend className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Expertise in
          </legend>
          {topics.map((t) => (
            <label key={t.id} className="check">
              <input
                type="checkbox"
                checked={v.topicIds.includes(t.id)}
                onChange={(e) => set("topicIds", e.target.checked ? [...v.topicIds, t.id] : v.topicIds.filter((x) => x !== t.id))}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
      )}
      <label className="field">
        Notes
        <textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
