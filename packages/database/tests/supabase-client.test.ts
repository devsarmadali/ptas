import { describe, expect, it } from "vitest";
import { createPtasSupabaseClient } from "../src/supabase-client.js";

describe("PTAS Supabase Client Factory", () => {
  it("initializes a client with valid URL and key", () => {
    const client = createPtasSupabaseClient({
      url: "https://zvadxmxasutvqpltszim.supabase.co",
      key: "sb_publishable_test_key"
    });
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("throws error when URL or key is missing", () => {
    expect(() =>
      createPtasSupabaseClient({
        url: "",
        key: "key"
      })
    ).toThrow(/required/);

    expect(() =>
      createPtasSupabaseClient({
        url: "https://example.supabase.co",
        key: ""
      })
    ).toThrow(/required/);
  });
});
