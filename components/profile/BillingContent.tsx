"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildEnterUrl,
  fetchPayerBilling,
  PortalError,
  startPaymentMethodUpdate,
  type BillingEntity,
  type BillingStatus,
  type PayerBilling,
} from "@/lib/payerPortal";

/**
 * "Billing accounts".
 *
 * ONE THING TO KNOW BEFORE EDITING THIS FILE, because the screen does not admit it and
 * the design it was built from implies otherwise: there is one billing account, not
 * several. `user_stripe_customer` is a single row per payer — one currency, one anchor,
 * one `paid_through`, one dunning clock — the card sits on that one Stripe customer, and
 * `renewals` issues ONE invoice per payer with a line per entity, charged by
 * `billing_gateway.issue_invoice(customer_id, …)` against the customer.
 *
 * So a row here is an ENTITY, and the payment method printed under each name is the same
 * account card every time. That is not a placeholder — it is the card that will actually
 * charge that entity. Three different cards would need a card stored per entity, which
 * has no column and nothing that would charge it, and would force a per-entity
 * `paid_through` (the per-row copy removed for drifting between one payer's entities).
 *
 * Sorting is client-side here, unlike the subscriptions table. The set is one payer's
 * entities, unpaged, and every key is a plain string already in hand — there is no
 * access rule to restate, so a round trip would buy nothing.
 */

const STATUS_STYLES: Record<BillingStatus, string> = {
  active: "bg-[#D6EDD9] text-[#267347]",
  past_due: "bg-[#FCE6BD] text-[#9E690D]",
  trial: "bg-[#DBE8FC] text-[#2961AD]",
  none: "bg-[#F2F5F7] text-[#949CA6]",
};

type SortKey = "name" | "country" | "plan" | "status";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "country", label: "Country" },
  { key: "plan", label: "Plan type" },
  { key: "status", label: "Status" },
];

/** Worst first, so anything needing a decision sorts to the top. */
const STATUS_RANK: Record<BillingStatus, number> = {
  past_due: 0,
  trial: 1,
  active: 2,
  none: 3,
};

function sortValue(entity: BillingEntity, key: SortKey): string | number {
  if (key === "country") return (entity.country ?? "").toLowerCase();
  if (key === "plan") return (entity.plan ?? "").toLowerCase();
  if (key === "status") return STATUS_RANK[entity.status] ?? 9;
  return (entity.entity_name ?? "").toLowerCase();
}

function StatusPill({ status, label }: { status: BillingStatus; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[12.5px] font-semibold leading-[15px] ${STATUS_STYLES[status] ?? STATUS_STYLES.none}`}
    >
      {label}
    </span>
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

/**
 * "Mastercard •••• •••• •••• 7068", the way the design prints it.
 *
 * Built from `brand` + `last4` rather than the server's ready-made `label`, which uses a
 * single dot group — the four groups are this screen's house style. Falls back to
 * `label` when there is no card at all to describe: a Stripe Link wallet exposes no card
 * object, and "Link" is a truer answer than four rows of dots.
 */
function cardLine(card: PayerBilling["account"]["card"]): string {
  if (!card) return "None saved";
  if (!card.last4) return card.label;
  const brand = (card.brand ?? "card").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${brand} •••• •••• •••• ${card.last4}`;
}

function RowMenu({
  entity,
  onUpdateCard,
  updating,
}: {
  entity: BillingEntity;
  onUpdateCard: () => void;
  updating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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
          className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-xl border border-[#E6EBED] bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,41,0.12)]"
        >
          <a
            role="menuitem"
            href={buildEnterUrl(entity.entity_id, entity.settings_path)}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[15px] text-[#292E38] transition-colors hover:bg-[#F5F7FA]"
          >
            View subscription
          </a>
          {/* The same screen the + button opens, in read-only mode against this row. */}
          <Link
            role="menuitem"
            href={`/profile/billing/account?entity=${encodeURIComponent(entity.entity_id)}`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[15px] text-[#292E38] transition-colors hover:bg-[#F5F7FA]"
          >
            View billing account
          </Link>
          {/* Lands on Invoices already narrowed to this company. */}
          <Link
            role="menuitem"
            href={`/profile/invoices?entity=${encodeURIComponent(entity.entity_id)}`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[15px] text-[#292E38] transition-colors hover:bg-[#F5F7FA]"
          >
            View invoices
          </Link>
          {/* Goes to Stripe's own form — the card never reaches this app. It updates the
              ACCOUNT's method, which is every company's, not just this row's. */}
          <button
            type="button"
            role="menuitem"
            disabled={updating}
            onClick={() => {
              setOpen(false);
              onUpdateCard();
            }}
            title="Updates the payment method for every company on this account."
            className="block w-full cursor-pointer px-4 py-2.5 text-left text-[15px] text-[#292E38] transition-colors hover:bg-[#F5F7FA] disabled:cursor-wait disabled:text-[#B4BAC3]"
          >
            {updating ? "Opening…" : "Update payment method"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BillingContent() {
  const [data, setData] = useState<PayerBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [updatingCard, setUpdatingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  /**
   * Hand off to Stripe's payment-method form. The card is captured there, never here.
   *
   * On success the browser leaves, so `updatingCard` is deliberately not reset — the
   * button stays "Opening…" until the page is gone, rather than flicking back and
   * inviting a second click into the same redirect.
   */
  const handleUpdateCard = async () => {
    setUpdatingCard(true);
    setCardError(null);
    try {
      window.location.href = await startPaymentMethodUpdate("/profile/billing");
    } catch (e) {
      setCardError(
        e instanceof PortalError
          ? e.message
          : "Could not open the payment form. Let's try again?",
      );
      setUpdatingCard(false);
    }
  };

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetchPayerBilling(controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof PortalError
            ? err.message
            : "Hmm, your billing didn't come through. Let's give it another go?",
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

  const account = data?.account;
  const rows = useMemo(() => {
    const list = [...(data?.entities ?? [])];
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortDir]);

  return (
    <div className="w-full">
      <div className="flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-[#E6EBED] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <h2 className="text-base font-bold text-[#21262E]">Billing accounts</h2>
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#2E9B9B] transition-colors hover:bg-[#2E9B9B]/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <span
              className={`material-symbols-outlined text-[20px] leading-none ${loading ? "animate-spin" : ""}`}
              aria-hidden
            >
              refresh
            </span>
          </button>
        </div>

        {cardError ? (
          <div
            className="mx-4 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 sm:mx-6"
            role="alert"
          >
            {cardError}
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
                className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-left text-[13px] font-semibold transition-colors hover:text-[#292E38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
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
                className="mt-4 cursor-pointer rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
                  <div className="mt-2 h-3 w-24 rounded bg-[#F3F5F7]" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="border-t border-[#E6EBED] px-6 py-16 text-center">
              <p className="text-base font-semibold text-[#292E38]">
                {account?.has_account
                  ? "No companies are billing to this account yet."
                  : "Nothing has been billed yet."}
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-[#6B7380]">
                A billing account opens the first time something is charged — a free trial
                on its own doesn&apos;t create one, which is why there is no card or
                renewal date to show.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E6EBED] border-t border-[#E6EBED]">
              {rows.map((entity) => (
                <div
                  key={entity.entity_id}
                  className="bill-row flex flex-wrap gap-x-4 gap-y-1 px-4 py-4 sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={buildEnterUrl(entity.entity_id, entity.settings_path)}
                        className="break-words text-[14.5px] font-semibold text-[#2E9B9B] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                      >
                        {entity.entity_name}
                      </a>
                      {account?.currency ? (
                        <span className="rounded-md border border-[#D8DEE4] px-1.5 py-0.5 text-[11px] font-semibold text-[#6B7380]">
                          {account.currency}
                        </span>
                      ) : null}
                    </div>

                    {/* The ACCOUNT's card, on every row, because there is one. See the
                        file header — this is not a placeholder for a per-row card. */}
                    <p className="mt-1.5 text-[13px] text-[#6B7380]">
                      <span className="font-semibold text-[#4B5563]">Payment method:</span>{" "}
                      {cardLine(account?.card ?? null)}
                    </p>
                    <p className="mt-1 text-[13px] text-[#6B7380]">
                      <span className="font-semibold text-[#4B5563]">Expiry date:</span>{" "}
                      {account?.card?.expiry ?? "—"}
                    </p>
                  </div>

                  <div className="break-words text-sm text-[#333B45] lg:pt-0.5">
                    <span className="text-[#6B7380] lg:hidden">Country: </span>
                    {entity.country || "—"}
                  </div>

                  <div className="break-words text-sm text-[#333B45] lg:pt-0.5">
                    <span className="text-[#6B7380] lg:hidden">Plan: </span>
                    {entity.plan || "—"}
                  </div>

                  <div>
                    <StatusPill status={entity.status} label={entity.status_label} />
                  </div>

                  <RowMenu
                    entity={entity}
                    onUpdateCard={handleUpdateCard}
                    updating={updatingCard}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Opens the form. The FORM is where the wall is — its Save is disabled, because
            a second billing account needs a table that does not exist, a Stripe customer
            per account, and renewals/dunning moved off the payer. */}
        <div className="flex justify-end border-t border-[#E6EBED] px-4 py-4 sm:px-6">
          <Link
            href="/profile/billing/account"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
              add
            </span>
            New billing account
          </Link>
        </div>
      </div>
    </div>
  );
}
