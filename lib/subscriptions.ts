/**
 * The subscription feature switch, mirrored from Minty's ``SUBSCRIPTION_ENABLED``
 * (Minty/blueprints/shared/feature_flags.py).
 *
 * Minty is the real guard: while the feature is dark every ``/api/me/*`` route and the
 * subscription-notice endpoint answer 404, whatever this app believes. This flag only
 * keeps the payer portal OUT OF SIGHT in that state - the three profile cards and the
 * ``/profile/subscriptions|billing|invoices`` pages (middleware.ts redirects them to the
 * profile) - so nobody is shown doors that open onto "not found".
 *
 * ON unless ``NEXT_PUBLIC_SUBSCRIPTION_ENABLED`` is ``0`` / ``false``. The opposite default
 * to the backends, deliberately: a developer's ``next dev`` with no env file keeps the whole
 * portal reachable, and the deployed app is switched off explicitly at the cutover
 * (docs/modernisation/modernisation_plan.md in the Minty repo, Phase E) alongside the two
 * backends. Read statically so Next inlines it into both the middleware and the client.
 */
export function subscriptionsEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED ?? "").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

/** The portal's paths, the ones the middleware sends back to the profile while dark. */
export const PORTAL_PATH_PREFIXES = ["/profile/subscriptions", "/profile/billing", "/profile/invoices"] as const;

export function isPortalPath(pathname: string): boolean {
  return PORTAL_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
