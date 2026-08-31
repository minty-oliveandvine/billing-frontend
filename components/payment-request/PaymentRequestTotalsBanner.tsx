"use client";

import { useMemo } from "react";
import type { PaymentRequestRow } from "./PaymentRequestTable";
import { currencyLabelForCode } from "@/lib/currencyDisplay";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import { parseRowAmount } from "@/lib/paymentRequestRowSort";

/** Currencies listed before the "+N more" summary line. */
const MAX_CURRENCY_LINES = 3;

export type PaymentRequestTotalsBannerProps = {
  /** Every row matching the current filters + search — NOT just the current page. */
  allRows: PaymentRequestRow[];
  /** Checked rows, already intersected with `allRows`. */
  selectedRows: PaymentRequestRow[];
  /** Applied filter dates, ISO `yyyy-mm-dd`; empty when unset. */
  startDate?: string;
  endDate?: string;
  className?: string;
};

function formatTotal(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Sums invoice totals per currency so HKD is never silently added to USD.
 * Sorted by descending total; the largest currency leads the banner.
 */
function sumByCurrency(rows: PaymentRequestRow[]): Array<{ code: string; total: number }> {
  const byCode = new Map<string, number>();
  for (const row of rows) {
    const code = row.currencyCode?.trim() || "HKD";
    byCode.set(code, (byCode.get(code) ?? 0) + (parseRowAmount(row.invoiceTotal ?? "") ?? 0));
  }
  return [...byCode.entries()]
    .map(([code, total]) => ({ code, total }))
    .sort((a, b) => b.total - a.total);
}

/** `10 Aug 2026 - 17 Aug 2026`, or just the one side that is set. */
function formatDateRange(startDate: string, endDate: string): string {
  const from = startDate ? formatIsoDateForDisplay(startDate) || startDate : "";
  const to = endDate ? formatIsoDateForDisplay(endDate) || endDate : "";
  if (from && to) return `${from} - ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "";
}

/**
 * Top-right totals summary. Three modes, in precedence order:
 * 1. rows checked → "Selected total amount" over the selection;
 * 2. a date range applied → "Total amount" plus the range as a subtitle;
 * 3. otherwise → "Total amount".
 *
 * Modes 2 and 3 sum the same array: start/end are pushed to the server as
 * `date_from`/`date_to`, so `allRows` is already range-limited.
 */
export function PaymentRequestTotalsBanner({
  allRows,
  selectedRows,
  startDate = "",
  endDate = "",
  className = "",
}: PaymentRequestTotalsBannerProps) {
  const hasSelection = selectedRows.length > 0;
  const rows = hasSelection ? selectedRows : allRows;
  const totals = useMemo(() => sumByCurrency(rows), [rows]);

  const label = hasSelection ? "Selected total amount" : "Total amount";
  const subtitle = hasSelection ? "" : formatDateRange(startDate, endDate);

  const primary = totals[0] ?? { code: "HKD", total: 0 };
  const extras = totals.slice(1, MAX_CURRENCY_LINES);
  const hiddenCount = Math.max(0, totals.length - MAX_CURRENCY_LINES);
  const mixed = totals.length > 1;

  return (
    <div
      className={`inline-flex max-w-full items-center justify-between gap-6 rounded-xl border-2 border-secondary bg-white px-4 py-2.5 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {subtitle ? <span className="text-[11px] text-gray-400 tabular-nums">{subtitle}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="whitespace-nowrap text-2xl font-semibold tabular-nums text-secondary">
          {mixed ? `${currencyLabelForCode(primary.code)} ` : ""}
          {formatTotal(primary.total)}
        </span>
        {extras.map((t) => (
          <span key={t.code} className="whitespace-nowrap text-sm font-semibold tabular-nums text-secondary">
            {currencyLabelForCode(t.code)} {formatTotal(t.total)}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="whitespace-nowrap text-xs text-gray-400">+{hiddenCount} more</span>
        ) : null}
      </div>
    </div>
  );
}
