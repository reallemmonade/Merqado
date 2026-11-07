"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Ctrl K opens keyword search; Ctrl / jumps to the case GPT bar. */
export function Shortcuts({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push(`/e/${engagementId}/search`);
      } else if (e.key === "/") {
        const el = document.getElementById("gpt-bar-input") ?? document.getElementById("gpt-input");
        if (el) {
          e.preventDefault();
          (el as HTMLInputElement).focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engagementId, router]);
  return null;
}
