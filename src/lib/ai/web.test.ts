import { describe, expect, it } from "vitest";
import { collectAnswer } from "./providers/anthropic";
import { hostOf } from "./web";

describe("web search answers", () => {
  it("numbers web citations after the case extracts, one number per page", () => {
    const { text, webSources } = collectAnswer(
      [
        { type: "text", text: "Case experts expect growth [2]. " },
        { type: "server_tool_use" },
        { type: "web_search_tool_result" },
        {
          type: "text",
          text: "Public sources report the market grew 8% in 2025.",
          citations: [{ type: "web_search_result_location", url: "https://www.example.com/a", title: "Market report", cited_text: "The market grew 8% in 2025." }],
        },
        { type: "text", text: " " },
        {
          type: "text",
          text: "Another report agrees",
          citations: [
            { type: "web_search_result_location", url: "https://news.example.org/b", title: null, cited_text: "Growth was 8%." },
            { type: "web_search_result_location", url: "https://www.example.com/a", title: "Market report", cited_text: "Volumes rose." },
          ],
        },
      ],
      31,
    );
    expect(text).toBe("Case experts expect growth [2]. Public sources report the market grew 8% in 2025 [31]. Another report agrees [32] [31]");
    expect(webSources).toEqual([
      { n: 31, url: "https://www.example.com/a", title: "Market report", text: "The market grew 8% in 2025. … Volumes rose." },
      { n: 32, url: "https://news.example.org/b", title: "news.example.org", text: "Growth was 8%." },
    ]);
  });

  it("leaves answers without web citations alone", () => {
    expect(collectAnswer([{ type: "text", text: "From the case [1]." }], 5)).toEqual({ text: "From the case [1].", webSources: [] });
  });

  it("shows a site name", () => {
    expect(hostOf("https://www.reuters.com/x")).toBe("reuters.com");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
