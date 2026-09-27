import { describe, expect, it } from "vitest";
import { resolveDocumentActor } from "../src/lib/server-actor.js";

describe("server document actor resolution", () => {
  it("rejects a request with no verified bearer session", async () => {
    await expect(resolveDocumentActor(null)).rejects.toThrow("verified bearer session missing");
  });

  it("rejects an empty bearer token before contacting Supabase", async () => {
    await expect(resolveDocumentActor("Bearer ")).rejects.toThrow("bearer token missing");
  });
});
