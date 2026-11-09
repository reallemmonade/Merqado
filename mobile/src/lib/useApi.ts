import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";

/** Loads a GET endpoint, reloads when the screen comes back into view, and optionally polls. */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const live = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (live.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : "Error");
    }
  }, [path]);

  useEffect(() => {
    live.current = true;
    setData(null);
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (!pollMs) return;
      const t = setInterval(load, pollMs);
      return () => clearInterval(t);
    }, [load, pollMs]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, reload: load, setData };
}
