import { describe, expect, it } from "vitest";
import { buildSolicitation, draftLink } from "./email";
import { fillPrompt, parseFill } from "./fill";
import { DEFAULT_STANDARD, emptyOnboarding, mergeFill, parseOnboarding, parseStandard, targetCount, tzLabel, type Onboarding } from "./model";

const c = { codeName: "Project Birch", caseCode: "CASE002" };

function sample(): Onboarding {
  return {
    ...emptyOnboarding(),
    market: "industrial adhesives",
    objective: "Commercial due diligence",
    weeks: "6",
    startsOn: "12/1",
    endsOn: "1/15",
    geography: "United States",
    doNotContactExtra: "Sponsor and its portfolio companies.",
    angles: [
      { id: "a1", name: "Customers", n: "~15", who: "Procurement leaders at OEMs", companies: "OEM 01, OEM 02", roles: "Procurement\nR&D", screeners: "Which categories?\nRole in supplier choice?" },
      { id: "a2", name: "Competitors", n: "10", who: "", companies: "Supplier 01", roles: "", screeners: "" },
    ],
    team: [
      { userId: null, name: "Person 01", email: "p01@example.com", role: "Partner", tz: "ET", copy: "invites", lead: false },
      { userId: null, name: "Person 03", email: "p03@example.com", role: "Consultant", tz: "PT", copy: "all", lead: true },
      { userId: null, name: "Person 04", email: "", role: "Associate", tz: "ET", copy: "all", lead: false },
    ],
  };
}

describe("solicitation email", () => {
  it("includes every part networks need", () => {
    const { subject, body } = buildSolicitation(c, sample(), DEFAULT_STANDARD);
    expect(subject).toBe("CASE002 · Project Birch · expert network request");
    expect(body).toContain("We are kicking off a 6-week study of the industrial adhesives market.");
    expect(body).toContain("- Customers (N~15): Procurement leaders at OEMs");
    expect(body).toContain("Case code: CASE002");
    expect(body).toContain("N: ~25 (~15 customers; 10 competitors)");
    expect(body).toContain("Timeframe: 12/1 – 1/15");
    expect(body).toContain("Time zones: ET (Person 01, Person 04); PT (Person 03)");
    expect(body).toContain("DO NOT CONTACT: Current and former employees of Project Birch and its affiliates. Sponsor and its portfolio companies.");
    expect(body).toContain('"industrial adhesives market study."');
    expect(body).toContain("INTERVIEW MODERATION:");
    expect(body).toContain("- Person 03 (p03@example.com)");
    expect(body).toContain("Please include on calendar invitations:\n- Person 01 (p01@example.com)");
    expect(body).toContain("Person 03 is your main point of contact");
    expect(body).toContain("Angle 2 – Competitors (N~10)");
    expect(body).toContain("Screeners:\n1. Which categories?\n2. Role in supplier choice?");
    expect(body.trim().endsWith("Thanks,\nPerson 03")).toBe(true);
    expect(body).not.toMatch(/\n{3,}/);
    expect(buildSolicitation(c, { ...sample(), doNotContactExtra: "{client} lenders." }, DEFAULT_STANDARD).body).toContain("Project Birch lenders.");
  });

  it("leaves out empty parts", () => {
    const { body } = buildSolicitation({ codeName: "", caseCode: "" }, emptyOnboarding(), { ...DEFAULT_STANDARD, moderation: "" });
    expect(body).not.toContain("Case code:");
    expect(body).not.toContain("INTERVIEW MODERATION");
    expect(body).not.toContain("Interview details");
    expect(body).toContain("DO NOT CONTACT: Current and former employees of the client");
  });

  it("drafts open in the person's mail app with the team copied", () => {
    const email = buildSolicitation(c, sample(), DEFAULT_STANDARD);
    const link = draftLink("team@network.example", email, ["p03@example.com"]);
    expect(link.startsWith("mailto:team@network.example?cc=p03%40example.com&subject=CASE002")).toBe(true);
    expect(decodeURIComponent(link.split("body=")[1]!)).toBe(email.body);
  });
});

describe("onboarding model", () => {
  it("reads broken or missing JSON as an empty form", () => {
    expect(parseOnboarding(null)).toEqual(emptyOnboarding());
    expect(parseOnboarding("{nope")).toEqual(emptyOnboarding());
    expect(parseStandard(null)).toEqual(DEFAULT_STANDARD);
  });

  it("fills only empty fields from documents", () => {
    const now = { ...sample(), geography: "" };
    const next = mergeFill(now, {
      market: "something else",
      geography: "US and Europe",
      angles: [
        { id: "", name: "customers", n: "~20", who: "x", companies: "", roles: "", screeners: "" },
        { id: "", name: "Former employees", n: "~5", who: "", companies: "", roles: "", screeners: "" },
      ],
    });
    expect(next.market).toBe("industrial adhesives");
    expect(next.geography).toBe("US and Europe");
    expect(next.angles[0]!.n).toBe("~15");
    expect(next.angles).toHaveLength(3);
    expect(next.angles[2]!.name).toBe("Former employees");
    expect(next.angles[2]!.id).not.toBe("");
  });

  it("reads target counts and time zones", () => {
    expect(targetCount("~20")).toBe(20);
    expect(targetCount("10-15")).toBe(10);
    expect(targetCount("")).toBe(0);
    expect(tzLabel("America/Los_Angeles")).toBe("PT");
    expect(tzLabel("America/New_York")).toBe("ET");
    expect(tzLabel(null)).toBe("");
  });
});

describe("filling from documents", () => {
  it("shares the text budget across files and skips empty ones", () => {
    const p = fillPrompt([
      { filename: "SOW.docx", text: "a".repeat(100_000) },
      { filename: "empty.pdf", text: "" },
      { filename: "Kickoff.pptx", text: "b".repeat(100_000) },
    ]);
    expect(p).toContain("=== SOW.docx ===");
    expect(p).not.toContain("empty.pdf");
    expect(p.length).toBeLessThan(61_000);
  });

  it("parses the model reply and keeps the code name out", () => {
    const fill = parseFill(
      'Here: ```json\n{"market":"specialty tubing","weeks":"6 weeks","doNotContactExtra":"Project Birch affiliates","angles":[{"name":"Customers","n":"~20"},{"name":""}]}\n```',
      ["Project Birch"],
    );
    expect(fill.market).toBe("specialty tubing");
    expect(fill.weeks).toBe("6");
    expect(fill.doNotContactExtra).toBe("{client} affiliates");
    expect(fill.angles).toHaveLength(1);
    expect(fill.angles![0]!.who).toBe("");
  });

  it("gives an empty fill for a bad reply", () => {
    expect(parseFill("no json here")).toEqual({});
  });
});
