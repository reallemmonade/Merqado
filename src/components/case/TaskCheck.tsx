"use client";

import type { TaskStatus } from "@/db/schema";
import { useApi } from "@/components/experts/useApi";

/** Ticks a workplan task forward: done for its reviewer, ready for review for its assignee. */
export function TaskCheck({ engagementId, taskId, next, label }: { engagementId: string; taskId: string; next: TaskStatus | null; label: string }) {
  const { call, busy } = useApi();
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={false}
      disabled={!next || busy !== null}
      onChange={() => next && call("t", `/api/engagements/${engagementId}/workplan`, { json: { op: "task.update", id: taskId, status: next } })}
    />
  );
}
