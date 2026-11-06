"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Calls an engagement API, then refreshes the page's server data. */
export function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(key: string, url: string, init: { method?: string; json?: unknown; form?: FormData } = {}) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: init.method ?? "POST",
        headers: init.json !== undefined ? { "content-type": "application/json" } : undefined,
        body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { call, busy, error, setError };
}
