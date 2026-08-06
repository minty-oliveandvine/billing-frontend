"use client";

import { useEffect, useRef, useState } from "react";

import { buildEnterUrl, type PortalEntity } from "@/lib/payerPortal";

/**
 * The per-row kebab.
 *
 * Two of the items in the design move an established financial relationship and have no
 * write route, no preview and no audit entry today. Neither is dropped: leaving them out
 * would quietly redesign the menu, and the gap is known rather than forgotten.
 *
 * They differ in how far they get. "Change subscriber" opens a real, READ-ONLY screen —
 * it can already answer "who could take this over?" from the entity's admins, and leaves
 * its own buttons disabled. "Change billing account" has nothing to show at all (there is
 * one account per payer, so the list would be one row) and stays a greyed menu item with
 * a reason attached.
 *
 * The two that do work leave for Minty. That is not a shortcut — subscribing and
 * cancelling run a proration preview and a confirmation the customer has to read, and
 * both are gated server-side by `@require_subscription_payer`. Re-implementing that flow
 * here would put a second, differently-worded route to the same charge in front of the
 * same person.
 */

type MenuItem = {
  label: string;
  href?: string;
  /** Why it cannot be used, shown as a tooltip. Presence of this disables the item. */
  unavailable?: string;
  danger?: boolean;
};

export function SubscriptionRowMenu({ entity }: { entity: PortalEntity }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const subscriptionUrl = buildEnterUrl(entity.entity_id, entity.settings_path);
  // Nothing live to end. Offering Cancel against an entity whose modules have all
  // lapsed sends the user to a page with no Cancel button on it.
  const hasSomethingToCancel = entity.modules.some(
    (m) => m.status === "active" || m.status === "past_due" || m.status === "trialing",
  );

  const items: MenuItem[] = [
    { label: "View subscription", href: subscriptionUrl },
    {
      label: "View billing account",
      href: `/profile/billing/account?entity=${encodeURIComponent(entity.entity_id)}`,
    },
    {
      label: "View invoices",
      href: `/profile/invoices?entity=${encodeURIComponent(entity.entity_id)}`,
    },
    {
      label: "Change billing account",
      unavailable: "Moving an entity to another billing account isn't supported yet.",
    },
    {
      // Opens, but cannot act. The screen is read-only — it lists the admins the bill
      // could sit with and leaves both of its buttons disabled — which is worth more
      // than a greyed menu row: it answers "who could take this over?" today.
      label: "Change subscriber",
      href: `/profile/subscriptions/subscriber?entity=${encodeURIComponent(entity.entity_id)}`,
    },
    {
      label: "Cancel subscription",
      href: hasSomethingToCancel ? subscriptionUrl : undefined,
      unavailable: hasSomethingToCancel
        ? undefined
        : "Nothing on this entity is running.",
      danger: true,
    },
  ];

  return (
    <div className="relative flex justify-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${entity.entity_name}`}
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#828A96] transition-colors hover:bg-[#F2F5F7] hover:text-[#292E38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
          more_vert
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-60 overflow-hidden rounded-xl border border-[#E6EBED] bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,41,0.12)]"
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-[15px] transition-colors hover:bg-[#F5F7FA] ${
                  item.danger ? "text-[#B42318]" : "text-[#292E38]"
                }`}
              >
                {item.label}
              </a>
            ) : (
              <span
                key={item.label}
                role="menuitem"
                aria-disabled
                title={item.unavailable}
                className="block cursor-not-allowed px-4 py-2.5 text-[15px] text-[#B4BAC3]"
              >
                {item.label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
