import { describe, expect, it } from "vitest";
import { vttToText } from "./vtt";

describe("vttToText", () => {
  it("joins one speaker's cues and keeps the first time", () => {
    const vtt = [
      "WEBVTT",
      "",
      "0f1c/12-0",
      "00:00:04.120 --> 00:00:07.900",
      "<v Person 40>We moved two catheter lines.</v>",
      "",
      "0f1c/13-0",
      "00:00:08.000 --> 00:00:09.000",
      "<v Person 40>Last year.</v>",
      "",
      "00:00:41.000 --> 00:00:44.000",
      "<v Interviewer>What drove the move?</v>",
      "",
      "01:02:03.000 --> 01:02:05.000",
      "<v Person 40>Lead times.</v>",
    ].join("\n");
    expect(vttToText(vtt)).toBe(
      ["Person 40 00:04 We moved two catheter lines. Last year.", "Interviewer 00:41 What drove the move?", "Person 40 1:02:03 Lead times."].join("\n"),
    );
  });

  it("keeps cues without a speaker", () => {
    expect(vttToText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there")).toBe("00:01 Hello there");
  });
});
