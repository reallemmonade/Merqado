/** Request header the proxy sets on case writes: the engagement id that the request may change. */
export const CASE_WRITE_HEADER = "x-mq-case-write";
/** Request header a client sets on writes nobody else needs to see (presence pings, read marks). */
export const QUIET_HEADER = "x-mq-quiet";

const CASE_PATH = /^\/api\/(?:engagements|mobile\/cases)\/([A-Za-z0-9_-]{1,64})(?:\/|$)/;
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The case a request writes to, or null for reads, quiet writes and non-case paths. */
export function caseWriteTarget(method: string, pathname: string, quiet: boolean): string | null {
  if (quiet || READS.has(method.toUpperCase())) return null;
  return pathname.match(CASE_PATH)?.[1] ?? null;
}
