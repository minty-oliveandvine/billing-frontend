import { findEmailAddressInJson } from "./extractEmail";
import { resolveMintyModuleUrl } from "./mintyEnv";

const TOKEN_KEY = "billing_token";
const ENTITY_ID_KEY = "billing_entity_id";
const ENTITY_NAME_KEY = "billing_entity_name";

const BILLING_TOKEN_MAX_AGE = 60 * 60 * 8; // 8 hours — matches JWT lifetime

const API_BASE =
  process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000";

export type AuthInfo = {
  token: string;
  entityId: string;
  entityName: string;
};

export function setAuth(token: string, entityId: string, entityName: string) {
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const opts = `path=/;max-age=${BILLING_TOKEN_MAX_AGE};SameSite=Lax${isSecure ? ";Secure" : ""}`;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)};${opts}`;
  document.cookie = `${ENTITY_ID_KEY}=${encodeURIComponent(entityId)};${opts}`;
  document.cookie = `${ENTITY_NAME_KEY}=${encodeURIComponent(entityName)};${opts}`;
}

export function getAuth(): AuthInfo | null {
  if (typeof document === "undefined") return null;
  const jar = Object.fromEntries(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf("=");
        return [c.slice(0, idx), decodeURIComponent(c.slice(idx + 1))];
      }),
  );
  const token = jar[TOKEN_KEY];
  if (!token) return null;
  return {
    token,
    entityId: jar[ENTITY_ID_KEY] ?? "",
    entityName: jar[ENTITY_NAME_KEY] ?? "",
  };
}

export function clearAuth() {
  const expire = "path=/;max-age=0";
  document.cookie = `${TOKEN_KEY}=;${expire}`;
  document.cookie = `${ENTITY_ID_KEY}=;${expire}`;
  document.cookie = `${ENTITY_NAME_KEY}=;${expire}`;
}

/** Cookie name checked by Next.js middleware for auth gating. */
export const AUTH_COOKIE_NAME = TOKEN_KEY;

/**
 * Decodes the JWT payload and returns the `role` claim string, or null if the
 * token is missing, malformed, or contains no `role` claim. Never throws.
 */
export function getRoleFromToken(): string | null {
  try {
    const auth = getAuth();
    if (!auth?.token) return null;
    const parts = auth.token.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof payload.role !== "string" || !payload.role) return null;
    return payload.role;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json = atob(base64);
    const payload = JSON.parse(json) as unknown;
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getEmailFromToken(): string | null {
  try {
    const auth = getAuth();
    if (!auth?.token) return null;
    const payload = decodeJwtPayload(auth.token);
    if (!payload) return null;
    return findEmailAddressInJson(payload);
  } catch {
    return null;
  }
}

/**
 * Returns true if the JWT stored in the cookie will expire within
 * `thresholdSeconds` seconds (default 120). Returns false if the token is
 * missing, malformed, or has no `exp` claim. Never throws.
 */
export function isTokenExpiringSoon(thresholdSeconds = 120): boolean {
  try {
    const auth = getAuth();
    if (!auth?.token) return false;
    const parts = auth.token.split(".");
    if (parts.length !== 3) return false;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof payload.exp !== "number") return false;
    return payload.exp - Date.now() / 1000 < thresholdSeconds;
  } catch {
    return false;
  }
}

/**
 * Returns true only if the JWT is already past its `exp` claim (with a small
 * 5-second clock-skew tolerance). Used to decide when a failed refresh should
 * actually kick the user back to login vs. allow the request to proceed.
 * Returns false if the token is missing, malformed, or has no `exp` claim.
 * Never throws.
 */
export function isTokenExpired(): boolean {
  try {
    const auth = getAuth();
    if (!auth?.token) return false;
    const parts = auth.token.split(".");
    if (parts.length !== 3) return false;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof payload.exp !== "number") return false;
    return payload.exp - Date.now() / 1000 < -5;
  } catch {
    return false;
  }
}

/**
 * Best-effort silent re-handoff to Flask Module 1 to obtain a fresh billing JWT.
 *
 * Inputs:
 *   - Reads `billing_entity_id` from the cookie jar to preserve the entity scope.
 *   - Reads `window.location.pathname + search` so the user lands back on the
 *     same page they were on (assuming the Flask session is still valid).
 *
 * Output: navigates the browser to
 *   <MODULE1_URL>/entity/<entity_id>/billing-relogin?next=<encoded current path>
 *
 * If Flask session is still valid (typical case), Flask mints a new JWT and
 * redirects straight back to /landing → cookie restored → user resumes with
 * zero clicks. If the Flask session is also expired, Flask-Login's
 * `login_view` sends them to the real login form. Either way no manual
 * cookie clearing is required.
 *
 * Falls back to plain Module 1 root if no entity context is available.
 */
export function redirectToLogin() {
  const entityId =
    typeof document !== "undefined"
      ? Object.fromEntries(
          document.cookie
            .split("; ")
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf("=");
              return [c.slice(0, idx), decodeURIComponent(c.slice(idx + 1))];
            }),
        )[ENTITY_ID_KEY]
      : "";

  clearAuth();

  const base = resolveMintyModuleUrl().replace(/\/$/, "");
  if (entityId) {
    const here =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    const next = encodeURIComponent(here);
    window.location.href = `${base}/entity/${entityId}/billing-relogin?next=${next}`;
    return;
  }

  window.location.href = `${base}/`;
}

/**
 * Exchanges the current valid billing JWT for a fresh 8-hour token via
 * POST /api/v1/auth/token/refresh.
 *
 * Returns true and updates the stored cookies if the server issued a new token.
 * Returns false if the token is already expired, missing, or the request failed.
 *
 * Uses raw fetch (not apiFetch) to avoid a circular import with api.ts.
 */
export async function refreshToken(): Promise<boolean> {
  const auth = getAuth();
  if (!auth?.token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/token/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "X-Entity-Id": auth.entityId,
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token?: string; expires_in?: number };
    if (!data.token) return false;
    setAuth(data.token, auth.entityId, auth.entityName);
    return true;
  } catch {
    return false;
  }
}
