import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock("@ptas/database/client", () => ({
  createPtasSupabaseClient: () => ({ auth: { getUser }, rpc })
}));
import { clearDocumentActorCache, resolveDocumentActor } from "../src/lib/server-actor.js";

describe("server document actor resolution", () => {
  afterEach(() => {
    clearDocumentActorCache();
    vi.clearAllMocks();
    vi.useRealTimers();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("rejects a request with no verified bearer session", async () => {
    await expect(resolveDocumentActor(null)).rejects.toThrow("verified bearer session missing");
  });

  it("rejects an empty bearer token before contacting Supabase", async () => {
    await expect(resolveDocumentActor("Bearer ")).rejects.toThrow("bearer token missing");
  });

  it("uses the active database assignment instead of JWT role metadata", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
    getUser.mockResolvedValue({
      data: { user: { id: "auth-user", app_metadata: { ptas_role: "ADMIN" } } },
      error: null
    });
    rpc.mockResolvedValue({
      data: { user_id: "app-user", role: "ETO", jurisdiction_id: "office-1" },
      error: null
    });

    await expect(resolveDocumentActor("Bearer valid-token")).resolves.toEqual({
      officerId: "app-user",
      role: "ETO",
      jurisdictionId: "office-1"
    });
  });

  it("caches verified actor contexts across repeated requests within TTL and respects cache clear", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
    getUser.mockResolvedValue({
      data: { user: { id: "auth-user" } },
      error: null
    });
    rpc.mockResolvedValue({
      data: { user_id: "app-user", role: "ETO", jurisdiction_id: "office-1" },
      error: null
    });

    const first = await resolveDocumentActor("Bearer cached-token");
    const second = await resolveDocumentActor("Bearer cached-token");

    expect(first).toEqual({
      officerId: "app-user",
      role: "ETO",
      jurisdictionId: "office-1"
    });
    expect(second).toEqual(first);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);

    clearDocumentActorCache();

    await resolveDocumentActor("Bearer cached-token");
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("never caches failed or denied actor lookups", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
    getUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error("session expired")
      })
      .mockResolvedValueOnce({
        data: { user: { id: "auth-user" } },
        error: null
      })
      .mockResolvedValueOnce({
        data: { user: { id: "auth-user" } },
        error: null
      });
    rpc
      .mockResolvedValueOnce({
        data: { user_id: "app-user", role: "GUEST", jurisdiction_id: "office-1" },
        error: null
      })
      .mockResolvedValueOnce({
        data: { user_id: "app-user", role: "INSPECTOR", jurisdiction_id: "office-1" },
        error: null
      });

    await expect(resolveDocumentActor("Bearer retry-token")).rejects.toThrow(
      "invalid or expired session"
    );
    await expect(resolveDocumentActor("Bearer retry-token")).rejects.toThrow(
      "active PTAS role and jurisdiction assignment required"
    );
    await expect(resolveDocumentActor("Bearer retry-token")).resolves.toEqual({
      officerId: "app-user",
      role: "INSPECTOR",
      jurisdictionId: "office-1"
    });
    expect(getUser).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent in-flight lookups for the same uncached token", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";

    let releaseGetUser!: (value: { data: { user: { id: string } }; error: null }) => void;
    getUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseGetUser = resolve;
        })
    );
    rpc.mockResolvedValueOnce({
      data: { user_id: "app-user", role: "DIRECTOR", jurisdiction_id: "hq-1" },
      error: null
    });

    const p1 = resolveDocumentActor("Bearer concurrent-token");
    const p2 = resolveDocumentActor("Bearer concurrent-token");
    const p3 = resolveDocumentActor("Bearer concurrent-token");

    releaseGetUser({ data: { user: { id: "auth-user" } }, error: null });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toEqual({ officerId: "app-user", role: "DIRECTOR", jurisdictionId: "hq-1" });
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
