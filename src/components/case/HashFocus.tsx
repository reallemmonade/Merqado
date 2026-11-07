"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Links from the Overview point at a record with a #hash (e.g. /workplan#task-abc). This scrolls
 * that record into view and flashes it, so the reader lands on the thing they clicked.
 */
export function HashFocus() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("flash"), 2200);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => {
      window.removeEventListener("hashchange", go);
      clearTimeout(timer);
    };
  }, [pathname, search]);
  return null;
}
