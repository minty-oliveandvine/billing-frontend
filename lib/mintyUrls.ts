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
