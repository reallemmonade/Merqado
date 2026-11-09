"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { safeReturnPath } from "@/lib/return-path";

/** Leaves Settings for the page you opened it from (or home). Esc does the same. */
export function SettingsClose({ from }: { from?: string }) {
  const router = useRouter();
  const close = useCallback(() => router.push(safeReturnPath(from)), [router, from]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Esc in a field or an open pop-up belongs to that, not to Settings.
      const t = e.target;
      if (t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (t instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit"].includes(t.type)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <button type="button" className="settings-close" onClick={close} aria-label="Close settings" title="Close · Esc">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
