"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Lets admins and test accounts switch their own title, and so their view, on the spot. */
export function TitlePicker({ current, titles }: { current: string; titles: { id: string; title: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <label className="eyebrow" htmlFor="title-picker" style={{ display: "block" }}>
        View as
      </label>
      <select
        id="title-picker"
        value={value}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.value;
          const previous = value;
          setValue(next);
          setBusy(true);
          setError(null);
          const res = await fetch("/api/me/title", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ firmRoleId: next }),
          });
          setBusy(false);
          if (!res.ok) {
            setValue(previous);
            setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't switch.");
            return;
          }
          router.refresh();
        }}
        style={{ width: "100%", background: "var(--nav-active)", color: "#fff", border: "1px solid #2b3a48" }}
      >
        {titles.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      {error && (
        <p className="error" role="alert" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
