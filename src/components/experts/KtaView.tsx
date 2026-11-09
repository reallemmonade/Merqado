"use client";

import Link from "next/link";
import { shortDate } from "@/lib/experts/calc";
import type { ExpertsData } from "@/lib/experts/data";
import { SourceLink } from "./SourceLink";
import { useApi } from "./useApi";

const VERDICTS = [
  ["supports", "Supports"],
  ["challenges", "Challenges"],
  ["new", "New point"],
] as const;

export function KtaView({
  engagementId,
  data,
  canEdit,
  focusHyp,
  focusVerdict,
}: {
  engagementId: string;
  data: ExpertsData;
  canEdit: boolean;
  /** Opened from a hypothesis (or its supports / challenges count): show only the takeaways behind it. */
  focusHyp?: string;
  focusVerdict?: "supports" | "challenges";
}) {
  const api = useApi();
  const base = `/e/${engagementId}/experts/ktas`;
  const hypHref = (h: string, v?: "supports" | "challenges") => `${base}?h=${h}${v ? `&v=${v}` : ""}#hyp-${h}`;
  const inFocus = (k: ExpertsData["takeaways"][number]) =>
    !focusHyp || (k.included && k.hypothesisId === focusHyp && (!focusVerdict || k.verdict === focusVerdict));
  const takeaways = data.takeaways.filter(inFocus);
  const focused = data.hypotheses.find((h) => h.id === focusHyp);
  const interviews = data.experts.filter((e) => takeaways.some((k) => k.expertId === e.id));
  const patch = (id: string, json: Record<string, unknown>) =>
    api.call(`kta-${id}`, `/api/engagements/${engagementId}/takeaways/${id}`, { method: "PATCH", json });
  const included = data.takeaways.filter((k) => k.included);
  const anonOf = (expertId: string) => data.experts.find((e) => e.id === expertId)?.anonTitle ?? "";

  const themes = data.hypotheses.map((h) => {
    const ks = included.filter((k) => k.hypothesisId === h.id);
    const sup = ks.filter((k) => k.verdict === "supports").length;
    const ch = ks.filter((k) => k.verdict === "challenges").length;
    const read = !ks.length ? "Not tested yet" : ch === 0 ? "Holding up" : sup > ch ? "Mostly holding, with exceptions" : "Under pressure";
    return { h, ks, sup, ch, read };
  });
  const unlinked = included.filter((k) => !k.hypothesisId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="split">
        <section className="primary" aria-label="Takeaways by interview">
          {focused && (
            <span className="pill filter-chip">
              {[focused.statement, focusVerdict === "supports" ? "Supports" : focusVerdict === "challenges" ? "Challenges" : ""].filter(Boolean).join(" · ")}
              <Link href={base} className="x" aria-label="Show all takeaways">
                ×
              </Link>
            </span>
          )}
          {interviews.length === 0 && (
            <div className="empty">
              <strong>{focused ? "None" : "No takeaways yet"}</strong>
            </div>
          )}
          {interviews.map((e) => {
            const ks = takeaways.filter((k) => k.expertId === e.id);
            const on = ks.filter((k) => k.included).length;
            const type = data.types.find((t) => t.id === e.typeId);
            return (
              <div className="group" key={e.id}>
                <div className="group-head">
                  <h2>{e.anonTitle}</h2>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {[type?.name, shortDate(e.interviewDate)].filter(Boolean).join(" · ")}
                  </span>
                  <span style={{ flex: 1 }} />
                  {canEdit && (
                    <button
                      type="button"
                      className="secondary small"
                      disabled={!!api.busy}
                      onClick={async () => {
                        const to = on !== ks.length;
                        for (const k of ks) if (k.included !== to) await patch(k.id, { included: to });
                      }}
                    >
                      {on === ks.length ? "Exclude all" : "Include all"}
                    </button>
                  )}
                  <Link href={`/e/${engagementId}/experts?expert=${e.id}&tab=takeaways`} style={{ fontSize: 13 }}>
                    Open
                  </Link>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {ks.map((k) => (
                    <div key={k.id} className={`item ${k.included ? "" : "off"}`} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        id={`inc-${k.id}`}
                        checked={k.included}
                        disabled={!canEdit}
                        onChange={(ev) => patch(k.id, { included: ev.target.checked })}
                        style={{ width: 18, height: 18, marginTop: 2 }}
                      />
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <label htmlFor={`inc-${k.id}`} style={{ lineHeight: 1.5 }}>
                          {k.body}
                        </label>
                        <div className="meta">
                          <label className="sr-only" htmlFor={`v-${k.id}`}>
                            Verdict
                          </label>
                          <select id={`v-${k.id}`} value={k.verdict} disabled={!canEdit} onChange={(ev) => patch(k.id, { verdict: ev.target.value })} style={{ fontSize: 12, padding: "4px 6px" }}>
                            {VERDICTS.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <label className="sr-only" htmlFor={`h-${k.id}`}>
                            Hypothesis
                          </label>
                          <select id={`h-${k.id}`} value={k.hypothesisId ?? ""} disabled={!canEdit} onChange={(ev) => patch(k.id, { hypothesisId: ev.target.value || null })} style={{ fontSize: 12, padding: "4px 6px", maxWidth: 280 }}>
                            <option value="">No hypothesis</option>
                            {data.hypotheses.map((h) => (
                              <option key={h.id} value={h.id}>
                                {[h.slideRef, h.statement].filter(Boolean).join(" · ")}
                              </option>
                            ))}
                          </select>
                          {k.locator && (
                            <SourceLink
                              engagementId={engagementId}
                              transcripts={data.transcripts.filter((t) => t.expertId === k.expertId)}
                              locator={k.locator}
                            />
                          )}
                          {k.source === "ai" && <span>AI draft</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="side" aria-label="Hypotheses" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 18 }}>Hypotheses</h2>
            <Link href={`/e/${engagementId}/experts/setup`} style={{ fontSize: 13 }}>
              Edit themes
            </Link>
          </div>
          {themes.length === 0 && <p className="muted">No hypotheses</p>}
          {themes.map(({ h, ks, sup, ch, read }) => (
            <div key={h.id} id={`hyp-${h.id}`} className={`card${h.id === focusHyp ? " hyp-on" : ""}`} style={{ gap: 10, padding: 16 }}>
              <div>
                {h.slideRef && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {h.slideRef}
                  </div>
                )}
                <Link href={hypHref(h.id)} className="plain">
                  <strong>{h.statement}</strong>
                </Link>
              </div>
              <div className="meta">
                <Link href={hypHref(h.id, "supports")} className="tag v-supports">
                  {sup} support
                </Link>
                <Link href={hypHref(h.id, "challenges")} className="tag v-challenges">
                  {ch} challenge
                </Link>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{read}</span>
              </div>
              {ks.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4 }}>
                  {ks.map((k) => (
                    <li key={k.id}>
                      {k.body} <span className="muted">({anonOf(k.expertId)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {unlinked.length > 0 && (
            <div className="card" style={{ gap: 8, padding: 16 }}>
              <strong>Not linked to a hypothesis ({unlinked.length})</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                {unlinked.map((k) => (
                  <li key={k.id}>
                    {k.body} <span className="muted">({anonOf(k.expertId)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      {api.error && <p className="error">{api.error}</p>}
    </div>
  );
}
