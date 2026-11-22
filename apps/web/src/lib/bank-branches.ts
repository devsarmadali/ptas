import { DESIGNATED_NBP_BRANCHES, type DesignatedBankBranch } from "./bank-branches-data";
import { getSupabaseAuthClient } from "./supabase-auth";

export type { DesignatedBankBranch };

const BRANCH_CACHE_TTL_MS = 10 * 60_000;
const branchCacheByDistrict = new Map<
  string,
  { readonly branches: readonly DesignatedBankBranch[]; readonly expiresAtMs: number }
>();
const branchInFlightByDistrict = new Map<string, Promise<readonly DesignatedBankBranch[]>>();

export function clearDesignatedBranchCache(): void {
  branchCacheByDistrict.clear();
  branchInFlightByDistrict.clear();
}

/**
 * Normalize district string for robust comparison across legal/statutory and bank schedules.
 * Examples:
 * - "District Vehari" -> "vehari"
 * - "Vehari Circle-I" -> "vehari"
 * - "D.G. Khan" -> "d g khan"
 */
export function normalizeDistrictName(district: string): string {
  if (!district) return "";
  return district
    .toLowerCase()
    .replace(/^district\s+/i, "")
    .replace(/\s+circle.*$/i, "")
    .replace(/^circle[- ]+/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return all distinct district names present in the designated branches schedule, sorted alphabetically.
 */
export function getUniqueDistricts(): readonly string[] {
  const set = new Set<string>();
  for (const b of DESIGNATED_NBP_BRANCHES) {
    if (b.district && b.district.trim()) {
      set.add(b.district.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Filter designated branches jurisdiction-wise based on officer or challan district.
 * If no district matches, falls back to all designated branches.
 */
export function getDesignatedBranchesForDistrict(
  district?: string | null
): readonly DesignatedBankBranch[] {
  if (!district || !district.trim()) {
    return DESIGNATED_NBP_BRANCHES;
  }

  const clean = normalizeDistrictName(district);
  if (!clean) return DESIGNATED_NBP_BRANCHES;

  const matches = DESIGNATED_NBP_BRANCHES.filter((b) => {
    const branchDist = normalizeDistrictName(b.district);
    return branchDist === clean || branchDist.includes(clean) || clean.includes(branchDist);
  });

  return matches.length > 0 ? matches : DESIGNATED_NBP_BRANCHES;
}

/**
 * Format branch for official dropdowns and statutory receipt records.
 */
export function formatBranchDisplay(branch: DesignatedBankBranch): string {
  return `${branch.bankName} — ${branch.branchName} (Branch Code: ${branch.branchCode}, ${branch.district})`;
}

/**
 * Format branch for compact option labels in select dropdowns.
 */
export function formatBranchOptionLabel(branch: DesignatedBankBranch): string {
  return `${branch.branchName} (Code: ${branch.branchCode}) — ${branch.district}`;
}

/**
 * Fetch designated bank branches from PostgreSQL via RPC with bounded TTL caching and
 * in-flight request deduplication, falling back gracefully to the embedded schedule.
 */
export async function fetchDesignatedBranchesFromDatabase(
  district?: string | null
): Promise<readonly DesignatedBankBranch[]> {
  const cacheKey = district ? normalizeDistrictName(district) || "__ALL__" : "__ALL__";
  const now = Date.now();
  const cached = branchCacheByDistrict.get(cacheKey);
  if (cached && cached.expiresAtMs > now) {
    return cached.branches;
  }

  const existingInFlight = branchInFlightByDistrict.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchPromise = (async (): Promise<readonly DesignatedBankBranch[]> => {
    try {
      const supabase = getSupabaseAuthClient();
      type RpcCaller = (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await (supabase.rpc as unknown as RpcCaller)(
        "get_designated_bank_branches",
        {
          p_district: district ? normalizeDistrictName(district) : null
        }
      );

      if (error || !Array.isArray(data) || data.length === 0) {
        return getDesignatedBranchesForDistrict(district);
      }

      const rows = data as Array<{
        serial_no: number;
        bank_name: string;
        region: string;
        district: string;
        branch_name: string;
        branch_code: string;
      }>;

      const mapped: readonly DesignatedBankBranch[] = rows.map((r) => ({
        serialNo: r.serial_no,
        bankName: r.bank_name,
        region: r.region,
        district: r.district,
        branchName: r.branch_name,
        branchCode: r.branch_code
      }));
      branchCacheByDistrict.set(cacheKey, {
        branches: mapped,
        expiresAtMs: Date.now() + BRANCH_CACHE_TTL_MS
      });
      return mapped;
    } catch (err) {
      console.warn("Falling back to local designated bank branches:", err);
      return getDesignatedBranchesForDistrict(district);
    } finally {
      branchInFlightByDistrict.delete(cacheKey);
    }
  })();

  branchInFlightByDistrict.set(cacheKey, fetchPromise);
  return fetchPromise;
}
