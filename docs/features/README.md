# Features — the payment-request app

`billing-frontend` is the Next.js browser of the bills module. People arrive from Minty
with a token, work on payment requests against billing-backend, and — when subscriptions
are on — manage what they pay for against Minty's payer API. Nothing is decided here that
a backend does not re-check.

| Feature | Document |
|---|---|
| Arriving with Minty's token, the cookies, refresh, what the role changes on screen, the module gate | [authentication.md](authentication.md) — the system-wide picture is `Minty/docs/features/authentication.md` |
| The list (tabs, filters, table / easy view), the Add Payment dialog, the detail page (attachments, payments, publish, activity) | [payment-requests.md](payment-requests.md) |
| The payer portal (`/profile/*`), the settings page, the maintenance page, the dark switch | [payer-portal.md](payer-portal.md) |
| User-facing error copy | [../ERROR_COPY.md](../ERROR_COPY.md) |

Running it and the environment variables: the repo `README.md`. Tests: `npm run test:e2e`
(Playwright against a running stack — `e2e/README.md`; 15 specs on 2026-09-18, of which
the Xero publish needs `E2E_XERO=1` and the live payer portal a stack with subscriptions
on). The cleanse log is in `../code_cleanse/`.
