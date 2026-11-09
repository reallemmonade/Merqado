import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apnsConfig, apnsPayload, isDeadToken, providerToken } from "@/lib/push/apns";

describe("apns", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("is off until the key is set", () => {
    expect(apnsConfig({})).toBeNull();
  });

  it("reads a key pasted on one line", () => {
    const cfg = apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_KEY_P8: pem.replace(/\n/g, "\\n") });
    expect(cfg?.bundleId).toBe("ai.merqado.app");
  });

  it("signs an ES256 provider token Apple can verify", () => {
    const cfg = apnsConfig({ APNS_KEY_ID: "KEY123", APNS_TEAM_ID: "TEAM45", APNS_KEY_P8: pem })!;
    const jwt = providerToken(cfg, 1_800_000_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(c!, "base64url").toString())).toEqual({ iss: "TEAM45", iat: 1_800_000_000 });
    const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
  });

  it("builds the payload", () => {
    expect(apnsPayload({ title: "T", body: "B", threadId: "room", category: "MESSAGE", data: { url: "/x" } })).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default", "thread-id": "room", category: "MESSAGE" },
      url: "/x",
    });
  });

  it("knows dead tokens", () => {
    expect(isDeadToken({ token: "t", status: 410 })).toBe(true);
    expect(isDeadToken({ token: "t", status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(isDeadToken({ token: "t", status: 429, reason: "TooManyRequests" })).toBe(false);
  });
});
