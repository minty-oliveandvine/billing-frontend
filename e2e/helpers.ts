// Shared plumbing: the module handoff token Minty mints, the landing handoff, skips.
//
// WHY THIS MINTS ITS OWN TOKEN
//
// In production a person clicks "Payments" in Minty; Flask mints a 30-minute HS256 JWT
// (blueprints/entity/routes/modules.py::_generate_module_token) and sends the browser to
// /landing?token=... here, which stores it in the `billing_token` cookie. A test cannot go
// through Minty's login (email OTP), but it holds the same SECRET_KEY, so it mints the same
// token. Nothing is bypassed: billing-backend verifies signature, expiry and claims exactly
// as it does Flask's, and the page reads the module claims out of it.
import { createHmac } from 'node:crypto';
import { test, type Page } from '@playwright/test';

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type Credentials = { secret: string; userId: string; entityId: string; entityName: string };

export function credentials(): Credentials | null {
  const secret = process.env.E2E_JWT_SECRET;
  const userId = process.env.E2E_MINTY_USER;
  const entityId = process.env.E2E_MINTY_ENTITY;
  if (!secret || !userId || !entityId) return null;
  return { secret, userId, entityId, entityName: process.env.E2E_MINTY_ENTITY_NAME || 'E2E Petty Cash Shop' };
}

export function requireCredentials(): Credentials {
  const creds = credentials();
  test.skip(!creds, 'Set E2E_JWT_SECRET (Minty SECRET_KEY), E2E_MINTY_USER and E2E_MINTY_ENTITY (see e2e/README.md)');
  return creds as Credentials;
}

/** The claims Minty puts in the module token; ``role`` decides what the UI offers. */
export function mintModuleToken(creds: Credentials, overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    user_id: creds.userId, entity_id: creds.entityId, xero_org_id: '', role: 'admin', system_role: 'normal',
    module: 'billing', sid: 'e2e', billing_enabled: true, petty_cash_enabled: true,
    exp: now + 1800, iat: now, ...overrides,
  }));
  const signature = b64url(createHmac('sha256', creds.secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

export async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

export const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:8000';
export const FLASK_URL = process.env.E2E_FLASK_URL || 'http://localhost:5001';

export async function requireStack(): Promise<void> {
  test.skip(!(await reachable((process.env.E2E_BASE_URL || 'http://localhost:3000') + '/module-selection')), 'Next (:3000) is not answering');
  test.skip(!(await reachable(BACKEND_URL + '/api/docs')) && !(await reachable(BACKEND_URL + '/')), 'billing-backend (:8000) is not answering');
}

/** Arrive the way Minty sends people: /landing stores the token and forwards to ``next``. */
export async function handoff(page: Page, creds: Credentials, next = '/', overrides: Record<string, unknown> = {}): Promise<void> {
  const token = mintModuleToken(creds, overrides);
  const qs = new URLSearchParams({ next, entity_id: creds.entityId, entity_name: creds.entityName, token });
  await page.goto(`/landing?${qs.toString()}`);
  await page.waitForURL((u) => !u.pathname.startsWith('/landing'), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

export function moneyRegex(amount: number): RegExp {
  const fixed2 = amount.toFixed(2);
  const withCommas = fixed2.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return new RegExp([fixed2, withCommas].map((s) => s.replace('.', '\.')).join('|'));
}
