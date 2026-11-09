import type { Archetype } from "@/db/schema";
import { z } from "zod";
import type { SourceMessage } from "./sources/types";

export interface Member {
  id: string;
  name: string;
  /** Case role; when set, a to-do from a private chat only goes to someone in that chat's roles. */
  archetype?: Archetype;
}

export interface Suggestion {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  message: SourceMessage;
}

/** Lowercase words only, so "Send v2 deck!" and "send v2 deck" count as the same to-do. */
export function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The prompt for one scan. Messages are numbered M1..Mn so the reply can point back to them. */
export function buildPrompt(messages: SourceMessage[], members: Member[], existing: string[], today: string) {
  const system = [
    "You turn a consulting team's chat and email messages into a to-do list.",
    "Only list concrete actions someone on the team committed to, was asked to do, or clearly still has to do. Skip status updates, finished work, opinions and small talk.",
    "Write each title as a short imperative under 12 words, e.g. \"Share storyline v2 with MDs\".",
    "Assignee: the team member's name exactly as listed, or null if unclear. \"I will\" means the message's author.",
    `Due: YYYY-MM-DD if a date is stated or clearly implied (today is ${today}), else null.`,
    "Do not repeat anything in the existing to-do list, even reworded.",
    'Reply with JSON only: {"todos":[{"title":"...","assignee":"Name or null","due":"YYYY-MM-DD or null","from":"M3"}]}.',
  ].join("\n");
  const user = [
    "Team members:",
    ...members.map((m) => `- ${m.name}`),
    "",
    "Existing to-dos:",
    ...(existing.length ? existing.map((t) => `- ${t}`) : ["- none"]),
    "",
    "Messages:",
    ...messages.map((m, i) => `M${i + 1} [${m.container}] ${m.author}, ${m.at.toISOString().slice(0, 10)}: ${m.text.slice(0, 1500)}`),
  ].join("\n");
  return { system, user };
}

const Reply = z.object({
  todos: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        assignee: z.string().nullish(),
        due: z.string().nullish(),
        from: z.string().max(20),
      }),
    )
    .max(50),
});

/** Matches "Dana", "dana smith" or "Dana Smith" to one member; ambiguous first names match no one. */
export function matchMember(name: string | null | undefined, members: Member[]): string | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n === "null") return null;
  const full = members.find((m) => m.name.toLowerCase() === n);
  if (full) return full.id;
  const first = members.filter((m) => m.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
  return first.length === 1 ? first[0]!.id : null;
}

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-31). */
export function isDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Parses the model's JSON, drops anything that points nowhere or repeats an existing to-do. */
export function parseSuggestions(json: unknown, messages: SourceMessage[], members: Member[], existing: string[]): Suggestion[] {
  const parsed = Reply.parse(json);
  const seen = new Set(existing.map(normTitle));
  const out: Suggestion[] = [];
  for (const t of parsed.todos) {
    const idx = Number(t.from.replace(/\D/g, "")) - 1;
    const message = messages[idx];
    const key = normTitle(t.title);
    if (!message || !key || seen.has(key)) continue;
    seen.add(key);
    const due = t.due && isDate(t.due) ? t.due : null;
    const audience = message.audience;
    const eligible = audience ? members.filter((m) => !m.archetype || audience.includes(m.archetype)) : members;
    out.push({ title: t.title, assigneeId: matchMember(t.assignee, eligible), dueDate: due, message });
  }
  return out;
}
