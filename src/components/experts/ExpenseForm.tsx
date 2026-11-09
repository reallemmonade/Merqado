"use client";

import { useState } from "react";
import { useApi } from "./useApi";

const CATEGORIES = [
  ["meals", "Meals (late dinners)"],
  ["travel", "Cabs and travel"],
  ["ai_tools", "AI tools"],
  ["other", "Other"],
] as const;

export function ExpenseForm({ engagementId }: { engagementId: string }) {
  const api = useApi();
  const [category, setCategory] = useState("meals");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await api.call("expense", `/api/engagements/${engagementId}/expert-setup`, {
          json: { kind: "expense", category, description, amount: Number(amount), spentOn: spentOn || null },
        });
        if (ok) {
          setDescription("");
          setAmount("");
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div className="form-grid">
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          What for
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        </label>
        <label className="field">
          Amount ($)
          <input type="number" min={0} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          Date
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </label>
      </div>
      <div>
        <button type="submit" className="small" disabled={api.busy === "expense"}>
          Add expense
        </button>
      </div>
      {api.error && <p className="error">{api.error}</p>}
    </form>
  );
}

export function DeleteExpense({ engagementId, id }: { engagementId: string; id: string }) {
  const api = useApi();
  return (
    <button
      type="button"
      className="secondary small"
      aria-label="Remove expense"
      disabled={!!api.busy}
      onClick={() => api.call("del", `/api/engagements/${engagementId}/expert-setup`, { json: { kind: "delete", what: "expense", id } })}
    >
      Remove
    </button>
  );
}
