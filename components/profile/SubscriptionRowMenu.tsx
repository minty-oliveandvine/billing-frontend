"use client";

import { useEffect, useRef, useState } from "react";

import { buildEnterUrl, type PortalEntity } from "@/lib/payerPortal";

/**
 * The per-row kebab.
 *
 * "Change billing account" USED TO BE HERE, greyed out with a reason attached, on the
 * argument that a known gap beats a quietly redesigned menu. It is gone now, because the
 * gap was never real: there is ONE billing account per payer — one Stripe customer, one
 * anchor, one dunning clock, one invoice with a line per company — so there is no second
 * account to move an entity to. The item promised a feature the model has no room for.
 * What DOES vary is which saved payment method that one account charges, and the Billing
 * tab is where that is chosen.
 *
 * "Change subscriber" stays, and is the genuine gap: handing an entity to a different
 * payer is a real operation with no write route, no proration preview and no audit entry
 * today. Its screen opens and is READ-ONLY — it can already answer "who could take this
 * over?" from the entity's admins — so it is worth more than a greyed row.
 *
 * The two that act leave for Minty. That is not a shortcut — subscribing and cancelling
 * run a proration preview and a confirmation the customer has to read, and both are gated
 * server-side by `@require_subscription_payer`. Re-implementing that flow here would put a
 * second, differently-worded route to the same charge in front of the same person.
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
  /** Opens upward when the row is near the bottom of the window — see `toggle`. */
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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

  /**
   * Decide the direction BEFORE opening, from the room actually left below the button.
   *
   * Six items is a tall menu, and the last row of the table is where it is most often
   * opened from. Dropping down from there ran it past the end of the card and cut off
   * "Cancel subscription" — the item somebody scrolls to that row to find.
   */
  const MENU_HEIGHT = 290;
  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < MENU_HEIGHT);
    }
    setOpen((v) => !v);
  };

  const subscriptionUrl = buildEnterUrl(entity.entity_id, entity.settings_path);
  // Nothing live to end. Offering Cancel against an entity whose modules have all
  // lapsed sends the user to a page with no Cancel button on it.
  const hasSomethingToCancel = entity.modules.some(
    (m) => m.status === "active" || m.status === "past_due" || m.status === "trialing",
  );

  const items: MenuItem[] = [
    { label: "View subscription", href: subscriptionUrl },
    {
      // The Billing tab, NOT a per-entity billing page — there isn't one to go to. A
      // payer has ONE billing account (one Stripe customer, one anchor, one dunning
      // clock) and every company they pay for is a line on its invoice, so the account
      // this entity bills to is simply the account. No entity id on the link, because
      // narrowing that screen to one company would be narrowing it to all of them.
      label: "View billing account",
      href: "/profile/billing",
    },
    {
      label: "View invoices",
      href: `/profile/invoices?entity=${encodeURIComponent(entity.entity_id)}`,
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
        ref={buttonRef}
        onClick={toggle}
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
          className={`absolute right-0 z-30 w-60 overflow-hidden rounded-xl border border-[#E6EBED] bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,41,0.12)] ${
            dropUp ? "bottom-9" : "top-9"
          }`}
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
