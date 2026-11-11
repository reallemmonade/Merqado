import { describe, expect, it } from "vitest";
import { checkAnswer, checkClaim, citedSentences } from "./verify";

// Same cases as agent-index tests/test_real_world_pages.py.
const FILING =
  "Apple reported total net sales of $391,035 million in fiscal 2024, up from $383,285 million in 2023. " +
  "Net income was $93,736 million. iPhone revenue declined slightly while Services grew 13%.";

describe("checkClaim", () => {
  it("allows rounding and unit words", () => {
    expect(checkClaim("Apple's net sales were $391 billion in 2024.", FILING).verdict).toBe("supported");
    expect(checkClaim("Net income was $93.7 billion.", FILING).verdict).toBe("supported");
    expect(checkClaim("Apple's net sales were $395 billion in 2024.", FILING).verdict).toBe("unsupported");
    expect(checkClaim("Net income was $96,995 million in 2024.", FILING).verdict).toBe("unsupported");
  });

  it("catches a wrong direction and an unknown company", () => {
    expect(checkClaim("Services grew 13% while iPhone revenue rose.", FILING).verdict).toBe("unsupported");
    expect(checkClaim("iPhone revenue declined in 2024.", FILING).verdict).toBe("supported");
    expect(checkClaim("Microsoft reported net sales of $391,035 million in 2024.", FILING).verdict).not.toBe("supported");
  });
});

describe("checkAnswer", () => {
  it("flags only the citing sentences the cited passage does not back", () => {
    const answer =
      "Net sales were $391 billion [1]. Net income was $96,995 million [1].\n" +
      "- iPhone revenue rose. [1]\n- Margins are healthy.";
    const flags = checkAnswer(answer, new Map([[1, FILING]]));
    expect(flags).toHaveLength(2);
    expect(answer.slice(0, flags[0]!.at).endsWith("$96,995 million [1]")).toBe(true);
    expect(answer.slice(0, flags[1]!.at).endsWith("rose. [1]")).toBe(true);
  });

  it("keeps decimals inside a sentence and skips sentences with no known source", () => {
    expect(citedSentences("Net income was $93.7 billion [2].").map((s) => s.claim)).toEqual(["Net income was $93.7 billion."]);
    expect(checkAnswer("Net income was $1 [9].", new Map([[1, FILING]]))).toEqual([]);
  });
});
