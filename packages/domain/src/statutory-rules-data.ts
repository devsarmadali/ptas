/**
 * Punjab Professional Tax - Second Schedule Statutory Rate Rules (v2.0)
 * Source: Punjab Finance Act 1977 (Second Schedule, Section 3)
 * Generated directly from official punjab_professional_tax_rules_v2.json
 */

export interface StatutoryCriterion {
  readonly field: string;
  readonly operator: string;
  readonly value: string | number | boolean | readonly string[];
}

export interface StatutoryRuleDefinition {
  readonly subclassification_code: string;
  readonly rule_id: string;
  readonly category_code: string;
  readonly category: string;
  readonly subcategory: string;
  readonly official_text: string;
  readonly annual_rate_pkr: number;
  readonly rate_basis: string;
  readonly criteria: readonly StatutoryCriterion[];
  readonly source_page: number;
  readonly notes: string;
}

export const STATUTORY_RULES_DATA: readonly StatutoryRuleDefinition[] = [
  {
    subclassification_code: "1(i)",
    rule_id: "PFT-1.i",
    category_code: "1",
    category: "Companies",
    subcategory: "Paid-up capital up to Rs 5 million",
    official_text:
      "Companies registered under the Companies Act, 2017 or under the relevant law for the time being in force, with paid up capital — up to rupees 5 million",
    annual_rate_pkr: 10000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "paid_up_capital_pkr",
        operator: "<=",
        value: 5000000
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "1(ii)",
    rule_id: "PFT-1.ii",
    category_code: "1",
    category: "Companies",
    subcategory: "Paid-up capital > Rs 5 million and <= Rs 50 million",
    official_text:
      "Companies registered under the Companies Act, 2017 or under the relevant law for the time being in force, with paid up capital — exceeding rupees 5 million but not exceeding rupees 50 million",
    annual_rate_pkr: 30000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "paid_up_capital_pkr",
        operator: ">",
        value: 5000000
      },
      {
        field: "paid_up_capital_pkr",
        operator: "<=",
        value: 50000000
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "1(iii)",
    rule_id: "PFT-1.iii",
    category_code: "1",
    category: "Companies",
    subcategory: "Paid-up capital > Rs 50 million and <= Rs 100 million",
    official_text:
      "Companies registered under the Companies Act, 2017 or under the relevant law for the time being in force, with paid up capital — exceeding rupees 50 million but not exceeding rupees 100 million",
    annual_rate_pkr: 70000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "paid_up_capital_pkr",
        operator: ">",
        value: 50000000
      },
      {
        field: "paid_up_capital_pkr",
        operator: "<=",
        value: 100000000
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "1(iv)",
    rule_id: "PFT-1.iv",
    category_code: "1",
    category: "Companies",
    subcategory: "Paid-up capital > Rs 100 million and <= Rs 200 million",
    official_text:
      "Companies registered under the Companies Act, 2017 or under the relevant law for the time being in force, with paid up capital — exceeding rupees 100 million but not exceeding rupees 200 million",
    annual_rate_pkr: 100000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "paid_up_capital_pkr",
        operator: ">",
        value: 100000000
      },
      {
        field: "paid_up_capital_pkr",
        operator: "<=",
        value: 200000000
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "1(v)",
    rule_id: "PFT-1.v",
    category_code: "1",
    category: "Companies",
    subcategory: "Paid-up capital > Rs 200 million",
    official_text:
      "Companies registered under the Companies Act, 2017 or under the relevant law for the time being in force, with paid up capital — exceeding rupees 200 million",
    annual_rate_pkr: 100000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "paid_up_capital_pkr",
        operator: ">",
        value: 200000000
      }
    ],
    source_page: 1,
    notes: "Same annual rate as 1(iv); paid-up capital is required to distinguish 1(iv) from 1(v)."
  },
  {
    subclassification_code: "2(i)",
    rule_id: "PFT-2.i",
    category_code: "2",
    category: "Factories (persons other than companies)",
    subcategory: "Employees not exceeding 10",
    official_text:
      "Persons other than companies, owning factories as defined under the Factories Act, 1932 and having — employees not exceeding 10",
    annual_rate_pkr: 1500,
    rate_basis: "per annum",
    criteria: [
      {
        field: "is_company",
        operator: "=",
        value: false
      },
      {
        field: "employee_count",
        operator: "<=",
        value: 10
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "2(ii)",
    rule_id: "PFT-2.ii",
    category_code: "2",
    category: "Factories (persons other than companies)",
    subcategory: "Employees > 10 and <= 25",
    official_text:
      "Persons other than companies, owning factories as defined under the Factories Act, 1932 and having — employees exceeding 10 but not exceeding 25",
    annual_rate_pkr: 5000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "is_company",
        operator: "=",
        value: false
      },
      {
        field: "employee_count",
        operator: ">",
        value: 10
      },
      {
        field: "employee_count",
        operator: "<=",
        value: 25
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "2(iii)",
    rule_id: "PFT-2.iii",
    category_code: "2",
    category: "Factories (persons other than companies)",
    subcategory: "Employees > 25",
    official_text:
      "Persons other than companies, owning factories as defined under the Factories Act, 1932 and having — employees exceeding 25",
    annual_rate_pkr: 7500,
    rate_basis: "per annum",
    criteria: [
      {
        field: "is_company",
        operator: "=",
        value: false
      },
      {
        field: "employee_count",
        operator: ">",
        value: 25
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "3(i)(a)",
    rule_id: "PFT-3.i.a",
    category_code: "3",
    category: "Commercial establishments (persons other than companies)",
    subcategory: "10+ employees | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Persons other than companies owning commercial establishments having 10 or more employees — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 6000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "is_company",
        operator: "=",
        value: false
      },
      {
        field: "employee_count",
        operator: ">=",
        value: 10
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "3(i)(b)",
    rule_id: "PFT-3.i.b",
    category_code: "3",
    category: "Commercial establishments (persons other than companies)",
    subcategory: "10+ employees | Others",
    official_text:
      "Persons other than companies owning commercial establishments having 10 or more employees — others",
    annual_rate_pkr: 4000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "is_company",
        operator: "=",
        value: false
      },
      {
        field: "employee_count",
        operator: ">=",
        value: 10
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 1,
    notes: ""
  },
  {
    subclassification_code: "3(ii)",
    rule_id: "PFT-3.ii",
    category_code: "3",
    category: "Commercial establishments (persons other than companies)",
    subcategory: "All other commercial establishments other than wholesalers and retailers",
    official_text: "All other commercial establishments other than wholesalers and retailers",
    annual_rate_pkr: 2000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "is_company",
        operator: "=",
        value: false
      },
      {
        field: "establishment_type",
        operator: "NOT_IN",
        value: ["wholesaler", "retailer"]
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "4(i)",
    rule_id: "PFT-4.i",
    category_code: "4",
    category: "Importers / Exporters",
    subcategory: "Preceding-FY import/export value > Rs 100,000 and <= Rs 1 million",
    official_text:
      "Persons engaged in the import or export of goods who, during the preceding financial year, imported or exported goods of the value — exceeding rupees 1 lac but not exceeding rupees 1 million",
    annual_rate_pkr: 2000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_import_export_value_pkr",
        operator: ">",
        value: 100000
      },
      {
        field: "preceding_fy_import_export_value_pkr",
        operator: "<=",
        value: 1000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "4(ii)",
    rule_id: "PFT-4.ii",
    category_code: "4",
    category: "Importers / Exporters",
    subcategory: "Preceding-FY import/export value > Rs 1 million and <= Rs 5 million",
    official_text:
      "Persons engaged in the import or export of goods who, during the preceding financial year, imported or exported goods of the value — exceeding rupees 1 million but not exceeding rupees 5 million",
    annual_rate_pkr: 3000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_import_export_value_pkr",
        operator: ">",
        value: 1000000
      },
      {
        field: "preceding_fy_import_export_value_pkr",
        operator: "<=",
        value: 5000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "4(iii)",
    rule_id: "PFT-4.iii",
    category_code: "4",
    category: "Importers / Exporters",
    subcategory: "Preceding-FY import/export value > Rs 5 million",
    official_text:
      "Persons engaged in the import or export of goods who, during the preceding financial year, imported or exported goods of the value — exceeding rupees 5 million",
    annual_rate_pkr: 5000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_import_export_value_pkr",
        operator: ">",
        value: 5000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "5(i)",
    rule_id: "PFT-5.i",
    category_code: "5",
    category: "Contractors / Builders / Property Developers (specified supplies)",
    subcategory: "Preceding-FY supply value not exceeding Rs 1 million",
    official_text:
      "Contractors, builders and property developers, who during the preceding financial year supplied to the Federal or the Provincial Government or a company or a factory or a commercial establishment or an autonomous or a semi autonomous organization or any Local Authority; goods, commodities and services of the value — not exceeding rupees 1 million",
    annual_rate_pkr: 1000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_supply_recipient",
        operator: "IN",
        value: [
          "Federal Government",
          "Provincial Government",
          "company",
          "factory",
          "commercial establishment",
          "autonomous organization",
          "semi autonomous organization",
          "Local Authority"
        ]
      },
      {
        field: "preceding_fy_supply_value_pkr",
        operator: "<=",
        value: 1000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "5(ii)",
    rule_id: "PFT-5.ii",
    category_code: "5",
    category: "Contractors / Builders / Property Developers (specified supplies)",
    subcategory: "Preceding-FY supply value > Rs 1 million and <= Rs 10 million",
    official_text:
      "Contractors, builders and property developers, who during the preceding financial year supplied to the Federal or the Provincial Government or a company or a factory or a commercial establishment or an autonomous or a semi autonomous organization or any Local Authority; goods, commodities and services of the value — exceeding rupees 1 million but not exceeding rupees 10 million",
    annual_rate_pkr: 6000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_supply_recipient",
        operator: "IN",
        value: [
          "Federal Government",
          "Provincial Government",
          "company",
          "factory",
          "commercial establishment",
          "autonomous organization",
          "semi autonomous organization",
          "Local Authority"
        ]
      },
      {
        field: "preceding_fy_supply_value_pkr",
        operator: ">",
        value: 1000000
      },
      {
        field: "preceding_fy_supply_value_pkr",
        operator: "<=",
        value: 10000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "5(iii)",
    rule_id: "PFT-5.iii",
    category_code: "5",
    category: "Contractors / Builders / Property Developers (specified supplies)",
    subcategory: "Preceding-FY supply value > Rs 10 million and <= Rs 50 million",
    official_text:
      "Contractors, builders and property developers, who during the preceding financial year supplied to the Federal or the Provincial Government or a company or a factory or a commercial establishment or an autonomous or a semi autonomous organization or any Local Authority; goods, commodities and services of the value — exceeding rupees 10 million but not exceeding rupees 50 million",
    annual_rate_pkr: 10000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_supply_recipient",
        operator: "IN",
        value: [
          "Federal Government",
          "Provincial Government",
          "company",
          "factory",
          "commercial establishment",
          "autonomous organization",
          "semi autonomous organization",
          "Local Authority"
        ]
      },
      {
        field: "preceding_fy_supply_value_pkr",
        operator: ">",
        value: 10000000
      },
      {
        field: "preceding_fy_supply_value_pkr",
        operator: "<=",
        value: 50000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "5(iv)",
    rule_id: "PFT-5.iv",
    category_code: "5",
    category: "Contractors / Builders / Property Developers (specified supplies)",
    subcategory: "Preceding-FY supply value > Rs 50 million",
    official_text:
      "Contractors, builders and property developers, who during the preceding financial year supplied to the Federal or the Provincial Government or a company or a factory or a commercial establishment or an autonomous or a semi autonomous organization or any Local Authority; goods, commodities and services of the value — exceeding rupees 50 million",
    annual_rate_pkr: 20000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "preceding_fy_supply_recipient",
        operator: "IN",
        value: [
          "Federal Government",
          "Provincial Government",
          "company",
          "factory",
          "commercial establishment",
          "autonomous organization",
          "semi autonomous organization",
          "Local Authority"
        ]
      },
      {
        field: "preceding_fy_supply_value_pkr",
        operator: ">",
        value: 50000000
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "6(i)",
    rule_id: "PFT-6.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Medical Consultants or Specialists / Dental Surgeons",
    official_text: "Medical Consultants or Specialists/Dental Surgeons",
    annual_rate_pkr: 5000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "profession_type",
        operator: "IN",
        value: ["Medical Consultant", "Medical Specialist", "Dental Surgeon"]
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "6(ii)",
    rule_id: "PFT-6.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Registered Medical Practitioners",
    official_text: "Registered Medical Practitioners",
    annual_rate_pkr: 4000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "profession_type",
        operator: "=",
        value: "Registered Medical Practitioner"
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "6(iii)(a)",
    rule_id: "PFT-6.iii.a",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Others including Homoeopaths, Hakeems and Ayuervedics | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Others including Homoeopaths, Hakeems and Ayuervedics — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 3000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "profession_type",
        operator: "IN",
        value: ["Homoeopath", "Hakeem", "Ayuervedic", "Other under 6(iii)"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 2,
    notes: ""
  },
  {
    subclassification_code: "6(iii)(b)",
    rule_id: "PFT-6.iii.b",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Others including Homoeopaths, Hakeems and Ayuervedics | Others",
    official_text: "Others including Homoeopaths, Hakeems and Ayuervedics — others",
    annual_rate_pkr: 1000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "profession_type",
        operator: "IN",
        value: ["Homoeopath", "Hakeem", "Ayuervedic", "Other under 6(iii)"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(iv)(a)",
    rule_id: "PFT-6.iv.a",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Auditing firms | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Auditing firms (per professionally qualified person) — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 6000,
    rate_basis: "per annum per professionally qualified person",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Auditing firm"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(iv)(b)",
    rule_id: "PFT-6.iv.b",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Auditing firms | Others",
    official_text: "Auditing firms (per professionally qualified person) — others",
    annual_rate_pkr: 4000,
    rate_basis: "per annum per professionally qualified person",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Auditing firm"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(v)(a)",
    rule_id: "PFT-6.v.a",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Management and Tax Consultants / Architects / Engineering, Technical and Scientific Consultants | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Management and Tax Consultants Architects, Engineering, Technical and Scientific Consultants — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 6000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "IN",
        value: [
          "Management Consultant",
          "Tax Consultant",
          "Architect",
          "Engineering Consultant",
          "Technical Consultant",
          "Scientific Consultant"
        ]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(v)(b)",
    rule_id: "PFT-6.v.b",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Management and Tax Consultants / Architects / Engineering, Technical and Scientific Consultants | Others",
    official_text:
      "Management and Tax Consultants Architects, Engineering, Technical and Scientific Consultants — others",
    annual_rate_pkr: 4000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "IN",
        value: [
          "Management Consultant",
          "Tax Consultant",
          "Architect",
          "Engineering Consultant",
          "Technical Consultant",
          "Scientific Consultant"
        ]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vi)",
    rule_id: "PFT-6.vi",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Lawyers",
    official_text: "Lawyers",
    annual_rate_pkr: 1000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "profession_type",
        operator: "=",
        value: "Lawyer"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(a)",
    rule_id: "PFT-6.vii.a",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Members of Stock Exchanges",
    official_text: "Members of Stock Exchanges",
    annual_rate_pkr: 10000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Stock Exchange Member"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(b)(i)",
    rule_id: "PFT-6.vii.b.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Money Changer | Within Metropolitan and Municipal Corporation limits",
    official_text: "Money Changer — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 6000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Money Changer"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(b)(ii)",
    rule_id: "PFT-6.vii.b.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Money Changer | Others",
    official_text: "Money Changer — others",
    annual_rate_pkr: 2000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Money Changer"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(c)(i)",
    rule_id: "PFT-6.vii.c.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Motorcycle / Scooter Dealers | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Motorcycle/Scooter dealers — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 10000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "dealer_type",
        operator: "IN",
        value: ["Motorcycle Dealer", "Scooter Dealer"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(c)(ii)",
    rule_id: "PFT-6.vii.c.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Motorcycle / Scooter Dealers | Others",
    official_text: "Motorcycle/Scooter dealers — others",
    annual_rate_pkr: 6000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "dealer_type",
        operator: "IN",
        value: ["Motorcycle Dealer", "Scooter Dealer"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 3,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(d)(i)",
    rule_id: "PFT-6.vii.d.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Motor Vehicle Dealers and Real Estate Agents | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Motor Vehicle Dealers and Real Estate Agents — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 20000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_or_dealer_type",
        operator: "IN",
        value: ["Motor Vehicle Dealer", "Real Estate Agent"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(d)(ii)",
    rule_id: "PFT-6.vii.d.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Motor Vehicle Dealers and Real Estate Agents | Others",
    official_text: "Motor Vehicle Dealers and Real Estate Agents — others",
    annual_rate_pkr: 10000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_or_dealer_type",
        operator: "IN",
        value: ["Motor Vehicle Dealer", "Real Estate Agent"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(e)(i)",
    rule_id: "PFT-6.vii.e.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Recruiting Agents | Within Metropolitan and Municipal Corporation limits",
    official_text: "Recruiting Agents — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 20000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Recruiting Agent"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(vii)(e)(ii)",
    rule_id: "PFT-6.vii.e.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Recruiting Agents | Others",
    official_text: "Recruiting Agents — others",
    annual_rate_pkr: 10000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Recruiting Agent"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(viii)(i)",
    rule_id: "PFT-6.viii.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Carriage of goods and passengers by road | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Carriage of goods and passengers by road — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 4000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Carriage of goods and passengers by road"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(viii)(ii)",
    rule_id: "PFT-6.viii.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Carriage of goods and passengers by road | Others",
    official_text: "Carriage of goods and passengers by road — others",
    annual_rate_pkr: 2000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "=",
        value: "Carriage of goods and passengers by road"
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(ix)(i)",
    rule_id: "PFT-6.ix.i",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Health Clubs and Gymnasiums | Within Metropolitan and Municipal Corporation limits",
    official_text:
      "Health Clubs and Gymnasiums — within Metropolitan and Municipal Corporation limits",
    annual_rate_pkr: 4000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "IN",
        value: ["Health Club", "Gymnasium"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(ix)(ii)",
    rule_id: "PFT-6.ix.ii",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Health Clubs and Gymnasiums | Others",
    official_text: "Health Clubs and Gymnasiums — others",
    annual_rate_pkr: 2000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "service_type",
        operator: "IN",
        value: ["Health Club", "Gymnasium"]
      },
      {
        field: "location_scope",
        operator: "=",
        value: "OTHER"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(x)",
    rule_id: "PFT-6.x",
    category_code: "6",
    category: "Professions and service providers",
    subcategory:
      "Jewelers / Departmental Stores / Electronic Goods Stores / Cable Operators / Printing Presses / Pesticide Dealers",
    official_text:
      "Jewelers, departmental stores, electronic goods stores, cable operators, printing presses and pesticide dealers",
    annual_rate_pkr: 2000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "business_type",
        operator: "IN",
        value: [
          "Jeweler",
          "Departmental Store",
          "Electronic Goods Store",
          "Cable Operator",
          "Printing Press",
          "Pesticide Dealer"
        ]
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "6(xi)",
    rule_id: "PFT-6.xi",
    category_code: "6",
    category: "Professions and service providers",
    subcategory: "Tobacco Venders — Wholesalers",
    official_text: "Tobacco venders — Wholesalers",
    annual_rate_pkr: 4000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "business_type",
        operator: "=",
        value: "Tobacco Wholesaler"
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "7",
    rule_id: "PFT-7",
    category_code: "7",
    category: "Franchisees / Authorized Dealers / Agents / Distributors",
    subcategory: "Flat rate",
    official_text: "Franchisee, Authorized dealers/Agents and distributors",
    annual_rate_pkr: 5000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "business_type",
        operator: "IN",
        value: ["Franchisee", "Authorized Dealer", "Authorized Agent", "Distributor"]
      }
    ],
    source_page: 4,
    notes: ""
  },
  {
    subclassification_code: "8",
    rule_id: "PFT-8",
    category_code: "8",
    category: "Property Developers / Builders / Marketing Agents or Companies",
    subcategory:
      "Development, marketing and management of residential, commercial or industrial properties",
    official_text:
      "Property Developers / Builders & Marketing Agent/Company engaged in the development marketing and management of residential, commercial or industrial properties",
    annual_rate_pkr: 50000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "business_activity",
        operator: "=",
        value:
          "Development/marketing/management of residential, commercial or industrial properties"
      }
    ],
    source_page: 5,
    notes: ""
  },
  {
    subclassification_code: "9",
    rule_id: "PFT-9",
    category_code: "9",
    category: "Hotels / Hostels / Guest Houses / Motels / Resorts",
    subcategory: "Lodging facilities",
    official_text:
      "Hotels, Hostels (except hostels owned and operated by an educational institution itself) / Guest Houses / Motels / Resorts providing lodging facilities",
    annual_rate_pkr: 5000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "business_type",
        operator: "IN",
        value: ["Hotel", "Hostel", "Guest House", "Motel", "Resort"]
      },
      {
        field: "provides_lodging",
        operator: "=",
        value: true
      },
      {
        field: "educational_institution_owned_and_operated_hostel",
        operator: "=",
        value: false
      }
    ],
    source_page: 5,
    notes: ""
  },
  {
    subclassification_code: "10",
    rule_id: "PFT-10",
    category_code: "10",
    category:
      "Restaurants / Eateries / Fast Food Points / Ice Cream Parlors / Bakeries / Confectioners / Sweets Shops",
    subcategory: "With air conditioning facility",
    official_text:
      "Restaurants / Eateries / Fast Food Points / Ice Cream Parlors / Bakeries / Confectioners / Sweets Shops with air conditioning facility",
    annual_rate_pkr: 5000,
    rate_basis: "per annum",
    criteria: [
      {
        field: "business_type",
        operator: "IN",
        value: [
          "Restaurant",
          "Eatery",
          "Fast Food Point",
          "Ice Cream Parlor",
          "Bakery",
          "Confectioner",
          "Sweets Shop"
        ]
      },
      {
        field: "air_conditioning_facility",
        operator: "=",
        value: true
      }
    ],
    source_page: 5,
    notes: ""
  },
  {
    subclassification_code: "11",
    rule_id: "PFT-11",
    category_code: "11",
    category:
      "Persons engaged in profession, trade, calling or employment assessed to pay income tax",
    subcategory: "Assessed to pay income tax during the preceding financial years",
    official_text:
      "Persons who are engaged in a profession, trade, calling or employment who were assessed to pay income tax during the preceding financial years",
    annual_rate_pkr: 200,
    rate_basis: "per annum",
    criteria: [
      {
        field: "engaged_in",
        operator: "IN",
        value: ["profession", "trade", "calling", "employment"]
      },
      {
        field: "assessed_to_pay_income_tax_in_preceding_financial_years",
        operator: "=",
        value: true
      }
    ],
    source_page: 5,
    notes: ""
  }
] as const;
