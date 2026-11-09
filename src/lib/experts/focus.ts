import { STATUS_LABEL, STATUS_ORDER, type Status } from "./calc";
import type { ExpertRow } from "./data";

/**
 * A "focus" is the slice of experts behind one segment of a Metrics chart. Clicking a segment
 * opens the Calls tab with ?focus=… and the list narrowed to those experts, in an order that
 * suits the question (e.g. most recent call first for "discussed").
 *
 *   type:<typeId>:<status>        Coverage by type segment
 *   type:<typeId>                 Everyone of that type (Overview category row)
 *   status:<status>               Everyone at that status (Overview interviews bar)
 *   topic:<topicId>:discussed     Topic coverage, talked about it in a transcript
 *   topic:<topicId>:notyet        Topic coverage, tagged with it but not discussed yet
 *   budget:spent | budget:booked | budget:expected
 */
export type Focus = { label: string; ids: string[] };

type Data = {
  experts: ExpertRow[];
  types: { id: string; name: string }[];
  topics: { id: string; name: string }[];
  transcripts: { expertId: string; discussedTopicIds: string[] }[];
};

export function focusHref(engagementId: string, key: string): string {
  return `/e/${engagementId}/experts?focus=${encodeURIComponent(key)}`;
}

const isStatus = (s: string): s is Status => (STATUS_ORDER as string[]).includes(s);

// Latest call first; calls not booked yet go last.
const byDateDesc = (a: ExpertRow, b: ExpertRow) => (b.interviewDate ?? "").localeCompare(a.interviewDate ?? "");
// Furthest along first (completed, scheduled, approved, proposed), then by date.
const byProgress = (a: ExpertRow, b: ExpertRow) =>
  STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status) || byDateDesc(a, b);
const bySoonest = (a: ExpertRow, b: ExpertRow) => (a.interviewDate ?? "9999").localeCompare(b.interviewDate ?? "9999");

export function resolveFocus(data: Data, key: string | undefined): Focus | null {
  if (!key) return null;
  const [kind, id, part] = key.split(":");
  const live = data.experts.filter((e) => e.status !== "declined");
  const pick = (label: string, rows: ExpertRow[], sort: (a: ExpertRow, b: ExpertRow) => number): Focus => ({
    label,
    ids: [...rows].sort(sort).map((e) => e.id),
  });

  if (kind === "type" && id && part && isStatus(part)) {
    const type = data.types.find((t) => t.id === id);
    if (!type) return null;
    return pick(`${type.name} · ${STATUS_LABEL[part].toLowerCase()}`, live.filter((e) => e.typeId === id && e.status === part), part === "completed" ? byDateDesc : bySoonest);
  }

  if (kind === "type" && id && !part) {
    const type = data.types.find((t) => t.id === id);
    if (!type) return null;
    return pick(type.name, live.filter((e) => e.typeId === id), byProgress);
  }

  if (kind === "status" && id && isStatus(id)) {
    return pick(STATUS_LABEL[id], live.filter((e) => e.status === id), id === "completed" ? byDateDesc : bySoonest);
  }

  if (kind === "topic" && id && (part === "discussed" || part === "notyet")) {
    const topic = data.topics.find((t) => t.id === id);
    if (!topic) return null;
    const discussed = new Set(data.transcripts.filter((t) => t.discussedTopicIds.includes(id)).map((t) => t.expertId));
    return part === "discussed"
      ? pick(`${topic.name} · discussed`, live.filter((e) => discussed.has(e.id)), byDateDesc)
      : pick(`${topic.name} · know it, not discussed yet`, live.filter((e) => e.topicIds.includes(id) && !discussed.has(e.id)), byProgress);
  }

  if (kind === "budget") {
    if (id === "spent") return pick("Honoraria spent", live.filter((e) => e.status === "completed"), (a, b) => b.honorarium - a.honorarium);
    if (id === "booked")
      return pick("Booked, not billed yet", live.filter((e) => e.status === "scheduled" || e.status === "approved"), (a, b) => b.honorarium - a.honorarium);
    if (id === "expected") return pick("Still expected (proposed)", live.filter((e) => e.status === "proposed"), (a, b) => b.honorarium - a.honorarium);
  }
  return null;
}
