import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";

const EVERY_MS = 4000;

/**
 * While a screen for this case is in view, checks the case's live version every few seconds and
 * calls `onChange` when anyone changes the case (on the web, the Mac app or another phone).
 */
export function useCaseLive(caseId: string | null | undefined, onChange: () => void) {
  const changed = useRef(onChange);
  changed.current = onChange;
  useFocusEffect(
    useCallback(() => {
      if (!caseId) return;
      let last: string | null = null;
      let stopped = false;
      const check = async () => {
        const r = await api<{ v: string }>(`/api/mobile/cases/${caseId}/live`).catch(() => null);
        if (stopped || !r) return;
        if (last !== null && r.v !== last) changed.current();
        last = r.v;
      };
      void check();
      const t = setInterval(check, EVERY_MS);
      return () => {
        stopped = true;
        clearInterval(t);
      };
    }, [caseId]),
  );
}
