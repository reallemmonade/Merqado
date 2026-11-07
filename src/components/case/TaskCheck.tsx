"use client";

import { useApi } from "@/components/experts/useApi";

/** Ticks a workplan task off as done (or back to in progress). */
export function TaskCheck({ engagementId, taskId, done, label, disabled }: { engagementId: string; taskId: string; done: boolean; label: string; disabled?: boolean }) {
  const { call, busy } = useApi();
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={done}
      disabled={disabled || busy !== null}
      onChange={() =>
        call("t", `/api/engagements/${engagementId}/workplan`, { json: { op: "task.update", id: taskId, status: done ? "in_progress" : "done" } })
      }
    />
  );
}
