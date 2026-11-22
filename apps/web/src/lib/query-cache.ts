/**
 * Shared client-side TTL and single-flight query cache for PTAS operational datasets.
 *
 * Eliminates duplicate Supabase RPC bursts across App Router route transitions,
 * overlapping mounts, and concurrent PDF/modal reads while guaranteeing immediate
 * invalidation on every write mutation and full purge on sign-out.
 */

export const PTAS_CACHE_KEYS = {
  OPERATIONAL_UNITS: "operational_units",
  POTENTIAL_UNITS: "potential_units",
  CHALLAN_REGISTRY: "challan_registry",
  AUDIT_LOGS: "audit_logs",
  CHALLAN_JURISDICTION_CODES_PREFIX: "challan_jurisdiction_codes:"
} as const;

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAtMs: number;
}

const valueCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export interface CacheFetchOptions {
  readonly force?: boolean | undefined;
  readonly shouldCache?: ((value: unknown) => boolean) | undefined;
}

export async function getOrFetchCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options: CacheFetchOptions = {}
): Promise<T> {
  const { force = false, shouldCache } = options;
  const now = Date.now();

  if (!force) {
    const cached = valueCache.get(key);
    if (cached && cached.expiresAtMs > now) {
      return cached.value as T;
    }

    const existingInFlight = inFlightRequests.get(key);
    if (existingInFlight) {
      return existingInFlight as Promise<T>;
    }
  }

  const request = fetcher()
    .then((value) => {
      if (!shouldCache || shouldCache(value)) {
        valueCache.set(key, {
          value,
          expiresAtMs: Date.now() + ttlMs
        });
      }
      return value;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) {
        inFlightRequests.delete(key);
      }
    });

  inFlightRequests.set(key, request);
  return request;
}

export function invalidateQueryCache(keys: string | readonly string[]): void {
  const list = typeof keys === "string" ? [keys] : keys;
  for (const key of list) {
    valueCache.delete(key);
    inFlightRequests.delete(key);
  }
}

export function invalidateQueryCachePrefix(prefix: string): void {
  for (const key of Array.from(valueCache.keys())) {
    if (key.startsWith(prefix)) {
      valueCache.delete(key);
    }
  }
  for (const key of Array.from(inFlightRequests.keys())) {
    if (key.startsWith(prefix)) {
      inFlightRequests.delete(key);
    }
  }
}

export function clearAllQueryCaches(): void {
  valueCache.clear();
  inFlightRequests.clear();
}
