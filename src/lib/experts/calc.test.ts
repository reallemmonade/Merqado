import { describe, expect, it } from "vitest";
import { anonymizeTitle, budgetSummary, coverage, elapsedShare, honorarium } from "./calc";

describe("anonymizeTitle", () => {
  it("keeps company and seniority", () => {
    expect(anonymizeTitle("Apple", "Senior Director, Commercial Strategy")).toBe("Apple, Senior Director");
    expect(anonymizeTitle("Kestrel Polymers", "Vice President, Global Procurement")).toBe("Kestrel Polymers, VP");
    expect(anonymizeTitle("Tamsin", "Chief Technology Officer")).toBe("Tamsin, C-suite");
    expect(anonymizeTitle("Arcline", "Senior Manager, Materials Engineering")).toBe("Arcline, Senior Manager");
  });
  it("marks former employees", () => {
    expect(anonymizeTitle("Polyvance", "Former Plant Manager")).toBe("Former Polyvance, Manager");
    expect(anonymizeTitle("Polyvance", "Plant Manager", true)).toBe("Former Polyvance, Manager");
  });
  it("falls back to the first part of an unknown title", () => {
    expect(anonymizeTitle("Hollis", "Senior Buyer, Polymer Components")).toBe("Hollis, Senior Buyer");
  });
});

describe("honorarium", () => {
  it("prorates every minute at the hourly rate", () => {
    expect(honorarium({ status: "completed", callMinutes: 60, followupMinutes: 30, surveyMinutes: 10, hourlyRate: 800 })).toBeCloseTo(1333.33, 2);
  });
  it("estimates an hour for calls with no length yet", () => {
    expect(honorarium({ status: "proposed", callMinutes: 0, followupMinutes: 0, surveyMinutes: 0, hourlyRate: 900 })).toBe(900);
  });
  it("is zero for declined experts", () => {
    expect(honorarium({ status: "declined", callMinutes: 60, followupMinutes: 0, surveyMinutes: 0, hourlyRate: 900 })).toBe(0);
  });
});

describe("coverage", () => {
  it("counts by status and ignores declined", () => {
    expect(coverage(["completed", "completed", "proposed", "declined"], 6)).toEqual({ completed: 2, scheduled: 0, approved: 0, proposed: 1, target: 6 });
  });
});

describe("budgetSummary", () => {
  it("adds spend, commitments and the remaining plan", () => {
    const e = (status: "completed" | "scheduled" | "proposed", rate: number) => ({ status, callMinutes: 60, followupMinutes: 0, surveyMinutes: 0, hourlyRate: rate });
    const s = budgetSummary({
      total: 10000,
      plannedInterviews: 5,
      experts: [e("completed", 1000), e("scheduled", 1000), e("proposed", 1000)],
      expenses: [{ category: "meals", amount: 300 }, { category: "ai_tools", amount: 100 }],
      elapsedShare: 0.5,
    });
    expect(s.spent).toBe(1400);
    expect(s.remaining).toBe(8600);
    expect(s.booked).toBe(1000);
    expect(s.futureInterviewCost).toBe(2000);
    expect(s.futureExpenses).toBe(400);
    expect(s.projected).toBe(1400 + 1000 + 1000 + 2000 + 400);
  });
});

describe("elapsedShare", () => {
  it("is null without dates and clamps to 0–1", () => {
    expect(elapsedShare(null, "2026-12-01")).toBeNull();
    expect(elapsedShare("2026-01-01", "2026-01-11", new Date("2026-01-06"))).toBeCloseTo(0.5, 5);
    expect(elapsedShare("2026-01-01", "2026-01-11", new Date("2027-01-01"))).toBe(1);
  });
});
