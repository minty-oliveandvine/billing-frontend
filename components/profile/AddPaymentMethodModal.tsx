"use client";

import {
  AddressElement,
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe,
  type StripeAddressElementChangeEvent,
} from "@stripe/stripe-js";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { pushAppScrollLock } from "@/lib/appScrollRoot";
import {
  confirmCardSetup,
  PortalError,
  startCardSetup,
  type PayerPaymentMethods,
} from "@/lib/payerPortal";

/**
 * Add a card without leaving the app.
 *
 * WHAT MOVED IN-APP IS THE UI, NOT THE CARD. The number is typed into a Stripe-hosted
 * iframe (`PaymentElement`) and confirmed straight against Stripe with a client secret;
 * it never touches this app's JavaScript, Minty's process, or any log. That is what keeps
 * the application out of PCI scope while the screen around it is ours. Nothing in this
 * file should ever be changed to read a card number out of the form.
 *
 * THREE SERVER TRIPS, IN THIS ORDER, AND THE LAST IS NOT OPTIONAL:
 *
 *   1. `startCardSetup`   — a SetupIntent, opened with no customer when the payer has
 *                           none, so abandoning this dialog leaves nothing behind.
 *   2. `stripe.confirmSetup` — the browser to Stripe, directly. Minty is not involved.
 *   3. `confirmCardSetup` — Minty finds out what happened. For a first card this is what
 *                           creates the Stripe customer and attaches the method; skip it
 *                           and the card is saved to nothing and charges nothing.
 *
 * `redirect: "if_required"` keeps step 2 on this page. The SetupIntent is card-only
 * (see `stripe_client.create_setup_intent`), so the only redirect left is 3-D Secure,
 * which Stripe runs in its own modal — and if an issuer ever demands a full redirect,
 * Stripe honours the `return_url` rather than failing.
 */

/**
 * `loadStripe` per publishable key, at module scope.
 *
 * Stripe.js must not be re-initialised on every render — it injects a script tag and
 * rebuilding it mid-flow tears down the mounted iframe. The key arrives from the server
 * rather than an env var (it is Minty that knows which Stripe account is configured), so
 * this is a small cache rather than the single top-level constant the Stripe docs show.
 */
const stripeByKey = new Map<string, Promise<Stripe | null>>();

function stripeFor(key: string): Promise<Stripe | null> {
  let promise = stripeByKey.get(key);
  if (!promise) {
    // Resolves to null rather than rejecting when the script cannot be fetched at all —
    // an ad blocker, a privacy extension or a proxy blocking js.stripe.com. Left to
    // reject it becomes an unhandled promise rejection and the dialog just sits on its
    // skeletons with nothing said.
    promise = loadStripe(key).catch((err: unknown) => {
      console.error("Stripe.js failed to load", err);
      return null;
    });
    stripeByKey.set(key, promise);
  }
  return promise;
}

const overlayClass =
  "dlg-overlay-in fixed inset-0 z-[460] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/45 p-3 backdrop-blur-[2px] sm:p-4";

/**
 * The shell onboarding's `.buynow-sheet` and Minty's card-capture dialog both use: 480px,
 * a 14px radius, a hairline `#ececea` border and a deep soft shadow.
 *
 * This dialog is opened FROM two different design systems — the Billing table and the
 * per-company card picker — and is the same act in both, so it stops being a third look.
 */
const shellClass =
  "dlg-in relative z-[1] my-auto w-full min-w-0 max-w-[480px] overflow-hidden rounded-[14px] border border-[#ececea] bg-white p-6 shadow-[0_20px_48px_rgba(0,0,0,0.22)]";

/**
 * Error text that cannot burst the dialog.
 *
 * `break-words` is load-bearing, not defensive tidying: Stripe's own failures quote the
 * offending value back, and a masked API key is a hundred characters with no space in it.
 * Without a break opportunity the paragraph simply refuses to wrap and the box runs out
 * through the side of the modal and off the page — which is what "Invalid API Key
 * provided: pk_test_****…" did.
 */
const errorClass =
  "rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13.5px] break-words text-rose-800";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

/** onboarding's `.btn-primary`, the CTA on every card dialog in the product. */
const primaryClass = `inline-flex h-11 min-w-[7rem] cursor-pointer items-center justify-center rounded-[10px] bg-gradient-to-r from-[#00CBC6] to-[#00D5BF] px-5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,203,198,0.28)] transition-shadow hover:shadow-[0_8px_22px_rgba(0,203,198,0.4)] disabled:cursor-not-allowed disabled:bg-[#d9d9d6] disabled:bg-none disabled:shadow-none ${focusRing}`;

/** onboarding's `.btn-ghost`. */
const ghostClass = `inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[#d9d9d6] bg-white px-5 text-sm font-semibold text-[#4a4d4b] transition-colors hover:bg-[#f5f5f3] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

/**
 * The mandate, word for word as onboarding and Minty print it.
 *
 * NOT fine print, and deliberately not shrunk below the text around it: `terms.card: never`
 * on the Payment Element suppresses Stripe's own authorisation line, which renders inside
 * the iframe and names the STRIPE ACCOUNT rather than Minty — in test mode it reads "you
 * allow Cash sandbox to charge your card". Suppressing it moves the disclosure onto this
 * sentence, so THE TWO MAY NOT BE CHANGED SEPARATELY: delete this and the dialog stores a
 * payment method having told the payer nothing about what it may be used for.
 *
 * `(Details)` is inert here exactly as it is in the other two, and for the same reason —
 * the Subscription Terms document it names does not exist yet.
 */
const mandateClass =
  "mt-3.5 text-[13px] leading-[1.5] text-[#8a8d8b] [overflow-wrap:anywhere]";

/**
 * The form itself. Split out because `useStripe`/`useElements` only work INSIDE
 * `<Elements>`, and `<Elements>` cannot be mounted until the client secret has arrived.
 */
function CardForm({
  setupIntent,
  firstCard,
  onSaved,
  onCancel,
}: {
  setupIntent: string;
  /**
   * Whether this is the first card on the account. SAYS SOMETHING, DECIDES NOTHING — the
   * server promotes a first card on its own (an account whose only method is not the
   * default has nothing for dunning to point at), and this only lets the dialog tell the
   * payer that is about to happen.
   */
  firstCard: boolean;
  onSaved: (methods: PayerPaymentMethods) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dead, setDead] = useState(false);
  /**
   * The billing name and address, from the Address Element beside the card.
   *
   * Held here and passed explicitly at confirm time rather than relying on Stripe merging
   * the two Elements for us. It does — an Address Element in `billing` mode inside the
   * same group is applied to the PaymentMethod — but the card fields are told `never` to
   * ask for these, and a silent dependency on that merge is how a card ends up saved with
   * no address at all.
   */
  const [billing, setBilling] = useState<
    StripeAddressElementChangeEvent["value"] | null
  >(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || busy) return;

    setBusy(true);
    setError(null);

    // Runs the Element's own validation first, so an empty or malformed field is caught
    // in the form rather than as a confirm failure.
    const submitted = await elements.submit();
    if (submitted.error) {
      setError(submitted.error.message ?? "Please check the card details.");
      setBusy(false);
      return;
    }

    const { error: confirmError, setupIntent: confirmed } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
        ...(billing
          ? {
              payment_method_data: {
                billing_details: {
                  name: billing.name,
                  address: billing.address,
                },
              },
            }
          : {}),
      },
      redirect: "if_required",
    });

    if (confirmError) {
      // Stripe's message is written for the cardholder ("Your card was declined.") and is
      // the only account of what the issuer actually said, so it is shown as written.
      setError(confirmError.message ?? "That card couldn't be saved.");
      setBusy(false);
      return;
    }

    try {
      // The card exists at Stripe now; this is what makes it the account's. For a first
      // card it is also what creates the customer, so a failure here is not cosmetic —
      // the method would sit attached to nothing.
      // No `make_default`. THIS DIALOG NEVER PROMOTES A CARD — `confirmCardSetup`
      // defaults it to false, and the server still makes a FIRST card the default by
      // itself. Promoting any later one is the Billing table's "Make default".
      const methods = await confirmCardSetup(confirmed?.id ?? setupIntent);
      onSaved(methods);
    } catch (e) {
      setError(
        e instanceof PortalError
          ? e.message
          : "The card was saved with our payment provider, but we couldn't finish adding it. Refresh and check before trying again.",
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-5">
      {/* `loaderror` is the Element itself failing to come up — a blocked js.stripe.com,
          a client secret it cannot fetch, a publishable key from another account. Left
          unhandled, react-stripe-js logs "Unhandled ... loaderror" to the console and the
          dialog shows an empty box forever, which is indistinguishable from "the button
          does nothing". Stripe's own message is the only account of what went wrong, so
          it is surfaced and also logged in full — the event carries detail the string
          does not. */}
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={(event) => {
          console.error("Stripe PaymentElement failed to load", event);
          setDead(true);
          setError(
            event?.error?.message ??
              "The card form couldn't load. If you're running an ad blocker or privacy extension, allow js.stripe.com and try again.",
          );
        }}
        options={{
          layout: "tabs",
          // Stripe's own mandate line, suppressed. It renders inside the iframe and names
          // the STRIPE ACCOUNT rather than Minty — "you allow Cash sandbox to charge your
          // card" in test mode. The sentence below replaces it and is therefore the
          // disclosure, not decoration; the two go together or not at all.
          terms: { card: "never" },
          // Asked for below instead, by the Address Element. Left on "auto" the card
          // fields collect a country and a postcode of their own, and the payer fills the
          // same two boxes twice.
          fields: { billingDetails: { name: "never", address: "never" } },
        }}
      />

      {/* The cardholder and the full billing address.

          Worth the extra fields rather than Stripe's minimal default: the name and address
          are what the issuer runs its AVS checks against, so a card saved without them is
          likelier to be declined off-session — which here means a failed renewal weeks
          later, with nobody at the keyboard to fix it. They are also the only fields the
          Edit dialog can change afterwards, and until now the only way to set them at all
          was to add the card and then edit it. */}
      <div className="mt-4">
        <AddressElement
          options={{ mode: "billing", display: { name: "full" } }}
          onChange={(event) => setBilling(event.complete ? event.value : null)}
        />
      </div>

      {/* WHERE THE "MAKE THIS MY DEFAULT" CHECKBOX USED TO BE, and it is not coming back.
          Adding a card and promoting one are two decisions, and joining them meant a card
          added FOR one company could re-point what every other company's picker offered.
          Promoting is now one control in one place: Billing → the card's menu → "Make
          default". A payer's FIRST card still becomes the default, decided server-side. */}
      {firstCard ? (
        <p className="mt-4 text-[12.5px] text-[#6B7380]">
          This is the first payment method on your billing account, so it is the one card
          pickers will offer first.
        </p>
      ) : null}

      <p className={mandateClass}>
        By providing your payment method, you authorise Minty to charge applicable
        subscription fees in accordance with the Subscription Terms.{" "}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="font-semibold text-[#1a9c92] underline underline-offset-2 hover:text-[#36c3b4]"
        >
          (Details)
        </a>
      </p>

      {error ? (
        <p className={`mt-4 ${errorClass}`} role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={ghostClass} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          className={primaryClass}
          disabled={!stripe || !ready || busy || dead}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function AddPaymentMethodModal({
  open,
  firstCard,
  onSaved,
  onClose,
}: {
  open: boolean;
  /** Purely for the line of copy — see `CardForm`. */
  firstCard: boolean;
  onSaved: (methods: PayerPaymentMethods) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [handle, setHandle] = useState<{
    clientSecret: string;
    publishableKey: string;
    setupIntent: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The in-flight `startCardSetup()` for this opening — the PROMISE, not a boolean.
   *
   * A boolean guard was wrong in a way only Strict Mode shows: React mounts effects
   * twice in development, the first mount's cleanup cancelled its own fetch, and the
   * second mount saw the flag already set and returned without starting one. Nothing ever
   * called `setHandle`, so the dialog sat on its skeletons forever — "Add payment method
   * does nothing", with no error anywhere because nothing had failed.
   *
   * Holding the promise instead means both mounts await the SAME request: one
   * SetupIntent, and whichever mount is still alive resolves it.
   */
  const pending = useRef<Promise<{ client_secret: string; publishable_key: string; setup_intent: string }> | null>(null);

  const close = useCallback(() => {
    // The SetupIntent is left to expire on its own. Nothing was attached and no customer
    // was created, so an abandoned one costs nothing — which is the whole reason the
    // customer is created at confirm time rather than here.
    setHandle(null);
    setError(null);
    pending.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;

    // ONE intent per opening, shared across mounts — a second one would swap the client
    // secret under an Element that has already mounted against the first.
    if (!pending.current) pending.current = startCardSetup();
    const request = pending.current;

    let cancelled = false;
    request
      .then((result) => {
        if (cancelled) return;
        setHandle({
          clientSecret: result.client_secret,
          publishableKey: result.publishable_key,
          setupIntent: result.setup_intent,
        });
      })
      .catch((e: unknown) => {
        // Let the next opening try again rather than replaying a failure forever.
        if (pending.current === request) pending.current = null;
        if (cancelled) return;
        setError(
          e instanceof PortalError
            ? e.message
            : "The card form didn't open. Mind trying again?",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className={shellClass}>
        <h2 id={titleId} className="text-lg font-bold text-[#1b1d1c]">
          New billing account
        </h2>
        <p className="mt-1.5 text-[13.5px] text-[#4a4d4b]">
          Card details are held by our payment provider, Stripe — they are never stored by
          Minty.
        </p>

        {error ? (
          <>
            <p className={`mt-5 ${errorClass}`} role="alert">
              {error}
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" className={ghostClass} onClick={close}>
                Close
              </button>
            </div>
          </>
        ) : handle ? (
          <Elements
            stripe={stripeFor(handle.publishableKey)}
            // NO `appearance`. Stripe's stock theme, the same as Minty's capture dialog
            // and onboarding's sheet — the three used to disagree only here, so the same
            // card form looked like a different form depending on which app opened it.
            // Half-theming an iframe is also worse than not theming it: the variables set
            // one accent and left the rest of Stripe's palette alone, which read as a
            // form that had been styled and then abandoned.
            options={{ clientSecret: handle.clientSecret }}
          >
            <CardForm
              setupIntent={handle.setupIntent}
              firstCard={firstCard}
              onSaved={onSaved}
              onCancel={close}
            />
          </Elements>
        ) : (
          <div className="mt-6 space-y-3" aria-live="polite">
            <div className="h-11 animate-pulse rounded-lg bg-[#EEF1F4]" />
            <div className="h-11 animate-pulse rounded-lg bg-[#F3F5F7]" />
            <div className="h-11 animate-pulse rounded-lg bg-[#F3F5F7]" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
