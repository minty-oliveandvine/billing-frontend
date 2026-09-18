// The payer portal: profile, billing accounts, invoices, subscriptions. These pages live in this
// app but read Minty's /api/me/* (the subscription tables the redesign retypes) and the payer's
// profile; they move to minty-web in Part 2 and to the redesigned tables in Part 1 C7.
import { expect, test } from '@playwright/test';
import { handoff, requireCredentials, requireStack, subscriptionsDark } from './helpers';

test.describe('payer portal while subscriptions are dark', () => {
  test.skip(!subscriptionsDark(), 'the stack runs with subscriptions live');

  test('the profile shows no portal cards and the portal pages go back to the profile', async ({ page }) => {
    await requireStack();
    await handoff(page, requireCredentials(), '/profile');
    await expect(page.getByRole('heading', { name: 'Eve Tester', level: 1 })).toBeVisible();
    for (const link of [/manage subscriptions/i, /^billing/i, /invoices/i]) {
      await expect(page.getByRole('link', { name: link })).toHaveCount(0);
    }
    for (const path of ['/profile/subscriptions', '/profile/billing', '/profile/invoices']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/profile\/?$/);
    }
  });
});

test.describe('payer portal', () => {
  test.skip(subscriptionsDark(), 'the stack runs with subscriptions dark: the portal is hidden');

  test.beforeEach(async ({ page }) => {
    await requireStack();
    await handoff(page, requireCredentials(), '/profile');
  });

  test('profile shows the signed-in person and the portal navigation', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Eve Tester', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /email address/i })).toBeVisible();
    for (const link of [/manage subscriptions/i, /^billing/i, /invoices/i]) {
      await expect(page.getByRole('link', { name: link }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();
  });

  test('billing lists the payer cards with an add action', async ({ page }) => {
    await page.goto('/profile/billing');
    await expect(page.getByRole('heading', { name: 'Billing', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /billing accounts/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add billing account/i })).toBeVisible();
    for (const col of [/payment method/i, /expiry date/i, /status/i]) {
      await expect(page.getByRole('button', { name: col }).first()).toBeVisible();
    }
  });

  test('invoices page renders with export disabled when there is nothing to export', async ({ page }) => {
    await page.goto('/profile/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });

  test('manage subscriptions loads for a payer with no subscriptions', async ({ page }) => {
    // F5 (fixed in C7): the summary used to read a per-company `paid_through` from a loop that
    // never ran for a payer with no companies, so /api/me/subscriptions answered 500.
    await page.goto('/profile/subscriptions');
    await expect(page.getByRole('heading', { name: /manage subscriptions/i, level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /sort by entity name/i })).toBeVisible();
  });

  test('settings offers the payment account-code picker', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /payment account code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
    // the codes seeded for the entity are offered
    await expect(page.locator('body')).toContainText(/429|408/);
  });
});
