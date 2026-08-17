"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  listIncomingTransfers,
  PortalError,
  respondToTransfer,
  type IncomingTransfer,
} from "@/lib/payerPortal";

/**
 * Requests to take over a company's subscription.
 *
 * The only screen in this portal about companies the viewer does NOT pay for, and the only
 * one a person can arrive at with no subscriptions at all — so it has to make sense cold.
 * Everything else here filters on the payer and is therefore empty for someone who has
 * never been billed; a recipient landing on Manage Subscriptions sees nothing and would
 * reasonably conclude the email was a mistake.
 *
 * ACCEPTING TAKES A PAYMENT. That is stated on the button and priced above it, because
 * "Accept" on its own reads like acknowledging a notification rather than agreeing to a
 * recurring bill. The figure comes from Minty, from the same function that charges it.
 *
 * Retrying is safe. Minty adopts an invoice already paid under the request's key rather
 * than raising a second one, so a double-click or a timeout costs nothing — which is why
 * the button re-enables after a failure instead of locking.
 */

function money(amount: number, currency: string | null) {
  const major = (amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency ? `${currency} ` : ""}${major}`;
}

function day(iso: string | null | undefined) {
  if (!iso) return "";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function IncomingTransfersContent() {
  const [rows, setRows] = useState<IncomingTransfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setRows(await listIncomingTransfers(signal));
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof PortalError
          ? err.message
          : "Hmm, that didn't come through. Let's give it another go?",
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const respond = async (row: IncomingTransfer, accept: boolean) => {
    setBusy(row.id);
    setResult(null);
    try {
      const message = await respondToTransfer(row.id, accept);
      setResult({ id: row.id, message });
      // Re-read rather than dropping the row locally: accepting moves a subscription, and
      // what the server says is now true is worth more than what this component assumed.
      await load();
    } catch (err) {
      setResult({
        id: row.id,
        message:
          err instanceof PortalError
            ? err.message
            : "That didn't go through. Let's try again?",
      });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div
        className="w-full max-w-[62rem] rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="flex w-full max-w-[62rem] flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-[132px] animate-pulse rounded-2xl border border-[#E6EBED] bg-[#F7F9FA]"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="w-full max-w-[62rem] rounded-2xl border border-dashed border-[#E6EBED] bg-white px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-[#21262E]">
          No requests waiting
        </p>
        <p className="mx-auto mt-2 max-w-[34rem] text-sm text-[#6B7380]">
          When someone asks you to take over billing for their company, it&rsquo;ll appear
          here for you to accept or decline.
        </p>
        <Link
          href="/profile"
          className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#D8DEE4] bg-white px-5 py-2.5 text-sm font-semibold text-[#292E38] transition-colors hover:bg-[#F5F7FA]"
        >
          Back to My Profile
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[62rem] flex-col gap-4">
      {rows.map((row) => {
        const quote = row.quote;
        const amount = quote ? quote.amount : row.amount;
        const currency = quote ? quote.currency : row.currency;
        const blocked = row.blockers.length > 0;
        const working = busy === row.id;

        return (
          <div
            key={row.id}
            className="rounded-2xl border border-[#E6EBED] bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.05)] sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-[17px] font-bold text-[#21262E]">
                  {row.entity_name || "A company"}
                </p>
                <p className="mt-1 break-words text-sm text-[#6B7380]">
                  {row.from_name} has asked you to become the subscriber.
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[#FFF7E6] px-2.5 py-1 text-xs font-semibold text-[#8A5A00]">
                Expires {day(row.expires_at)}
              </span>
            </div>

            {/* The money, before the button. Accepting is a purchase. */}
            <div className="mt-4 rounded-xl bg-[#F7F9FA] px-4 py-3.5 text-sm">
              {amount != null ? (
                <>
                  <p className="text-[#21262E]">
                    You&rsquo;ll be charged{" "}
                    <span className="font-semibold">{money(amount, currency)}</span> today
                    {quote
                      ? ` for ${day(quote.covers_from)} to ${day(quote.covers_to)}`
                      : ""}
                    .
                  </p>
                  <p className="mt-1 text-[#6B7380]">
                    That covers the days after the period {row.from_name} has already paid
                    for — you&rsquo;re not charged for those.
                    {quote?.anchor_is_new
                      ? " It also sets your monthly billing date."
                      : " After that it renews on your usual billing date."}
                  </p>
                </>
              ) : (
                <p className="text-[#6B7380]">
                  We couldn&rsquo;t price this request just now. Accepting will show you the
                  amount before anything is charged.
                </p>
              )}
            </div>

            {blocked ? (
              <div
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"
                role="status"
              >
                {row.blockers.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            ) : null}

            {result?.id === row.id ? (
              <p className="mt-3 text-sm text-[#374151]" role="status">
                {result.message}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => respond(row, false)}
                disabled={working}
                className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#D8DEE4] bg-white px-5 py-2.5 text-[15px] font-semibold text-[#292E38] transition-colors hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:text-[#B4BAC3]"
              >
                Decline
              </button>
              {blocked ? (
                <Link
                  href="/profile/billing"
                  className="inline-flex cursor-pointer items-center justify-center rounded-[10px] bg-secondary px-5 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Add a payment method
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => respond(row, true)}
                  disabled={working}
                  className="inline-flex items-center justify-center rounded-[10px] bg-secondary px-5 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary/40"
                >
                  {working ? "Taking over…" : "Accept and pay"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
