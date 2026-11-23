/** Window event fired in a tab after its case changed; client-loaded views refetch on it. */
export const CASE_CHANGED_EVENT = "mq:case-changed";

export interface LiveSyncOptions {
  engagementId: string;
  onChange: () => void;
  onSignedOut: () => void;
  /** Wait after a change before reloading, so a burst of writes reloads once. */
  debounceMs?: number;
  win?: Window & typeof globalThis;
}

interface Msg {
  /** A version, from the tab holding the stream. */
  v?: string;
  /** A tab that just opened asks the stream holder for the current version. */
  ask?: boolean;
}

/**
 * Wires one tab into live updates for a case and returns the teardown.
 * - Leader election uses Web Locks: the tab holding `merqado-live:<id>` opens the event stream and
 *   relays each version over a BroadcastChannel. When it closes, the next tab takes over.
 * - Each tab remembers the last version it saw; a different one means reload.
 * - A hidden tab waits and reloads when it comes back into view.
 */
export function createLiveSync(opts: LiveSyncOptions): () => void {
  const w = opts.win ?? window;
  const doc = w.document;
  const debounceMs = opts.debounceMs ?? 250;
  const name = `merqado-live:${opts.engagementId}`;
  const url = `/api/engagements/${encodeURIComponent(opts.engagementId)}/live`;

  let last: string | null = null;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const fire = () => {
    if (closed) return;
    if (doc.visibilityState !== "visible") {
      dirty = true;
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) opts.onChange();
    }, debounceMs);
  };

  const seen = (v: string) => {
    if (last !== null && v !== last) fire();
    last = v;
  };

  const onVisible = () => {
    if (doc.visibilityState === "visible" && dirty) {
      dirty = false;
      fire();
    }
  };
  doc.addEventListener("visibilitychange", onVisible);

  const channel = typeof w.BroadcastChannel === "function" ? new w.BroadcastChannel(name) : null;
  let leading = false;
  if (channel) {
    channel.onmessage = (e: MessageEvent<Msg>) => {
      if (typeof e.data?.v === "string") seen(e.data.v);
      else if (e.data?.ask && leading && last !== null) channel.postMessage({ v: last } satisfies Msg);
    };
    channel.postMessage({ ask: true } satisfies Msg);
  }

  let stopStream = () => {};
  const openStream = (): Promise<void> =>
    new Promise((resolve) => {
      if (closed) return resolve();
      leading = true;
      const es = new w.EventSource(url);
      es.addEventListener("v", (e) => {
        const v = (e as MessageEvent<string>).data;
        seen(v);
        channel?.postMessage({ v } satisfies Msg);
      });
      es.onerror = () => {
        // The browser retries on its own; check the stream wasn't refused because sign-in ended.
        w.fetch("/api/auth/status", { cache: "no-store" })
          .then((r) => {
            if (r.status === 401 && !closed) opts.onSignedOut();
          })
          .catch(() => null);
      };
      stopStream = () => {
        es.close();
        leading = false;
        resolve();
      };
    });

  const locks = (w.navigator as Navigator | undefined)?.locks;
  const abort = new AbortController();
  if (locks && channel) {
    locks.request(name, { signal: abort.signal }, () => openStream()).catch(() => null);
  } else {
    void openStream();
  }

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    abort.abort();
    stopStream();
    channel?.close();
    doc.removeEventListener("visibilitychange", onVisible);
  };
}
