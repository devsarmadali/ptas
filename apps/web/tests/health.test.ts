import { describe, expect, it } from "vitest";
import { GET } from "../src/app/health/route";

describe("health route", () => {
  it("returns a non-cached ok response", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
