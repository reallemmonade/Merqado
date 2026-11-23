import { targetCount, type Onboarding, type Standard } from "./model";

export interface EmailCase {
  /** Project code name, e.g. "Project Birch". */
  codeName: string;
  caseCode: string;
}

/** Fills {client} and {market} in the standard text. */
export function fillPlaceholders(text: string, c: EmailCase, o: Onboarding): string {
  return text
    .replace(/\{client\}/gi, c.codeName.trim() || "the client")
    .replace(/\{market\}/gi, o.market.trim() || "industry");
}

const bullets = (text: string, mark = "- ") =>
  text
    .split(/\n|;\s*/)
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean)
    .map((l) => mark + l);

function nLine(o: Onboarding): string {
  const parts = o.angles.filter((a) => a.name.trim()).map((a) => `${a.n.trim() || "?"} ${a.name.trim().toLowerCase()}`);
  const total = o.angles.reduce((s, a) => s + targetCount(a.n), 0);
  if (!parts.length) return "";
  return parts.length > 1 && total ? `~${total} (${parts.join("; ")})` : parts.join("; ");
}

function dateRange(o: Onboarding): string {
  const s = o.startsOn.trim();
  const e = o.endsOn.trim();
  if (s && e) return `${s} – ${e}`;
  return s || (e ? `through ${e}` : "");
}

/** Team grouped by time zone: "Pacific (Person 02, Person 03); Eastern (Person 01)". */
function zones(o: Onboarding): string {
  const by = new Map<string, string[]>();
  for (const t of o.team) {
    if (!t.name.trim() || !t.tz.trim()) continue;
    by.set(t.tz.trim(), [...(by.get(t.tz.trim()) ?? []), t.name.trim()]);
  }
  return [...by].map(([tz, names]) => `${tz} (${names.join(", ")})`).join("; ");
}

const nTag = (n: string) => (n.trim() ? ` (N${/^[~≈<>]/.test(n.trim()) ? "" : "~"}${n.trim()})` : "");

const person = (t: { name: string; email: string }) => (t.email.trim() ? `${t.name.trim()} (${t.email.trim()})` : t.name.trim());

export interface SolicitationEmail {
  subject: string;
  body: string;
}

/** The solicitation email every expert network gets. Plain text, ready to paste or draft. */
export function buildSolicitation(c: EmailCase, o: Onboarding, std: Standard): SolicitationEmail {
  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);
  const field = (label: string, value: string) => value.trim() && push(`${label}: ${value.trim()}`);

  push("Hi team,", "");
  const length = o.weeks.trim() ? `${o.weeks.trim()}-week ` : "";
  push(`We are kicking off a ${length}study of the ${o.market.trim() || "[market]"} market.`, "");

  const angled = o.angles.filter((a) => a.name.trim());
  if (angled.length) {
    push("We are aiming to speak with:");
    for (const a of angled) push(`- ${a.name.trim()}${nTag(a.n)}${a.who.trim() ? `: ${a.who.trim()}` : ""}`);
    push("");
  }

  field("Project objective", o.objective);
  field("Case code", c.caseCode);
  field("N", nLine(o));
  field("Timeframe", dateRange(o));
  field("Geo", o.geography);
  field("Time zones", zones(o));
  push("");

  const dnc = [fillPlaceholders(std.doNotContact, c, o), o.doNotContactExtra].map((s) => s.trim()).filter(Boolean).join(" ");
  if (dnc) push(`DO NOT CONTACT: ${dnc}`);
  if (std.blinding.trim()) push(`CLIENT BLINDING: ${fillPlaceholders(std.blinding, c, o).trim()}`);
  if (std.moderation.trim()) push(`INTERVIEW MODERATION: ${fillPlaceholders(std.moderation, c, o).trim()}`);
  push("");

  const all = o.team.filter((t) => t.name.trim() && t.copy === "all");
  const invites = o.team.filter((t) => t.name.trim() && t.copy === "invites");
  const lead = o.team.find((t) => t.lead && t.name.trim());
  if (all.length || invites.length || lead) {
    push("Team correspondence:");
    if (all.length) push("Please include on all emails and calendar invitations:", ...all.map((t) => `- ${person(t)}`));
    if (invites.length) push("Please include on calendar invitations:", ...invites.map((t) => `- ${person(t)}`));
    if (lead) push(`${lead.name.trim()} is your main point of contact; please copy ${lead.name.trim()} on all correspondence.`);
    push("");
  }

  if (angled.length) {
    push("Interview details:", "");
    angled.forEach((a, i) => {
      push(`Angle ${i + 1} – ${a.name.trim()}${nTag(a.n)}`);
      if (a.who.trim()) push(a.who.trim());
      if (a.companies.trim()) push(`Target companies (illustrative): ${a.companies.trim()}`);
      const roles = bullets(a.roles);
      if (roles.length) push("Target roles:", ...roles);
      const scr = bullets(a.screeners);
      if (scr.length) push("Screeners:", ...scr.map((s, j) => s.replace(/^- /, `${j + 1}. `)));
      push("");
    });
  }

  if (std.signOff.trim()) push(std.signOff.trim());
  const me = lead?.name.trim();
  if (me) push(me);

  const subject = [c.caseCode.trim(), c.codeName.trim(), "expert network request"].filter(Boolean).join(" · ");
  // Filled text may say {client} anywhere (documents are read with the client blinded).
  return { subject, body: fillPlaceholders(L.join("\n"), c, o).replace(/\n{3,}/g, "\n\n").trim() };
}

/** A mailto link that opens a draft in the person's own mail app. Nothing is sent. */
export function draftLink(to: string, email: SolicitationEmail, cc: string[] = []): string {
  const q = [`subject=${encodeURIComponent(email.subject)}`, `body=${encodeURIComponent(email.body)}`];
  if (cc.length) q.unshift(`cc=${encodeURIComponent(cc.join(","))}`);
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, "@")}?${q.join("&")}`;
}
