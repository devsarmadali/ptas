import type { Sql } from "postgres";

export interface DesignatedBankBranchRecord {
  id: string;
  serialNo: number;
  bankName: string;
  region: string;
  district: string;
  branchName: string;
  branchCode: string;
  isActive: boolean;
  createdAt: string;
}

export interface DesignatedBankBranchesRepository {
  listByDistrict(district?: string): Promise<readonly DesignatedBankBranchRecord[]>;
  findByBranchCode(branchCode: string): Promise<DesignatedBankBranchRecord | null>;
}

export class InMemoryDesignatedBankBranchesRepository implements DesignatedBankBranchesRepository {
  private readonly branches: DesignatedBankBranchRecord[] = [];

  constructor(initialBranches: DesignatedBankBranchRecord[] = []) {
    this.branches = [...initialBranches];
  }

  async listByDistrict(district?: string): Promise<readonly DesignatedBankBranchRecord[]> {
    if (!district || !district.trim()) {
      return [...this.branches];
    }
    const clean = district.trim().toLowerCase();
    return this.branches.filter(
      (b) =>
        b.district.toLowerCase() === clean ||
        b.district.toLowerCase().includes(clean) ||
        clean.includes(b.district.toLowerCase())
    );
  }

  async findByBranchCode(branchCode: string): Promise<DesignatedBankBranchRecord | null> {
    const match = this.branches.find((b) => b.branchCode === branchCode);
    return match ? { ...match } : null;
  }
}

export class PostgresDesignatedBankBranchesRepository implements DesignatedBankBranchesRepository {
  constructor(private readonly sql: Sql) {}

  async listByDistrict(district?: string): Promise<readonly DesignatedBankBranchRecord[]> {
    const clean = district ? district.trim().toLowerCase() : null;
    const rows = await this.sql<
      Array<{
        id: string;
        serial_no: number;
        bank_name: string;
        region: string;
        district: string;
        branch_name: string;
        branch_code: string;
        is_active: boolean;
        created_at: string;
      }>
    >`
      SELECT id, serial_no, bank_name, region, district, branch_name, branch_code, is_active, created_at
      FROM public.designated_bank_branches
      WHERE is_active = true
        AND (
          ${clean} IS NULL
          OR lower(district) = ${clean}
          OR lower(district) LIKE ${"%" + (clean || "") + "%"}
          OR ${clean} LIKE '%' || lower(district) || '%'
        )
      ORDER BY district, branch_name
    `;

    return rows.map((r) => ({
      id: r.id,
      serialNo: r.serial_no,
      bankName: r.bank_name,
      region: r.region,
      district: r.district,
      branchName: r.branch_name,
      branchCode: r.branch_code,
      isActive: r.is_active,
      createdAt: r.created_at
    }));
  }

  async findByBranchCode(branchCode: string): Promise<DesignatedBankBranchRecord | null> {
    const rows = await this.sql<
      Array<{
        id: string;
        serial_no: number;
        bank_name: string;
        region: string;
        district: string;
        branch_name: string;
        branch_code: string;
        is_active: boolean;
        created_at: string;
      }>
    >`
      SELECT id, serial_no, bank_name, region, district, branch_name, branch_code, is_active, created_at
      FROM public.designated_bank_branches
      WHERE branch_code = ${branchCode}
      LIMIT 1
    `;

    const r = rows[0];
    if (!r) return null;

    return {
      id: r.id,
      serialNo: r.serial_no,
      bankName: r.bank_name,
      region: r.region,
      district: r.district,
      branchName: r.branch_name,
      branchCode: r.branch_code,
      isActive: r.is_active,
      createdAt: r.created_at
    };
  }
}
