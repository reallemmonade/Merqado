import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { caseVersion, COALESCE_MS, publishCaseChange, subscribeCase, watcherCount } from "./hub";
import { caseWriteTarget } from "./paths";

describe("caseWriteTarget", () => {
  it("tags writes to a case, web and phone", () => {
    expect(caseWriteTarget("POST", "/api/engagements/abc123/notes", false)).toBe("abc123");
    expect(caseWriteTarget("delete", "/api/engagements/abc123/experts/x", false)).toBe("abc123");
    expect(caseWriteTarget("POST", "/api/mobile/cases/abc123/todos", false)).toBe("abc123");
  });
  it("skips reads, quiet writes and other paths", () => {
    expect(caseWriteTarget("GET", "/api/engagements/abc123/notes", false)).toBeNull();
    expect(caseWriteTarget("POST", "/api/engagements/abc123/channel", true)).toBeNull();
    expect(caseWriteTarget("POST", "/api/engagements", false)).toBeNull();
    expect(caseWriteTarget("POST", "/api/feedback", false)).toBeNull();
    expect(caseWriteTarget("POST", "/e/abc123/notes", false)).toBeNull();
  });
});

describe("live hub", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("bumps the version once per burst of writes and tells every watcher", () => {
    const id = `case-${Math.random()}`;
    const before = caseVersion(id);
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeCase(id, a);
    const offB = subscribeCase(id, b);
    publishCaseChange(id);
    publishCaseChange(id);
    publishCaseChange(id);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(COALESCE_MS);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    const after = caseVersion(id);
    expect(after).not.toBe(before);
    expect(a).toHaveBeenCalledWith(after);
    offA();
    offB();
    expect(watcherCount(id)).toBe(0);
  });

  it("keeps cases apart", () => {
    const one = `case-${Math.random()}`;
    const two = `case-${Math.random()}`;
    const fn = vi.fn();
    const off = subscribeCase(one, fn);
    publishCaseChange(two);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(fn).not.toHaveBeenCalled();
    off();
  });
});
