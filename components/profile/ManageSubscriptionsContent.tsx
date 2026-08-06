"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SubscriptionRowMenu } from "@/components/profile/SubscriptionRowMenu";
import {
  isDormant,
  SubscriptionStatusBadge,
} from "@/components/profile/SubscriptionStatusBadge";
import {
  buildEnterUrl,
  fetchPayerSubscriptions,
  PortalError,
  type PayerSubscriptions,
  type PortalEntity,
  type SortDirection,
  type SortField,
} from "@/lib/payerPortal";

/**
 * "Manage subscriptions" — every entity the signed-in user pays for.
 *
 * Searching, sorting and paging are all SERVER-side. That looks like overkill for a
 * table this size until you notice what two of the sorts mean: "worst status first" and
 * "how many modules are live" are both computed from the access rules, which live in
 * Minty. Sorting a page of six rows in the browser would order the page rather than the
 * set, and would need those rules restated here to do even that.
 */

const PER_PAGE = 6;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The column tracks live in `app/globals.css` (`.subs-head` / `.subs-row` /
 * `.subs-modules` / `.subs-module-line`), not in utility classes here — see the comment
 * there for why, and for what the widths mean. This file only says which cell is which.
 */
/** Nudges the single-line cells onto the centre line of the first module's badge. */
const ROW_TEXT_CELL = "lg:pt-[3px]";

type Column = {
  id: SortField;
  label: string;
};

const COLUMNS: Column[] = [
  { id: "entity", label: "Entity name" },
  { id: "subscriber", label: "Subscriber" },
  { id: "country", label: "Country" },
  { id: "modules", label: "Modules" },
  { id: "status", label: "Status" },
  { id: "next_billing", label: "Next Billing / Expires" },
];

function SortArrow({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span
      className={`material-symbols-outlined text-[14px] leading-none ${
        active ? "text-[#2E9B9B]" : "text-[#9EA6B0]"
      }`}
      aria-hidden
    >
      {active ? (direction === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
    </span>
  );
}

/** The module lines inside one row — shared by the desktop grid and the mobile card. */
function ModuleLines({ entity }: { entity: PortalEntity }) {
  return (
    <>
      {entity.modules.map((module) => (
        <div key={module.code} className="subs-module-line">
          {/* Never truncated. A module name is short, fixed and from the catalog — there
              are two of them — so "Payment Re…" is not a space problem to solve with an
              ellipsis, it is a column that was too narrow. */}
          <span
            className={`whitespace-nowrap text-sm ${
              isDormant(module.status) ? "text-[#99A1AB]" : "text-[#333B45]"
            }`}
          >
            {module.name}
          </span>
          <span className="justify-self-start">
            <SubscriptionStatusBadge status={module.status} label={module.status_label} />
          </span>
          <span
            className={`subs-module-date text-[13px] font-medium ${
              module.date ? "text-[#6B7380]" : "text-[#99A1AB]"
            }`}
          >
            {module.date ? `${module.date_label} ${module.date}` : "—"}
          </span>
        </div>
      ))}
    </>
  );
}

export function ManageSubscriptionsContent() {
  const [data, setData] = useState<PayerSubscriptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortField>("entity");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  // Debounce the box, not the request: typing "micro" should cost one call, not five.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetchPayerSubscriptions({
      query,
      sort,
      direction,
      page,
      perPage: PER_PAGE,
      signal: controller.signal,
    })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        // A superseded request is not a failure — a newer one is already in flight.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof PortalError
            ? err.message
            : "Hmm, your subscriptions didn't come through. Let's give it another go?",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query, sort, direction, page, reloadTick]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (field === sort) {
        setDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSort(field);
        setDirection("asc");
      }
      setPage(1);
    },
    [sort],
  );

  const entities = data?.entities ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const first = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const last = Math.min(page * PER_PAGE, total);

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-[#E6EBED] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
        {/* Search row */}
        <div className="flex items-center gap-3 p-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] bg-[#F5F7FA] px-4 py-3">
            <span className="material-symbols-outlined text-[18px] leading-none text-[#6B7380]" aria-hidden>
              search
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search subscriptions and trials"
              aria-label="Search subscriptions and trials"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[#292E38] placeholder:text-[#6B7380] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#2E9B9B] transition-colors hover:bg-[#2E9B9B]/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <span
              className={`material-symbols-outlined text-[20px] leading-none ${loading ? "animate-spin" : ""}`}
              aria-hidden
            >
              refresh
            </span>
          </button>
        </div>

        {/* Column headers — wide screens only; the stacked cards carry their own labels. */}
        <div className="subs-head border-y border-[#E6EBED] px-6 pb-3 pt-1.5">
          {COLUMNS.map(({ id, label }) => {
            const active = sort === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleSort(id)}
                aria-label={`Sort by ${label}`}
                className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-left text-[13px] font-semibold transition-colors hover:text-[#292E38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                  active ? "text-[#292E38]" : "text-[#6B7380]"
                }`}
              >
                <span>{label}</span>
                <SortArrow active={active} direction={direction} />
              </button>
            );
          })}
          {/* Spacer over the kebab column. */}
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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse px-6 py-6">
                <div className="h-4 w-40 rounded bg-[#EEF1F4]" />
                <div className="mt-3 h-3 w-3/4 rounded bg-[#F3F5F7]" />
                <div className="mt-2 h-3 w-2/3 rounded bg-[#F3F5F7]" />
              </div>
            ))}
          </div>
        ) : entities.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#292E38]">
              {query ? "Nothing matched that." : "You're not paying for anything yet."}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7380]">
              {query
                ? "Try a company name, a country, or a status like “free trial”."
                : "Entities show up here once you start a trial or a subscription for them. Someone else may be the payer for the companies you're a member of — their subscription page will say who."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E6EBED]">
            {entities.map((entity) => (
              <div
                key={entity.entity_id}
                className="subs-row px-4 py-4 sm:px-6 lg:py-[18px]"
              >
                <div className={`flex items-start justify-between gap-3 lg:block ${ROW_TEXT_CELL}`}>
                  <a
                    href={buildEnterUrl(entity.entity_id, entity.settings_path)}
                    className="break-words text-[14.5px] font-semibold text-[#2E9B9B] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                  >
                    {entity.entity_name}
                  </a>
                  {/* The kebab rides with the name on narrow screens, where there is no
                      last column. */}
                  <span className="shrink-0 lg:hidden">
                    <SubscriptionRowMenu entity={entity} />
                  </span>
                </div>

                <div className={`min-w-0 break-words text-sm text-[#333B45] ${ROW_TEXT_CELL}`}>
                  <span className="text-[#6B7380] lg:hidden">Subscriber: </span>
                  {entity.subscriber.name || "—"}
                </div>

                <div className={`min-w-0 break-words text-sm text-[#333B45] ${ROW_TEXT_CELL}`}>
                  <span className="text-[#6B7380] lg:hidden">Country: </span>
                  {entity.country || "—"}
                </div>

                {/* One cell spanning Modules + Status + Next Billing — see globals.css. */}
                <div className="subs-modules flex flex-col gap-2.5 lg:gap-3">
                  <ModuleLines entity={entity} />
                </div>

                <div className="hidden justify-center lg:flex">
                  <SubscriptionRowMenu entity={entity} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer — rendered whenever there is a set to describe, error state aside. */}
        {!error && data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6EBED] px-4 py-4 sm:px-6">
            <p className="text-[13px] font-medium text-[#737A87]">
              {total === 0
                ? "No entities"
                : `Showing ${first}–${last} of ${total} ${total === 1 ? "entity" : "entities"}`}
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

/**
 * Page numbers, windowed to five. An unbounded run would wrap into a paragraph of
 * buttons once a payer has a few dozen entities, on the narrowest screen first.
 */
function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  const size = 5;
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), pages - size + 1));
  const numbers = Array.from({ length: Math.min(size, pages) }, (_, i) => start + i);

  const boxClass =
    "inline-flex h-[34px] min-w-[34px] cursor-pointer items-center justify-center rounded-lg px-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

  return (
    <nav className="flex items-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={`${boxClass} border border-[#E6EBED] bg-white font-semibold text-[#737A87] hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
          chevron_left
        </span>
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? "page" : undefined}
          className={`${boxClass} ${
            n === page
              ? "bg-[#4FC7C7] font-semibold text-white"
              : "border border-[#E6EBED] bg-white font-medium text-[#292E38] hover:bg-[#F5F7FA]"
          }`}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
        className={`${boxClass} border border-[#E6EBED] bg-white font-semibold text-[#737A87] hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
          chevron_right
        </span>
      </button>
    </nav>
  );
}
