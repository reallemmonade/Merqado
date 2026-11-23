"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CASE_CHANGED_EVENT, createLiveSync } from "./liveSync";

/**
 * Keeps every open tab and window on a case live. One tab per browser holds the server stream
 * and passes changes to the rest, so many tabs don't use up the browser's connections. Each tab
 * reloads its own data and keeps its own view, scroll and unsaved input.
 */
export function LiveSync({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  useEffect(
    () =>
      createLiveSync({
        engagementId,
        onChange: () => {
          router.refresh();
          window.dispatchEvent(new CustomEvent(CASE_CHANGED_EVENT, { detail: { engagementId } }));
        },
        onSignedOut: () => location.reload(),
      }),
    [engagementId, router],
  );
  return null;
}
