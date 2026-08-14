"use client";

/**
 * The payer portal's pager, shared by all three tabs.
 *
 * Lifted out of `ManageSubscriptionsContent` and `InvoicesContent`, which held byte-for-byte
 * identical copies, when Billing became the third caller. Two copies is a smell; three is a
 * guarantee that a fix lands in one of them.
 *
 * Page numbers are WINDOWED to five. An unbounded run wraps into a paragraph of buttons
 * once a payer has a few dozen entities — on the narrowest screen first, where the footer
 * already carries the count beside it.
 *
 * Render it only when there is more than one page. It is deliberately not self-hiding: the
 * caller owns the footer layout, and a component that sometimes renders nothing leaves a
 * `justify-between` row with one child silently re-centring itself.
 */
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  const size = 5;
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), pages - size + 1));
  const numbers = Array.from({ length: Math.min(size, pages) }, (_, i) => start + i);

  const boxClass =
    "inline-flex h-[34px] min-w-[34px] cursor-pointer items-center justify-center rounded-lg px-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

  // Centred once it wraps. Every footer that renders this is `justify-between`, which
  // separates children only WITHIN a line — so on a phone, where the count takes the
  // first row and the pager gets its own, there is nothing left to push against and it
  // lands hard left under the text. `mx-auto` absorbs the free space on both sides
  // instead; from `sm` up it goes back to sitting at the end of the shared row. Living
  // here rather than in each footer, it applies to Manage Subscriptions, Billing and
  // Invoices alike.
  return (
    <nav className="mx-auto flex items-center gap-1.5 sm:mx-0" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={`${boxClass} border border-[#E6EBED] bg-white font-semibold text-[#737A87] hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
          chevron_left
        </span>
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? "page" : undefined}
          className={`${boxClass} ${
            n === page
              ? "bg-[#4FC7C7] font-semibold text-white"
              : "border border-[#E6EBED] bg-white font-medium text-[#292E38] hover:bg-[#F5F7FA]"
          }`}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
        className={`${boxClass} border border-[#E6EBED] bg-white font-semibold text-[#737A87] hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
          chevron_right
        </span>
      </button>
    </nav>
  );
}
