import { describe, expect, it } from "vitest";
import { findLinks, suggestFolders, versionStem } from "./classify";
import { DEFAULT_FOLDERS, cleanPath, sortFolders } from "./folders";

const F = [...DEFAULT_FOLDERS];

describe("suggestFolders", () => {
  it("files an expert transcript by its name", () => {
    const r = suggestFolders({ name: "2026-09-21_Medical Compounds and Device Market_Person 37.docx" }, F);
    expect(r.folders[0]).toBe("Interviews/Transcripts");
  });

  it("files meeting transcripts, guides, models and decks", () => {
    expect(suggestFolders({ name: "2026-09-28_Client BOD.docx" }, F).folders[0]).toBe("Meetings/Transcripts");
    expect(suggestFolders({ name: "IVG_WORKING_Client_vJockComments.docx" }, F).folders[0]).toBe("Interviews/Guides");
    expect(suggestFolders({ name: "Client_Market Model_WORKING.xlsx" }, F).folders[0]).toBe("Models");
    expect(suggestFolders({ name: "CDMO_NPC_KPC_Scores_9.24.xlsx" }, F).folders[0]).toBe("Models/Surveys");
    expect(suggestFolders({ name: "Steerco readout.pptx" }, F).folders).toContain("Deliverables/Presentations");
    expect(suggestFolders({ name: "call.m4a" }, F).folders[0]).toBe("Meetings/Recordings");
  });

  it("follows the folder a file was dropped in", () => {
    expect(suggestFolders({ name: "x.docx", relPath: "Project_Atlas_CASE001/Interviews/Transcripts/IVs by Segment/x.docx" }, F).folders[0]).toBe("Interviews/Transcripts");
    expect(suggestFolders({ name: "OEM 15 summary.docx", relPath: "Data from Client/Week of 9.28 uploads/OEM 15 summary.docx" }, F).folders[0]).toBe("Client/Data/Week of 9.28 uploads");
    expect(suggestFolders({ name: "a.docx", relPath: "Meeting Transcripts/CTM/a.docx" }, F).folders[0]).toBe("Meetings/Transcripts");
    const m = suggestFolders({ name: "a.xlsx", relPath: "Models - Working/a.xlsx" }, F);
    expect(m.folders[0]).toBe("Models");
    expect(m.sure).toBe(true);
  });

  it("keeps an unknown dropped folder as a subfolder", () => {
    const r = suggestFolders({ name: "OEM 01 revenue tagging.xlsx", relPath: "OEM deep dive analysis/OEM 01 revenue tagging.xlsx" }, F);
    expect(r.folders[0]).toBe("Models/OEM deep dive analysis");
  });

  it("is unsure when nothing matches", () => {
    const r = suggestFolders({ name: "Scan_0042.pdf" }, F);
    expect(r.sure).toBe(false);
    expect(r.folders).toEqual([]);
  });
});

describe("versionStem", () => {
  it("drops version marks", () => {
    expect(versionStem("Market Model v2.xlsx")).toBe(versionStem("Market Model_v3.xlsx"));
    expect(versionStem("Guide_v03_SENT.docx")).toBe("guide");
    expect(versionStem("Deck (1).pptx")).toBe("deck");
    expect(versionStem("Deck final.pptx")).toBe("deck");
  });
});

describe("findLinks", () => {
  it("links files to experts by their code", () => {
    const refs = [
      { kind: "expert" as const, id: "e1", label: "OEM 16 · Head", keys: ["OEM 16"] },
      { kind: "expert" as const, id: "e2", label: "OEM 1 · VP", keys: ["OEM 1"] },
    ];
    expect(findLinks({ name: "Person 21, OEM 16.docx" }, refs).map((l) => l.id)).toEqual(["e1"]);
  });
});

describe("folders", () => {
  it("cleans typed paths", () => {
    expect(cleanPath(" Models / OEM  deep dive /")).toBe("Models/OEM deep dive");
  });
  it("keeps children under their parent", () => {
    expect(sortFolders(["Admin", "Models", "Admin/Expenses", "Models/X", "Admin/New"])).toEqual(["Admin", "Admin/Expenses", "Admin/New", "Models", "Models/X"]);
  });
});
