// COPY of minty-web/features/subscription/api/payerPortal.ts - the one read the Subscriptions
// Overview makes (2026-09-30); lifted into @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port).

/**
 * Every company the person pays for, from minty-billing-api's `GET /api/me/subscriptions` - the
 * read minty-web's portal (08-A) and its My Profile make, so the three screens can never disagree
 * about the figures. Person-scoped: no `X-Entity-Id`; the pages are walked (the API caps a page).
 *
 * The types below are minty-web's own (its `payerPortal.ts`), the three the overview reads; this
 * app's own payer portal and its `lib/payerPortal.ts` were deleted on 2026-10-01 (the pages live
 * in minty-web).
 */

import { billingApiFetch } from "@/components/ui/sidebarHost";
import { ApiError } from "@/lib/api";

/**
 * Seven statuses, not the four the design draws swatches for. `past_due`, `ended` and
 * `trial_expired` are splits of what would otherwise be a grey "not subscribed" that lies.
 */
export type ModuleStatus =
  "active" | "trialing" | "cancelled" | "past_due" | "ended" | "trial_expired" | "not_subscribed";

export type PortalModule = {
  code: string;
  name: string;
  status: ModuleStatus;
  /** What the badge reads, e.g. "free trial". Server-owned so every app says it the same way. */
  status_label: string;
  /** "Next billing" / "Trial ends" / "Expires" / "Access ends" / "Ended", or null. */
  date_label: string | null;
  /** Already formatted - "15 Aug 2026". Null when there is no date to show. */
  date: string | null;
  date_iso: string | null;
};

export type PortalEntity = {
  entity_id: string;
  entity_name: string;
  country: string | null;
  country_code: string | null;
  subscriber: { id: string; name: string; email: string };
  modules: PortalModule[];
  /** A Minty PATH. Hand the token back through Flask's /entity/<id>/enter to land on it signed in. */
  settings_path: string;
  /** ISO; when the company was created (minty-web orders its list by it). */
  created_at?: string | null;
};

type Page = { entities: PortalEntity[]; pages: number };

/** The API's page-size ceiling (`MAX_PER_PAGE` in its portal service). */
export const MAX_PER_PAGE = 100;

const UNEXPECTED_SHAPE = "Your subscriptions didn't load. Mind trying again?";

async function fetchPage(page: number, signal?: AbortSignal): Promise<Page> {
  const data = await billingApiFetch<Page>("/api/me/subscriptions", {
    query: { page, per_page: MAX_PER_PAGE },
    signal,
  });
  if (!data || !Array.isArray(data.entities)) throw new ApiError(502, UNEXPECTED_SHAPE);
  return data;
}

export async function fetchAllPayerSubscriptions(
  signal?: AbortSignal,
): Promise<{ entities: PortalEntity[] }> {
  const first = await fetchPage(1, signal);
  const entities = [...first.entities];
  for (let page = 2; page <= first.pages; page++) {
    const next = await fetchPage(page, signal);
    entities.push(...next.entities);
  }
  return { entities };
}
