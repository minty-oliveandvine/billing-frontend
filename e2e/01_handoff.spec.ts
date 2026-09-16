// Arriving from Minty, the module gate, and the payment-request list's vocabulary.
import { expect, test } from '@playwright/test';
import { handoff, requireCredentials, requireStack } from './helpers';

// The status tabs ARE the bill_status vocabulary the redesign renames (voided -> void, and the
// dead members go). Pin the words the user sees today.
const STATUS_TABS = ['All', 'Payment Requested', 'Partially Paid', 'Returned', 'Paid', 'Draft', 'Voided'];

test.describe('handoff and list', () => {
  test.beforeEach(async () => {
    await requireStack();
  });

  test('without a token the app falls back to module selection', async ({ page }) => {
    await page.goto('/landing');
    await expect(page).toHaveURL(/\/module-selection/);
  });

  test('the handoff stores the token and opens the payment-request list for the entity', async ({ page }) => {
    const creds = requireCredentials();
    await handoff(page, creds, '/');
    await expect(page).toHaveURL(/localhost:3000\/?$/);
    await expect(page.getByText(creds.entityName)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Payment' })).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'billing_token')?.value).toBeTruthy();
    expect(cookies.find((c) => c.name === 'billing_entity_id')?.value).toBe(creds.entityId);
  });

  test('the status filter offers exactly the bill statuses', async ({ page }) => {
    const creds = requireCredentials();
    await handoff(page, creds, '/');
    const tabs = page.getByRole('tablist', { name: /filter by status/i }).getByRole('tab');
    await expect(tabs).toHaveText(STATUS_TABS);
    await tabs.filter({ hasText: 'Draft' }).click();
    await expect(tabs.filter({ hasText: 'Draft' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the database entitlement, not the token claim, decides whether the module shows', async ({ page }) => {
    // lib/moduleClaims.ts refreshes entitlements from the backend; a stale claim in the JWT is
    // only the first paint. The E2E entity has the BILL module on, so it stays available.
    const creds = requireCredentials();
    await handoff(page, creds, '/', { billing_enabled: false });
    await expect(page.getByRole('button', { name: 'Add Payment' })).toBeVisible();
  });
});
