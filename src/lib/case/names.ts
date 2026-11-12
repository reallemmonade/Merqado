/**
 * The case GPT is named after the project code name: "Project Atlas" becomes "AtlasGPT".
 * Engagements keep their code name in `clientName`.
 */
export function gptName(codeName: string): string {
  const stripped = codeName.trim().replace(/^project\s+/i, "");
  const first = stripped.split(/\s+/)[0] ?? "";
  const word = first.replace(/[^\p{L}\p{N}]/gu, "");
  return `${word || "Case"}GPT`;
}

