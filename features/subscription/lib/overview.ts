// COPY of the parts of minty-web/features/subscription/lib/billing.ts (and `utcDay` from its
// lib/subscriptionSummary.ts) that My Profile's Subscriptions Overview draws (2026-09-30);
// lifted into @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port).

import type { PortalEntity, PortalModule } from "@/lib/payerPortal";

export const ACTIVE_SUBSCRIPTIONS = "Active subscriptions";
export const TRIAL_ENDING = "Trial ending";
export const MANAGE_SUBSCRIPTION = "Manage Subscription";

/**
 * How far off a trial's end may be and still count as "Trial ending". Thirty days, a trial's
 * whole length (the user's call, 2026-09-25): in practice every trial going on.
 */
export const TRIAL_ENDING_DAYS = 30;

/**
 * An ISO day - or any date `Date.parse` reads - as that day's UTC midnight. The fallback is not
 * decoration: the portal's API has written dates as RFC 822 ("Sun, 18 Oct 2026 12:00:00 GMT"),
 * and a reader of the ISO prefix alone silently made every one of them null.
 */
export function utcDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysUntil(iso: string | null, today: Date): number | null {
  const day = utcDay(iso);
  if (!day) return null;
  const from = utcDay(today.toISOString());
  if (!from) return null;
  return Math.round((day.getTime() - from.getTime()) / 86_400_000);
}

function trialing(entity: PortalEntity): PortalModule[] {
  return entity.modules.filter((m) => m.status === "trialing");
}

export type OverviewFigures = { active: number; trialEnding: number };

/**
 * 08-A's two figures, from the list alone. "Active subscriptions" counts COMPANIES with a module
 * being paid for (a trial is not one - nothing is charged yet); "Trial ending" counts the
 * companies with a trial ending within `TRIAL_ENDING_DAYS`.
 */
export function overview(entities: PortalEntity[], today: Date): OverviewFigures {
  let active = 0;
  let trialEnding = 0;
  for (const entity of entities) {
    if (entity.modules.some((m) => m.status === "active" || m.status === "cancelled")) active += 1;
    const ending = trialing(entity).some((trial) => {
      const left = daysUntil(trial.date_iso, today);
      return left !== null && left <= TRIAL_ENDING_DAYS;
    });
    if (ending) trialEnding += 1;
  }
  return { active, trialEnding };
}

/** "entity" / "entities" - the unit alone, for a figure drawn above it (My Profile, 10-A). */
export function entityUnit(n: number): string {
  return n === 1 ? "entity" : "entities";
}
