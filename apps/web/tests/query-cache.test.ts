import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllQueryCaches,
  getOrFetchCached,
  invalidateQueryCache,
  invalidateQueryCachePrefix
} from "../src/lib/query-cache.js";

describe("Client TTL and Single-Flight Query Cache", () => {
  beforeEach(() => {
    clearAllQueryCaches();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T10:00:00.000Z"));
  });

  afterEach(() => {
    clearAllQueryCaches();
    vi.useRealTimers();
  });

  it("serves cached entries within TTL and re-fetches once expired", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(["u1"]).mockResolvedValueOnce(["u2"]);

    const first = await getOrFetchCached("units", 45_000, fetcher);
    const second = await getOrFetchCached("units", 45_000, fetcher);

    expect(first).toEqual(["u1"]);
    expect(second).toEqual(["u1"]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(45_001);
    const third = await getOrFetchCached("units", 45_000, fetcher);
    expect(third).toEqual(["u2"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent in-flight requests to a single RPC call", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      await Promise.resolve();
      return { count: calls };
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => getOrFetchCached("challans", 45_000, fetcher))
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.every((entry) => entry.count === 1)).toBe(true);
  });

  it("bypasses cache when force is true and respects shouldCache predicates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(["valid-1"])
      .mockResolvedValueOnce(["valid-2"]);

    const firstNull = await getOrFetchCached("potential", 60_000, fetcher, {
      shouldCache: (v) => v !== null
    });
    expect(firstNull).toBeNull();

    const loaded = await getOrFetchCached("potential", 60_000, fetcher, {
      shouldCache: (v) => v !== null
    });
    expect(loaded).toEqual(["valid-1"]);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const forced = await getOrFetchCached("potential", 60_000, fetcher, {
      force: true,
      shouldCache: (v) => v !== null
    });
    expect(forced).toEqual(["valid-2"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("clears targeted keys, key prefixes, and full cache cleanly", async () => {
    const fn = vi.fn().mockResolvedValue("v");

    await getOrFetchCached("code:a", 60_000, fn);
    await getOrFetchCached("code:b", 60_000, fn);
    await getOrFetchCached("other", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(3);

    invalidateQueryCachePrefix("code:");
    await getOrFetchCached("other", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(3);

    await getOrFetchCached("code:a", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(4);

    invalidateQueryCache(["other"]);
    await getOrFetchCached("other", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(5);

    clearAllQueryCaches();
    await getOrFetchCached("other", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(6);
  });
});
