import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";

/** Loads a GET endpoint, reloads when the screen comes back into view, and optionally polls. */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Only the newest request for the current path may write state, so a slow
  // answer for the previous case never overwrites the new one.
  const seq = useRef(0);
  const current = useRef(path);
  current.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    try {
      const d = await api<T>(path);
      if (n === seq.current && current.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current && current.current === path) setError(e instanceof Error ? e.message : "Error");
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [path]);

  // Loads on first view, on every return to the screen, and on each poll.
  useFocusEffect(
    useCallback(() => {
      void load();
      if (!pollMs) return;
      const t = setInterval(load, pollMs);
      return () => clearInterval(t);
    }, [load, pollMs]),
  );

  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loading = !!path && data === null && error === null;
  return { data, error, loading, refreshing, refresh, reload: load, setData };
}
