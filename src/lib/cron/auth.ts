import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const CRON_SECRET_HEADER = "x-cron-secret";

/** GitHub Actions signs a short-lived token for the Scheduler workflow; no shared secret needed. */
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const CRON_AUDIENCE = "merqado-cron";
const REPOSITORY = "reallemmonade/merqado";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/cron.yml@refs/heads/main`;

let githubKeys: JWTVerifyGetKey | undefined;
function githubJwks(): JWTVerifyGetKey {
  githubKeys ??= createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));
  return githubKeys;
}

/** True when the request carries the CRON_SECRET. Always false when CRON_SECRET isn't set. */
export function secretAuthorized(headers: Headers, secret = process.env.CRON_SECRET): boolean {
  const given = headers.get(CRON_SECRET_HEADER);
  if (!secret || secret.length < 16 || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** True when the bearer token is a GitHub OIDC token from this repo's Scheduler workflow on main. */
export async function githubWorkflowAuthorized(headers: Headers, keys: JWTVerifyGetKey = githubJwks()): Promise<boolean> {
  const token = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: CRON_AUDIENCE,
      algorithms: ["RS256"],
    });
    return (
      String(payload.repository ?? "").toLowerCase() === REPOSITORY &&
      String(payload.workflow_ref ?? "").toLowerCase() === WORKFLOW_REF.toLowerCase() &&
      payload.ref === "refs/heads/main"
    );
  } catch {
    return false;
  }
}

/** The Scheduler workflow's GitHub token, or the optional CRON_SECRET header (for manual calls). */
export async function cronAuthorized(headers: Headers): Promise<boolean> {
  return secretAuthorized(headers) || (await githubWorkflowAuthorized(headers));
}
