"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ALL_ENTITIES,
  EntityFilterCombobox,
} from "@/components/profile/EntityFilterCombobox";
import { Pagination } from "@/components/profile/Pagination";
import {
  fetchPayerInvoices,
  PortalError,
  type PayerInvoices,
} from "@/lib/payerPortal";

/**
 * "Invoices" — the payer's billing history.
 *
 * ONE INVOICE PER PAYER PER PERIOD, with a line per entity, so filtering by entity is a
 * filter over LINES. That changes two columns and not just the row count: the description
 * becomes that entity's products and the amount becomes that entity's share. Showing the
 * full invoice total against one company would overstate what it cost by whatever the
 * other companies rode in on. The server does that arithmetic — see `build_payer_invoices`.
 *
 * The entity filter defaults to "All". Arriving with `?entity=<id>` — which is what
 * "View invoices" on a row passes — starts narrowed to that company instead.
 *
 * The Description cell is two lines and a tooltip, all three server-composed: what
 * happened ("Upgrade · Petty Cash → Super Minty"), over which days and for which company,
 * and — on hover — the memo the biller wrote, which is the only place the arithmetic
 * behind a prorated amount is written down. Composing any of it here would mean restating
 * rules that live in `build_payer_invoices`.
 *
 * Export CSV and the per-row download are rendered disabled: an invoice PDF is Stripe's
 * document and there is no route serving it yet, and a CSV of numbers the customer may
 * reconcile against is not something to ship half-built.
 */

const PER_PAGE = 7;

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-[#D6EDD9] text-[#267347]",
  open: "bg-[#FCE6BD] text-[#9E690D]",
  draft: "bg-[#F2F5F7] text-[#949CA6]",
  uncollectible: "bg-[#FDE2E2] text-[#B42318]",
  void: "bg-[#F2F5F7] text-[#949CA6]",
};

const COLUMNS = [
  "Invoice #",
  "Date",
  "Description",
  "Amount",
  "Status",
  "Payment method",
];

export function InvoicesContent({ initialEntityId }: { initialEntityId?: string }) {
  const [data, setData] = useState<PayerInvoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityId, setEntityId] = useState(initialEntityId ?? ALL_ENTITIES);
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetchPayerInvoices({
      entityId: entityId || null,
      page,
      perPage: PER_PAGE,
      signal: controller.signal,
    })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof PortalError
            ? err.message
            : "Hmm, your invoices didn't come through. Let's give it another go?",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [entityId, page]);

  useEffect(() => load(), [load, reloadTick]);

  const invoices = data?.invoices ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const first = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const last = Math.min(page * PER_PAGE, total);

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-[#E6EBED] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
        {/* Filter row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-[15px] font-semibold text-[#374151]">
              Entity
            </span>
            <EntityFilterCombobox
              options={data?.entity_options ?? []}
              value={entityId}
              disabled={loading && !data}
              onChange={(id) => {
                setEntityId(id);
                // A narrower set almost never has the page you were on.
                setPage(1);
              }}
            />
          </div>
          <button
            type="button"
            disabled
            title="Exporting isn't wired up yet."
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-secondary/40 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
              download
            </span>
            Export CSV
          </button>
        </div>

        {/* `flex gap-x-6` is a FALLBACK, not the layout. `.inv-head` is defined after
            Tailwind's utilities in the stylesheet, so its `display: none` / `display:
            grid` wins whenever it is loaded. It only matters when it is NOT — a dev
            server holding a stale globals.css — where without it the header collapses to
            `display: block` and the labels run together into one unreadable string
            ("Invoice #DateDescriptionAmount…"). Costs nothing when the CSS is present. */}
        <div className="inv-head flex flex-wrap gap-x-6 border-y border-[#E6EBED] bg-[#FBFCFD] px-6 py-3 text-[13px] font-semibold text-[#6B7380]">
          {COLUMNS.map((label) => (
            <span key={label} className="whitespace-nowrap">
              {label}
            </span>
          ))}
          <span aria-hidden />
        </div>

        {error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-[#B42318]" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              className="mt-4 cursor-pointer rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          </div>
        ) : loading && !data ? (
          <div className="divide-y divide-[#E6EBED]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse px-6 py-5">
                <div className="h-3.5 w-full max-w-2xl rounded bg-[#F1F4F6]" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#292E38]">
              {entityId ? "No invoices for that company yet." : "No invoices yet."}
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[#6B7380]">
              Invoices appear here once a renewal or a purchase has actually been charged.
              A free trial doesn&apos;t raise one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E6EBED]">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="inv-row flex flex-wrap gap-x-4 gap-y-1 px-4 py-4 sm:px-6"
              >
                <span className="break-all text-[14.5px] font-semibold text-[#333B45]">
                  {invoice.reference}
                </span>

                <span className="text-sm text-[#333B45]">
                  <span className="text-[#6B7380] lg:hidden">Date: </span>
                  {invoice.date ?? "—"}
                </span>

                {/* Two lines: what happened, then over which days and for which
                    company. The memo — the arithmetic behind a prorated figure — is the
                    title rather than a third line; it runs to three sentences on a
                    change and would be the tallest thing in the table. */}
                <span
                  className="min-w-0 break-words"
                  title={invoice.memo ?? undefined}
                >
                  <span className="block text-sm font-medium text-[#333B45]">
                    {invoice.description}
                  </span>
                  {invoice.description_detail ? (
                    <span className="mt-0.5 block text-[12.5px] leading-[16px] text-[#8A929C]">
                      {invoice.description_detail}
                    </span>
                  ) : null}
                </span>

                <span className="text-sm font-semibold text-[#16202E]">
                  {invoice.amount}
                </span>

                <span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[12.5px] font-semibold leading-[15px] ${STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft}`}
                  >
                    {invoice.status_label}
                  </span>
                </span>

                {/* Not stored per invoice. Naming the account's current card here would
                    be a guess, and the invoice it would be wrong about first is a failed
                    one — where which card was charged is the whole question. */}
                <span className="text-sm text-[#99A1AB]">
                  <span className="text-[#6B7380] lg:hidden">Payment method: </span>
                  {invoice.payment_method ?? "Not recorded"}
                </span>

                {/* Opens Stripe's hosted invoice page, which carries the PDF download —
                    and, for an invoice still open, a way to pay it. `open_in_new` rather
                    than a download arrow because that is what it does: labelling it
                    "download" when it opens a page costs a click of confusion.

                    `noopener noreferrer` is not boilerplate here. The URL's token IS the
                    authorisation, and a referrer would carry it to whatever that page
                    links onward to. */}
                <span className="flex justify-center">
                  {invoice.hosted_invoice_url ? (
                    <a
                      href={invoice.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View invoice ${invoice.reference} on Stripe`}
                      title="View invoice — download the PDF or pay it on Stripe"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#2E9B9B] transition-colors hover:bg-[#2E9B9B]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                    >
                      <span
                        className="material-symbols-outlined text-[20px] leading-none"
                        aria-hidden
                      >
                        open_in_new
                      </span>
                    </a>
                  ) : (
                    /* Null until the invoice is finalized, and null for every invoice
                       raised before the column existed — disabled beats a dead link. */
                    <button
                      type="button"
                      disabled
                      aria-label={`No document for ${invoice.reference}`}
                      title="No document for this invoice yet."
                      className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-[#C9CFD6]"
                    >
                      <span
                        className="material-symbols-outlined text-[20px] leading-none"
                        aria-hidden
                      >
                        open_in_new
                      </span>
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {!error && data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6EBED] px-4 py-4 sm:px-6">
            <p className="text-[13px] font-medium text-[#737A87]">
              {total === 0
                ? "No invoices"
                : `Showing ${first}–${last} of ${total} ${total === 1 ? "invoice" : "invoices"}`}
            </p>
            {pages > 1 ? (
              <Pagination page={page} pages={pages} onChange={setPage} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
