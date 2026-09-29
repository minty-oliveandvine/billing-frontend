import { getAuth } from "@/lib/auth";
import { resolveMintyModuleUrl } from "@/lib/mintyEnv";

/** Minty (module 1) origin — same as Petty Cash / entity entry. */
export const MINTY_MODULE_URL = resolveMintyModuleUrl();
export { resolveMintyModuleUrl };

/**
 * Minty entry URL with optional `next` path (path on the Minty app, e.g. `/entity/…/settings`).
 */
export function buildMintyEnterUrl(nextPath?: string): string {
  const auth = getAuth();
  if (auth?.entityId && auth?.token) {
    const base = `${MINTY_MODULE_URL}/entity/${auth.entityId}/enter?token=${encodeURIComponent(auth.token)}`;
    return nextPath
      ? `${base}&next=${encodeURIComponent(nextPath)}`
      : base;
  }
  return `${MINTY_MODULE_URL}/entity`;
}

/**
 * "My Profile" - through Minty's `/profile`, the one route that decides WHICH profile opens:
 * minty-web's when Minty's `MINTY_WEB_HUB` is on, this app's `/profile` otherwise. Every "open
 * my profile" link here goes this way, so the switch is flipped in one place. Opened inside a
 * company it names it (`entity_id`) and says it came from this app (`from=bills`, so the back
 * arrow returns here), entering through `/entity/<id>/enter` so a Minty session that lapsed
 * while this app's longer token lived is re-established from that token on the way.
 */
export function buildMintyProfileUrl(): string {
  const auth = getAuth();
  if (auth?.entityId) {
    const qs = new URLSearchParams({ entity_id: auth.entityId, from: "bills" });
    return buildMintyEnterUrl(`/profile?${qs.toString()}`);
  }
  return MINTY_PROFILE_URL;
}

/** The profile with no company in context - also what a server render links to. */
export const MINTY_PROFILE_URL = `${MINTY_MODULE_URL}/profile`;

function mintyPathFromTemplate(template: string, entityId: string): string {
  return template.replace(/\{entityId\}/g, entityId);
}

/**
 * Override with `NEXT_PUBLIC_MINTY_USERS_PATH` (must include `{entityId}`), e.g. `/entity/{entityId}/users`.
 */
export function buildMintyUsersUrl(): string {
  const auth = getAuth();
  const template =
    process.env.NEXT_PUBLIC_MINTY_USERS_PATH ?? "/entity/{entityId}/users";
  if (!auth?.entityId) return `${MINTY_MODULE_URL}/entity`;
  return buildMintyEnterUrl(mintyPathFromTemplate(template, auth.entityId));
}

/**
 * Override with `NEXT_PUBLIC_MINTY_XERO_PATH`, e.g. `/entity/{entityId}/xero`.
 */
export function buildMintyXeroIntegrationUrl(): string {
  const auth = getAuth();
  const template =
    process.env.NEXT_PUBLIC_MINTY_XERO_PATH ?? "/entity/{entityId}/xero";
  if (!auth?.entityId) return `${MINTY_MODULE_URL}/entity`;
  return buildMintyEnterUrl(mintyPathFromTemplate(template, auth.entityId));
}

/**
 * Override with `NEXT_PUBLIC_MINTY_ENTITY_SETTINGS_PATH`, e.g. `/entity/{entityId}/settings`.
 */
export function buildMintyEntitySettingsUrl(): string {
  const auth = getAuth();
  const template =
    process.env.NEXT_PUBLIC_MINTY_ENTITY_SETTINGS_PATH ??
    "/entity/{entityId}/settings";
  if (!auth?.entityId) return `${MINTY_MODULE_URL}/entity`;
  return buildMintyEnterUrl(mintyPathFromTemplate(template, auth.entityId));
}
