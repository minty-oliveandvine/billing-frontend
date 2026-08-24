/**
 * How the payer portal writes money and dates.
 *
 * Extracted from ChangeSubscriberContent and IncomingTransfersContent, which held
 * byte-identical copies. The two screens quote the SAME handover from opposite sides —
 * one offers it, the other accepts it — so a figure that formatted differently between
 * them would read as a different figure.
 */

/**
 * Amounts arrive in MINOR units, the way Stripe and Minty's own pricing both carry them.
 * Formatted with the currency code rather than a symbol, because the portal shows
 * whatever currency the entity is billed in and "$" alone would not say which one.
 */
export function money(amount: number, currency: string | null) {
  const major = (amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency ? `${currency} ` : ""}${major}`;
}

/** A date the customer can read. Empty string for anything unparseable, never "Invalid Date". */
export function day(iso: string | null | undefined) {
  if (!iso) return "";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}
