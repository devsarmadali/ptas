import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock("@ptas/database/client", () => ({
  createPtasSupabaseClient: () => ({ auth: { getUser }, rpc })
}));
import { resolveDocumentActor } from "../src/lib/server-actor.js";

describe("server document actor resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
