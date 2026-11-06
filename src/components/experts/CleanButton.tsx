"use client";

import { useApi } from "./useApi";

export function CleanButton({ engagementId, transcriptId, again }: { engagementId: string; transcriptId: string; again: boolean }) {
  const api = useApi();
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        className={again ? "secondary small" : "small"}
        disabled={api.busy === "clean"}
        onClick={() => api.call("clean", `/api/engagements/${engagementId}/transcripts/${transcriptId}/clean`)}
      >
        {api.busy === "clean" ? "Cleaning with AI…" : again ? "Clean again" : "Clean with AI"}
      </button>
      {api.error && <span className="error" style={{ fontSize: 13 }}>{api.error}</span>}
    </span>
  );
}
