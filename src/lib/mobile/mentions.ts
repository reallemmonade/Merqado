/** Who an @mention in a chat message points at. */
export interface Mentionable {
  id: string;
  name: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Finds the people a message mentions. Matches "@Full Name" or "@First" (when only one person
 * has that first name). "@all", "@everyone" and "@channel" mention everyone given.
 */
export function findMentions(body: string, people: Mentionable[]): string[] {
  const text = norm(body);
  if (/(^|\s)@(all|everyone|channel|here)\b/.test(text)) return people.map((p) => p.id);
  const hits = new Set<string>();
  const firstCount = new Map<string, number>();
  for (const p of people) {
    const first = norm(p.name).split(/\s+/)[0] ?? "";
    firstCount.set(first, (firstCount.get(first) ?? 0) + 1);
  }
  for (const p of people) {
    const full = norm(p.name).trim();
    const first = full.split(/\s+/)[0] ?? "";
    const at = (needle: string) => new RegExp(`(^|[^\\w@])@${escape(needle)}(?![\\w])`).test(text);
    if ((full && at(full)) || (first && firstCount.get(first) === 1 && at(first))) hits.add(p.id);
  }
  return [...hits];
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
