// Payment Settings' "Leave without saving?" (lib/leaveGuard.ts, the dialog copied from minty-web):
// ticks not saved yet hold every way out of the page - the header's back link, the Flask pills,
// the sidebar's links and its Logout - until "Discard changes"; "Go Back" and Escape stay.
//
// Only the account-code list is stubbed (a fixed list, two of three active, so the saved ticks are
// known); everything else is the stack. Pages on Flask's origin are answered by a stub page, so
// Flask need not serve them, and Minty's /logout and the backend's logout call are caught, so no run
// signs anybody out. The browser's own leave prompt must never fire where our dialog asked.
import { expect, test, type Dialog, type Page, type Route } from '@playwright/test';
import { BACKEND_URL, FLASK_URL, handoff, requireCredentials, requireStack, type Credentials } from './helpers';

const ACCOUNTS = [
  { code: '200', name: 'Sales', active: true },
  { code: '429', name: 'General Expenses', active: true },
  { code: '310', name: 'Cost of Goods Sold', active: false },
];

const tick = (page: Page, code: string) => {
  const a = ACCOUNTS.find((x) => x.code === code)!;
  return page.getByRole('checkbox', { name: `Include ${a.code} - ${a.name} in payment account dropdown` });
};

/** The preflight's answer: whatever origin and headers the browser asks for. */
function cors(route: Route): Record<string, string> {
  const headers = route.request().headers();
  return {
    'access-control-allow-origin': headers['origin'] ?? '*',
    'access-control-allow-headers': headers['access-control-request-headers'] ?? 'authorization, content-type',
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  };
}

type Run = { creds: Credentials; prompts: string[]; logouts: string[] };

async function arrive(page: Page): Promise<Run> {
  const creds = requireCredentials();
  const run: Run = { creds, prompts: [], logouts: [] };
  page.on('dialog', (d: Dialog) => {
    run.prompts.push(d.type());
    void d.dismiss();
  });
  await page.route('**/entity-bill-accounts/**', (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    const body = ACCOUNTS.map((a, i) => ({
      id: `e2e-leave-${a.code}`,
      entity_id: creds.entityId,
      account_code: a.code,
      account_name: a.name,
      account_type: 'EXPENSE',
      is_default: false,
      is_active: a.active,
      sort_order: i,
    }));
    return route.fulfill({ status: 200, headers: cors(route), contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Flask's pages (the pills' and the menu's destinations) - its API calls still reach Flask
  await page.route(`${FLASK_URL}/**`, (route: Route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Flask page stub</title>' })
      : route.fallback(),
  );
  await page.route(`${FLASK_URL}/logout**`, (route: Route) => {
    run.logouts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Minty logout stub</title>' });
  });
  await page.route(`${BACKEND_URL}/api/v1/auth/logout`, (route: Route) => {
    if (route.request().method() !== 'OPTIONS') run.logouts.push(route.request().url());
    return route.fulfill({ status: 204, headers: cors(route) });
  });
  await handoff(page, creds, '/settings');
  await expect(page.getByRole('heading', { name: /payment account code/i })).toBeVisible();
  await expect(tick(page, '200')).toBeChecked();
  await expect(tick(page, '310')).not.toBeChecked();
  return run;
}

const leaveDialog = (page: Page) => page.getByRole('dialog', { name: 'Leave without saving?' });
const backLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /Payments/ });

test.describe('payment settings: leave without saving', () => {
  test.beforeEach(async () => {
    await requireStack();
  });

  test('nothing changed: the back link leaves at once', async ({ page }) => {
    const run = await arrive(page);
    await backLink(page).click();
    await expect(page).toHaveURL((u) => u.pathname === '/');
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(run.prompts).toEqual([]);
  });

  test('a tick held by the back link: Go Back and Escape both stay, the tick kept', async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await backLink(page).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('You have unsaved changes.');
    await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL((u) => u.pathname === '/settings');
    await expect(tick(page, '310')).toBeChecked();

    await backLink(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL((u) => u.pathname === '/settings');
    await expect(tick(page, '310')).toBeChecked();
    expect(run.prompts).toEqual([]);
  });

  test('a Flask pill is a real link: Discard changes goes there, with no browser prompt', async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await page.getByRole('link', { name: 'Users', exact: true }).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();

    await expect(page).toHaveURL(`${FLASK_URL}/entity/settings/users/${run.creds.entityId}?from=bills`);
    expect(run.prompts).toEqual([]);
  });

  test("the sidebar's Settings asks above the drawer, and Discard changes reloads the saved ticks", async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await page.getByRole('banner').getByRole('button', { name: 'Open navigation menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();

    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(nav).toBeVisible(); // the drawer stayed open under it
    // Escape answers the dialog alone: the drawer under it stays open
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(dialog).toBeVisible();
    const discard = dialog.getByRole('button', { name: 'Discard changes' });
    // the button is what the pointer hits at its own centre - not the drawer over it
    const onTop = await discard.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(onTop).toBe(true);
    await discard.click();

    await expect(page).toHaveURL((u) => u.pathname === '/settings');
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(tick(page, '200')).toBeChecked();
    await expect(tick(page, '429')).toBeChecked();
    await expect(tick(page, '310')).not.toBeChecked();
    expect(run.prompts).toEqual([]);
  });

  test('Logout asks first: Go Back stays, signed in, and nothing was logged out', async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await page.getByRole('banner').getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Logout', exact: true }).click();

    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page).toHaveURL((u) => u.pathname === '/settings');
    await expect(tick(page, '310')).toBeChecked();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'billing_token')?.value ?? '').not.toBe('');
    expect(run.logouts).toEqual([]);
    expect(run.prompts).toEqual([]);
  });
});
