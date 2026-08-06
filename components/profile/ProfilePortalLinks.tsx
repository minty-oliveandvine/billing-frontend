"use client";

import Link from "next/link";

/**
 * The payer portal's front door: three cards on My Profile.
 *
 * They sit here rather than in the nav because what they open is not scoped to the
 * entity you happen to have selected — it is your BILLING RELATIONSHIP, which spans
 * every company you pay for. The profile is the only screen in the app that is already
 * about the person rather than the company, so it is where the cross-entity view
 * belongs.
 *
 * Billing and Invoices are routed but not yet built (see their placeholder pages). They
 * are shown anyway, and marked, because a card that is coming is more honest than a
 * silently missing one — and the tab bar on the destination lists all three regardless.
 */

type PortalLink = {
  href: string;
  title: string;
  detail: string;
  /** Rendered, but flagged as not ready. */
  comingSoon?: boolean;
};

const LINKS: PortalLink[] = [
  {
    href: "/profile/subscriptions",
    title: "Manage subscriptions",
    detail: "View & manage every entity's modules",
  },
  {
    href: "/profile/billing",
    title: "Billing",
    detail: "See what you're charged across all entities",
  },
  {
    href: "/profile/invoices",
    title: "Invoices",
    detail: "View & export payment invoices per entity",
  },
];

export function ProfilePortalLinks() {
  return (
    <nav className="mt-4 flex flex-col gap-[18px]" aria-label="Subscription and billing">
      {LINKS.map(({ href, title, detail, comingSoon }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-3 rounded-[14px] border border-gray-200 bg-white px-5 py-[18px] text-left transition-colors hover:border-[#2E9B9B]/50 hover:bg-[#2E9B9B]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold uppercase leading-tight text-[#16202E] sm:text-base">
                {title}
              </span>
              {comingSoon ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  Coming soon
                </span>
              ) : null}
            </span>
            <span className="mt-3 block text-[15px] font-bold text-[#6B7280]">{detail}</span>
          </span>
          <span
            className="material-symbols-outlined shrink-0 text-[22px] leading-none text-[#2E9B9B] transition-transform group-hover:translate-x-0.5"
            aria-hidden
          >
            chevron_right
          </span>
        </Link>
      ))}
    </nav>
  );
}
