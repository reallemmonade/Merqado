import { randomBytes } from "node:crypto";

/**
 * Live case updates: an in-process pub/sub keyed by engagement id. Every write to a case bumps
 * the case's version, and every open tab, window or phone that is watching the case gets the new
 * version and reloads its data. Versions carry the server's boot id, so a restart (deploy) also
 * reads as a change and every client reloads once.
 *
 * Merqado runs as one web process, so in-memory is enough. Running several instances would need
 * a shared channel (e.g. a database table polled here) behind the same functions.
 */

type Listener = (version: string) => void;

interface Hub {
  boot: string;
  versions: Map<string, number>;
  listeners: Map<string, Set<Listener>>;
  pending: Map<string, ReturnType<typeof setTimeout>>;
}

const KEY = Symbol.for("merqado.live.hub");
const g = globalThis as unknown as { [KEY]?: Hub };

function hub(): Hub {
  return (g[KEY] ??= { boot: randomBytes(4).toString("hex"), versions: new Map(), listeners: new Map(), pending: new Map() });
}

/** Writes that land within this window are sent as one change. */
export const COALESCE_MS = 120;

export function caseVersion(engagementId: string): string {
  const h = hub();
  return `${h.boot}.${h.versions.get(engagementId) ?? 0}`;
}

/** Marks a case as changed and tells everyone watching it. */
export function publishCaseChange(engagementId: string): void {
  const h = hub();
  if (h.pending.has(engagementId)) return;
  h.pending.set(
    engagementId,
    setTimeout(() => {
      h.pending.delete(engagementId);
      h.versions.set(engagementId, (h.versions.get(engagementId) ?? 0) + 1);
      const v = caseVersion(engagementId);
      for (const fn of h.listeners.get(engagementId) ?? []) {
        try {
          fn(v);
        } catch {}
      }
    }, COALESCE_MS),
  );
}

/** Calls `fn` with the new version after each change; returns the unsubscribe function. */
export function subscribeCase(engagementId: string, fn: Listener): () => void {
  const h = hub();
  let set = h.listeners.get(engagementId);
  if (!set) h.listeners.set(engagementId, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0 && h.listeners.get(engagementId) === set) h.listeners.delete(engagementId);
  };
}

export function watcherCount(engagementId: string): number {
  return hub().listeners.get(engagementId)?.size ?? 0;
}
