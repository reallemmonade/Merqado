import { describe, expect, it } from "vitest";
import { cleanTitle, matchEvent, scoreCase, type CaseFacts } from "./match";

const atlas: CaseFacts = {
  engagementId: "e1",
  caseCode: "CASE001",
  projectName: "Project Atlas",
  clientName: "Company 07",
  team: ["a@firm.test", "b@firm.test", "c@firm.test", "d@firm.test"],
  experts: [{ name: "Person Twentyone", label: "Former VP, OEM 16" }],
};
const birch: CaseFacts = { ...atlas, engagementId: "e2", caseCode: "CASE002", projectName: "Project Birch", team: ["a@firm.test", "x@firm.test"], experts: [] };

describe("matchEvent", () => {
  it("prefers the case code in the title", () => {
    expect(matchEvent({ subject: "CASE001 weekly steerco", people: [] }, [birch, atlas])).toEqual({ engagementId: "e1", score: 100, matchedBy: "Case code in title" });
  });

  it("matches the bare code name as a whole word only", () => {
    expect(scoreCase({ subject: "Atlas mgmt 1:1", people: [] }, atlas)?.matchedBy).toBe("Project name in title");
    expect(scoreCase({ subject: "Atlassian training", people: [] }, atlas)).toBeNull();
  });

  it("matches an expert call by the expert's name", () => {
    expect(scoreCase({ subject: "Call with Person Twentyone", people: [] }, atlas)?.matchedBy).toBe("Expert on case");
  });

  it("needs at least half the team, and two people", () => {
    expect(scoreCase({ subject: "Check-in", people: ["a@firm.test", "b@firm.test", "c@firm.test"] }, atlas)?.matchedBy).toBe("3 of 4 team");
    expect(scoreCase({ subject: "Check-in", people: ["a@firm.test", "z@other.test"] }, atlas)).toBeNull();
    expect(matchEvent({ subject: "Lunch", people: ["a@firm.test", "x@firm.test"] }, [atlas, birch])?.engagementId).toBe("e2");
  });

  it("returns null when nothing ties the event to a case", () => {
    expect(matchEvent({ subject: "Dentist", people: ["a@firm.test"] }, [atlas, birch])).toBeNull();
  });
});

describe("cleanTitle", () => {
  it("replaces the client's name and expert names", () => {
    expect(cleanTitle("Company 07 steerco  / Person Twentyone", atlas)).toBe("Client steerco / Former VP, OEM 16");
  });

  it("leaves a placeholder client name alone", () => {
    expect(cleanTitle("Client sync", { ...atlas, clientName: "Client" })).toBe("Client sync");
  });
});
