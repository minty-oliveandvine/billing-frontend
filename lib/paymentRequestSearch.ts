import type { PaymentRequestRow } from "@/components/payment-request/PaymentRequestTable";

/**
 * Digits and the decimal point only — thousands separators and currency symbols dropped.
 * `"6,000.00"` → `"6000.00"`, `"HK$ 1,500.00"` → `"1500.00"`, `"3,000"` → `"3000"`.
 *
 * The decimal point is deliberately kept: stripping to bare digits would turn
 * `"3,000.00"` into `"300000"` and `"300.00"` into `"30000"`, so a query of `3000`
 * would falsely match a 300.00 row.
 */
export function normalizeAmountForSearch(s: string): string {
  return s.replace(/[^0-9.]/g, "");
}

/**
 * Supplier, description, or a "contains" match on the invoice total's digits —
 * `3000` matches 3,000.00 and 13,000.50 but not 300.00. The unpaid amount is not
 * searched; only the invoice total is.
 */
export function rowMatchesSearch(row: PaymentRequestRow, rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  if (row.contactTitle.toLowerCase().includes(lower)) return true;
  if (row.contactCaption?.toLowerCase().includes(lower)) return true;
  const qNum = normalizeAmountForSearch(q);
  if (!qNum || qNum === ".") return false;
  return normalizeAmountForSearch(row.invoiceTotal ?? "").includes(qNum);
}
