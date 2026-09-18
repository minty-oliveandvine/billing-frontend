# Payment-request browser tests

```bash
npm install
npm run test:e2e        # against a stack that is already running
```

Real browser, stack already up (Next :3000 `npm run dev`, billing-backend :8000, Minty :5001,
Postgres). Nothing is started here. Specs skip with a reason when a service or the credentials
are missing.

Why this exists: this app had no tests of any kind, and phase C8 of `docs/modernisation/modernisation_plan.md`
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
| `E2E_BASE_URL` / `E2E_BACKEND_URL` / `E2E_FLASK_URL` | the three hosts; default the local ports, set them to the deployed hosts for a run against a deployment |
| `E2E_SUBSCRIPTIONS` | `0` when the backends run with `SUBSCRIPTION_ENABLED=0` (the payer portal is dark) |
| `E2E_XERO` | `1` when the e2e entity is connected to a Xero organisation (a Demo Company, linked by hand): `04_xero_publish` runs and the supplier is `ABC Furniture` instead of the seed's placeholder; `E2E_SUPPLIER_QUERY` / `E2E_SUPPLIER` / `E2E_BILL_ACCOUNT_CODE` override the names |

Run the seed in the Minty repo before every run. Never commit any of these values.

## Specs

| File | Journeys |
|---|---|
| `01_handoff.spec.ts` | no token → module selection; the handoff sets the cookies and opens the list; the seven status tabs; the database entitlement (not the JWT claim) decides whether the module shows |
| `02_bill_lifecycle.spec.ts` | Add Payment dialog: save as draft (supplier and account-code pickers) → listed under Draft; Confirm without attachment/due date shows both validation alerts; the draft's detail page |
| `03_payer_portal.spec.ts` | profile, billing accounts, invoices, manage subscriptions, settings account-code picker |
| `04_xero_publish.spec.ts` | `E2E_XERO=1` only: a complete request (dates, attachment) confirmed → Payment Requested → Publish from the payment actions menu → Republish offered, also after a reload — the real ACCPAY invoice, attachment upload and the Minty token hand-off |

## Findings the suite records

- **F5** — FIXED in phase C7 (2026-09-17): `/api/me/subscriptions` answers 200 for a payer with no companies; the spec that recorded it passes.

## Not covered here

Stripe card capture. Submitting a request for real and publishing it are covered only by
`04_xero_publish` against a connected shop (`E2E_XERO=1`); without it the attachment upload
stays with billing-backend's API tests (storage stubbed).
