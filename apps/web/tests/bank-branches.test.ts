import { describe, it, expect } from "vitest";
import {
  getDesignatedBranchesForDistrict,
  normalizeDistrictName,
  formatBranchDisplay,
  formatBranchOptionLabel,
  getUniqueDistricts
} from "../src/lib/bank-branches";

describe("Designated Bank Branches Jurisdiction-Wise Service", () => {
  it("normalizes district names correctly", () => {
    expect(normalizeDistrictName("District Vehari")).toBe("vehari");
    expect(normalizeDistrictName("Vehari Circle-I")).toBe("vehari");
    expect(normalizeDistrictName("Circle-Vehari")).toBe("vehari");
    expect(normalizeDistrictName("VEHARI")).toBe("vehari");
    expect(normalizeDistrictName("D.G. Khan")).toBe("d g khan");
  });

  it("extracts all unique districts from designated branches schedule", () => {
    const districts = getUniqueDistricts();
    expect(districts.length).toBeGreaterThan(50);
    expect(districts).toContain("VEHARI");
    expect(districts).toContain("Lahore");
    expect(districts).toContain("Multan");
  });

  it("filters branches strictly for Vehari district", () => {
    const branches = getDesignatedBranchesForDistrict("Vehari");
    expect(branches.length).toBe(5);
    const branchNames = branches.map((b) => b.branchName);
    expect(branchNames).toContain("Main Branch, Vehari");
    expect(branchNames).toContain("Main Branch, Burewala");
    expect(branchNames).toContain("Main Branch, Mailsi");
    expect(branchNames).toContain("Ghalla Mandi Burewala");
    expect(branchNames).toContain("Ghalla Mandi Gaggoo");

    for (const b of branches) {
      expect(b.district.toUpperCase()).toBe("VEHARI");
      expect(b.bankName).toBe("National Bank of Pakistan");
    }
  });

  it("filters branches strictly for D G Khan district", () => {
    const branches = getDesignatedBranchesForDistrict("D G Khan");
    expect(branches.length).toBeGreaterThan(0);
    for (const b of branches) {
      expect(b.district).toBe("D G Khan");
    }
  });

  it("formats branch label with branch name and code", () => {
    const vehariBranches = getDesignatedBranchesForDistrict("Vehari");
    const mainVehari = vehariBranches.find((b) => b.branchCode === "414")!;
    expect(mainVehari).toBeDefined();
    const formatted = formatBranchDisplay(mainVehari);
    expect(formatted).toContain("National Bank of Pakistan");
    expect(formatted).toContain("Main Branch, Vehari");
    expect(formatted).toContain("414");

    const optionLabel = formatBranchOptionLabel(mainVehari);
    expect(optionLabel).toContain("Main Branch, Vehari");
    expect(optionLabel).toContain("414");
    expect(optionLabel).toContain("VEHARI");
  });
});
