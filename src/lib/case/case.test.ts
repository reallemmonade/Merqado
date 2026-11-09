import { describe, expect, it } from "vitest";
import { gptName } from "./names";
import { canSeeRoom, roomMembersLabel, ROOM_TEMPLATES } from "./rooms";
import { progressPct, shortDate, timelinePct } from "./progress";
import { chunk, keywords, phraseHits, splitCitations, topSnippets } from "./search";

describe("gptName", () => {
  it("uses the project code name", () => {
    expect(gptName("Project Atlas")).toBe("AtlasGPT");
    expect(gptName("project resin")).toBe("resinGPT");
    expect(gptName("Titan")).toBe("TitanGPT");
    expect(gptName("  ")).toBe("CaseGPT");
  });
});

describe("rooms", () => {
  it("shows a room only to listed roles", () => {
    const mdOnly = JSON.stringify(ROOM_TEMPLATES.find((r) => r.name === "MDs only")!.archetypes);
    expect(canSeeRoom(mdOnly, "partner")).toBe(true);
    expect(canSeeRoom(mdOnly, "associate")).toBe(false);
    expect(canSeeRoom("not json", "partner")).toBe(false);
  });
  it("labels members", () => {
    expect(roomMembersLabel(JSON.stringify(["partner", "manager", "consultant", "associate"]))).toBe("Everyone");
    expect(roomMembersLabel(JSON.stringify(["associate", "consultant"]))).toBe("Consultants + Associates");
  });
});

describe("progress", () => {
  it("counts partly done tasks", () => {
    expect(progressPct([])).toBe(0);
    expect(progressPct([{ status: "done" }, { status: "not_yet" }])).toBe(50);
    expect(progressPct([{ status: "almost_done" }, { status: "in_progress" }, { status: "done" }])).toBe(67);
  });
  it("cycles statuses", () => {
  });
  it("places dates on the timeline", () => {
    expect(timelinePct("2026-09-15", "2026-09-01", "2026-09-29")).toBe(50);
    expect(timelinePct("2026-12-01", "2026-09-01", "2026-09-29")).toBe(100);
    expect(shortDate("2026-10-01")).toBe("Oct 1");
  });
});

describe("search", () => {
  it("drops filler words", () => {
    expect(keywords("What did OEMs say about supplier consolidation?")).toEqual(["oems", "say", "supplier", "consolidation"]);
    expect(keywords("the PVC and TPE")).toEqual(["pvc", "tpe"]);
  });
  it("ranks snippets by matches and keeps to the budget", () => {
    const snips = [
      { label: "a", href: "#", text: "nothing here", kind: "note" as const },
      { label: "b", href: "#", text: "PVC is consolidated. PVC again.", kind: "note" as const },
      { label: "c", href: "#", text: "TPE is fragmented, PVC is not", kind: "note" as const },
    ];
    const top = topSnippets(snips, "PVC TPE", 5);
    expect(top.map((s) => s.label)).toEqual(["c", "b"]);
    expect(topSnippets(snips, "PVC", 5, 20).length).toBe(0);
  });
  it("finds exact phrases", () => {
    const hit = phraseHits("We outsource EO sterilization today. Sterilization is tight.", "sterilization");
    expect(hit?.count).toBe(2);
    expect(hit?.match).toBe("sterilization");
    expect(phraseHits("abc", "zzz")).toBeNull();
  });
  it("splits citations", () => {
    expect(splitCitations("PVC is concentrated [2]. Yes [10]")).toEqual([{ text: "PVC is concentrated " }, { cite: 2 }, { text: ". Yes " }, { cite: 10 }]);
  });
  it("chunks long text", () => {
    const parts = chunk("a".repeat(2000), 900);
    expect(parts.length).toBe(3);
  });
});
