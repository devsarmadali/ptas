/**
 * @file packages/domain/src/geography.ts
 * @description Central Punjab Geographical Identity & Permanent Circles Domain Catalog
 *
 * Defines official types, constants, and lookup helpers for:
 * - 10 Administrative Divisions
 * - 42 Districts (PBS codes 201..243 and unique 3-char uppercase initials)
 * - 157 Gazetted Tehsils (unique codes 1..157)
 * - 420 Permanent Immutable Circles (10 upfront per district: XXX-1..XXX-10)
 */

export interface GeoDivision {
  readonly code: string;
  readonly name: string;
  readonly abbrev: string;
  readonly headquarterCity: string;
}

export interface GeoDistrict {
  readonly pbsCode: string;
  readonly districtCode: string; // 3-char initial (e.g. VHR, MTN, LHR)
  readonly name: string;
  readonly fullName: string;
  readonly divisionCode: string;
}

export interface GeoTehsil {
  readonly tehsilCode: number; // 1..157
  readonly name: string;
  readonly districtCode: string;
  readonly pbsCode: string;
  readonly divisionCode: string;
}

export interface GeoCircle {
  readonly circleCode: string; // e.g. VHR-1, MTN-2, LHR-10
  readonly name: string;
  readonly circleNumber: number; // 1..10
  readonly districtCode: string;
  readonly districtName: string;
  readonly divisionCode: string;
  readonly isImmutable: true;
}

export interface UserJurisdictionAssignment {
  readonly id: string;
  readonly userId: string;
  readonly roleCode: "ETI" | "ETO" | "DET" | "ADMIN" | "AUDITOR";
  readonly circleId?: string | null;
  readonly districtId?: string | null;
  readonly divisionId?: string | null;
  readonly validFrom: string;
  readonly validTo?: string | null;
  readonly transferOrderNumber?: string | null;
}

// ----------------------------------------------------------------------------
// 1. Master 10 Administrative Divisions
// ----------------------------------------------------------------------------
export const PUNJAB_DIVISIONS: readonly GeoDivision[] = [
  { code: "DIV_BWP", name: "Bahawalpur Division", abbrev: "BWP", headquarterCity: "Bahawalpur" },
  {
    code: "DIV_DGK",
    name: "Dera Ghazi Khan Division",
    abbrev: "DGK",
    headquarterCity: "Dera Ghazi Khan"
  },
  { code: "DIV_FSD", name: "Faisalabad Division", abbrev: "FSD", headquarterCity: "Faisalabad" },
  { code: "DIV_GJT", name: "Gujrat Division", abbrev: "GJT", headquarterCity: "Gujrat" },
  { code: "DIV_GRW", name: "Gujranwala Division", abbrev: "GRW", headquarterCity: "Gujranwala" },
  { code: "DIV_LHR", name: "Lahore Division", abbrev: "LHR", headquarterCity: "Lahore" },
  { code: "DIV_MTN", name: "Multan Division", abbrev: "MTN", headquarterCity: "Multan" },
  { code: "DIV_RWP", name: "Rawalpindi Division", abbrev: "RWP", headquarterCity: "Rawalpindi" },
  { code: "DIV_SWL", name: "Sahiwal Division", abbrev: "SWL", headquarterCity: "Sahiwal" },
  { code: "DIV_SGD", name: "Sargodha Division", abbrev: "SGD", headquarterCity: "Sargodha" }
] as const;

// ----------------------------------------------------------------------------
// 2. Master 42 Districts (PBS Codes 201..243 & Unique 3-Char Initials)
// ----------------------------------------------------------------------------
export const PUNJAB_DISTRICTS: readonly GeoDistrict[] = [
  {
    pbsCode: "201",
    districtCode: "ATK",
    name: "Attock",
    fullName: "Attock District",
    divisionCode: "DIV_RWP"
  },
  {
    pbsCode: "202",
    districtCode: "BWN",
    name: "Bahawalnagar",
    fullName: "Bahawalnagar District",
    divisionCode: "DIV_BWP"
  },
  {
    pbsCode: "203",
    districtCode: "BWP",
    name: "Bahawalpur",
    fullName: "Bahawalpur District",
    divisionCode: "DIV_BWP"
  },
  {
    pbsCode: "204",
    districtCode: "BHK",
    name: "Bhakkar",
    fullName: "Bhakkar District",
    divisionCode: "DIV_SGD"
  },
  {
    pbsCode: "205",
    districtCode: "CKL",
    name: "Chakwal",
    fullName: "Chakwal District",
    divisionCode: "DIV_RWP"
  },
  {
    pbsCode: "206",
    districtCode: "CHT",
    name: "Chiniot",
    fullName: "Chiniot District",
    divisionCode: "DIV_FSD"
  },
  {
    pbsCode: "207",
    districtCode: "DGK",
    name: "Dera Ghazi Khan",
    fullName: "Dera Ghazi Khan District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "208",
    districtCode: "FSD",
    name: "Faisalabad",
    fullName: "Faisalabad District",
    divisionCode: "DIV_FSD"
  },
  {
    pbsCode: "209",
    districtCode: "GRW",
    name: "Gujranwala",
    fullName: "Gujranwala District",
    divisionCode: "DIV_GRW"
  },
  {
    pbsCode: "210",
    districtCode: "GJT",
    name: "Gujrat",
    fullName: "Gujrat District",
    divisionCode: "DIV_GJT"
  },
  {
    pbsCode: "211",
    districtCode: "HFD",
    name: "Hafizabad",
    fullName: "Hafizabad District",
    divisionCode: "DIV_GJT"
  },
  {
    pbsCode: "213",
    districtCode: "JHM",
    name: "Jhelum",
    fullName: "Jhelum District",
    divisionCode: "DIV_RWP"
  },
  {
    pbsCode: "214",
    districtCode: "JNG",
    name: "Jhang",
    fullName: "Jhang District",
    divisionCode: "DIV_FSD"
  },
  {
    pbsCode: "215",
    districtCode: "KSR",
    name: "Kasur",
    fullName: "Kasur District",
    divisionCode: "DIV_LHR"
  },
  {
    pbsCode: "216",
    districtCode: "KWL",
    name: "Khanewal",
    fullName: "Khanewal District",
    divisionCode: "DIV_MTN"
  },
  {
    pbsCode: "217",
    districtCode: "KHB",
    name: "Khushab",
    fullName: "Khushab District",
    divisionCode: "DIV_SGD"
  },
  {
    pbsCode: "218",
    districtCode: "LHR",
    name: "Lahore",
    fullName: "Lahore District",
    divisionCode: "DIV_LHR"
  },
  {
    pbsCode: "219",
    districtCode: "LYH",
    name: "Layyah",
    fullName: "Layyah District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "220",
    districtCode: "LOD",
    name: "Lodhran",
    fullName: "Lodhran District",
    divisionCode: "DIV_MTN"
  },
  {
    pbsCode: "221",
    districtCode: "MBD",
    name: "Mandi Bahauddin",
    fullName: "Mandi Bahauddin District",
    divisionCode: "DIV_GJT"
  },
  {
    pbsCode: "222",
    districtCode: "MWL",
    name: "Mianwali",
    fullName: "Mianwali District",
    divisionCode: "DIV_SGD"
  },
  {
    pbsCode: "223",
    districtCode: "MTN",
    name: "Multan",
    fullName: "Multan District",
    divisionCode: "DIV_MTN"
  },
  {
    pbsCode: "224",
    districtCode: "MZG",
    name: "Muzaffargarh",
    fullName: "Muzaffargarh District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "225",
    districtCode: "NKS",
    name: "Nankana Sahib",
    fullName: "Nankana Sahib District",
    divisionCode: "DIV_LHR"
  },
  {
    pbsCode: "226",
    districtCode: "NRW",
    name: "Narowal",
    fullName: "Narowal District",
    divisionCode: "DIV_GRW"
  },
  {
    pbsCode: "227",
    districtCode: "OKR",
    name: "Okara",
    fullName: "Okara District",
    divisionCode: "DIV_SWL"
  },
  {
    pbsCode: "228",
    districtCode: "PKP",
    name: "Pakpattan",
    fullName: "Pakpattan District",
    divisionCode: "DIV_SWL"
  },
  {
    pbsCode: "229",
    districtCode: "RYK",
    name: "Rahim Yar Khan",
    fullName: "Rahim Yar Khan District",
    divisionCode: "DIV_BWP"
  },
  {
    pbsCode: "230",
    districtCode: "RJP",
    name: "Rajanpur",
    fullName: "Rajanpur District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "231",
    districtCode: "RWP",
    name: "Rawalpindi",
    fullName: "Rawalpindi District",
    divisionCode: "DIV_RWP"
  },
  {
    pbsCode: "232",
    districtCode: "SWL",
    name: "Sahiwal",
    fullName: "Sahiwal District",
    divisionCode: "DIV_SWL"
  },
  {
    pbsCode: "233",
    districtCode: "SGD",
    name: "Sargodha",
    fullName: "Sargodha District",
    divisionCode: "DIV_SGD"
  },
  {
    pbsCode: "234",
    districtCode: "SKP",
    name: "Sheikhupura",
    fullName: "Sheikhupura District",
    divisionCode: "DIV_LHR"
  },
  {
    pbsCode: "235",
    districtCode: "SKT",
    name: "Sialkot",
    fullName: "Sialkot District",
    divisionCode: "DIV_GRW"
  },
  {
    pbsCode: "236",
    districtCode: "TTS",
    name: "Toba Tek Singh",
    fullName: "Toba Tek Singh District",
    divisionCode: "DIV_FSD"
  },
  {
    pbsCode: "237",
    districtCode: "VHR",
    name: "Vehari",
    fullName: "Vehari District",
    divisionCode: "DIV_MTN"
  },
  {
    pbsCode: "238",
    districtCode: "JMP",
    name: "Jampur",
    fullName: "Jampur District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "239",
    districtCode: "KAD",
    name: "Kot Addu",
    fullName: "Kot Addu District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "240",
    districtCode: "TNS",
    name: "Tonsa (Taunsa)",
    fullName: "Tonsa (Taunsa) District",
    divisionCode: "DIV_DGK"
  },
  {
    pbsCode: "241",
    districtCode: "WZD",
    name: "Wazirabad",
    fullName: "Wazirabad District",
    divisionCode: "DIV_GJT"
  },
  {
    pbsCode: "242",
    districtCode: "MUR",
    name: "Murree",
    fullName: "Murree District",
    divisionCode: "DIV_RWP"
  },
  {
    pbsCode: "243",
    districtCode: "TLG",
    name: "Talagang",
    fullName: "Talagang District",
    divisionCode: "DIV_RWP"
  }
] as const;

// ----------------------------------------------------------------------------
// 3. Master 157 Gazetted Tehsils (Unique Codes 1..157)
// ----------------------------------------------------------------------------
export const PUNJAB_TEHSILS: readonly GeoTehsil[] = [
  {
    tehsilCode: 1,
    name: "Bahawalnagar",
    districtCode: "BWN",
    pbsCode: "202",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 2,
    name: "Chishtian",
    districtCode: "BWN",
    pbsCode: "202",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 3,
    name: "Haroonabad",
    districtCode: "BWN",
    pbsCode: "202",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 4,
    name: "Minchinabad",
    districtCode: "BWN",
    pbsCode: "202",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 5,
    name: "Fort Abbas",
    districtCode: "BWN",
    pbsCode: "202",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 6,
    name: "Ahmadpur East",
    districtCode: "BWP",
    pbsCode: "203",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 7,
    name: "Bahawalpur City",
    districtCode: "BWP",
    pbsCode: "203",
    divisionCode: "DIV_BWP"
  },
  { tehsilCode: 8, name: "Yazman", districtCode: "BWP", pbsCode: "203", divisionCode: "DIV_BWP" },
  {
    tehsilCode: 9,
    name: "Bahawalpur Saddar",
    districtCode: "BWP",
    pbsCode: "203",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 10,
    name: "Hasilpur",
    districtCode: "BWP",
    pbsCode: "203",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 11,
    name: "Khairpur Tamewali",
    districtCode: "BWP",
    pbsCode: "203",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 12,
    name: "Rahim Yar Khan",
    districtCode: "RYK",
    pbsCode: "229",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 13,
    name: "Sadiqabad",
    districtCode: "RYK",
    pbsCode: "229",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 14,
    name: "Liaqatpur",
    districtCode: "RYK",
    pbsCode: "229",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 15,
    name: "Khanpur Katora",
    districtCode: "RYK",
    pbsCode: "229",
    divisionCode: "DIV_BWP"
  },
  {
    tehsilCode: 16,
    name: "Dera Ghazi Khan",
    districtCode: "DGK",
    pbsCode: "207",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 17,
    name: "Kot Chutta",
    districtCode: "DGK",
    pbsCode: "207",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 18,
    name: "Muhammadpur",
    districtCode: "JMP",
    pbsCode: "238",
    divisionCode: "DIV_DGK"
  },
  { tehsilCode: 19, name: "Jampur", districtCode: "JMP", pbsCode: "238", divisionCode: "DIV_DGK" },
  { tehsilCode: 20, name: "Dajal", districtCode: "JMP", pbsCode: "238", divisionCode: "DIV_DGK" },
  {
    tehsilCode: 21,
    name: "Jampur Tribal Area",
    districtCode: "JMP",
    pbsCode: "238",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 22,
    name: "Chowk Sarwar Shaheed",
    districtCode: "KAD",
    pbsCode: "239",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 23,
    name: "Kot Addu",
    districtCode: "KAD",
    pbsCode: "239",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 24,
    name: "Karor Lal Esan",
    districtCode: "LYH",
    pbsCode: "219",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 25,
    name: "Chaubara",
    districtCode: "LYH",
    pbsCode: "219",
    divisionCode: "DIV_DGK"
  },
  { tehsilCode: 26, name: "Layyah", districtCode: "LYH", pbsCode: "219", divisionCode: "DIV_DGK" },
  { tehsilCode: 27, name: "Jatoi", districtCode: "MZG", pbsCode: "224", divisionCode: "DIV_DGK" },
  { tehsilCode: 28, name: "Alipur", districtCode: "MZG", pbsCode: "224", divisionCode: "DIV_DGK" },
  {
    tehsilCode: 29,
    name: "Muzaffargarh",
    districtCode: "MZG",
    pbsCode: "224",
    divisionCode: "DIV_DGK"
  },
  { tehsilCode: 30, name: "Rojhan", districtCode: "RJP", pbsCode: "230", divisionCode: "DIV_DGK" },
  {
    tehsilCode: 31,
    name: "Rajanpur",
    districtCode: "RJP",
    pbsCode: "230",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 32,
    name: "De-Excluded Area Rajanpur",
    districtCode: "RJP",
    pbsCode: "230",
    divisionCode: "DIV_DGK"
  },
  {
    tehsilCode: 33,
    name: "Koh-e-Suleman",
    districtCode: "TNS",
    pbsCode: "240",
    divisionCode: "DIV_DGK"
  },
  { tehsilCode: 34, name: "Tonsa", districtCode: "TNS", pbsCode: "240", divisionCode: "DIV_DGK" },
  { tehsilCode: 35, name: "Wahova", districtCode: "TNS", pbsCode: "240", divisionCode: "DIV_DGK" },
  { tehsilCode: 36, name: "Bhowana", districtCode: "CHT", pbsCode: "206", divisionCode: "DIV_FSD" },
  { tehsilCode: 37, name: "Chiniot", districtCode: "CHT", pbsCode: "206", divisionCode: "DIV_FSD" },
  { tehsilCode: 38, name: "Lalian", districtCode: "CHT", pbsCode: "206", divisionCode: "DIV_FSD" },
  {
    tehsilCode: 39,
    name: "Chak Jhumra",
    districtCode: "FSD",
    pbsCode: "208",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 40,
    name: "Faisalabad City",
    districtCode: "FSD",
    pbsCode: "208",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 41,
    name: "Faisalabad Sadar",
    districtCode: "FSD",
    pbsCode: "208",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 42,
    name: "Jaranwala",
    districtCode: "FSD",
    pbsCode: "208",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 43,
    name: "Samundri",
    districtCode: "FSD",
    pbsCode: "208",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 44,
    name: "Tandlianwala",
    districtCode: "FSD",
    pbsCode: "208",
    divisionCode: "DIV_FSD"
  },
  { tehsilCode: 45, name: "Shorkot", districtCode: "JNG", pbsCode: "214", divisionCode: "DIV_FSD" },
  { tehsilCode: 46, name: "Jhang", districtCode: "JNG", pbsCode: "214", divisionCode: "DIV_FSD" },
  {
    tehsilCode: 47,
    name: "Ahmadpur Sial",
    districtCode: "JNG",
    pbsCode: "214",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 48,
    name: "Athara Hazari",
    districtCode: "JNG",
    pbsCode: "214",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 49,
    name: "Mandi Shah Jeewna",
    districtCode: "JNG",
    pbsCode: "214",
    divisionCode: "DIV_FSD"
  },
  { tehsilCode: 50, name: "Kamalia", districtCode: "TTS", pbsCode: "236", divisionCode: "DIV_FSD" },
  { tehsilCode: 51, name: "Gojra", districtCode: "TTS", pbsCode: "236", divisionCode: "DIV_FSD" },
  {
    tehsilCode: 52,
    name: "Pirmahal",
    districtCode: "TTS",
    pbsCode: "236",
    divisionCode: "DIV_FSD"
  },
  {
    tehsilCode: 53,
    name: "Toba Tek Singh",
    districtCode: "TTS",
    pbsCode: "236",
    divisionCode: "DIV_FSD"
  },
  { tehsilCode: 54, name: "Gujrat", districtCode: "GJT", pbsCode: "210", divisionCode: "DIV_GJT" },
  { tehsilCode: 55, name: "Kharian", districtCode: "GJT", pbsCode: "210", divisionCode: "DIV_GJT" },
  {
    tehsilCode: 56,
    name: "Sarai Alamgir",
    districtCode: "GJT",
    pbsCode: "210",
    divisionCode: "DIV_GJT"
  },
  {
    tehsilCode: 57,
    name: "Jalalpur Jattan",
    districtCode: "GJT",
    pbsCode: "210",
    divisionCode: "DIV_GJT"
  },
  { tehsilCode: 58, name: "Kunjah", districtCode: "GJT", pbsCode: "210", divisionCode: "DIV_GJT" },
  {
    tehsilCode: 59,
    name: "Pindi Bhattian",
    districtCode: "HFD",
    pbsCode: "211",
    divisionCode: "DIV_GJT"
  },
  {
    tehsilCode: 60,
    name: "Hafizabad",
    districtCode: "HFD",
    pbsCode: "211",
    divisionCode: "DIV_GJT"
  },
  {
    tehsilCode: 61,
    name: "Mandi Bahauddin",
    districtCode: "MBD",
    pbsCode: "221",
    divisionCode: "DIV_GJT"
  },
  {
    tehsilCode: 62,
    name: "Malakwal",
    districtCode: "MBD",
    pbsCode: "221",
    divisionCode: "DIV_GJT"
  },
  { tehsilCode: 63, name: "Phalia", districtCode: "MBD", pbsCode: "221", divisionCode: "DIV_GJT" },
  {
    tehsilCode: 64,
    name: "Wazirabad",
    districtCode: "WZD",
    pbsCode: "241",
    divisionCode: "DIV_GJT"
  },
  {
    tehsilCode: 65,
    name: "Ali Pur Chatta",
    districtCode: "WZD",
    pbsCode: "241",
    divisionCode: "DIV_GJT"
  },
  {
    tehsilCode: 66,
    name: "Gujranwala City",
    districtCode: "GRW",
    pbsCode: "209",
    divisionCode: "DIV_GRW"
  },
  {
    tehsilCode: 67,
    name: "Gujranwala Saddar",
    districtCode: "GRW",
    pbsCode: "209",
    divisionCode: "DIV_GRW"
  },
  { tehsilCode: 68, name: "Kamoke", districtCode: "GRW", pbsCode: "209", divisionCode: "DIV_GRW" },
  {
    tehsilCode: 69,
    name: "Nowshera Virkan",
    districtCode: "GRW",
    pbsCode: "209",
    divisionCode: "DIV_GRW"
  },
  {
    tehsilCode: 70,
    name: "Shakargarh",
    districtCode: "NRW",
    pbsCode: "226",
    divisionCode: "DIV_GRW"
  },
  { tehsilCode: 71, name: "Narowal", districtCode: "NRW", pbsCode: "226", divisionCode: "DIV_GRW" },
  {
    tehsilCode: 72,
    name: "Zafarwal",
    districtCode: "NRW",
    pbsCode: "226",
    divisionCode: "DIV_GRW"
  },
  { tehsilCode: 73, name: "Pasrur", districtCode: "SKT", pbsCode: "235", divisionCode: "DIV_GRW" },
  { tehsilCode: 74, name: "Daska", districtCode: "SKT", pbsCode: "235", divisionCode: "DIV_GRW" },
  {
    tehsilCode: 75,
    name: "Sambrial",
    districtCode: "SKT",
    pbsCode: "235",
    divisionCode: "DIV_GRW"
  },
  { tehsilCode: 76, name: "Sialkot", districtCode: "SKT", pbsCode: "235", divisionCode: "DIV_GRW" },
  { tehsilCode: 77, name: "Chunian", districtCode: "KSR", pbsCode: "215", divisionCode: "DIV_LHR" },
  { tehsilCode: 78, name: "Kasur", districtCode: "KSR", pbsCode: "215", divisionCode: "DIV_LHR" },
  {
    tehsilCode: 79,
    name: "Kot Radha Kishan",
    districtCode: "KSR",
    pbsCode: "215",
    divisionCode: "DIV_LHR"
  },
  { tehsilCode: 80, name: "Pattoki", districtCode: "KSR", pbsCode: "215", divisionCode: "DIV_LHR" },
  {
    tehsilCode: 81,
    name: "Lahore Cantonment",
    districtCode: "LHR",
    pbsCode: "218",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 82,
    name: "Lahore City",
    districtCode: "LHR",
    pbsCode: "218",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 83,
    name: "Model Town",
    districtCode: "LHR",
    pbsCode: "218",
    divisionCode: "DIV_LHR"
  },
  { tehsilCode: 84, name: "Raiwind", districtCode: "LHR", pbsCode: "218", divisionCode: "DIV_LHR" },
  {
    tehsilCode: 85,
    name: "Shalimar",
    districtCode: "LHR",
    pbsCode: "218",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 86,
    name: "Sangla Hill",
    districtCode: "NKS",
    pbsCode: "225",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 87,
    name: "Nankana Sahib",
    districtCode: "NKS",
    pbsCode: "225",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 88,
    name: "Shah Kot",
    districtCode: "NKS",
    pbsCode: "225",
    divisionCode: "DIV_LHR"
  },
  { tehsilCode: 89, name: "Muridke", districtCode: "SKP", pbsCode: "234", divisionCode: "DIV_LHR" },
  {
    tehsilCode: 90,
    name: "Ferozewala",
    districtCode: "SKP",
    pbsCode: "234",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 91,
    name: "Safdarabad",
    districtCode: "SKP",
    pbsCode: "234",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 92,
    name: "Sheikhupura",
    districtCode: "SKP",
    pbsCode: "234",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 93,
    name: "Sharak Pur",
    districtCode: "SKP",
    pbsCode: "234",
    divisionCode: "DIV_LHR"
  },
  {
    tehsilCode: 94,
    name: "Jahanian",
    districtCode: "KWL",
    pbsCode: "216",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 95,
    name: "Kabirwala",
    districtCode: "KWL",
    pbsCode: "216",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 96,
    name: "Khanewal",
    districtCode: "KWL",
    pbsCode: "216",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 97,
    name: "Mian Channu",
    districtCode: "KWL",
    pbsCode: "216",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 98,
    name: "Dunyapur",
    districtCode: "LOD",
    pbsCode: "220",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 99,
    name: "Kahror Pacca",
    districtCode: "LOD",
    pbsCode: "220",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 100,
    name: "Lodhran",
    districtCode: "LOD",
    pbsCode: "220",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 101,
    name: "Jalalpur Pirwala",
    districtCode: "MTN",
    pbsCode: "223",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 102,
    name: "Multan City",
    districtCode: "MTN",
    pbsCode: "223",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 103,
    name: "Multan Saddar",
    districtCode: "MTN",
    pbsCode: "223",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 104,
    name: "Shujabad",
    districtCode: "MTN",
    pbsCode: "223",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 105,
    name: "Jallah jeem",
    districtCode: "VHR",
    pbsCode: "237",
    divisionCode: "DIV_MTN"
  },
  {
    tehsilCode: 106,
    name: "Burewala",
    districtCode: "VHR",
    pbsCode: "237",
    divisionCode: "DIV_MTN"
  },
  { tehsilCode: 107, name: "Mailsi", districtCode: "VHR", pbsCode: "237", divisionCode: "DIV_MTN" },
  { tehsilCode: 108, name: "Vehari", districtCode: "VHR", pbsCode: "237", divisionCode: "DIV_MTN" },
  { tehsilCode: 109, name: "Attock", districtCode: "ATK", pbsCode: "201", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 110,
    name: "Fateh Jang",
    districtCode: "ATK",
    pbsCode: "201",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 111,
    name: "Hassan Abdal",
    districtCode: "ATK",
    pbsCode: "201",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 112, name: "Hazro", districtCode: "ATK", pbsCode: "201", divisionCode: "DIV_RWP" },
  { tehsilCode: 113, name: "Jand", districtCode: "ATK", pbsCode: "201", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 114,
    name: "Pindi Gheb",
    districtCode: "ATK",
    pbsCode: "201",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 115,
    name: "Chakwal",
    districtCode: "CKL",
    pbsCode: "205",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 116,
    name: "Choa Saidan Shah",
    districtCode: "CKL",
    pbsCode: "205",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 117,
    name: "Kallar Kahar",
    districtCode: "CKL",
    pbsCode: "205",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 118, name: "Dina", districtCode: "JHM", pbsCode: "213", divisionCode: "DIV_RWP" },
  { tehsilCode: 119, name: "Jhelum", districtCode: "JHM", pbsCode: "213", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 120,
    name: "Pind Dadan Khan",
    districtCode: "JHM",
    pbsCode: "213",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 121, name: "Sohawa", districtCode: "JHM", pbsCode: "213", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 122,
    name: "Rawalpindi",
    districtCode: "RWP",
    pbsCode: "231",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 123,
    name: "Gujar Khan",
    districtCode: "RWP",
    pbsCode: "231",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 124, name: "Kahuta", districtCode: "RWP", pbsCode: "231", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 125,
    name: "Kallar Syedan",
    districtCode: "RWP",
    pbsCode: "231",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 126, name: "Taxila", districtCode: "RWP", pbsCode: "231", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 127,
    name: "Daultala",
    districtCode: "RWP",
    pbsCode: "231",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 128,
    name: "Kotli Sattian",
    districtCode: "MUR",
    pbsCode: "242",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 129, name: "Murree", districtCode: "MUR", pbsCode: "242", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 130,
    name: "Talagang",
    districtCode: "TLG",
    pbsCode: "243",
    divisionCode: "DIV_RWP"
  },
  { tehsilCode: 131, name: "Lawa", districtCode: "TLG", pbsCode: "243", divisionCode: "DIV_RWP" },
  {
    tehsilCode: 132,
    name: "Multan Khurd",
    districtCode: "TLG",
    pbsCode: "243",
    divisionCode: "DIV_RWP"
  },
  {
    tehsilCode: 133,
    name: "Depalpur",
    districtCode: "OKR",
    pbsCode: "227",
    divisionCode: "DIV_SWL"
  },
  { tehsilCode: 134, name: "Okara", districtCode: "OKR", pbsCode: "227", divisionCode: "DIV_SWL" },
  {
    tehsilCode: 135,
    name: "Renala Khurd",
    districtCode: "OKR",
    pbsCode: "227",
    divisionCode: "DIV_SWL"
  },
  {
    tehsilCode: 136,
    name: "Arifwala",
    districtCode: "PKP",
    pbsCode: "228",
    divisionCode: "DIV_SWL"
  },
  {
    tehsilCode: 137,
    name: "Pakpattan",
    districtCode: "PKP",
    pbsCode: "228",
    divisionCode: "DIV_SWL"
  },
  {
    tehsilCode: 138,
    name: "Chichawatni",
    districtCode: "SWL",
    pbsCode: "232",
    divisionCode: "DIV_SWL"
  },
  {
    tehsilCode: 139,
    name: "Sahiwal",
    districtCode: "SWL",
    pbsCode: "232",
    divisionCode: "DIV_SWL"
  },
  {
    tehsilCode: 140,
    name: "Khushab",
    districtCode: "KHB",
    pbsCode: "217",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 141,
    name: "Noorpur Thal",
    districtCode: "KHB",
    pbsCode: "217",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 142,
    name: "Quaidabad",
    districtCode: "KHB",
    pbsCode: "217",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 143,
    name: "Naushera (Wadi-e-Soon)",
    districtCode: "KHB",
    pbsCode: "217",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 144,
    name: "Bhalwal",
    districtCode: "SGD",
    pbsCode: "233",
    divisionCode: "DIV_SGD"
  },
  { tehsilCode: 145, name: "Bhera", districtCode: "SGD", pbsCode: "233", divisionCode: "DIV_SGD" },
  {
    tehsilCode: 146,
    name: "Kot Momin",
    districtCode: "SGD",
    pbsCode: "233",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 147,
    name: "Sahiwal",
    districtCode: "SGD",
    pbsCode: "233",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 148,
    name: "Sargodha",
    districtCode: "SGD",
    pbsCode: "233",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 149,
    name: "Shahpur",
    districtCode: "SGD",
    pbsCode: "233",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 150,
    name: "Sillanwali",
    districtCode: "SGD",
    pbsCode: "233",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 151,
    name: "Bhakkar",
    districtCode: "BHK",
    pbsCode: "204",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 152,
    name: "Darya Khan",
    districtCode: "BHK",
    pbsCode: "204",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 153,
    name: "Kaloorkot",
    districtCode: "BHK",
    pbsCode: "204",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 154,
    name: "Mankera",
    districtCode: "BHK",
    pbsCode: "204",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 155,
    name: "Isakhel",
    districtCode: "MWL",
    pbsCode: "222",
    divisionCode: "DIV_SGD"
  },
  {
    tehsilCode: 156,
    name: "Mianwali",
    districtCode: "MWL",
    pbsCode: "222",
    divisionCode: "DIV_SGD"
  },
  { tehsilCode: 157, name: "Piplan", districtCode: "MWL", pbsCode: "222", divisionCode: "DIV_SGD" }
] as const;

// ----------------------------------------------------------------------------
// 4. Master 420 Permanent Baseline Circles (10 Upfront Per District)
// ----------------------------------------------------------------------------
export const PUNJAB_CIRCLES: readonly GeoCircle[] = [
  {
    circleCode: "ATK-1",
    name: "Circle 1 Attock",
    circleNumber: 1,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-2",
    name: "Circle 2 Attock",
    circleNumber: 2,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-3",
    name: "Circle 3 Attock",
    circleNumber: 3,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-4",
    name: "Circle 4 Attock",
    circleNumber: 4,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-5",
    name: "Circle 5 Attock",
    circleNumber: 5,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-6",
    name: "Circle 6 Attock",
    circleNumber: 6,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-7",
    name: "Circle 7 Attock",
    circleNumber: 7,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-8",
    name: "Circle 8 Attock",
    circleNumber: 8,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-9",
    name: "Circle 9 Attock",
    circleNumber: 9,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "ATK-10",
    name: "Circle 10 Attock",
    circleNumber: 10,
    districtCode: "ATK",
    districtName: "Attock",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-1",
    name: "Circle 1 Bahawalnagar",
    circleNumber: 1,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-2",
    name: "Circle 2 Bahawalnagar",
    circleNumber: 2,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-3",
    name: "Circle 3 Bahawalnagar",
    circleNumber: 3,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-4",
    name: "Circle 4 Bahawalnagar",
    circleNumber: 4,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-5",
    name: "Circle 5 Bahawalnagar",
    circleNumber: 5,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-6",
    name: "Circle 6 Bahawalnagar",
    circleNumber: 6,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-7",
    name: "Circle 7 Bahawalnagar",
    circleNumber: 7,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-8",
    name: "Circle 8 Bahawalnagar",
    circleNumber: 8,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-9",
    name: "Circle 9 Bahawalnagar",
    circleNumber: 9,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWN-10",
    name: "Circle 10 Bahawalnagar",
    circleNumber: 10,
    districtCode: "BWN",
    districtName: "Bahawalnagar",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-1",
    name: "Circle 1 Bahawalpur",
    circleNumber: 1,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-2",
    name: "Circle 2 Bahawalpur",
    circleNumber: 2,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-3",
    name: "Circle 3 Bahawalpur",
    circleNumber: 3,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-4",
    name: "Circle 4 Bahawalpur",
    circleNumber: 4,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-5",
    name: "Circle 5 Bahawalpur",
    circleNumber: 5,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-6",
    name: "Circle 6 Bahawalpur",
    circleNumber: 6,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-7",
    name: "Circle 7 Bahawalpur",
    circleNumber: 7,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-8",
    name: "Circle 8 Bahawalpur",
    circleNumber: 8,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-9",
    name: "Circle 9 Bahawalpur",
    circleNumber: 9,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BWP-10",
    name: "Circle 10 Bahawalpur",
    circleNumber: 10,
    districtCode: "BWP",
    districtName: "Bahawalpur",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "BHK-1",
    name: "Circle 1 Bhakkar",
    circleNumber: 1,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-2",
    name: "Circle 2 Bhakkar",
    circleNumber: 2,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-3",
    name: "Circle 3 Bhakkar",
    circleNumber: 3,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-4",
    name: "Circle 4 Bhakkar",
    circleNumber: 4,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-5",
    name: "Circle 5 Bhakkar",
    circleNumber: 5,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-6",
    name: "Circle 6 Bhakkar",
    circleNumber: 6,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-7",
    name: "Circle 7 Bhakkar",
    circleNumber: 7,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-8",
    name: "Circle 8 Bhakkar",
    circleNumber: 8,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-9",
    name: "Circle 9 Bhakkar",
    circleNumber: 9,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "BHK-10",
    name: "Circle 10 Bhakkar",
    circleNumber: 10,
    districtCode: "BHK",
    districtName: "Bhakkar",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "CKL-1",
    name: "Circle 1 Chakwal",
    circleNumber: 1,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-2",
    name: "Circle 2 Chakwal",
    circleNumber: 2,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-3",
    name: "Circle 3 Chakwal",
    circleNumber: 3,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-4",
    name: "Circle 4 Chakwal",
    circleNumber: 4,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-5",
    name: "Circle 5 Chakwal",
    circleNumber: 5,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-6",
    name: "Circle 6 Chakwal",
    circleNumber: 6,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-7",
    name: "Circle 7 Chakwal",
    circleNumber: 7,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-8",
    name: "Circle 8 Chakwal",
    circleNumber: 8,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-9",
    name: "Circle 9 Chakwal",
    circleNumber: 9,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CKL-10",
    name: "Circle 10 Chakwal",
    circleNumber: 10,
    districtCode: "CKL",
    districtName: "Chakwal",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "CHT-1",
    name: "Circle 1 Chiniot",
    circleNumber: 1,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-2",
    name: "Circle 2 Chiniot",
    circleNumber: 2,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-3",
    name: "Circle 3 Chiniot",
    circleNumber: 3,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-4",
    name: "Circle 4 Chiniot",
    circleNumber: 4,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-5",
    name: "Circle 5 Chiniot",
    circleNumber: 5,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-6",
    name: "Circle 6 Chiniot",
    circleNumber: 6,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-7",
    name: "Circle 7 Chiniot",
    circleNumber: 7,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-8",
    name: "Circle 8 Chiniot",
    circleNumber: 8,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-9",
    name: "Circle 9 Chiniot",
    circleNumber: 9,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "CHT-10",
    name: "Circle 10 Chiniot",
    circleNumber: 10,
    districtCode: "CHT",
    districtName: "Chiniot",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "DGK-1",
    name: "Circle 1 Dera Ghazi Khan",
    circleNumber: 1,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-2",
    name: "Circle 2 Dera Ghazi Khan",
    circleNumber: 2,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-3",
    name: "Circle 3 Dera Ghazi Khan",
    circleNumber: 3,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-4",
    name: "Circle 4 Dera Ghazi Khan",
    circleNumber: 4,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-5",
    name: "Circle 5 Dera Ghazi Khan",
    circleNumber: 5,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-6",
    name: "Circle 6 Dera Ghazi Khan",
    circleNumber: 6,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-7",
    name: "Circle 7 Dera Ghazi Khan",
    circleNumber: 7,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-8",
    name: "Circle 8 Dera Ghazi Khan",
    circleNumber: 8,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-9",
    name: "Circle 9 Dera Ghazi Khan",
    circleNumber: 9,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "DGK-10",
    name: "Circle 10 Dera Ghazi Khan",
    circleNumber: 10,
    districtCode: "DGK",
    districtName: "Dera Ghazi Khan",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "FSD-1",
    name: "Circle 1 Faisalabad",
    circleNumber: 1,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-2",
    name: "Circle 2 Faisalabad",
    circleNumber: 2,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-3",
    name: "Circle 3 Faisalabad",
    circleNumber: 3,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-4",
    name: "Circle 4 Faisalabad",
    circleNumber: 4,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-5",
    name: "Circle 5 Faisalabad",
    circleNumber: 5,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-6",
    name: "Circle 6 Faisalabad",
    circleNumber: 6,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-7",
    name: "Circle 7 Faisalabad",
    circleNumber: 7,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-8",
    name: "Circle 8 Faisalabad",
    circleNumber: 8,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-9",
    name: "Circle 9 Faisalabad",
    circleNumber: 9,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "FSD-10",
    name: "Circle 10 Faisalabad",
    circleNumber: 10,
    districtCode: "FSD",
    districtName: "Faisalabad",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "GRW-1",
    name: "Circle 1 Gujranwala",
    circleNumber: 1,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-2",
    name: "Circle 2 Gujranwala",
    circleNumber: 2,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-3",
    name: "Circle 3 Gujranwala",
    circleNumber: 3,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-4",
    name: "Circle 4 Gujranwala",
    circleNumber: 4,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-5",
    name: "Circle 5 Gujranwala",
    circleNumber: 5,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-6",
    name: "Circle 6 Gujranwala",
    circleNumber: 6,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-7",
    name: "Circle 7 Gujranwala",
    circleNumber: 7,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-8",
    name: "Circle 8 Gujranwala",
    circleNumber: 8,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-9",
    name: "Circle 9 Gujranwala",
    circleNumber: 9,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GRW-10",
    name: "Circle 10 Gujranwala",
    circleNumber: 10,
    districtCode: "GRW",
    districtName: "Gujranwala",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "GJT-1",
    name: "Circle 1 Gujrat",
    circleNumber: 1,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-2",
    name: "Circle 2 Gujrat",
    circleNumber: 2,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-3",
    name: "Circle 3 Gujrat",
    circleNumber: 3,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-4",
    name: "Circle 4 Gujrat",
    circleNumber: 4,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-5",
    name: "Circle 5 Gujrat",
    circleNumber: 5,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-6",
    name: "Circle 6 Gujrat",
    circleNumber: 6,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-7",
    name: "Circle 7 Gujrat",
    circleNumber: 7,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-8",
    name: "Circle 8 Gujrat",
    circleNumber: 8,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-9",
    name: "Circle 9 Gujrat",
    circleNumber: 9,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "GJT-10",
    name: "Circle 10 Gujrat",
    circleNumber: 10,
    districtCode: "GJT",
    districtName: "Gujrat",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-1",
    name: "Circle 1 Hafizabad",
    circleNumber: 1,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-2",
    name: "Circle 2 Hafizabad",
    circleNumber: 2,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-3",
    name: "Circle 3 Hafizabad",
    circleNumber: 3,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-4",
    name: "Circle 4 Hafizabad",
    circleNumber: 4,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-5",
    name: "Circle 5 Hafizabad",
    circleNumber: 5,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-6",
    name: "Circle 6 Hafizabad",
    circleNumber: 6,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-7",
    name: "Circle 7 Hafizabad",
    circleNumber: 7,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-8",
    name: "Circle 8 Hafizabad",
    circleNumber: 8,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-9",
    name: "Circle 9 Hafizabad",
    circleNumber: 9,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "HFD-10",
    name: "Circle 10 Hafizabad",
    circleNumber: 10,
    districtCode: "HFD",
    districtName: "Hafizabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "JHM-1",
    name: "Circle 1 Jhelum",
    circleNumber: 1,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-2",
    name: "Circle 2 Jhelum",
    circleNumber: 2,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-3",
    name: "Circle 3 Jhelum",
    circleNumber: 3,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-4",
    name: "Circle 4 Jhelum",
    circleNumber: 4,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-5",
    name: "Circle 5 Jhelum",
    circleNumber: 5,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-6",
    name: "Circle 6 Jhelum",
    circleNumber: 6,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-7",
    name: "Circle 7 Jhelum",
    circleNumber: 7,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-8",
    name: "Circle 8 Jhelum",
    circleNumber: 8,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-9",
    name: "Circle 9 Jhelum",
    circleNumber: 9,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JHM-10",
    name: "Circle 10 Jhelum",
    circleNumber: 10,
    districtCode: "JHM",
    districtName: "Jhelum",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "JNG-1",
    name: "Circle 1 Jhang",
    circleNumber: 1,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-2",
    name: "Circle 2 Jhang",
    circleNumber: 2,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-3",
    name: "Circle 3 Jhang",
    circleNumber: 3,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-4",
    name: "Circle 4 Jhang",
    circleNumber: 4,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-5",
    name: "Circle 5 Jhang",
    circleNumber: 5,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-6",
    name: "Circle 6 Jhang",
    circleNumber: 6,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-7",
    name: "Circle 7 Jhang",
    circleNumber: 7,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-8",
    name: "Circle 8 Jhang",
    circleNumber: 8,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-9",
    name: "Circle 9 Jhang",
    circleNumber: 9,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "JNG-10",
    name: "Circle 10 Jhang",
    circleNumber: 10,
    districtCode: "JNG",
    districtName: "Jhang",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "KSR-1",
    name: "Circle 1 Kasur",
    circleNumber: 1,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-2",
    name: "Circle 2 Kasur",
    circleNumber: 2,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-3",
    name: "Circle 3 Kasur",
    circleNumber: 3,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-4",
    name: "Circle 4 Kasur",
    circleNumber: 4,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-5",
    name: "Circle 5 Kasur",
    circleNumber: 5,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-6",
    name: "Circle 6 Kasur",
    circleNumber: 6,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-7",
    name: "Circle 7 Kasur",
    circleNumber: 7,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-8",
    name: "Circle 8 Kasur",
    circleNumber: 8,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-9",
    name: "Circle 9 Kasur",
    circleNumber: 9,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KSR-10",
    name: "Circle 10 Kasur",
    circleNumber: 10,
    districtCode: "KSR",
    districtName: "Kasur",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "KWL-1",
    name: "Circle 1 Khanewal",
    circleNumber: 1,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-2",
    name: "Circle 2 Khanewal",
    circleNumber: 2,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-3",
    name: "Circle 3 Khanewal",
    circleNumber: 3,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-4",
    name: "Circle 4 Khanewal",
    circleNumber: 4,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-5",
    name: "Circle 5 Khanewal",
    circleNumber: 5,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-6",
    name: "Circle 6 Khanewal",
    circleNumber: 6,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-7",
    name: "Circle 7 Khanewal",
    circleNumber: 7,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-8",
    name: "Circle 8 Khanewal",
    circleNumber: 8,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-9",
    name: "Circle 9 Khanewal",
    circleNumber: 9,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KWL-10",
    name: "Circle 10 Khanewal",
    circleNumber: 10,
    districtCode: "KWL",
    districtName: "Khanewal",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "KHB-1",
    name: "Circle 1 Khushab",
    circleNumber: 1,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-2",
    name: "Circle 2 Khushab",
    circleNumber: 2,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-3",
    name: "Circle 3 Khushab",
    circleNumber: 3,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-4",
    name: "Circle 4 Khushab",
    circleNumber: 4,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-5",
    name: "Circle 5 Khushab",
    circleNumber: 5,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-6",
    name: "Circle 6 Khushab",
    circleNumber: 6,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-7",
    name: "Circle 7 Khushab",
    circleNumber: 7,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-8",
    name: "Circle 8 Khushab",
    circleNumber: 8,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-9",
    name: "Circle 9 Khushab",
    circleNumber: 9,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "KHB-10",
    name: "Circle 10 Khushab",
    circleNumber: 10,
    districtCode: "KHB",
    districtName: "Khushab",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "LHR-1",
    name: "Circle 1 Lahore",
    circleNumber: 1,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-2",
    name: "Circle 2 Lahore",
    circleNumber: 2,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-3",
    name: "Circle 3 Lahore",
    circleNumber: 3,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-4",
    name: "Circle 4 Lahore",
    circleNumber: 4,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-5",
    name: "Circle 5 Lahore",
    circleNumber: 5,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-6",
    name: "Circle 6 Lahore",
    circleNumber: 6,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-7",
    name: "Circle 7 Lahore",
    circleNumber: 7,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-8",
    name: "Circle 8 Lahore",
    circleNumber: 8,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-9",
    name: "Circle 9 Lahore",
    circleNumber: 9,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LHR-10",
    name: "Circle 10 Lahore",
    circleNumber: 10,
    districtCode: "LHR",
    districtName: "Lahore",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "LYH-1",
    name: "Circle 1 Layyah",
    circleNumber: 1,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-2",
    name: "Circle 2 Layyah",
    circleNumber: 2,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-3",
    name: "Circle 3 Layyah",
    circleNumber: 3,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-4",
    name: "Circle 4 Layyah",
    circleNumber: 4,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-5",
    name: "Circle 5 Layyah",
    circleNumber: 5,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-6",
    name: "Circle 6 Layyah",
    circleNumber: 6,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-7",
    name: "Circle 7 Layyah",
    circleNumber: 7,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-8",
    name: "Circle 8 Layyah",
    circleNumber: 8,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-9",
    name: "Circle 9 Layyah",
    circleNumber: 9,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LYH-10",
    name: "Circle 10 Layyah",
    circleNumber: 10,
    districtCode: "LYH",
    districtName: "Layyah",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "LOD-1",
    name: "Circle 1 Lodhran",
    circleNumber: 1,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-2",
    name: "Circle 2 Lodhran",
    circleNumber: 2,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-3",
    name: "Circle 3 Lodhran",
    circleNumber: 3,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-4",
    name: "Circle 4 Lodhran",
    circleNumber: 4,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-5",
    name: "Circle 5 Lodhran",
    circleNumber: 5,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-6",
    name: "Circle 6 Lodhran",
    circleNumber: 6,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-7",
    name: "Circle 7 Lodhran",
    circleNumber: 7,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-8",
    name: "Circle 8 Lodhran",
    circleNumber: 8,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-9",
    name: "Circle 9 Lodhran",
    circleNumber: 9,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "LOD-10",
    name: "Circle 10 Lodhran",
    circleNumber: 10,
    districtCode: "LOD",
    districtName: "Lodhran",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MBD-1",
    name: "Circle 1 Mandi Bahauddin",
    circleNumber: 1,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-2",
    name: "Circle 2 Mandi Bahauddin",
    circleNumber: 2,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-3",
    name: "Circle 3 Mandi Bahauddin",
    circleNumber: 3,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-4",
    name: "Circle 4 Mandi Bahauddin",
    circleNumber: 4,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-5",
    name: "Circle 5 Mandi Bahauddin",
    circleNumber: 5,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-6",
    name: "Circle 6 Mandi Bahauddin",
    circleNumber: 6,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-7",
    name: "Circle 7 Mandi Bahauddin",
    circleNumber: 7,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-8",
    name: "Circle 8 Mandi Bahauddin",
    circleNumber: 8,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-9",
    name: "Circle 9 Mandi Bahauddin",
    circleNumber: 9,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MBD-10",
    name: "Circle 10 Mandi Bahauddin",
    circleNumber: 10,
    districtCode: "MBD",
    districtName: "Mandi Bahauddin",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MWL-1",
    name: "Circle 1 Mianwali",
    circleNumber: 1,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-2",
    name: "Circle 2 Mianwali",
    circleNumber: 2,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-3",
    name: "Circle 3 Mianwali",
    circleNumber: 3,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-4",
    name: "Circle 4 Mianwali",
    circleNumber: 4,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-5",
    name: "Circle 5 Mianwali",
    circleNumber: 5,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-6",
    name: "Circle 6 Mianwali",
    circleNumber: 6,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-7",
    name: "Circle 7 Mianwali",
    circleNumber: 7,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-8",
    name: "Circle 8 Mianwali",
    circleNumber: 8,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-9",
    name: "Circle 9 Mianwali",
    circleNumber: 9,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MWL-10",
    name: "Circle 10 Mianwali",
    circleNumber: 10,
    districtCode: "MWL",
    districtName: "Mianwali",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "MTN-1",
    name: "Circle 1 Multan",
    circleNumber: 1,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-2",
    name: "Circle 2 Multan",
    circleNumber: 2,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-3",
    name: "Circle 3 Multan",
    circleNumber: 3,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-4",
    name: "Circle 4 Multan",
    circleNumber: 4,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-5",
    name: "Circle 5 Multan",
    circleNumber: 5,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-6",
    name: "Circle 6 Multan",
    circleNumber: 6,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-7",
    name: "Circle 7 Multan",
    circleNumber: 7,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-8",
    name: "Circle 8 Multan",
    circleNumber: 8,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-9",
    name: "Circle 9 Multan",
    circleNumber: 9,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MTN-10",
    name: "Circle 10 Multan",
    circleNumber: 10,
    districtCode: "MTN",
    districtName: "Multan",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "MZG-1",
    name: "Circle 1 Muzaffargarh",
    circleNumber: 1,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-2",
    name: "Circle 2 Muzaffargarh",
    circleNumber: 2,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-3",
    name: "Circle 3 Muzaffargarh",
    circleNumber: 3,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-4",
    name: "Circle 4 Muzaffargarh",
    circleNumber: 4,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-5",
    name: "Circle 5 Muzaffargarh",
    circleNumber: 5,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-6",
    name: "Circle 6 Muzaffargarh",
    circleNumber: 6,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-7",
    name: "Circle 7 Muzaffargarh",
    circleNumber: 7,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-8",
    name: "Circle 8 Muzaffargarh",
    circleNumber: 8,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-9",
    name: "Circle 9 Muzaffargarh",
    circleNumber: 9,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "MZG-10",
    name: "Circle 10 Muzaffargarh",
    circleNumber: 10,
    districtCode: "MZG",
    districtName: "Muzaffargarh",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "NKS-1",
    name: "Circle 1 Nankana Sahib",
    circleNumber: 1,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-2",
    name: "Circle 2 Nankana Sahib",
    circleNumber: 2,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-3",
    name: "Circle 3 Nankana Sahib",
    circleNumber: 3,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-4",
    name: "Circle 4 Nankana Sahib",
    circleNumber: 4,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-5",
    name: "Circle 5 Nankana Sahib",
    circleNumber: 5,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-6",
    name: "Circle 6 Nankana Sahib",
    circleNumber: 6,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-7",
    name: "Circle 7 Nankana Sahib",
    circleNumber: 7,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-8",
    name: "Circle 8 Nankana Sahib",
    circleNumber: 8,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-9",
    name: "Circle 9 Nankana Sahib",
    circleNumber: 9,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NKS-10",
    name: "Circle 10 Nankana Sahib",
    circleNumber: 10,
    districtCode: "NKS",
    districtName: "Nankana Sahib",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "NRW-1",
    name: "Circle 1 Narowal",
    circleNumber: 1,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-2",
    name: "Circle 2 Narowal",
    circleNumber: 2,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-3",
    name: "Circle 3 Narowal",
    circleNumber: 3,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-4",
    name: "Circle 4 Narowal",
    circleNumber: 4,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-5",
    name: "Circle 5 Narowal",
    circleNumber: 5,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-6",
    name: "Circle 6 Narowal",
    circleNumber: 6,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-7",
    name: "Circle 7 Narowal",
    circleNumber: 7,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-8",
    name: "Circle 8 Narowal",
    circleNumber: 8,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-9",
    name: "Circle 9 Narowal",
    circleNumber: 9,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "NRW-10",
    name: "Circle 10 Narowal",
    circleNumber: 10,
    districtCode: "NRW",
    districtName: "Narowal",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "OKR-1",
    name: "Circle 1 Okara",
    circleNumber: 1,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-2",
    name: "Circle 2 Okara",
    circleNumber: 2,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-3",
    name: "Circle 3 Okara",
    circleNumber: 3,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-4",
    name: "Circle 4 Okara",
    circleNumber: 4,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-5",
    name: "Circle 5 Okara",
    circleNumber: 5,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-6",
    name: "Circle 6 Okara",
    circleNumber: 6,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-7",
    name: "Circle 7 Okara",
    circleNumber: 7,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-8",
    name: "Circle 8 Okara",
    circleNumber: 8,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-9",
    name: "Circle 9 Okara",
    circleNumber: 9,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "OKR-10",
    name: "Circle 10 Okara",
    circleNumber: 10,
    districtCode: "OKR",
    districtName: "Okara",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-1",
    name: "Circle 1 Pakpattan",
    circleNumber: 1,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-2",
    name: "Circle 2 Pakpattan",
    circleNumber: 2,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-3",
    name: "Circle 3 Pakpattan",
    circleNumber: 3,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-4",
    name: "Circle 4 Pakpattan",
    circleNumber: 4,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-5",
    name: "Circle 5 Pakpattan",
    circleNumber: 5,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-6",
    name: "Circle 6 Pakpattan",
    circleNumber: 6,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-7",
    name: "Circle 7 Pakpattan",
    circleNumber: 7,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-8",
    name: "Circle 8 Pakpattan",
    circleNumber: 8,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-9",
    name: "Circle 9 Pakpattan",
    circleNumber: 9,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "PKP-10",
    name: "Circle 10 Pakpattan",
    circleNumber: 10,
    districtCode: "PKP",
    districtName: "Pakpattan",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "RYK-1",
    name: "Circle 1 Rahim Yar Khan",
    circleNumber: 1,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-2",
    name: "Circle 2 Rahim Yar Khan",
    circleNumber: 2,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-3",
    name: "Circle 3 Rahim Yar Khan",
    circleNumber: 3,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-4",
    name: "Circle 4 Rahim Yar Khan",
    circleNumber: 4,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-5",
    name: "Circle 5 Rahim Yar Khan",
    circleNumber: 5,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-6",
    name: "Circle 6 Rahim Yar Khan",
    circleNumber: 6,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-7",
    name: "Circle 7 Rahim Yar Khan",
    circleNumber: 7,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-8",
    name: "Circle 8 Rahim Yar Khan",
    circleNumber: 8,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-9",
    name: "Circle 9 Rahim Yar Khan",
    circleNumber: 9,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RYK-10",
    name: "Circle 10 Rahim Yar Khan",
    circleNumber: 10,
    districtCode: "RYK",
    districtName: "Rahim Yar Khan",
    divisionCode: "DIV_BWP",
    isImmutable: true
  },
  {
    circleCode: "RJP-1",
    name: "Circle 1 Rajanpur",
    circleNumber: 1,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-2",
    name: "Circle 2 Rajanpur",
    circleNumber: 2,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-3",
    name: "Circle 3 Rajanpur",
    circleNumber: 3,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-4",
    name: "Circle 4 Rajanpur",
    circleNumber: 4,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-5",
    name: "Circle 5 Rajanpur",
    circleNumber: 5,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-6",
    name: "Circle 6 Rajanpur",
    circleNumber: 6,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-7",
    name: "Circle 7 Rajanpur",
    circleNumber: 7,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-8",
    name: "Circle 8 Rajanpur",
    circleNumber: 8,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-9",
    name: "Circle 9 Rajanpur",
    circleNumber: 9,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RJP-10",
    name: "Circle 10 Rajanpur",
    circleNumber: 10,
    districtCode: "RJP",
    districtName: "Rajanpur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "RWP-1",
    name: "Circle 1 Rawalpindi",
    circleNumber: 1,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-2",
    name: "Circle 2 Rawalpindi",
    circleNumber: 2,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-3",
    name: "Circle 3 Rawalpindi",
    circleNumber: 3,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-4",
    name: "Circle 4 Rawalpindi",
    circleNumber: 4,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-5",
    name: "Circle 5 Rawalpindi",
    circleNumber: 5,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-6",
    name: "Circle 6 Rawalpindi",
    circleNumber: 6,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-7",
    name: "Circle 7 Rawalpindi",
    circleNumber: 7,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-8",
    name: "Circle 8 Rawalpindi",
    circleNumber: 8,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-9",
    name: "Circle 9 Rawalpindi",
    circleNumber: 9,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "RWP-10",
    name: "Circle 10 Rawalpindi",
    circleNumber: 10,
    districtCode: "RWP",
    districtName: "Rawalpindi",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "SWL-1",
    name: "Circle 1 Sahiwal",
    circleNumber: 1,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-2",
    name: "Circle 2 Sahiwal",
    circleNumber: 2,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-3",
    name: "Circle 3 Sahiwal",
    circleNumber: 3,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-4",
    name: "Circle 4 Sahiwal",
    circleNumber: 4,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-5",
    name: "Circle 5 Sahiwal",
    circleNumber: 5,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-6",
    name: "Circle 6 Sahiwal",
    circleNumber: 6,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-7",
    name: "Circle 7 Sahiwal",
    circleNumber: 7,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-8",
    name: "Circle 8 Sahiwal",
    circleNumber: 8,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-9",
    name: "Circle 9 Sahiwal",
    circleNumber: 9,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SWL-10",
    name: "Circle 10 Sahiwal",
    circleNumber: 10,
    districtCode: "SWL",
    districtName: "Sahiwal",
    divisionCode: "DIV_SWL",
    isImmutable: true
  },
  {
    circleCode: "SGD-1",
    name: "Circle 1 Sargodha",
    circleNumber: 1,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-2",
    name: "Circle 2 Sargodha",
    circleNumber: 2,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-3",
    name: "Circle 3 Sargodha",
    circleNumber: 3,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-4",
    name: "Circle 4 Sargodha",
    circleNumber: 4,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-5",
    name: "Circle 5 Sargodha",
    circleNumber: 5,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-6",
    name: "Circle 6 Sargodha",
    circleNumber: 6,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-7",
    name: "Circle 7 Sargodha",
    circleNumber: 7,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-8",
    name: "Circle 8 Sargodha",
    circleNumber: 8,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-9",
    name: "Circle 9 Sargodha",
    circleNumber: 9,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SGD-10",
    name: "Circle 10 Sargodha",
    circleNumber: 10,
    districtCode: "SGD",
    districtName: "Sargodha",
    divisionCode: "DIV_SGD",
    isImmutable: true
  },
  {
    circleCode: "SKP-1",
    name: "Circle 1 Sheikhupura",
    circleNumber: 1,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-2",
    name: "Circle 2 Sheikhupura",
    circleNumber: 2,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-3",
    name: "Circle 3 Sheikhupura",
    circleNumber: 3,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-4",
    name: "Circle 4 Sheikhupura",
    circleNumber: 4,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-5",
    name: "Circle 5 Sheikhupura",
    circleNumber: 5,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-6",
    name: "Circle 6 Sheikhupura",
    circleNumber: 6,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-7",
    name: "Circle 7 Sheikhupura",
    circleNumber: 7,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-8",
    name: "Circle 8 Sheikhupura",
    circleNumber: 8,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-9",
    name: "Circle 9 Sheikhupura",
    circleNumber: 9,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKP-10",
    name: "Circle 10 Sheikhupura",
    circleNumber: 10,
    districtCode: "SKP",
    districtName: "Sheikhupura",
    divisionCode: "DIV_LHR",
    isImmutable: true
  },
  {
    circleCode: "SKT-1",
    name: "Circle 1 Sialkot",
    circleNumber: 1,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-2",
    name: "Circle 2 Sialkot",
    circleNumber: 2,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-3",
    name: "Circle 3 Sialkot",
    circleNumber: 3,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-4",
    name: "Circle 4 Sialkot",
    circleNumber: 4,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-5",
    name: "Circle 5 Sialkot",
    circleNumber: 5,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-6",
    name: "Circle 6 Sialkot",
    circleNumber: 6,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-7",
    name: "Circle 7 Sialkot",
    circleNumber: 7,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-8",
    name: "Circle 8 Sialkot",
    circleNumber: 8,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-9",
    name: "Circle 9 Sialkot",
    circleNumber: 9,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "SKT-10",
    name: "Circle 10 Sialkot",
    circleNumber: 10,
    districtCode: "SKT",
    districtName: "Sialkot",
    divisionCode: "DIV_GRW",
    isImmutable: true
  },
  {
    circleCode: "TTS-1",
    name: "Circle 1 Toba Tek Singh",
    circleNumber: 1,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-2",
    name: "Circle 2 Toba Tek Singh",
    circleNumber: 2,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-3",
    name: "Circle 3 Toba Tek Singh",
    circleNumber: 3,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-4",
    name: "Circle 4 Toba Tek Singh",
    circleNumber: 4,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-5",
    name: "Circle 5 Toba Tek Singh",
    circleNumber: 5,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-6",
    name: "Circle 6 Toba Tek Singh",
    circleNumber: 6,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-7",
    name: "Circle 7 Toba Tek Singh",
    circleNumber: 7,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-8",
    name: "Circle 8 Toba Tek Singh",
    circleNumber: 8,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-9",
    name: "Circle 9 Toba Tek Singh",
    circleNumber: 9,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "TTS-10",
    name: "Circle 10 Toba Tek Singh",
    circleNumber: 10,
    districtCode: "TTS",
    districtName: "Toba Tek Singh",
    divisionCode: "DIV_FSD",
    isImmutable: true
  },
  {
    circleCode: "VHR-1",
    name: "Circle 1 Vehari",
    circleNumber: 1,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-2",
    name: "Circle 2 Vehari",
    circleNumber: 2,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-3",
    name: "Circle 3 Vehari",
    circleNumber: 3,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-4",
    name: "Circle 4 Vehari",
    circleNumber: 4,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-5",
    name: "Circle 5 Vehari",
    circleNumber: 5,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-6",
    name: "Circle 6 Vehari",
    circleNumber: 6,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-7",
    name: "Circle 7 Vehari",
    circleNumber: 7,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-8",
    name: "Circle 8 Vehari",
    circleNumber: 8,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-9",
    name: "Circle 9 Vehari",
    circleNumber: 9,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "VHR-10",
    name: "Circle 10 Vehari",
    circleNumber: 10,
    districtCode: "VHR",
    districtName: "Vehari",
    divisionCode: "DIV_MTN",
    isImmutable: true
  },
  {
    circleCode: "JMP-1",
    name: "Circle 1 Jampur",
    circleNumber: 1,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-2",
    name: "Circle 2 Jampur",
    circleNumber: 2,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-3",
    name: "Circle 3 Jampur",
    circleNumber: 3,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-4",
    name: "Circle 4 Jampur",
    circleNumber: 4,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-5",
    name: "Circle 5 Jampur",
    circleNumber: 5,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-6",
    name: "Circle 6 Jampur",
    circleNumber: 6,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-7",
    name: "Circle 7 Jampur",
    circleNumber: 7,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-8",
    name: "Circle 8 Jampur",
    circleNumber: 8,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-9",
    name: "Circle 9 Jampur",
    circleNumber: 9,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "JMP-10",
    name: "Circle 10 Jampur",
    circleNumber: 10,
    districtCode: "JMP",
    districtName: "Jampur",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-1",
    name: "Circle 1 Kot Addu",
    circleNumber: 1,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-2",
    name: "Circle 2 Kot Addu",
    circleNumber: 2,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-3",
    name: "Circle 3 Kot Addu",
    circleNumber: 3,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-4",
    name: "Circle 4 Kot Addu",
    circleNumber: 4,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-5",
    name: "Circle 5 Kot Addu",
    circleNumber: 5,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-6",
    name: "Circle 6 Kot Addu",
    circleNumber: 6,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-7",
    name: "Circle 7 Kot Addu",
    circleNumber: 7,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-8",
    name: "Circle 8 Kot Addu",
    circleNumber: 8,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-9",
    name: "Circle 9 Kot Addu",
    circleNumber: 9,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "KAD-10",
    name: "Circle 10 Kot Addu",
    circleNumber: 10,
    districtCode: "KAD",
    districtName: "Kot Addu",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-1",
    name: "Circle 1 Tonsa (Taunsa)",
    circleNumber: 1,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-2",
    name: "Circle 2 Tonsa (Taunsa)",
    circleNumber: 2,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-3",
    name: "Circle 3 Tonsa (Taunsa)",
    circleNumber: 3,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-4",
    name: "Circle 4 Tonsa (Taunsa)",
    circleNumber: 4,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-5",
    name: "Circle 5 Tonsa (Taunsa)",
    circleNumber: 5,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-6",
    name: "Circle 6 Tonsa (Taunsa)",
    circleNumber: 6,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-7",
    name: "Circle 7 Tonsa (Taunsa)",
    circleNumber: 7,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-8",
    name: "Circle 8 Tonsa (Taunsa)",
    circleNumber: 8,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-9",
    name: "Circle 9 Tonsa (Taunsa)",
    circleNumber: 9,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "TNS-10",
    name: "Circle 10 Tonsa (Taunsa)",
    circleNumber: 10,
    districtCode: "TNS",
    districtName: "Tonsa (Taunsa)",
    divisionCode: "DIV_DGK",
    isImmutable: true
  },
  {
    circleCode: "WZD-1",
    name: "Circle 1 Wazirabad",
    circleNumber: 1,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-2",
    name: "Circle 2 Wazirabad",
    circleNumber: 2,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-3",
    name: "Circle 3 Wazirabad",
    circleNumber: 3,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-4",
    name: "Circle 4 Wazirabad",
    circleNumber: 4,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-5",
    name: "Circle 5 Wazirabad",
    circleNumber: 5,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-6",
    name: "Circle 6 Wazirabad",
    circleNumber: 6,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-7",
    name: "Circle 7 Wazirabad",
    circleNumber: 7,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-8",
    name: "Circle 8 Wazirabad",
    circleNumber: 8,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-9",
    name: "Circle 9 Wazirabad",
    circleNumber: 9,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "WZD-10",
    name: "Circle 10 Wazirabad",
    circleNumber: 10,
    districtCode: "WZD",
    districtName: "Wazirabad",
    divisionCode: "DIV_GJT",
    isImmutable: true
  },
  {
    circleCode: "MUR-1",
    name: "Circle 1 Murree",
    circleNumber: 1,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-2",
    name: "Circle 2 Murree",
    circleNumber: 2,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-3",
    name: "Circle 3 Murree",
    circleNumber: 3,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-4",
    name: "Circle 4 Murree",
    circleNumber: 4,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-5",
    name: "Circle 5 Murree",
    circleNumber: 5,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-6",
    name: "Circle 6 Murree",
    circleNumber: 6,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-7",
    name: "Circle 7 Murree",
    circleNumber: 7,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-8",
    name: "Circle 8 Murree",
    circleNumber: 8,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-9",
    name: "Circle 9 Murree",
    circleNumber: 9,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "MUR-10",
    name: "Circle 10 Murree",
    circleNumber: 10,
    districtCode: "MUR",
    districtName: "Murree",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-1",
    name: "Circle 1 Talagang",
    circleNumber: 1,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-2",
    name: "Circle 2 Talagang",
    circleNumber: 2,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-3",
    name: "Circle 3 Talagang",
    circleNumber: 3,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-4",
    name: "Circle 4 Talagang",
    circleNumber: 4,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-5",
    name: "Circle 5 Talagang",
    circleNumber: 5,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-6",
    name: "Circle 6 Talagang",
    circleNumber: 6,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-7",
    name: "Circle 7 Talagang",
    circleNumber: 7,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-8",
    name: "Circle 8 Talagang",
    circleNumber: 8,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-9",
    name: "Circle 9 Talagang",
    circleNumber: 9,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  },
  {
    circleCode: "TLG-10",
    name: "Circle 10 Talagang",
    circleNumber: 10,
    districtCode: "TLG",
    districtName: "Talagang",
    divisionCode: "DIV_RWP",
    isImmutable: true
  }
] as const;

// ----------------------------------------------------------------------------
// High-Performance Lookup Maps
// ----------------------------------------------------------------------------
const divisionByCodeMap = new Map<string, GeoDivision>(PUNJAB_DIVISIONS.map((d) => [d.code, d]));
const divisionByAbbrevMap = new Map<string, GeoDivision>(
  PUNJAB_DIVISIONS.map((d) => [d.abbrev, d])
);

const districtByPbsMap = new Map<string, GeoDistrict>(PUNJAB_DISTRICTS.map((d) => [d.pbsCode, d]));
const districtByCodeMap = new Map<string, GeoDistrict>(
  PUNJAB_DISTRICTS.map((d) => [d.districtCode.toUpperCase(), d])
);
const districtByNameMap = new Map<string, GeoDistrict>(
  PUNJAB_DISTRICTS.map((d) => [d.name.toLowerCase(), d])
);

const tehsilByCodeMap = new Map<number, GeoTehsil>(PUNJAB_TEHSILS.map((t) => [t.tehsilCode, t]));

const circleByCodeMap = new Map<string, GeoCircle>(
  PUNJAB_CIRCLES.map((c) => [c.circleCode.toUpperCase(), c])
);

// ----------------------------------------------------------------------------
// Lookup Helpers
// ----------------------------------------------------------------------------

export function getDivision(codeOrAbbrev: string): GeoDivision | undefined {
  if (!codeOrAbbrev) return undefined;
  const upper = codeOrAbbrev.toUpperCase().trim();
  return divisionByCodeMap.get(upper) ?? divisionByAbbrevMap.get(upper);
}

export function getDistrict(codeOrPbsOrName: string): GeoDistrict | undefined {
  if (!codeOrPbsOrName) return undefined;
  const clean = codeOrPbsOrName.trim();
  const upper = clean.toUpperCase();
  return (
    districtByCodeMap.get(upper) ??
    districtByPbsMap.get(clean) ??
    districtByNameMap.get(clean.toLowerCase())
  );
}

export function getDistrictsByDivision(divisionCodeOrAbbrev: string): readonly GeoDistrict[] {
  const div = getDivision(divisionCodeOrAbbrev);
  if (!div) return [];
  return PUNJAB_DISTRICTS.filter((d) => d.divisionCode === div.code);
}

export function getGeoTehsilsByDistrict(districtCodeOrPbsOrName: string): readonly GeoTehsil[] {
  const dist = getDistrict(districtCodeOrPbsOrName);
  if (!dist) return [];
  return PUNJAB_TEHSILS.filter((t) => t.districtCode === dist.districtCode);
}

export function getCirclesByDistrict(districtCodeOrPbsOrName: string): readonly GeoCircle[] {
  const dist = getDistrict(districtCodeOrPbsOrName);
  if (!dist) return [];
  return PUNJAB_CIRCLES.filter((c) => c.districtCode === dist.districtCode);
}

export function getCircle(circleCode: string): GeoCircle | undefined {
  if (!circleCode) return undefined;
  return circleByCodeMap.get(circleCode.toUpperCase().trim());
}

export function getTehsilByCode(tehsilCode: number): GeoTehsil | undefined {
  return tehsilByCodeMap.get(tehsilCode);
}

/**
 * Resolves a permanent circle identifier from district initial and circle number.
 * E.g. resolveCircleCode("VHR", 1) -> "VHR-1"
 */
export function resolveCircleCode(districtCode: string, circleNumber: number): string {
  const dist = getDistrict(districtCode);
  const prefix = dist ? dist.districtCode : districtCode.toUpperCase();
  return `${prefix}-${circleNumber}`;
}

/**
 * Canonical check if a string is a valid permanent circle code.
 */
export function isValidCircleCode(circleCode: string): boolean {
  return circleByCodeMap.has(circleCode.toUpperCase().trim());
}
