import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveSync } from "@/components/live/liveSync";

/** A tiny browser: tabs sharing BroadcastChannels and one Web Lock manager, fake EventSources. */
function browser() {
  const channels = new Map<string, Set<FakeChannel>>();
  class FakeChannel {
    onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(public name: string) {
      if (!channels.has(name)) channels.set(name, new Set());
      channels.get(name)!.add(this);
    }
    postMessage(data: unknown) {
      for (const c of channels.get(this.name) ?? []) if (c !== this) c.onmessage?.({ data } as MessageEvent);
    }
    close() {
      channels.get(this.name)?.delete(this);
    }
  }
  const streams: FakeSource[] = [];
  class FakeSource {
    listeners: ((e: MessageEvent) => void)[] = [];
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) {
      streams.push(this);
    }
    addEventListener(_t: string, fn: (e: MessageEvent) => void) {
      this.listeners.push(fn);
    }
    emit(v: string) {
      for (const fn of this.listeners) fn({ data: v } as MessageEvent);
    }
    close() {
      this.closed = true;
    }
  }
  const held = new Map<string, Promise<void>>();
  const queue = new Map<string, (() => void)[]>();
  const locks = {
    request(name: string, _opts: { signal: AbortSignal }, cb: () => Promise<void>) {
      const run = () => {
        const p = cb().finally(() => {
          held.delete(name);
          queue.get(name)?.shift()?.();
        });
        held.set(name, p);
        return p;
      };
      if (!held.has(name)) return run();
      return new Promise<void>((res) => {
        const q = queue.get(name) ?? [];
        q.push(() => void run().then(res));
        queue.set(name, q);
      });
    },
  };
  function tab() {
    const listeners = new Map<string, () => void>();
    const doc = {
      visibilityState: "visible",
      addEventListener: (t: string, fn: () => void) => listeners.set(t, fn),
      removeEventListener: (t: string) => listeners.delete(t),
    };
    const win = {
      document: doc,
      BroadcastChannel: FakeChannel,
      EventSource: FakeSource,
      navigator: { locks },
      fetch: vi.fn(async () => ({ status: 200 })),
    } as unknown as Window & typeof globalThis;
    return { win, doc, show: () => listeners.get("visibilitychange")?.() };
  }
  return { tab, streams };
}

describe("createLiveSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens one stream per browser and reloads every tab on a change", async () => {
    const b = browser();
    const t1 = b.tab();
    const t2 = b.tab();
    const on1 = vi.fn();
    const on2 = vi.fn();
    const stop1 = createLiveSync({ engagementId: "c1", onChange: on1, onSignedOut: vi.fn(), win: t1.win });
    const stop2 = createLiveSync({ engagementId: "c1", onChange: on2, onSignedOut: vi.fn(), win: t2.win });
    await vi.advanceTimersByTimeAsync(0);
    expect(b.streams.length).toBe(1);
    b.streams[0]!.emit("boot.0");
    await vi.advanceTimersByTimeAsync(300);
    expect(on1).not.toHaveBeenCalled();
    expect(on2).not.toHaveBeenCalled();
    b.streams[0]!.emit("boot.1");
    await vi.advanceTimersByTimeAsync(300);
    expect(on1).toHaveBeenCalledTimes(1);
    expect(on2).toHaveBeenCalledTimes(1);
    stop1();
    stop2();
  });

  it("a tab that opens later learns the current version first", async () => {
    const b = browser();
    const t1 = b.tab();
    const stop1 = createLiveSync({ engagementId: "c1", onChange: vi.fn(), onSignedOut: vi.fn(), win: t1.win });
    await vi.advanceTimersByTimeAsync(0);
    b.streams[0]!.emit("boot.4");
    const t2 = b.tab();
    const on2 = vi.fn();
    const stop2 = createLiveSync({ engagementId: "c1", onChange: on2, onSignedOut: vi.fn(), win: t2.win });
    b.streams[0]!.emit("boot.5");
    await vi.advanceTimersByTimeAsync(300);
    expect(on2).toHaveBeenCalledTimes(1);
    stop1();
    stop2();
  });

  it("hands the stream to the next tab when the first closes", async () => {
    const b = browser();
    const t1 = b.tab();
    const t2 = b.tab();
    const on2 = vi.fn();
    const stop1 = createLiveSync({ engagementId: "c1", onChange: vi.fn(), onSignedOut: vi.fn(), win: t1.win });
    const stop2 = createLiveSync({ engagementId: "c1", onChange: on2, onSignedOut: vi.fn(), win: t2.win });
    await vi.advanceTimersByTimeAsync(0);
    b.streams[0]!.emit("boot.0");
    stop1();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.streams[0]!.closed).toBe(true);
    expect(b.streams.length).toBe(2);
    b.streams[1]!.emit("boot.1");
    await vi.advanceTimersByTimeAsync(300);
    expect(on2).toHaveBeenCalledTimes(1);
    stop2();
  });

  it("a hidden tab waits until it is shown, and a burst reloads once", async () => {
    const b = browser();
    const t1 = b.tab();
    const on1 = vi.fn();
    const stop = createLiveSync({ engagementId: "c1", onChange: on1, onSignedOut: vi.fn(), win: t1.win });
    await vi.advanceTimersByTimeAsync(0);
    b.streams[0]!.emit("boot.0");
    t1.doc.visibilityState = "hidden";
    b.streams[0]!.emit("boot.1");
    b.streams[0]!.emit("boot.2");
    await vi.advanceTimersByTimeAsync(1000);
    expect(on1).not.toHaveBeenCalled();
    t1.doc.visibilityState = "visible";
    t1.show();
    await vi.advanceTimersByTimeAsync(300);
    expect(on1).toHaveBeenCalledTimes(1);
    stop();
  });

  it("sends a signed-out tab to sign-in", async () => {
    const b = browser();
    const t1 = b.tab();
    (t1.win.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 401 });
    const out = vi.fn();
    const stop = createLiveSync({ engagementId: "c1", onChange: vi.fn(), onSignedOut: out, win: t1.win });
    await vi.advanceTimersByTimeAsync(0);
    b.streams[0]!.onerror?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(out).toHaveBeenCalled();
    stop();
  });
});
