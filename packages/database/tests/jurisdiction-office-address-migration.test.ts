import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PTAS Migration 0029: Jurisdiction Office Address", () => {
  const sql = readFileSync(
    resolve(__dirname, "../migrations/0029_jurisdiction_office_address.sql"),
    "utf8"
  );

  it("alters public.jurisdictions to add office_address column", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS office_address text;");
  });

  it("populates official Vehari Excise & Taxation Office address", () => {
    expect(sql).toContain("Excise & Taxation Office, Danewal Road, Near General Bus Stand, Vehari");
  });

  it("populates sub-offices for Burewala and Mailsi", () => {
    expect(sql).toContain("Excise & Taxation Sub-Office, Old Tehsil Road, Burewala");
    expect(sql).toContain("Excise & Taxation Sub-Office, Colony Road, Mailsi");
  });
});
