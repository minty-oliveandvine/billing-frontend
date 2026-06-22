/** Maps API bill `status` (lowercase) to list/detail display labels. */
export function billStatusToDisplayLabel(status: string): string {
  const k = status.trim().toLowerCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    draft: "Draft",
    submitted: "Payment Requested",
    paid: "Paid",
    partially_paid: "Partially Paid",
    voided: "Voided",
    returned: "Returned",
  };
  if (map[k]) return map[k];
  if (!k) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Header badge on payment request details — aligned with list/table status tags
 * (`PaymentRequestTable` / `statusTagPaymentRequestedClass`, etc.).
 */
export function statusDisplayBadgeClass(displayLabel: string): string {
  const base =
    "inline-flex max-w-full items-center justify-center rounded-lg px-2.5 py-1 text-center text-sm font-semibold sm:px-3 sm:py-0 sm:text-sm lg:h-[42px] lg:min-h-[42px]";
  switch (displayLabel) {
    case "Paid":
      return `${base} border border-primary/25 bg-white text-[#656565]`;
    case "Payment Requested":
      return `${base} bg-secondary/10 text-secondary`;
    case "Partially Paid":
      return `${base} bg-[#70ebba]/10 font-semibold text-[#70ebba]`;
    case "Returned":
      return `${base} bg-[#EA9713]/15 text-[#EA9713]`;
    case "Voided":
      return `${base} text-[#FF6B6B]`;
    case "Draft":
      return `${base} bg-[#EDEDED] font-medium text-[#C0C0C0]`;
    default:
      return `${base} bg-[#EDEDED] font-medium text-[#C0C0C0]`;
  }
}
