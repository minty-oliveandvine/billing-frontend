# Features — the payment-request app

`billing-frontend` is the Next.js browser of the bills module. People arrive from Minty
with a token, work on payment requests against billing-backend, set the payment account codes,
and see their profile and subscriptions overview in the sidebar drawer (managing subscriptions
is minty-web's). Nothing is decided here that a backend does not re-check.

| Feature | Document |
|---|---|
| Arriving with Minty's token, the cookies, refresh, what the role changes on screen, the module gate | [authentication.md](authentication.md) — the system-wide picture is `Minty/docs/features/authentication.md` |
| The list (tabs, filters, table / easy view), the Add Payment dialog, the detail page (attachments, payments, publish, activity) | [payment-requests.md](payment-requests.md) |
| Payment Settings (`/settings`), the maintenance page | [settings.md](settings.md) |
| The old payer portal (`/profile/*`) — moved to minty-web on 2026-10-01; its addresses forward there | [payer-portal.md](payer-portal.md) |
| The sidebar on every page - the menu and My Profile, copied from minty-web for `@minty/shared` | [sidebar.md](sidebar.md) |
| User-facing error copy | [../ERROR_COPY.md](../ERROR_COPY.md) |

Email fields take English only (2026-10-01): My Profile's email spreads `useEmailInput` from
`lib/emailInput.ts`, a copy of minty-web's. The input is `type="text" inputMode="email"`, anything
outside printable ASCII is dropped once an IME composition ends, and the field says why. Flask
refuses such an address again on save. See minty-web's `docs/features/README.md`.

Running it and the environment variables: the repo `README.md`. Tests: `npm run test:e2e`
(Playwright against a running stack — `e2e/README.md`; the Xero publish needs `E2E_XERO=1`). The cleanse log is in `../code_cleanse/`.
