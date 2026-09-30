// COPY of minty-web/features/subscription/api/payerPortal.ts - the one read the Subscriptions
// Overview makes (2026-09-30); lifted into @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port).

/**
 * Every company the person pays for, from minty-billing-api's `GET /api/me/subscriptions` - the
 * read minty-web's portal (08-A) and its My Profile make, so the three screens can never disagree
 * about the figures. Person-scoped: no `X-Entity-Id`; the pages are walked (the API caps a page).
 *
 * NOT `lib/payerPortal.ts`: that is this app's own payer portal, still reading Flask's older
 * `/api/me/*` until Part 2 step 5 retires it with its pages.
 */

import { billingApiFetch } from "@/components/ui/sidebarHost";
import { ApiError } from "@/lib/api";
import type { PortalEntity } from "@/lib/payerPortal";

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
