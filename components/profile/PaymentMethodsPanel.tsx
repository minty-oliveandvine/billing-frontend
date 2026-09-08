"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { AddPaymentMethodModal } from "@/components/profile/AddPaymentMethodModal";
import { Pagination } from "@/components/profile/Pagination";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import {
  fetchPaymentMethods,
  PortalError,
  removePaymentMethod,
  setDefaultPaymentMethod,
  updatePaymentMethod,
  type PayerPaymentMethods,
  type SavedPaymentMethod,
} from "@/lib/payerPortal";

/**
 * "Billing accounts" — one row per saved payment method.
 *
 * A ROW USED TO BE A COMPANY, and that was the misreading this table was built to end:
 * the account's single card was reprinted under every company name, so three rows looked
 * like three billing accounts holding three cards. The rows are the METHODS, and the two
 * columns that genuinely belonged to a company (plan, status) live on Manage
 * Subscriptions, which is the tab about companies.
 *
 * WHICH CARD PAYS FOR WHICH COMPANY IS NOT DECIDED HERE. Each company is nominated onto
 * one saved method — Manage Subscriptions → ⋮ → "Change billing account" — and a renewal
 * raises one invoice per card, charged to that card. This screen is the wallet: what is
 * saved, what is expiring, and what can be removed.
 *
 * THE DEFAULT NOMINATES NOTHING. It is the card the pickers offer first, and therefore
 * what a newly nominated company is likely to end up on. Promoting one here changes what
 * is charged for nothing that is already running — it used to change it for everything,
 * which is why the wording matters.
 *
 * The card never reaches this app — see `AddPaymentMethodModal`. Every field rendered
 * here is display metadata Stripe hands back about a card it holds: brand, last four,
 * expiry, funding type, issuing country, and the billing name and address. There is no
 * card number to have.
 *
 * WHAT THE SERVER REFUSES, shown verbatim rather than replaced: the default cannot be
 * removed while another method could take its place (Stripe clears the default on
 * detach), and the last method cannot be removed at all while something is still billing
 * to it (the next renewal would decline into dunning). Each refusal names its own fix,
 * which a generic "couldn't remove that" would throw away.
 *
 * Sorting is client-side, like the table it replaces: the set is one account's saved
 * methods — a handful, unpaged — and every key is already in hand.
 */

/** Rows per page. Matches Manage Subscriptions, whose rows are the same height. */
const PER_PAGE = 6;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

const primaryClass = `inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

/**
 * The card's own header action, matching Export CSV on the Invoices tab.
 *
 * Same geometry as that button — `px-4 py-2.5`, no fixed height, no shadow — rather than
 * the `h-11` form button used inside the dialogs. The two sit in the same position on
 * adjacent tabs, so a difference in height or shadow reads as one of them being wrong.
 */
const headerActionClass = `inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

const ghostClass = `inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-[#D8DEE4] bg-white px-4 text-sm font-semibold text-[#4B5563] transition-colors hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

const dangerClass = `inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-[#B42318] px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

const fieldClass = `h-11 w-full rounded-lg border border-[#D8DEE4] bg-white px-3 text-[15px] text-[#21262E] outline-none transition-colors focus:border-[#2E9B9B] ${focusRing}`;

const labelClass = "block text-[13px] font-semibold text-[#4B5563]";

const overlayClass =
  "dlg-overlay-in fixed inset-0 z-[460] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/45 p-3 sm:p-4";

const shellClass =
  "dlg-in relative z-[1] my-auto w-full min-w-0 max-w-[480px] overflow-hidden rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:p-6";

// --- The status column -------------------------------------------------------
//
// TWO INDEPENDENT FACTS, SHOWN TOGETHER. "Is this the one being charged" and "is this
// card still good" are not alternatives, and the row where they differ is the important
// one: a default that has expired is the row that stops the money on every company on the
// account. Collapsing them to a single pill hid exactly that — an expired default read
// "Expired" and no longer admitted to being the default.
//
// So Default is its own pill and the expiry state sits beside it, and a method that is
// neither falls back to "Saved" so the cell is never blank.

type ExpiryState = "expired" | "expiring" | null;

/**
 * The flag pills, in the shape every card list in the product uses: a bordered
 * `rounded-full` capsule rather than the square borderless chip this table had of its own.
 * Same fact, same card, three apps — it should not be three different-looking labels.
 */
const DEFAULT_PILL = "border-[#b5ddbd] bg-[#d6edd9] text-[#267347]";
const SAVED_PILL = "border-[#e3e8ec] bg-[#f2f5f7] text-[#949ca6]";

const EXPIRY_STYLES: Record<"expired" | "expiring", string> = {
  expired: "border-[#ffcccc] bg-[#fff1f1] text-[#b4231f]",
  expiring: "border-[#f2d59b] bg-[#fce6bd] text-[#9e690d]",
};

const EXPIRY_LABELS: Record<"expired" | "expiring", string> = {
  expired: "Expired",
  expiring: "Expiring soon",
};

function expiryStateOf(method: SavedPaymentMethod): ExpiryState {
  if (method.expired) return "expired";
  if (method.expires_soon) return "expiring";
  return null;
}

/**
 * Worst first, so anything needing a decision sorts to the top — and within that, the
 * default first, because a problem on the card being charged outranks the same problem on
 * a spare nothing depends on.
 */
function statusRank(method: SavedPaymentMethod): number {
  const expiry = expiryStateOf(method);
  const severity = expiry === "expired" ? 0 : expiry === "expiring" ? 2 : 4;
  return severity + (method.is_default ? 0 : 1);
}

type SortKey = "name" | "type" | "country" | "expiry" | "status";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Payment method" },
  { key: "type", label: "Type" },
  { key: "country", label: "Country" },
  { key: "expiry", label: "Expiry date" },
  { key: "status", label: "Status" },
];

/**
 * "Credit card · Visa · Apple Pay", or just "Link" for a wallet with no card behind it.
 *
 * `funding` is Stripe's own classification of the card (credit / debit / prepaid), not a
 * guess from the brand — a debit Visa and a credit Visa are the same brand and behave
 * differently at the issuer.
 *
 * The wallet is the last part and not the first: what gets charged is the card, but the
 * payer added it through Apple Pay and will not recognise a row that only names the
 * plastic underneath.
 */
function typeOf(method: SavedPaymentMethod): string {
  if (method.type !== "card") return method.wallet_label ?? method.brand_label;
  const funding = method.funding
    ? `${method.funding.charAt(0).toUpperCase()}${method.funding.slice(1)} card`
    : "Card";
  return [funding, method.brand_label, method.wallet_label]
    .filter(Boolean)
    .join(" · ");
}

/**
 * "Mastercard •••• 7068".
 *
 * ONE group of dots, not four. The long form printed the same card as
 * "Mastercard •••• •••• •••• 7068" here and "Mastercard •••• 7068" in every picker, which
 * is a difference a payer comparing the two screens has to stop and resolve. The short
 * form wins because the pickers are where a card is chosen and the row is narrow there.
 */
function methodLine(method: SavedPaymentMethod): string {
  if (!method.last4) return method.label;
  return `${method.brand_label} •••• ${method.last4}`;
}

function sortValue(method: SavedPaymentMethod, key: SortKey): string | number {
  if (key === "type") return typeOf(method).toLowerCase();
  if (key === "country") return (method.country_name ?? "").toLowerCase();
  if (key === "status") return statusRank(method);
  if (key === "expiry") {
    // Compared as a number, never as "MM/YY" text — that sorts 01/40 above 12/26. A
    // method with no expiry (a wallet) parks at the end rather than at the front.
    if (!method.exp_year || !method.exp_month) return Number.MAX_SAFE_INTEGER;
    return method.exp_year * 12 + method.exp_month;
  }
  return methodLine(method).toLowerCase();
}

const pillClass =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-bold tracking-[0.02em]";

function StatusCell({ method }: { method: SavedPaymentMethod }) {
  const expiry = expiryStateOf(method);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {method.is_default ? (
        <span className={`${pillClass} ${DEFAULT_PILL}`}>Default</span>
      ) : null}
      {expiry ? (
        <span className={`${pillClass} ${EXPIRY_STYLES[expiry]}`}>
          {EXPIRY_LABELS[expiry]}
        </span>
      ) : null}
      {!method.is_default && !expiry ? (
        <span className={`${pillClass} ${SAVED_PILL}`}>Saved</span>
      ) : null}
    </div>
  );
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span
      className={`material-symbols-outlined text-[14px] leading-none ${active ? "text-[#2E9B9B]" : "text-[#9EA6B0]"}`}
      aria-hidden
    >
      {active ? (dir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
    </span>
  );
}

// --- Dialogs -----------------------------------------------------------------

/** A small dialog shell — the same chrome the add-card modal uses. */
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => pushAppScrollLock(), []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={shellClass}>
        <h2 id={titleId} className="text-lg font-bold text-[#21262E]">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Edit what Stripe actually allows to change on a saved method.
 *
 * NOT a way to replace the card. A number, brand or CVC cannot be edited — a different
 * card is a different PaymentMethod — so this is the reissued expiry and the name and
 * address the issuer checks against, which are real causes of a decline on a card the
 * payer believes is fine. The dialog says as much, or the missing card-number field reads
 * as a bug.
 */
function EditDialog({
  method,
  onSaved,
  onClose,
}: {
  method: SavedPaymentMethod;
  onSaved: (methods: PayerPaymentMethods) => void;
  onClose: () => void;
}) {
  const isCard = Boolean(method.exp_month && method.exp_year);
  const [expMonth, setExpMonth] = useState(String(method.exp_month ?? ""));
  const [expYear, setExpYear] = useState(String(method.exp_year ?? ""));
  const [name, setName] = useState(method.cardholder ?? "");
  const [line1, setLine1] = useState(method.address.line1 ?? "");
  const [city, setCity] = useState(method.address.city ?? "");
  const [postal, setPostal] = useState(method.address.postal_code ?? "");
  const [country, setCountry] = useState(method.address.country ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const methods = await updatePaymentMethod(method.id, {
        ...(isCard && expMonth && expYear
          ? { exp_month: Number(expMonth), exp_year: Number(expYear) }
          : {}),
        name,
        address: {
          line1: line1 || null,
          city: city || null,
          postal_code: postal || null,
          // Stripe wants a two-letter code here; anything else is refused by the API.
          country: country ? country.toUpperCase().slice(0, 2) : null,
        },
      });
      onSaved(methods);
    } catch (e) {
      setError(
        e instanceof PortalError ? e.message : "That didn't save. Mind trying again?",
      );
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Edit ${method.label}`} onClose={onClose}>
      <p className="mt-1.5 text-[13.5px] text-[#6B7380]">
        The card number can&apos;t be changed — to use a different card, add it and remove
        this one.
      </p>
      <form onSubmit={save} className="mt-5 space-y-4">
        {isCard ? (
          <div>
            <span className={labelClass}>Expiry</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                aria-label="Expiry month"
                inputMode="numeric"
                maxLength={2}
                value={expMonth}
                onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ""))}
                placeholder="MM"
                className={`${fieldClass} w-20`}
              />
              <span className="text-[#9EA6B0]">/</span>
              <input
                aria-label="Expiry year"
                inputMode="numeric"
                maxLength={4}
                value={expYear}
                onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ""))}
                placeholder="YYYY"
                className={`${fieldClass} w-28`}
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelClass} htmlFor="pm-name">
            Name on the payment method
          </label>
          <input
            id="pm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${fieldClass} mt-1.5`}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="pm-line1">
            Billing address
          </label>
          <input
            id="pm-line1"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            placeholder="Street address"
            className={`${fieldClass} mt-1.5`}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              aria-label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className={fieldClass}
            />
            <input
              aria-label="Postal code"
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="Postal code"
              className={fieldClass}
            />
            <input
              aria-label="Country code"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country (HK)"
              maxLength={2}
              className={`${fieldClass} uppercase`}
            />
          </div>
        </div>

        {error ? (
          <p
            className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13.5px] break-words text-rose-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className={ghostClass} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={primaryClass} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Removal, confirmed.
 *
 * The confirmation is not ceremony: the method may be the one every company on the
 * account is charged to, and the server's two refusals land HERE rather than as a toast
 * on a row that already looks gone.
 */
function RemoveDialog({
  method,
  onRemoved,
  onClose,
}: {
  method: SavedPaymentMethod;
  onRemoved: (methods: PayerPaymentMethods) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      onRemoved(await removePaymentMethod(method.id));
    } catch (e) {
      setError(
        e instanceof PortalError ? e.message : "That didn't remove. Mind trying again?",
      );
      setBusy(false);
    }
  };

  return (
    <Dialog title="Remove payment method" onClose={onClose}>
      <p className="mt-2 text-[14.5px] text-[#4B5563]">
        Remove <span className="font-semibold text-[#21262E]">{method.label}</span> from
        this billing account?
      </p>
      {method.is_default ? (
        <p className="mt-2 text-[13.5px] text-[#6B7380]">
          This is the method your invoices are currently charged to.
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13.5px] break-words text-amber-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={ghostClass} onClick={onClose} disabled={busy}>
          Keep it
        </button>
        <button type="button" className={dangerClass} onClick={confirm} disabled={busy}>
          {busy ? "Removing…" : "Remove"}
        </button>
      </div>
    </Dialog>
  );
}

// --- The row menu ------------------------------------------------------------

function RowMenu({
  method,
  onMakeDefault,
  onEdit,
  onRemove,
  busy,
}: {
  method: SavedPaymentMethod;
  onMakeDefault: () => void;
  onEdit: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** Opens upward when the row is near the bottom of the window — see `toggle`. */
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Decide the direction BEFORE opening, from the room actually left below the button.
   *
   * The last row is where this matters and it is not a rare case — it is every account
   * with one saved method. Dropping down from there ran the menu off the end of the card
   * and cut "Remove" in half, which is the one item somebody scrolls to that row to find.
   */
  const MENU_HEIGHT = 170;
  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < MENU_HEIGHT);
    }
    setOpen((v) => !v);
  };

  const item =
    "block w-full cursor-pointer px-4 py-2.5 text-left text-[15px] text-[#292E38] transition-colors hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:text-[#B4BAC3]";

  return (
    <div className="relative flex justify-center" ref={ref}>
      <button
        type="button"
        ref={buttonRef}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${method.label}`}
        disabled={busy}
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#828A96] transition-colors hover:bg-[#F2F5F7] hover:text-[#292E38] disabled:cursor-wait ${focusRing}`}
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
          {/* The title has to say what this does NOT do. Companies keep the card they
              are on; the default is only what the pickers offer first. Calling it "make
              default" without that reads as "charge everything to this". */}
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={method.is_default}
            title={
              method.is_default
                ? "This is already the account's main payment method."
                : "Offered first when a company is put on a card. Companies already billing keep theirs."
            }
            onClick={() => {
              setOpen(false);
              onMakeDefault();
            }}
          >
            {method.is_default ? "Already the default" : "Make default"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit details
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-[#B42318] hover:bg-rose-50`}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

// --- The table ---------------------------------------------------------------

export function PaymentMethodsPanel() {
  const [data, setData] = useState<PayerPaymentMethods | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavedPaymentMethod | null>(null);
  const [removing, setRemoving] = useState<SavedPaymentMethod | null>(null);
  // Worst first: an expired card is the row that stops the money.
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  /** The requested page. Read `page` below, which clamps it to what exists. */
  const [pageInput, setPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetchPaymentMethods(controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof PortalError
            ? err.message
            : "Your payment methods didn't come through. Mind trying again?",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => load(), [load, reloadTick]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  /** Every write answers with the fresh list, so nothing here re-fetches to catch up. */
  const applied = (methods: PayerPaymentMethods) => {
    setData(methods);
    setActionError(null);
    setBusyId(null);
    setAdding(false);
    setEditing(null);
    setRemoving(null);
  };

  const makeDefault = async (method: SavedPaymentMethod) => {
    setBusyId(method.id);
    setActionError(null);
    try {
      applied(await setDefaultPaymentMethod(method.id));
    } catch (e) {
      setActionError(
        e instanceof PortalError ? e.message : "That didn't change. Mind trying again?",
      );
      setBusyId(null);
    }
  };

  const sorted = useMemo(() => {
    const list = [...(data?.methods ?? [])];
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortDir]);

  /**
   * Paged in the BROWSER, unlike the other two tabs.
   *
   * They page server-side because their sorts have to be — "worst status first" is
   * computed from access rules that live in Minty, so sorting a page there would order
   * the page rather than the set. This list has no such rule: it is one account's saved
   * methods, already fetched whole in a single Stripe call, and every sort key is a plain
   * string in hand. A round trip per page would buy nothing.
   *
   * `page` is CLAMPED rather than reset in an effect. Removing the last method on page 3
   * leaves the state pointing past the end, and clamping at render shows the new last
   * page immediately instead of flashing an empty table for one frame.
   */
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pageInput, pages);
  const first = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const last = Math.min(page * PER_PAGE, total);
  const rows = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="w-full">
      {/* NOT `overflow-hidden`, which is what a rounded card usually wants: it clips the
          row menus, and the row it clipped worst was the last one — the menu ran past the
          card's edge and lost "Remove". Nothing inside paints into the corners (the cells
          have no background of their own), so the radius survives without it. */}
      <div className="flex min-h-[34rem] flex-col rounded-2xl border border-[#E6EBED] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
        {/* WRAPS, like the Invoices filter row above its own Export CSV button. Held on
            one line, the description squeezed the actions into a two-line button beside a
            three-line paragraph on any phone; wrapping drops them onto their own row
            instead. `items-center` rather than `items-start` so they sit level once they
            share a line on wider screens. */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#21262E]">Billing accounts</h2>
            {/* The one thing this screen has to say out loud, because a list of cards
                above a subscription tab invites the opposite reading.

                IT USED TO SAY invoices are charged to the one marked Default, and that
                stopped being true when each company got its own card: the default
                nominates nothing (see payment_methods.set_default), it only decides what
                the pickers offer first. Left as it was, this line told a payer their
                money followed a card it does not follow. */}
            <p className="mt-1 text-[13px] text-[#6B7380]">
              Used for every company you pay for. Each company is billed to the card it was
              put on;{" "}
              <span className="font-semibold text-[#4B5563]">Default</span> is only the one
              card pickers offer first.
            </p>
          </div>
          {/* The action lives up here so the footer is free for the count and the pager,
              which is where the other two tabs put theirs. Refresh stays the rightmost
              control on all three, so it is in the same corner whichever tab you are on. */}
          {/* Mobile: this group takes the whole wrapped row and splits it — Add on the
              left, refresh on the right, so the icon keeps the right-hand position it
              holds on every other tab instead of trailing the button into the middle.
              `w-full` is what makes that possible: the parent's `justify-between` only
              separates children WITHIN a line, and once the actions wrap to a line of
              their own there is nothing left to push against.

              From `sm` up it shrinks back to its content and `ml-auto` pushes the pair
              right as a unit, beside the title rather than under it. */}
          <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            <button
              type="button"
              className={headerActionClass}
              onClick={() => setAdding(true)}
            >
              <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                add
              </span>
              Add billing account
            </button>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              disabled={loading}
              aria-label="Refresh"
              title="Refresh"
              className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#2E9B9B] transition-colors hover:bg-[#2E9B9B]/10 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
            >
              <span
                className={`material-symbols-outlined text-[20px] leading-none ${loading ? "animate-spin" : ""}`}
                aria-hidden
              >
                refresh
              </span>
            </button>
          </div>
        </div>

        {actionError ? (
          <div
            className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm break-words text-amber-900 sm:mx-6"
            role="alert"
          >
            {actionError}
          </div>
        ) : null}

        <div className="bill-head flex flex-wrap gap-x-6 border-t border-[#E6EBED] px-6 py-3">
          {COLUMNS.map(({ key, label }) => {
            const active = sortKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                aria-label={`Sort by ${label}`}
                className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-left text-[13px] font-semibold transition-colors hover:text-[#292E38] ${focusRing} ${
                  active ? "text-[#292E38]" : "text-[#6B7380]"
                }`}
              >
                <span>{label}</span>
                <SortArrow active={active} dir={sortDir} />
              </button>
            );
          })}
          <span aria-hidden />
        </div>

        <div className="flex-1">
          {error ? (
            <div className="border-t border-[#E6EBED] px-6 py-12 text-center">
              <p className="text-sm text-[#B42318]" role="alert">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setReloadTick((n) => n + 1)}
                className={`${ghostClass} mt-4`}
              >
                Try again
              </button>
            </div>
          ) : loading && !data ? (
            <div className="divide-y divide-[#E6EBED] border-t border-[#E6EBED]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse px-6 py-5">
                  <div className="h-4 w-52 rounded bg-[#EEF1F4]" />
                  <div className="mt-2.5 h-3 w-64 rounded bg-[#F3F5F7]" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="border-t border-[#E6EBED] px-6 py-16 text-center">
              <p className="text-base font-semibold text-[#292E38]">
                No billing account saved yet
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-[#6B7380]">
                {data?.has_account
                  ? "Add one so your subscriptions keep running when the next invoice is raised."
                  : "Nothing has been charged yet. Adding a card here doesn't start a subscription — each company's billing is still confirmed on its own settings page."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E6EBED] border-t border-[#E6EBED]">
              {rows.map((method) => (
                <div
                  key={method.id}
                  className="bill-row flex flex-wrap gap-x-4 gap-y-1 px-4 py-4 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="break-words text-[14.5px] font-semibold text-[#21262E]">
                      {methodLine(method)}
                    </p>
                    {/* Whoever the card is registered to — Stripe's own
                        `billing_details.name`, often not the payer (a finance lead's card
                        on a director's account), so it is shown rather than assumed. */}
                    {method.cardholder ? (
                      <p className="mt-1.5 text-[13px] text-[#6B7380]">
                        <span className="font-semibold text-[#4B5563]">Name:</span>{" "}
                        {method.cardholder}
                      </p>
                    ) : null}
                    {method.added ? (
                      <p className="mt-1 text-[13px] text-[#6B7380]">
                        <span className="font-semibold text-[#4B5563]">Added:</span>{" "}
                        {method.added}
                      </p>
                    ) : null}
                  </div>

                  <div className="break-words text-sm text-[#333B45] lg:pt-0.5">
                    <span className="text-[#6B7380] lg:hidden">Type: </span>
                    {typeOf(method)}
                  </div>

                  {/* Where the card was ISSUED, not the billing address — they disagree
                      constantly and the issuer is the half that isn't visible anywhere
                      else. The title says so, because a row reading "United States" under
                      an address in Manila looks wrong until you know which question is
                      being answered. */}
                  <div
                    className="break-words text-sm text-[#333B45] lg:pt-0.5"
                    title="Where this card was issued. It doesn't have to match the billing address."
                  >
                    <span className="text-[#6B7380] lg:hidden">Country: </span>
                    {method.country_name || "—"}
                  </div>

                  <div className="break-words text-sm text-[#333B45] lg:pt-0.5">
                    <span className="text-[#6B7380] lg:hidden">Expiry date: </span>
                    {method.expiry ?? "—"}
                  </div>

                  <div>
                    <StatusCell method={method} />
                  </div>

                  <RowMenu
                    method={method}
                    busy={busyId === method.id}
                    onMakeDefault={() => makeDefault(method)}
                    onEdit={() => setEditing(method)}
                    onRemove={() => setRemoving(method)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — the count, then the action, matching the other two tabs.
            No pagination: this list is one account's saved methods, a handful at most,
            and it is neither paged nor windowed — so the range is always the whole set,
            and saying "Showing 1–3 of 3" is the honest version of that rather than a
            control that would never do anything. Suppressed while the first load is still
            in flight, so it cannot flash "No billing accounts" at an account that has
            three. */}
        {!error && data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6EBED] px-4 py-4 sm:px-6">
            <p className="text-[13px] font-medium text-[#737A87]">
              {total === 0
                ? "No billing accounts"
                : `Showing ${first}–${last} of ${total} ${
                    total === 1 ? "billing account" : "billing accounts"
                  }`}
            </p>
            {pages > 1 ? (
              <Pagination page={page} pages={pages} onChange={setPage} />
            ) : null}
          </div>
        ) : null}
      </div>

      <AddPaymentMethodModal
        open={adding}
        firstCard={(data?.methods.length ?? 0) === 0}
        onSaved={applied}
        onClose={() => setAdding(false)}
      />
      {editing ? (
        <EditDialog method={editing} onSaved={applied} onClose={() => setEditing(null)} />
      ) : null}
      {removing ? (
        <RemoveDialog
          method={removing}
          onRemoved={applied}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}
