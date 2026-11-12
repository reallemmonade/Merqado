/**
 * Sample content for a new case's workplan, chats, notes, dictionary and deck. It continues the
 * fictional specialty plastics diligence in experts/sample.ts. Each part is only added when that
 * section is empty, so it never overwrites a team's work.
 */
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  caseNotes,
  chatMessages,
  chatReactions,
  chatRooms,
  deckIssues,
  deckLearnings,
  deckSlides,
  glossaryTerms,
  workplanMilestones,
  workplanModules,
  workplanTasks,
  type Archetype,
  type TaskStatus,
} from "@/db/schema";
import type { CaseMember } from "./page";
import { ROOM_TEMPLATES } from "./rooms";

export async function seedCaseWorkspace(db: DB, engagementId: string, members: CaseMember[], fallbackUserId: string): Promise<string[]> {
  const added: string[] = [];
  const pick = (a: Archetype, n = 0) => {
    const list = members.filter((m) => m.archetype === a);
    return (list[n % Math.max(1, list.length)] ?? members[0])?.id ?? fallbackUserId;
  };
  const P = pick("partner"), M = pick("manager"), C = pick("consultant"), A1 = pick("associate"), A2 = pick("associate", 1);

  // Workplan
  let modId: Record<string, string> = {};
  if (!(await db.query.workplanModules.findFirst({ where: eq(workplanModules.engagementId, engagementId) }))) {
    const mods = await db
      .insert(workplanModules)
      .values(
        [
          ["Market sizing", C],
          ["Customers", A1],
          ["Competitors", M],
          ["Pricing power", C],
          ["Recycled resins", A2],
        ].map(([name, leadId], i) => ({ engagementId, name: name!, leadId, sort: i + 1 })),
      )
      .returning();
    modId = Object.fromEntries(mods.map((m) => [m.name, m.id]));
    const ms = await db
      .insert(workplanMilestones)
      .values([
        { engagementId, label: "Kickoff", date: "2026-10-19", isColumn: false },
        { engagementId, label: "Check-in", date: "2026-11-02" },
        { engagementId, label: "Client update 1", date: "2026-11-16" },
        { engagementId, label: "Final readout", date: "2026-11-30" },
      ])
      .returning();
    const msId = (label: string) => ms.find((m) => m.label === label)!.id;
    const T: [string, string, string, string, TaskStatus][] = [
      ["Market sizing", "Check-in", "Top-down market frame", C, "done"],
      ["Market sizing", "Client update 1", "Bottom-up volume model", C, "almost_done"],
      ["Market sizing", "Client update 1", "Reconcile with client sales data", A1, "in_progress"],
      ["Market sizing", "Final readout", "Market size and growth by end use", C, "not_yet"],
      ["Customers", "Check-in", "Customer list by end market", A1, "done"],
      ["Customers", "Client update 1", "Customer interview synthesis", A1, "in_progress"],
      ["Customers", "Final readout", "Customer concentration view", A2, "not_yet"],
      ["Competitors", "Check-in", "Competitor long list", A2, "done"],
      ["Competitors", "Client update 1", "Benchmark on purchase criteria", A2, "almost_done"],
      ["Competitors", "Final readout", "Competitive positioning page", M, "not_yet"],
      ["Pricing power", "Client update 1", "Price increase pass-through analysis", C, "in_progress"],
      ["Pricing power", "Final readout", "Pricing power slide", M, "not_yet"],
      ["Recycled resins", "Client update 1", "Recycled resin capability scan", A2, "not_yet"],
    ];
    await db.insert(workplanTasks).values(
      T.map(([mod, m, title, assigneeId, status], i) => ({ engagementId, moduleId: modId[mod]!, milestoneId: msId(m), title, assigneeId, status, sort: i })),
    );
    added.push("workplan");
  } else {
    const mods = await db.select().from(workplanModules).where(eq(workplanModules.engagementId, engagementId));
    modId = Object.fromEntries(mods.map((m) => [m.name, m.id]));
  }

  // Team channel
  if (!(await db.query.chatRooms.findFirst({ where: eq(chatRooms.engagementId, engagementId) }))) {
    const rooms = await db
      .insert(chatRooms)
      .values(ROOM_TEMPLATES.map((r, i) => ({ engagementId, name: r.name, archetypes: JSON.stringify(r.archetypes), sort: i })))
      .returning();
    const room = (n: string) => rooms.find((r) => r.name === n)!.id;
    const at = (d: string) => new Date(d);
    const first = (id: string) => (members.find((m) => m.id === id)?.name ?? "").split(/\s+/)[0] ?? "";
    const msgs = await db.insert(chatMessages).values([
      { engagementId, roomId: room("Core team"), userId: A1, body: "Customer list by end market is done. Automotive is a bigger share than we assumed.", createdAt: at("2026-11-04T09:12:00Z") },
      { engagementId, roomId: room("Core team"), userId: C, body: "Bottom-up model is within 8% of the top-down frame now. Writing it up for the market slide.", createdAt: at("2026-11-04T09:40:00Z") },
      { engagementId, roomId: room("Core team"), userId: A2, body: "Second competitor call booked for Nov 9.", createdAt: at("2026-11-04T10:05:00Z") },
      { engagementId, roomId: room("Full team"), userId: M, body: "Client update 1 is Nov 16 at 10am. Dry run Nov 13.", createdAt: at("2026-11-03T16:02:00Z") },
      { engagementId, roomId: room("Chat with MDs"), userId: P, body: "Lead update 1 with pricing power, then the market size. The buyer cares about margins first.", pinned: true, createdAt: at("2026-11-02T20:14:00Z") },
      { engagementId, roomId: room("Chat with MDs"), userId: M, body: "Agreed. I will reorder the storyline and share v2 by Wednesday.", createdAt: at("2026-11-02T21:02:00Z") },
      { engagementId, roomId: room("MDs only"), userId: P, body: "Sponsor wants a view on exit timing at the next check-in.", createdAt: at("2026-11-01T11:10:00Z") },
      { engagementId, roomId: room("Associates only"), userId: A1, body: "Splitting the remaining interview write-ups: I take customers, you take competitors?", createdAt: at("2026-11-03T22:40:00Z") },
    ]).returning();
    // Thread replies, reactions, a mention and a meeting, so every part of the channel has something in it.
    const model = msgs[1]!;
    await db.insert(chatMessages).values([
      { engagementId, roomId: model.roomId, parentId: model.id, userId: A1, body: "Does that include the recycled grades?", createdAt: at("2026-11-04T09:52:00Z") },
      { engagementId, roomId: model.roomId, parentId: model.id, userId: C, body: "Not yet. Adding them as a separate line.", createdAt: at("2026-11-04T09:58:00Z") },
      { engagementId, roomId: model.roomId, parentId: model.id, userId: A2, body: "I can pull the recycled volumes from the competitor calls.", createdAt: at("2026-11-04T10:12:00Z") },
      {
        engagementId,
        roomId: room("Core team"),
        userId: C,
        body: `@${first(A1)} can you send the end-market split to the full team before the dry run?`,
        mentions: JSON.stringify([A1]),
        createdAt: at("2026-11-04T11:20:00Z"),
      },
      {
        engagementId,
        roomId: room("Full team"),
        userId: M,
        body: "",
        kind: "meeting" as const,
        meta: JSON.stringify({ title: "Client update 1 dry run", startsAt: "2026-11-13T15:00:00.000Z", minutes: 60, link: null }),
        createdAt: at("2026-11-03T16:05:00Z"),
      },
    ]);
    const rx = [
      [msgs[0]!.id, C, "👍"],
      [msgs[0]!.id, A2, "👍"],
      [model.id, A1, "🔥"],
      [model.id, M, "🔥"],
      [model.id, P, "👀"],
      [msgs[3]!.id, C, "✅"],
    ];
    await db.insert(chatReactions).values(rx.map(([messageId, userId, emoji]) => ({ messageId: messageId!, userId: userId!, emoji: emoji! }))).onConflictDoNothing();
    if (C !== M) {
      const [dm] = await db.insert(chatRooms).values({ engagementId, kind: "dm", name: "", memberIds: JSON.stringify([C, M]), createdBy: M }).returning();
      await db.insert(chatMessages).values([
        { engagementId, roomId: dm!.id, userId: M, body: "Can you take the market slide in the dry run?", createdAt: at("2026-11-04T12:30:00Z") },
        { engagementId, roomId: dm!.id, userId: C, body: "Yes. I will send a draft tonight.", createdAt: at("2026-11-04T12:34:00Z") },
      ]);
    }
    added.push("channel");
  }

  // Notes
  if (!(await db.query.caseNotes.findFirst({ where: eq(caseNotes.engagementId, engagementId) }))) {
    await db.insert(caseNotes).values([
      { engagementId, kind: "decision", body: "Size the market on volume first, then apply price.", moduleId: modId["Market sizing"] ?? null, origin: "Core team meeting", createdBy: M, createdAt: new Date("2026-11-03T15:00:00Z") },
      { engagementId, kind: "open", body: "Client to confirm which end-use tags in the sales data are final.", moduleId: modId["Market sizing"] ?? null, origin: "Client call", createdBy: C, createdAt: new Date("2026-11-03T17:00:00Z") },
      { engagementId, kind: "decision", body: "Lead client update 1 with pricing power, then market size.", moduleId: modId["Pricing power"] ?? null, origin: "Chat with MDs", createdBy: P, createdAt: new Date("2026-11-02T20:30:00Z") },
      { engagementId, kind: "open", body: "Need a second end-user view on lead times before the update.", moduleId: modId["Customers"] ?? null, origin: "Experts", createdBy: A1, createdAt: new Date("2026-11-04T11:00:00Z") },
      { engagementId, kind: "note", body: "Two customers mentioned qualification takes 9 to 12 months, which supports high switching costs.", moduleId: modId["Customers"] ?? null, origin: "Interviews", createdBy: A2, createdAt: new Date("2026-11-04T12:00:00Z") },
    ]);
    added.push("notes");
  }

  // Dictionary
  if (!(await db.query.glossaryTerms.findFirst({ where: eq(glossaryTerms.engagementId, engagementId) }))) {
    const G: [string, string, string][] = [
      ["Compounding", "Industry", "Blending base resin with additives into a ready-to-mold plastic."],
      ["Engineering plastics", "Industry", "Higher-performance plastics (nylon, PBT, PC) used where commodity resins fall short."],
      ["Pass-through", "Industry", "Passing raw material price changes on to customers, usually with a lag."],
      ["Qualification", "Industry", "Testing a customer runs before approving a new material or supplier; often 9 to 12 months."],
      ["Recycled content", "Industry", "Share of post-consumer or post-industrial plastic in a compound."],
      ["KTA", "Firm jargon", "Key takeaway from an interview."],
      ["KPC", "Firm jargon", "Key purchase criteria: what customers weigh when picking a supplier."],
      ["IV", "Firm jargon", "Interview."],
      ["Target", "Case codes", "The company being studied (Polyvance Materials in the sample)."],
    ];
    await db.insert(glossaryTerms).values(G.map(([term, category, definition]) => ({ engagementId, term, category, definition })));
    await db.insert(glossaryTerms).values([
      { engagementId, term: "Toll compounding", category: "Industry", definition: "Compounding a customer's own resin for a fee.", status: "suggested" as const },
      { engagementId, term: "Masterbatch", category: "Industry", definition: "Concentrated mix of pigments or additives let down into resin.", status: "suggested" as const },
    ]);
    added.push("dictionary");
  }

  // Deck
  if (!(await db.query.deckSlides.findFirst({ where: eq(deckSlides.engagementId, engagementId) }))) {
    const S: [string, string, string, string, string][] = [
      ["Executive summary", "The target is a share gainer with real pricing power in a growing niche", "Market grows 5-6% a year to 2030\nTarget has passed through 90% of resin cost increases since 2022\nCustomers rarely switch: qualification takes 9-12 months", "Expert interviews (n=6); team analysis", ""],
      ["Market", "Specialty compounding is a $4.2B market growing 5-6% a year", "Automotive and medical drive two-thirds of growth\nRecycled-content grades grow fastest at ~12% a year", "Market model v2; expert interviews", "Market sizing"],
      ["Market", "Recycled-content grades are the fastest-growing segment", "Brand owners commit to 25-30% recycled content by 2030\nTarget has two recycled grades in qualification", "Expert interviews (n=4)", "Recycled resins"],
      ["Customers", "Customers rarely switch suppliers once qualified", "Qualification takes 9-12 months and costs $200-500k\nFewer than 5% of programs move supplier in a year", "Customer interviews (n=3)", "Customers"],
      ["Customers", "Customer concentration is a low risk", "Top 10 customers are 35% of revenue\nNo customer is above 8%", "Client sales data FY25", "Customers"],
      ["Pricing", "The target has passed through almost all resin cost increases", "90% pass-through since 2022, with a 1-2 quarter lag\nCompetitors passed through 70-80%", "Client pricing data; competitor interviews (n=2)", "Pricing power"],
      ["Pricing", "About 30% of customers moved volume to a cheaper supplier last year", "Price-led switching concentrated in automotive interiors\nTarget lost two mid-size programs on price", "Customer interviews (n=2)", "Pricing power"],
    ];
    const slides = await db
      .insert(deckSlides)
      .values(S.map(([section, headline, body, sourceNote, mod], i) => ({ engagementId, section, headline, body, sourceNote, moduleId: mod ? (modId[mod] ?? null) : null, sort: i + 1 })))
      .returning({ id: deckSlides.id });
    const slide = (n: number) => slides[n - 1]!.id;
    await db.insert(deckIssues).values([
      {
        engagementId,
        kind: "contradiction" as const,
        severity: "high" as const,
        slideId: slide(4),
        claim: "Fewer than 5% of programs move supplier in a year",
        otherRef: "Slide 7",
        otherClaim: "About 30% of customers moved volume to a cheaper supplier last year",
        detail: "Switching rates disagree by 6x; the executive summary relies on low switching.",
      },
      {
        engagementId,
        kind: "contradiction" as const,
        severity: "medium" as const,
        slideId: slide(1),
        claim: "Customers rarely switch: qualification takes 9-12 months",
        otherRef: "Slide 7",
        otherClaim: "Target lost two mid-size programs on price",
        detail: "Lost programs on price weaken the pricing power claim in the executive summary.",
      },
      {
        engagementId,
        kind: "qc" as const,
        severity: "medium" as const,
        slideId: slide(7),
        claim: S[6]![1],
        detail: "Headline states a fact without the so-what.",
        fix: "Say what 30% switching means for pricing power.",
      },
    ]);
    await db.insert(deckLearnings).values([
      { engagementId, rule: "Headlines are full-sentence so-whats, under 15 words.", origin: "Partner review" },
      { engagementId, rule: "Show interviewee ranges, not single points, unless the model gives one.", origin: "Manager review" },
      { engagementId, rule: "Every chart has a source line with interview count.", origin: "Firm standard" },
      { engagementId, rule: "Experts are never named; credit quotes with the anonymized title.", origin: "Firm standard" },
    ]);
    added.push("deck");
  }
  return added;
}
