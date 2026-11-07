"use client";

import { useApi } from "@/components/experts/useApi";

/** Fills an empty case section with the sample case. */
export function SampleButton({ engagementId }: { engagementId: string }) {
  const { call, busy, error } = useApi();
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button type="button" className="secondary small" disabled={busy !== null} onClick={() => call("sample", `/api/engagements/${engagementId}/sample`)}>
        {busy ? "Adding…" : "Sample data"}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
