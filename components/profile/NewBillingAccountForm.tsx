"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  fetchBillingFormOptions,
  fetchPayerBilling,
  PortalError,
  startPaymentMethodUpdate,
  type BillingFormOptions,
} from "@/lib/payerPortal";

/**
 * "Billing account" — one screen, two jobs.
 *
 * With no `entityId` it is the blank form behind + New billing account. With one it is
 * the same layout showing the account that company bills to, which is what "View billing
 * account" on the table opens. One component rather than a form and a near-identical
 * read-only twin: the fields, the sections and the order are the same either way, and the
 * only real difference is whether they can be typed into.
 *
 * VIEW MODE IS THE SAME ACCOUNT FROM EVERY ROW. `user_stripe_customer` is one row per
 * payer, and `renewals` bills every company on one invoice against that one Stripe
 * customer — so what changes between rows is the entity, country and plan, not the card.
 * The note under the payment section says so, because two rows showing identical card
 * details otherwise reads as a bug.
 *
 * Save is disabled in BOTH modes. Two separate things have to land before it can be
 * enabled, and neither is cosmetic:
 *
 * 1. THERE IS NOWHERE TO SAVE IT. `user_stripe_customer` holds one row per payer, and
 *    `renewals` / `issue_invoice` charge that one customer. A second billing account
 *    needs a table, a Stripe customer per account, entities pointed at one, and dunning
 *    and renewals moved off the payer.
 *
 * 2. THE CARD FIELDS MUST NOT STAY. Card number and CVC are rendered here because the
 *    design draws them, but a real PAN must never reach our servers — that is what puts
 *    an application in PCI scope. When this is wired they get replaced by Stripe
 *    Elements (or a setup-mode Checkout, which is what the rest of the app already
 *    uses), so the number goes straight to Stripe and we only ever hold a token.
 *
 * Because of (2) the card inputs carry `autoComplete="off"`. A browser offering to fill
 * a REAL card into a form that cannot submit is the one way a mock like this could do
 * actual harm.
 *
 * The dropdown contents come from Minty's registries rather than being typed in here —
 * see `fetchBillingFormOptions`.
 */

/**
 * What an empty field means in VIEW mode.
 *
 * Stripe only holds what was captured when the card was saved, and `billing_details.name`
 * is frequently null — the setup Checkout does not require it. A blank disabled box reads
 * as "this failed to load"; saying "Not on file" says the true thing, which is that
 * nobody ever entered it.
 *
 * Deliberately NOT filled from the payer's name or the Stripe customer's. Neither is the
 * cardholder — a finance lead's card sits on a director's account often enough that
 * putting the wrong name against a card number is a real risk, not a pedantic one.
 */
const NOT_ON_FILE = "Not on file";

const LABEL = "block text-sm font-semibold text-[#374151]";
const FIELD =
  "mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-3 text-[15px] text-[#16202E] transition-colors placeholder:text-[#9CA3AF] focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:cursor-not-allowed disabled:bg-gray-50";
const SECTION = "text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9AA3AE]";

export function NewBillingAccountForm({ entityId }: { entityId?: string }) {
  const viewing = Boolean(entityId);

  const [options, setOptions] = useState<BillingFormOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  /**
   * Hand off to Stripe's own payment-method form. Nothing is captured here — that is
   * exactly why the fields below stay disabled even in "new" mode.
   *
   * `updatingCard` is not reset on success: the browser leaves, and flicking the label
   * back would invite a second click into the same redirect.
   */
  const handleUpdateCard = async () => {
    setUpdatingCard(true);
    setCardError(null);
    try {
      window.location.href = await startPaymentMethodUpdate(
        entityId
          ? `/profile/billing/account?entity=${encodeURIComponent(entityId)}`
          : "/profile/billing",
      );
    } catch (e) {
      setCardError(
        e instanceof PortalError
          ? e.message
          : "Could not open the payment form. Let's try again?",
      );
      setUpdatingCard(false);
    }
  };

  const [entityName, setEntityName] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("active");
  const [cardholder, setCardholder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    fetchBillingFormOptions(controller.signal)
      .then(setOptions)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Losing the option lists costs the dropdowns, not the page.
        setOptionsError(true);
      });
    return () => controller.abort();
  }, []);

  // View mode: fill the same fields from the real account.
  useEffect(() => {
    if (!entityId) return;
    const controller = new AbortController();
    fetchPayerBilling(controller.signal)
      .then((billing) => {
        const entity = billing.entities.find((e) => e.entity_id === entityId);
        if (!entity) {
          setLoadError("That company isn't billing to this account.");
          return;
        }
        setEntityName(entity.entity_name);
        setCountry(entity.country_code ?? "");
        setPlan(entity.plan_code ?? "");
        setStatus(entity.status);
        setCurrency(billing.account.currency ?? "");
        // Stripe's own cardholder, never the payer's name as a stand-in — the two are
        // often different people.
        setCardholder(billing.account.card?.cardholder ?? "");
        setCardNumber(
          billing.account.card?.last4
            ? `•••• •••• •••• ${billing.account.card.last4}`
            : (billing.account.card?.label ?? ""),
        );
        setExpiry(billing.account.card?.expiry ?? "");
        // CVC is never retrievable from Stripe, by design. Left blank rather than
        // dotted, so nothing on screen implies we hold it.
        setCvc("");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError("Hmm, that account didn't come through. Let's give it another go?");
      });
    return () => controller.abort();
  }, [entityId]);

  const selectPlaceholder = optionsError
    ? "Couldn't load options"
    : options
      ? "Select…"
      : "Loading…";

  return (
    <div className="w-full max-w-[62rem]">
      {loadError ? (
        <div
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#E6EBED] bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.05)] sm:p-10">
        {/* Account ------------------------------------------------------- */}
        <p className={SECTION}>Account</p>

        <div className="mt-5">
          <label htmlFor="entityName" className={LABEL}>
            Entity name
          </label>
          <input
            id="entityName"
            type="text"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            className={FIELD}
            disabled={viewing}
            placeholder="Registered company name"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="country" className={LABEL}>
              Country
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={FIELD}
            disabled={viewing}
            >
              <option value="">{selectPlaceholder}</option>
              {options?.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="currency" className={LABEL}>
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={FIELD}
            disabled={viewing}
            >
              <option value="">{selectPlaceholder}</option>
              {options?.currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="my-8 border-[#EEF1F4]" />

        {/* Plan ---------------------------------------------------------- */}
        <p className={SECTION}>Plan</p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="plan" className={LABEL}>
              Plan type
            </label>
            <select
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className={FIELD}
            disabled={viewing}
            >
              <option value="">{selectPlaceholder}</option>
              {/* Keyed by the module SET — "Super Minty" is the two-module bundle, and
                  the bundle IS the discount, so it is one option rather than two ticks. */}
              {options?.plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className={LABEL}>
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={FIELD}
            disabled={viewing}
            >
              {options?.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              )) ?? <option value="active">Active</option>}
            </select>
          </div>
        </div>

        <hr className="my-8 border-[#EEF1F4]" />

        {/* Payment method ------------------------------------------------ */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={SECTION}>Payment method</p>
          {/* Above the fields, not below them: it is the way to CHANGE the card, and the
              fields under it are read-only. Offering it after they have been read (or
              typed into, on a form that cannot save) puts it where it is no longer the
              answer.

              Live only in view mode. On the blank form there is no account for a card to
              attach to — the same wall Save is behind. */}
          <button
            type="button"
            onClick={viewing ? handleUpdateCard : undefined}
            disabled={!viewing || updatingCard}
            title={
              viewing
                ? "Opens Stripe's secure form. Covers every company on this account."
                : "Save the billing account first — there's nothing for a card to attach to yet."
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-secondary bg-white px-4 py-2 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:border-[#D8DEE4] disabled:text-[#B4BAC3] disabled:hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
              credit_card
            </span>
            {updatingCard
              ? "Opening…"
              : viewing
                ? "Update payment method"
                : "Add payment method"}
          </button>
        </div>

        {cardError ? (
          <p
            className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
            role="alert"
          >
            {cardError}
          </p>
        ) : null}

        <div className="mt-5">
          <label htmlFor="cardholder" className={LABEL}>
            Cardholder name
          </label>
          <input
            id="cardholder"
            type="text"
            value={cardholder}
            onChange={(e) => setCardholder(e.target.value)}
            className={FIELD}
            disabled={viewing}
            placeholder={viewing ? NOT_ON_FILE : "Name as shown on the card"}
            autoComplete="off"
          />
        </div>

        <div className="mt-5">
          <label htmlFor="cardNumber" className={LABEL}>
            Card number
          </label>
          <input
            id="cardNumber"
            type="text"
            inputMode="numeric"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            className={FIELD}
            disabled={viewing}
            // The card placeholders are Stripe Elements' own ("1234 1234 1234 1234",
            // "MM / YY", "CVC"). These three inputs get replaced by Elements before Save
            // is enabled — see the file header — and matching its copy now means that
            // swap changes the behaviour without changing the look.
            placeholder={viewing ? NOT_ON_FILE : "1234 1234 1234 1234"}
            // Deliberately off — see the file header. This form cannot submit, and a
            // browser filling a real card into it would be the only way it could hurt.
            autoComplete="off"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="expiry" className={LABEL}>
              Expiry (MM/YY)
            </label>
            <input
              id="expiry"
              type="text"
              inputMode="numeric"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className={FIELD}
            disabled={viewing}
              placeholder={viewing ? NOT_ON_FILE : "MM / YY"}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="cvc" className={LABEL}>
              CVC
            </label>
            <input
              id="cvc"
              type="text"
              inputMode="numeric"
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              className={FIELD}
            disabled={viewing}
              // Not "Not on file" — a CVC is never stored by anyone, including Stripe,
              // so "we don't have it" would understate a deliberate rule.
              placeholder={viewing ? "Never stored" : "CVC"}
              autoComplete="off"
            />
          </div>
        </div>

        {viewing ? (
          /* The reason two rows show the same card. Sits under the payment section
             because that is where the reader is when the question occurs to them. */
          <p className="mt-5 rounded-lg bg-[#F5F7FA] px-3.5 py-3 text-xs leading-relaxed text-[#6B7380]">
            This is the one account every company you pay for bills to — same renewal
            date, same payment method, one invoice. Opening it from another row shows the
            same card.
          </p>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/profile/billing"
            className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#D8DEE4] bg-white px-6 py-3 text-[15px] font-semibold text-[#292E38] transition-colors hover:bg-[#F5F7FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            {viewing ? "Back to billing" : "Cancel"}
          </Link>
          <button
            type="button"
            disabled
            title={
              viewing
                ? "Editing a billing account isn't wired up yet — the card fields need to move to Stripe first."
                : "Saving isn't wired up yet — there's one billing account per person for now, and the card fields need to move to Stripe before any of this is stored."
            }
            className="inline-flex cursor-not-allowed items-center justify-center rounded-[10px] bg-secondary/40 px-6 py-3 text-[15px] font-semibold text-white"
          >
            Save billing account
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-[52rem] text-xs leading-relaxed text-[#6B7380]">
        {viewing
          ? "Read-only for now. Editing a billing account is switched off until the card fields move to Stripe."
          : "Preview only. Saving is switched off: there is one billing account per person today, and the card fields move to Stripe before anything entered here is stored."}
      </p>
    </div>
  );
}
