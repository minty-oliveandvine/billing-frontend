# The payer portal (`/profile/*`) and the settings page

The screens for the person who **pays** for companies: what they subscribe to, the cards
on file, their invoices, and handing a company's bill to somebody else. The data lives
only in Minty, so these pages call Minty's `/api/me/*` directly with the billing JWT
(`lib/payerPortal.ts`; see [authentication.md](authentication.md)). The rules — trials,
grace, dunning, transfers — are Minty's (`Minty/docs/features/modules-and-subscriptions.md`).

## Dark by switch

While subscriptions are dark (`NEXT_PUBLIC_SUBSCRIPTION_ENABLED=0`, matching Minty's
`SUBSCRIPTION_ENABLED=0`; `lib/subscriptions.ts`), `/profile` shows **no** portal cards
(`components/profile/ProfilePortalLinks.tsx` returns nothing) and the middleware redirects
`/profile/subscriptions`, `/profile/billing`, `/profile/invoices` back to `/profile`.
Minty answers every `/api/me/*` call with 404 in that state, so the pages could not work
anyway. ON when the variable is unset — a bare `next dev` keeps the portal reachable.

## `/profile` (`components/profile/MyProfileContent.tsx`)

The signed-in person (from `GET /api/auth/me`), profile edits (`PUT /api/profile/me`),
account deactivation (`DELETE /api/profile/me`), the way back to Minty, and — when live —
the three cards into the portal (`PortalShell`, `PortalTabs`: Manage Subscriptions,
Billing, Invoices).

## `/profile/subscriptions` (`ManageSubscriptionsContent.tsx`)

Every company the person pays for, one row each with the modules' states
(`SubscriptionStatusBadge`: trial, active, past due, scheduled to cancel, cancelled,
expired). Searching, sorting and paging are **server-side on purpose** — "worst status
first" and "how many modules are live" are computed from access rules that live in Minty
(`GET /api/me/subscriptions`). The row menu (`SubscriptionRowMenu`) opens the company in
Minty (`/entity/<id>/enter`, any company, not just the one in the cookie), and:

- **Change subscriber** (`/profile/subscriptions/subscriber`, `ChangeSubscriberContent.tsx`):
  *offers* the handover to another admin of that company
  (`/api/me/subscriptions/subscriber-options`, `…/transfer`); nothing changes until they
  accept, at which point Minty charges **them** for the days the current payer's money
  does not cover. `blockers` come from Minty in its own words (a trial still running,
  a past-due invoice, …). Inviting a new admin is `…/invite-admin`.
- **Incoming** (`/profile/subscriptions/incoming`, `IncomingTransfersContent.tsx`): the
  handovers offered *to* the person (`…/transfers`), with `InheritedTrials` stating,
  before the button, what is free now and charged later; accept / decline
  (`…/transfer/respond`); the offerer can withdraw (`…/transfer/cancel`).

## `/profile/billing` (`PaymentMethodsPanel.tsx`, `AddPaymentMethodModal.tsx`, `EntityBillingAccountDialog.tsx`)

The cards saved on the payer's account (`/api/me/billing/payment-methods`; add one through
a Stripe SetupIntent — `…/setup-intent` then `…/confirm`; `…/default`, `…/update`,
`…/remove`) and **the card each company is billed on**
(`/api/me/billing/entity-payment-method`, `EntityFilterCombobox` to pick the company).

## `/profile/invoices` (`InvoicesContent.tsx`)

The payer's invoices newest first (`GET /api/me/invoices`), with an export that is
disabled when there is nothing to export.

## `/settings` (`components/settings/`)

The settings pills mirror Minty's tabs (Users, Entity & Integration, Petty Cash
Settings, Payment Settings — `SettingsPills.tsx`). Only **Payment Settings** lives here:
the account-code picker (`AccountCodeSettings.tsx` — which of the entity's bill account
codes are offered, default and order; elevated roles, backed by
`/api/entity-bill-accounts/*`). The other three link back to Minty's settings page for
the entity (`lib/mintyUrls.ts`), with a placeholder while unresolved.

## `/maintenance`

A static page the Vercel apps can be pointed at during a cutover window (Minty has no
maintenance gate of its own yet; a real `MAINTENANCE_MODE` is a Part 2 deliverable in
`Minty/docs/modernisation/modernisation_plan.md`).

## Tests

`e2e/03_payer_portal.spec.ts`: the *dark* describe (the profile shows no portal cards and
the portal pages go back to the profile — runs with `E2E_SUBSCRIPTIONS=0`) and the *live*
describe (profile, billing cards with an add action, invoices with export disabled,
manage subscriptions for a payer with none, the settings account-code picker — needs a
stack with subscriptions on). Both halves pass on 2026-09-18, on their respective stacks.
