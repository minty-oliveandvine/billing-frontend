"use client";

import { useEffect, useRef, useState } from "react";

import { EntityBillingAccountDialog } from "@/components/profile/EntityBillingAccountDialog";
import { buildEnterUrl, type PortalEntity } from "@/lib/payerPortal";

/**
 * The per-row kebab.
 *
 * "Change billing account" was here once, DISABLED, then removed, on the argument that
 * there was nothing behind it: a payer had one Stripe customer, one anchor, one dunning
 * clock and one invoice with a line per company, so no single company could be moved
 * anywhere. It is back, and live, because that constraint is gone. Each company is billed
 * on the card it was put on — a `payer_billing_group`, which owns that card's paid-through
 * and its own retry clock — and a renewal raises one invoice per card. Choosing there
 * changes what THIS company is charged to and moves nothing else the payer owns.
 *
 * It is also the only item that acts IN PLACE. The rest lead somewhere because they start
 * something longer; picking one of a handful of saved cards does not, and a new URL would
 * lose the row the menu was opened from. It sits under "View invoices" — the reading items
 * first, then the one that changes how this company is billed, then the two that end or
 * hand over the relationship.
 *
 * The Billing tab still has a default. It nominates nothing: it is the card the pickers
 * offer first.
 *
 * "Change subscriber" is now live. It does not hand the company over on the spot — it
 * OFFERS it, and the person offered has to accept and pay, because a bill can only move to
 * someone who agrees to carry it. The screen behind it prices that and says what blocks it.
 *
 * The two that act leave for Minty. That is not a shortcut — subscribing and cancelling
 * run a proration preview and a confirmation the customer has to read, and both are gated
 * server-side by `@require_subscription_payer`. Re-implementing that flow here would put a
 * second, differently-worded route to the same charge in front of the same person.
 */

type MenuItem = {
  label: string;
  href?: string;
  /** Acts in place instead of navigating — see "Change billing account". */
  onSelect?: () => void;
  /** Why it cannot be used, shown as a tooltip. Presence of this disables the item. */
  unavailable?: string;
  danger?: boolean;
};

export function SubscriptionRowMenu({ entity }: { entity: PortalEntity }) {
  const [open, setOpen] = useState(false);
  const [cardDialog, setCardDialog] = useState(false);
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
      label: "View invoices",
      href: `/profile/invoices?entity=${encodeURIComponent(entity.entity_id)}`,
    },
    {
      // OPENS IN PLACE. The two items around it start something longer — a handover to
      // price and offer, a cancellation to preview — and earn a screen of their own. This
      // is one choice among a handful of saved cards, and sending someone to a new URL to
      // make it loses the row they opened the menu from.
      //
      // Per COMPANY: it sets which saved card THIS one is billed to and moves nothing
      // else. The Billing tab is the whole wallet — add, edit, remove, and which card is
      // the account's main one.
      label: "Change billing account",
      onSelect: () => setCardDialog(true),
    },
    {
      // The same screen withdraws a request that is already waiting, so there is no
      // separate "cancel handover" item: one destination, and it knows which state the
      // company is in. A second row would need to know that too, from data this menu
      // does not have.
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
            ) : item.onSelect ? (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  // Closed FIRST: the dialog takes the focus and the scroll lock, and a
                  // menu left open underneath it reopens on top when the dialog closes.
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={`block w-full cursor-pointer px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-[#F5F7FA] ${
                  item.danger ? "text-[#B42318]" : "text-[#292E38]"
                }`}
              >
                {item.label}
              </button>
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

      <EntityBillingAccountDialog
        open={cardDialog}
        entityId={entity.entity_id}
        entityName={entity.entity_name}
        onClose={() => setCardDialog(false)}
      />
    </div>
  );
}
