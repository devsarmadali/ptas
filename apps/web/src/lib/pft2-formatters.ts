/**
 * Shared Formatters for Form P.F.T-2 Payment Challan
 *
 * Ensures 100% synchronization of date formatting, tax year display,
 * and scope labels between the jsPDF vector engine and the React DOM preview.
 */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

/**
 * Formats any incoming date string (ISO YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
 * into standard statutory challan format: DD-Mon-YYYY (e.g. "03-Oct-2026", "31-Aug-2026").
 */
export function formatChallanDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();

  // Already in DD-Mon-YYYY format (e.g. 03-Oct-2026)
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY-MM-DD format (e.g. 2026-10-03 or 2026-07-01)
  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd && ymd[1] && ymd[2] && ymd[3]) {
    const y = ymd[1];
    const m = parseInt(ymd[2], 10) - 1;
    const d = ymd[3].padStart(2, "0");
    if (m >= 0 && m < 12) {
      return `${d}-${MONTH_NAMES[m]}-${y}`;
    }
  }

  // DD/MM/YYYY format (e.g. 31/08/2026 or 31/10/2026)
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy && dmy[1] && dmy[2] && dmy[3]) {
    const d = dmy[1].padStart(2, "0");
    const m = parseInt(dmy[2], 10) - 1;
    const y = dmy[3];
    if (m >= 0 && m < 12) {
      return `${d}-${MONTH_NAMES[m]}-${y}`;
    }
  }

  // DD-MM-YYYY format (e.g. 31-10-2026)
  const dmyHyphen = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyHyphen && dmyHyphen[1] && dmyHyphen[2] && dmyHyphen[3]) {
    const d = dmyHyphen[1].padStart(2, "0");
    const m = parseInt(dmyHyphen[2], 10) - 1;
    const y = dmyHyphen[3];
    if (m >= 0 && m < 12) {
      return `${d}-${MONTH_NAMES[m]}-${y}`;
    }
  }

  return trimmed;
}

/**
 * Formats Tax Year consistently to compact statutory format (e.g. "2026-27").
 */
export function formatChallanTaxYear(taxYear?: string | null): string {
  if (!taxYear) return "2026-27";
  const trimmed = taxYear.trim();
  const match = trimmed.match(/^(\d{4})-(\d{4})$/);
  if (match && match[1] && match[2]) {
    return `${match[1]}-${match[2].slice(-2)}`;
  }
  return trimmed;
}

/**
 * Cleans the scope label to remove redundant occurrences of "DEMAND".
 */
export function cleanChallanScope(rawScope?: string | null): string {
  if (!rawScope) return "CURRENT";
  return rawScope
    .replace(/\bDEMAND\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
