# Payment-request browser tests

```bash
npm install
npm run test:e2e        # against a stack that is already running
```

Real browser, stack already up (Next :3000 `npm run dev`, billing-backend :8000, Minty :5001,
Postgres). Nothing is started here. Specs skip with a reason when a service or the credentials
are missing.

Why this exists: this app had no tests of any kind, and phase C8 of `docs/modernisation_plan.md`
(in the Minty repo) changes what it renders — `bill_status` (`voided → void`, dead members gone),
`publish_state` (`not_published → draft`) and the bill payload. The status tabs, the labels on
the action bar and the payer portal are pinned here first.

## Credentials

The specs arrive the way Minty sends people: `/landing?token=<jwt>`. They mint that JWT
themselves with the shared `SECRET_KEY` (see `e2e/helpers.ts` for why nothing is bypassed):

| Variable | What |
|---|---|
| `E2E_JWT_SECRET` | the `SECRET_KEY` shared by Minty and billing-backend |
| `E2E_MINTY_USER` / `E2E_MINTY_ENTITY` | the identity `Minty/scripts/e2e_seed.py --print` creates — the entity has the BILL module on, synced suppliers and bill account codes |
| `E2E_MINTY_ENTITY_NAME` | optional, default `E2E Petty Cash Shop` |

Run the seed in the Minty repo before every run. Never commit any of these values.

## Specs

| File | Journeys |
|---|---|
| `01_handoff.spec.ts` | no token → module selection; the handoff sets the cookies and opens the list; the seven status tabs; the database entitlement (not the JWT claim) decides whether the module shows |
| `02_bill_lifecycle.spec.ts` | Add Payment dialog: save as draft (supplier and account-code pickers) → listed under Draft; Confirm without attachment/due date shows both validation alerts; the draft's detail page |
| `03_payer_portal.spec.ts` | profile, billing accounts, invoices, manage subscriptions, settings account-code picker |

## Findings the suite records

- **F5** `Minty/blueprints/subscription/services/portal.py` `build_payer_subscriptions`: a payer with
  no subscribed entities gets a 500 from `/api/me/subscriptions` (`paid_through` referenced
  outside the loop that assigns it); the page shows "Try again". `test.fail()` until phase C7.

## Not covered here

Submitting a request for real (it uploads the attachment to the bucket — covered by
billing-backend's API tests with storage stubbed), Xero publish, Stripe card capture.
