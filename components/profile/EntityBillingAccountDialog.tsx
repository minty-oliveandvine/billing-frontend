"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useState } from "react";

import { AddPaymentMethodModal } from "@/components/profile/AddPaymentMethodModal";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import {
  fetchEntityPaymentMethod,
  setEntityPaymentMethod,
  PortalError,
  type EntityPaymentMethod,
  type SavedPaymentMethod,
} from "@/lib/payerPortal";

/**
 * "Change billing account" — which saved card ONE company is billed to.
 *
 * A DIALOG rather than a page, and opened from the row it is about. The other items on
 * that menu leave for a screen because they start something longer (a handover to price
 * and offer, a cancellation to preview); this is one choice among a handful of saved
 * cards, and a new URL would lose the row the menu was opened from.
 *
 * THE SAME CARD LIST AS EVERYWHERE ELSE. The rows are onboarding's `.buynow-pm` and the
 * copy of it Minty's lapsed-trial dialog carries — the same tokens down to the hex:
 * `--line-strong` #d9d9d6, `--accent` #36c3b4, `--accent-soft` #e6f7f4, `--radius-sm`
 * 10px, muted #8a8d8b, ink #1b1d1c. A payer who saved a card during onboarding and
 * chose one again in Minty meets it a third time here; three different-looking lists of
 * the same cards read as three different products.
 *
 * The CHOSEN state is not decoration. A bare radio dot on seven identical rows made the
 * selection genuinely hard to read — which in Minty is how a confirmation naming a card
 * the payer had not chosen got as far as a screenshot.
 *
 * The choice exists at all because it now has a per-company answer. A payer's saved cards
 * are still the payer's, but each company is nominated onto one of them, and the renewal
 * raises one invoice per card charged to that card. Saving here changes what THIS company
 * is charged and moves nothing else the payer owns.
 *
 * THERE IS NO FALLBACK, and the dialog has to say so. A company with no card nominated is
 * not quietly billed on the account default: it is not billed at all, its renewal is
 * skipped and logged, and a trial ending on it expires instead of converting.
 *
 * The account default is the PRESELECTION and nothing more — a suggestion, not what will
 * be charged.
 *
 * The card never reaches this app. Adding one goes through the same Stripe Elements
 * dialog the Billing tab uses; this only ever handles `pm_...` ids.
 */

// Under the add-card modal (z-460), which can open on top of this one.
const overlayClass =
  "dlg-overlay-in fixed inset-0 z-[440] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/45 p-3 sm:p-4";

/** Minty's dialog shell: `rounded-2xl border border-gray-200 bg-white p-6 shadow-sm`. */
const shellClass =
  "dlg-in relative z-[1] my-auto w-full min-w-0 max-w-[520px] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl ring-1 ring-black/5";

/** onboarding `.buynow-pm`, unchosen. */
const rowClass =
  "flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-3 transition-colors";
const rowChosen = "border-[#36c3b4] bg-[#e6f7f4]";
const rowUnchosen = "border-[#d9d9d6] bg-white hover:bg-[#fbfbfa]";

/** The teal text button Minty uses for "Change" / "Use a different card". */
const linkButtonClass =
  "bg-transparent p-0 text-[13.5px] font-semibold text-[#1a9c92] hover:underline disabled:opacity-50";

/** The gradient CTA, from the restart dialog's "Add a card". */
const primaryClass =
  "inline-flex items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#00CBC6] to-[#00D5BF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,203,198,0.28)] transition-shadow hover:shadow-[0_8px_22px_rgba(0,203,198,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

const ghostClass =
  "inline-flex items-center justify-center rounded-[10px] border border-[#d9d9d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#4a4d4b] transition-colors hover:bg-[#fbfbfa]";

/** `.buynow-pm-label` — "Mastercard •••• 7068". */
function methodLine(method: SavedPaymentMethod): string {
  if (!method.last4) return method.label;
  return `${method.brand_label} •••• ${method.last4}`;
}

/**
 * `.buynow-pm-meta` — the expiry, and nothing else.
 *
 * IT USED TO CARRY "· Account default" TOO, appended to the date, which read as part of
 * the date and — on a dialog about ONE company — as a per-company setting. It is neither:
 * it is the payer's account-level default, the card every picker offers first. It is a
 * pill on the rail now, beside the per-company one, where the row on which the two differ
 * is legible at a glance.
 */
function methodMeta(method: SavedPaymentMethod): string {
  return method.expiry
    ? `Expires ${method.expiry}`
    : method.wallet_label || method.brand_label;
}

/** One shape for every flag; only the colour family says which kind it is. */
const pillClass =
  "rounded-full border px-2 py-0.5 text-[11.5px] font-bold tracking-[0.02em] whitespace-nowrap";
const pillNominated = "border-[#b9e7de] bg-[#e6f7f4] text-[#0f7b6c]";
const pillDefault = "border-[#b5ddbd] bg-[#d6edd9] text-[#267347]";
const pillSoon = "border-[#f2d59b] bg-[#fce6bd] text-[#9e690d]";
const pillExpired = "border-[#ffcccc] bg-[#fff1f1] text-[#b4231f]";

function CardRow({
  method,
  checked,
  nominated,
  isDefault,
  onSelect,
}: {
  method: SavedPaymentMethod;
  checked: boolean;
  nominated: boolean;
  isDefault: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={`${rowClass} ${checked ? rowChosen : rowUnchosen}`}>
      <input
        type="radio"
        name="entity-card"
        className="h-4 w-4 cursor-pointer accent-[#36c3b4]"
        checked={checked}
        onChange={onSelect}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-[#1b1d1c]">
          {methodLine(method)}
        </span>
        <span className="truncate text-[12.5px] text-[#8a8d8b]">
          {methodMeta(method)}
        </span>
      </span>
      {/* The flag rail. What the card is to THIS company, then to the account, then how
          close it is to not working — the same pills in the same order as Minty's restart
          screen, its confirmation, and onboarding's sheet.

          An expired card can be selected and WOULD be charged. Said here rather than at
          the failed payment, and "Expiring soon" for the same reason one step earlier:
          the renewal that breaks is off-session, weeks away, with nobody at the keyboard. */}
      {/* STACKED on a narrow screen. Side by side, two pills plus a radio left the card
          label about half the row, so "Visa •••• 5556" broke across two lines and its
          expiry across two more — a four-line row for a card with nothing unusual about
          it. In a column they take one pill's width and the label keeps the rest. */}
      <span className="ml-auto flex flex-none items-center gap-1.5 max-[560px]:flex-col max-[560px]:items-end">
        {nominated ? <span className={`${pillClass} ${pillNominated}`}>Billing this</span> : null}
        {isDefault ? <span className={`${pillClass} ${pillDefault}`}>Default</span> : null}
        {method.expires_soon && !method.expired ? (
          <span className={`${pillClass} ${pillSoon}`}>Expiring soon</span>
        ) : null}
        {method.expired ? <span className={`${pillClass} ${pillExpired}`}>Expired</span> : null}
      </span>
    </label>
  );
}

export function EntityBillingAccountDialog({
  open,
  entityId,
  entityName,
  onClose,
}: {
  open: boolean;
  entityId: string;
  entityName: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [data, setData] = useState<EntityPaymentMethod | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  /**
   * COLLAPSED to the chosen card until the payer asks to change it.
   *
   * Minty collapses the same list for the same reason: seven saved cards made the dialog
   * taller than the viewport and pushed the button off the bottom, and the list is a
   * control somebody wants when changing something, not every time they read which card
   * a company is on.
   */
  const [expanded, setExpanded] = useState(false);

  /**
   * Preselect the company's own card, falling back to the account default.
   *
   * Only ever a PRESELECTION of the default — the fallback is what the picker offers, not
   * what is charged. Nothing is nominated until Save.
   */
  const applied = useCallback((next: EntityPaymentMethod) => {
    setData(next);
    setChosen(next.nominated_id ?? next.default_id ?? null);
  }, []);

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !entityId) return;
    // Re-read on every opening rather than caching: another tab, or the Billing tab in
    // this one, can have removed the card this company was on since the menu was drawn.
    setError(null);
    setSaved(false);
    setExpanded(false);
    const controller = new AbortController();
    fetchEntityPaymentMethod(entityId, controller.signal)
      .then(applied)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof PortalError ? err.message : "That didn't load. Let's try again?",
        );
      });
    return () => controller.abort();
  }, [open, entityId, applied]);

  const save = async () => {
    if (!entityId || !chosen) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      applied(await setEntityPaymentMethod(entityId, chosen));
      setSaved(true);
      setExpanded(false);
    } catch (err) {
      setError(
        err instanceof PortalError ? err.message : "That didn't save. Let's try again?",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const methods = data?.methods ?? [];
  const loading = data === null && error === null;
  const nothingSavedYet = data !== null && methods.length === 0;
  const unnominated = data !== null && data.nominated_id === null;
  const unchanged = chosen !== null && chosen === data?.nominated_id;
  // Collapsed shows the chosen row only. Rendered rather than unmounted for the same
  // reason Minty keeps them: what is chosen has to stay readable off the DOM.
  const shown = expanded ? methods : methods.filter((m) => m.id === chosen);

  return createPortal(
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={shellClass}>
        <div className="flex items-start gap-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-xl font-bold text-gray-900">
            Change billing account
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex-none rounded-lg bg-transparent p-1 leading-none text-[#8a8d8b] hover:bg-[#f5f5f3] hover:text-[#4a4d4b]"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">
              close
            </span>
          </button>
        </div>

        {/* The company on its OWN line, not spliced into a sentence — entity names here
            are free text and routinely long enough to be a sentence themselves. */}
        <p className="mt-1 text-xs font-medium text-gray-500">{entityName}</p>

        <p className="mt-2 text-sm text-gray-600">
          Which saved payment method this company is billed to. Your other companies keep
          the cards they are on.
        </p>

        {/* The rule the whole dialog turns on, stated before the choice rather than after
            it is got wrong: nothing is charged for a company with no card on it. */}
        {unnominated && !nothingSavedYet ? (
          <p className="mt-3 rounded-[10px] border border-[#d9d9d6] bg-[#fbfbfa] px-3 py-2 text-xs text-[#4a4d4b]">
            This company isn&apos;t on any card yet, so nothing can be billed for it — its
            renewal is skipped, and a trial ending on it will expire rather than convert.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-[10px] border border-[#ffcccc] bg-[#fff1f1] px-3 py-2 text-xs text-[#b4231f]">
            {error}
          </p>
        ) : null}

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Billing accounts</h3>
            {methods.length > 1 ? (
              <button
                type="button"
                className={linkButtonClass}
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Done" : "Change"}
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="mt-2 grid gap-2" aria-hidden>
              <div className="h-[58px] animate-pulse rounded-[10px] bg-[#f5f5f3]" />
              <div className="h-[58px] animate-pulse rounded-[10px] bg-[#f5f5f3]" />
            </div>
          ) : nothingSavedYet ? (
            <p className="mt-2 text-sm text-[#4a4d4b]">
              There is no card saved on your billing account yet.
            </p>
          ) : (
            <div className="mt-2 grid max-h-[42vh] gap-2 overflow-y-auto">
              {shown.map((method) => (
                <CardRow
                  key={method.id}
                  method={method}
                  checked={chosen === method.id}
                  nominated={data?.nominated_id === method.id}
                  isDefault={data?.default_id === method.id}
                  onSelect={() => {
                    setChosen(method.id);
                    setSaved(false);
                  }}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            className={`${nothingSavedYet ? `${primaryClass} mt-3` : `${linkButtonClass} mt-2.5`}`}
            onClick={() => setAdding(true)}
          >
            New billing account
          </button>
        </div>

        {saved ? (
          <p className="mt-4 rounded-[10px] border border-[#b9e7de] bg-[#e6f7f4] px-3 py-2 text-xs font-semibold text-[#0f7b6c]">
            Saved — {entityName} is billed to that card from now on.
          </p>
        ) : null}

        {/* Where the OTHER card questions live. Add, edit, remove and the account default
            belong to the wallet, not to this company. */}
        <p className="mt-4 text-xs text-gray-500">
          Editing or removing a card, and choosing the account default, live on{" "}
          <Link href="/profile/billing" className="font-semibold text-[#1a9c92] hover:underline">
            Billing
          </Link>
          . The default is only what this offers first.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
          <button type="button" className={ghostClass} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={primaryClass}
            disabled={saving || !chosen || unchanged}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <AddPaymentMethodModal
        open={adding}
        // Only tells the dialog whether to mention that a first card becomes the account
        // default. It cannot promote anything: no add-card dialog can, in any of the three
        // apps, which is what stops a card added FOR one company re-pointing what every
        // other company's picker offers.
        firstCard={nothingSavedYet}
        onSaved={(refreshed) => {
          setData((current) => (current ? { ...current, ...refreshed } : current));
          // Opened out, because the card they just added is the one they came to choose
          // and a collapsed list would hide it behind "Change".
          setExpanded(true);
          setAdding(false);
        }}
        onClose={() => setAdding(false)}
      />
    </div>,
    document.body,
  );
}
