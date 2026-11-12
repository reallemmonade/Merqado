import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import http2 from "node:http2";

/**
 * Sends iPhone notifications straight to Apple (APNs) with a token-based .p8 key.
 * Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (the .p8 file's text), APNS_BUNDLE_ID.
 */
export interface ApnsConfig {
  keyId: string;
  teamId: string;
  key: KeyObject;
  bundleId: string;
}

export function apnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 } = env;
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_KEY_P8) return null;
  // Render keeps newlines in env vars, but people often paste the key as one line with "\n".
  const pem = APNS_KEY_P8.includes("\\n") ? APNS_KEY_P8.replace(/\\n/g, "\n") : APNS_KEY_P8;
  return { keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, key: createPrivateKey(pem), bundleId: env.APNS_BUNDLE_ID || "ai.merqado.app" };
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

let cached: { jwt: string; at: number; keyId: string } | null = null;

/** Apple wants a fresh provider token at most every 60 minutes and no more than every 20. */
export function providerToken(cfg: ApnsConfig, now = Date.now()): string {
  if (cached && cached.keyId === cfg.keyId && now - cached.at < 40 * 60 * 1000) return cached.jwt;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: cfg.key, dsaEncoding: "ieee-p1363" });
  cached = { jwt: `${header}.${claims}.${b64url(signature)}`, at: now, keyId: cfg.keyId };
  return cached.jwt;
}

export interface ApnsMessage {
  title: string;
  body: string;
  /** Notifications with the same thread id stack together on the lock screen. */
  threadId?: string;
  /** Matches a notification category registered by the app (adds Reply / Approve buttons). */
  category?: string;
  badge?: number;
  /** Extra data the app reads when the notification is tapped, e.g. { url: "/case/x/room/y" }. */
  data?: Record<string, unknown>;
}

export interface ApnsResult {
  token: string;
  status: number;
  reason?: string;
}

const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;

export function apnsPayload(msg: ApnsMessage) {
  return {
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: "default",
      ...(msg.threadId && { "thread-id": msg.threadId }),
      ...(msg.category && { category: msg.category }),
      ...(msg.badge !== undefined && { badge: msg.badge }),
    },
    ...(msg.data ?? {}),
  };
}

/** Sends one message to several devices on one HTTP/2 connection. */
export async function sendApns(
  cfg: ApnsConfig,
  environment: keyof typeof HOSTS,
  tokens: string[],
  msg: ApnsMessage,
): Promise<ApnsResult[]> {
  if (tokens.length === 0) return [];
  const client = http2.connect(HOSTS[environment]);
  client.on("error", () => {});
  const body = JSON.stringify(apnsPayload(msg));
  const jwt = providerToken(cfg);
  try {
    return await Promise.all(
      tokens.map(
        (token) =>
          new Promise<ApnsResult>((resolve) => {
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              "apns-topic": cfg.bundleId,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "content-type": "application/json",
            });
            let status = 0;
            let data = "";
            req.setTimeout(10_000, () => req.close());
            req.on("response", (h) => (status = Number(h[":status"]) || 0));
            req.on("data", (c) => (data += c));
            req.on("end", () => {
              let reason: string | undefined;
              try {
                reason = data ? (JSON.parse(data) as { reason?: string }).reason : undefined;
              } catch {}
              resolve({ token, status, reason });
            });
            req.on("error", (e) => resolve({ token, status: 0, reason: e.message }));
            // A timed-out stream only closes; the first resolve wins.
            req.on("close", () => resolve({ token, status, reason: status ? undefined : "timeout" }));
            req.end(body);
          }),
      ),
    );
  } finally {
    client.close();
  }
}

/** Apple answers these when a token will never work again; the device should be forgotten. */
export function isDeadToken(r: ApnsResult): boolean {
  return r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered" || r.reason === "DeviceTokenNotForTopic";
}
