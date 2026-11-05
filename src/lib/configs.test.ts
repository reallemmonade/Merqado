import { describe, expect, it } from "vitest";
import { aiProviderConfigSchema, createProvider } from "./ai";
import { safeKey, storageConfigSchema } from "./storage";

describe("AI provider configs", () => {
  it("defaults Anthropic to the current Opus model", () => {
    const c = aiProviderConfigSchema.parse({ kind: "anthropic", apiKey: "k" });
    expect(c).toMatchObject({ model: "claude-opus-5-5" });
  });

  it("builds a provider for every supported kind", () => {
    const configs = [
      { kind: "anthropic", apiKey: "k" },
      { kind: "bedrock", awsRegion: "us-east-1" },
      { kind: "vertex", projectId: "p" },
      { kind: "openai", apiKey: "k", model: "m" },
      { kind: "azure-openai", apiKey: "k", endpoint: "https://x.openai.azure.com", deployment: "d" },
    ];
    for (const raw of configs) {
      const p = createProvider(aiProviderConfigSchema.parse(raw));
      expect(p.kind).toBe(raw.kind);
    }
  });

  it("rejects unknown providers", () => {
    expect(() => aiProviderConfigSchema.parse({ kind: "mystery" })).toThrow();
  });
});

describe("storage", () => {
  it("parses an S3 connection", () => {
    expect(storageConfigSchema.parse({ kind: "s3", bucket: "b", region: "us-east-1" })).toMatchObject({ prefix: "" });
  });

  it("blocks path traversal in keys", () => {
    expect(() => safeKey("../etc/passwd")).toThrow();
    expect(() => safeKey("a/../../b")).toThrow();
    expect(safeKey("/engagements/1/file.pdf")).toBe("engagements/1/file.pdf");
  });
});
