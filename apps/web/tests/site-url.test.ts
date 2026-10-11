import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPublicBaseUrl, buildVerificationUrl } from "../src/lib/site-url";

describe("Dynamic Site URL & Verification Engine", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty string or window origin if no env vars set in node", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_VERCEL_URL;
    delete process.env.VERCEL_URL;

    const base = getPublicBaseUrl();
    expect(typeof base).toBe("string");
  });

  it("respects NEXT_PUBLIC_APP_URL when configured for a custom domain", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom-tax-portal.com";
    expect(getPublicBaseUrl()).toBe("https://custom-tax-portal.com");

    // Strips trailing slashes
    process.env.NEXT_PUBLIC_APP_URL = "https://custom-tax-portal.com/";
    expect(getPublicBaseUrl()).toBe("https://custom-tax-portal.com");
  });

  it("respects VERCEL_URL for deployment previews", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_VERCEL_URL;
    process.env.VERCEL_URL = "custom-preview.vercel.app";
    expect(getPublicBaseUrl()).toBe("https://custom-preview.vercel.app");
  });

  it("builds root-relative or absolute verification URL correctly", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://my-domain.org";

    const url = buildVerificationUrl({
      type: "PFT-2",
      ref: "PFT2-2026-0001",
      amt: 5000,
      pin: "123456"
    });

    expect(url).toBe(
      "https://my-domain.org/verify?type=PFT-2&ref=PFT2-2026-0001&amt=5000&pin=123456"
    );
  });

  it("ignores undefined, null, and empty parameter values", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://my-domain.org";

    const url = buildVerificationUrl({
      type: "PFT-REC",
      ref: "REC-001",
      pdn: undefined,
      amt: null,
      sha: ""
    });

    expect(url).toBe("https://my-domain.org/verify?type=PFT-REC&ref=REC-001");
  });
});
