"use client";

import Link from "next/link";

export const PORTAL_TAB_IDS = ["subscriptions", "billing", "invoices"] as const;
export type PortalTabId = (typeof PORTAL_TAB_IDS)[number];

const TABS: { id: PortalTabId; label: string; href: string }[] = [
  { id: "subscriptions", label: "Manage Subscriptions", href: "/profile/subscriptions" },
  { id: "billing", label: "Billing", href: "/profile/billing" },
  { id: "invoices", label: "Invoices", href: "/profile/invoices" },
];

export const PORTAL_TAB_LABELS: Record<PortalTabId, string> = {
  subscriptions: "Manage Subscriptions",
  billing: "Billing",
  invoices: "Invoices",
};

/**
 * The payer portal's three sections.
 *
 * An underline rather than the pill row used in Settings: these are sections of one
 * screen about one relationship, where the Settings pills jump between separately-scoped
 * pages (and two of them leave the app entirely). Different job, different affordance.
 *
 * The full bar renders even though Billing and Invoices are placeholders — hiding them
 * would make the portal look finished at two-thirds, and the profile cards already
 * announce all three.
 */
export function PortalTabs({ active }: { active: PortalTabId }) {
  return (
    <div className="border-b border-[#E6EBED]">
      <nav className="flex flex-wrap items-end gap-6 sm:gap-8" aria-label="Subscription sections">
        {TABS.map(({ id, label, href }) => {
          const isActive = id === active;
          return (
            <Link
              key={id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px border-b-[2.5px] pb-2 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                isActive
                  ? "border-[#4FC7C7] font-bold text-[#242933]"
                  : "border-transparent font-medium text-[#808794] hover:text-[#242933]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
