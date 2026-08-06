/**
 * A portal section that is routed but not built.
 *
 * It says what the section WILL hold and where the same information lives today, rather
 * than the bare "not available yet" the settings placeholder uses — someone who clicked
 * Invoices wants an invoice, and sending them away empty-handed when the data exists on
 * another screen is the avoidable half of an unfinished feature.
 */
export function PortalPlaceholder({
  title,
  summary,
  whereInstead,
}: {
  title: string;
  summary: string;
  whereInstead: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E6EBED] bg-white px-6 py-16 text-center shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <span
        className="material-symbols-outlined text-[32px] leading-none text-[#B4BAC3]"
        aria-hidden
      >
        hourglass_empty
      </span>
      <p className="mt-3 text-base font-semibold text-[#292E38]">{title} is on the way</p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-[#6B7380]">{summary}</p>
      <p className="mx-auto mt-3 max-w-lg text-sm text-[#6B7380]">{whereInstead}</p>
    </div>
  );
}
