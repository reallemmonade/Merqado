import type { IssueRow, SlideRow } from "@/components/case/Deck";
import type { Deck } from "./data";

/** Slides numbered in deck order, with their open issue counts. */
export function slideRows(deck: Deck): SlideRow[] {
  return deck.slides.map((s, i) => ({
    id: s.id,
    n: i + 1,
    section: s.section,
    headline: s.headline,
    body: s.body,
    sourceNote: s.sourceNote,
    moduleId: s.moduleId,
    status: s.status,
    openIssues: deck.issues.filter((x) => x.slideId === s.id && x.status === "open").length,
  }));
}

export function issueRows(deck: Deck, kind: "qc" | "contradiction"): IssueRow[] {
  const n = new Map(deck.slides.map((s, i) => [s.id, { n: i + 1, headline: s.headline }]));
  return deck.issues
    .filter((x) => x.kind === kind)
    .map((x) => ({
      id: x.id,
      kind: x.kind,
      severity: x.severity,
      slideId: x.slideId,
      slideN: x.slideId ? (n.get(x.slideId)?.n ?? null) : null,
      slideHeadline: x.slideId ? (n.get(x.slideId)?.headline ?? "") : "",
      claim: x.claim,
      otherRef: x.otherRef,
      otherClaim: x.otherClaim,
      detail: x.detail,
      fix: x.fix,
      status: x.status,
    }));
}
