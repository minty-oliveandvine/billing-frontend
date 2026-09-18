# Billing frontend

The payment-request (Module 2) app: the bill list and detail screens, publishing to Xero, and
the payer portal under `/profile` (subscriptions, invoices, cards, incoming transfers).
Next.js 16 (App Router) + React 19, on **port 3000**.

```bash
npm install
npm run dev          # http://localhost:3000, bound to 0.0.0.0
```

People do not sign in here. Minty sends them to `/landing?token=<jwt>` and
[`lib/auth.ts`](lib/auth.ts) keeps that token, the entity id and name in cookies; every
call to the billing backend carries it as a bearer token.

## It talks to two backends

| What                                            | Service                                    | Resolved in                                                                 |
| ----------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `/api/*` — bills, payments, Xero, payer portal  | billing-backend (Django, port 8000)        | [`lib/apiBase.ts`](lib/apiBase.ts) — `NEXT_PUBLIC_MODULE2_BACKEND_URL`, default `http://localhost:8000` |
| links back to Minty (users, Xero, settings, logout) | Minty (Flask, port 5001)               | [`lib/mintyEnv.ts`](lib/mintyEnv.ts) — `NEXT_PUBLIC_MODULE1_URL`, else picked by `NEXT_PUBLIC_APP_ENV` (`development` / `prestaging` / `staging` / `production`), each with its own `NEXT_PUBLIC_MODULE1_URL_<ENV>` override and a hosted default |
| the payer portal (`/profile/subscriptions`, `/profile/billing`, `/profile/invoices`) shown at all | Minty's `SUBSCRIPTION_ENABLED` switch | [`lib/subscriptions.ts`](lib/subscriptions.ts) — `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`; `0` hides the three profile cards and redirects the pages to `/profile` (middleware). ON when unset, unlike the backends, so a bare `next dev` keeps the portal reachable; the deployed app is set to `0` at the cutover together with Minty and onboarding-backend, because Minty answers every `/api/me/*` call with 404 while dark |

`NEXT_PUBLIC_*` is inlined at build time, so set these in the deployed environment before
building; an unset backend URL silently means `localhost`. The three `NEXT_PUBLIC_MINTY_*_PATH`
variables in [`lib/mintyUrls.ts`](lib/mintyUrls.ts) only change which Minty page a link opens
and can normally stay unset.

## Scripts

|                     |                                                                                  |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | dev server on 3000                                                               |
| `npm run build`     | production build                                                                 |
| `npm run start`     | serve the production build                                                       |
| `npm run lint`      | eslint                                                                           |
| `npm run typecheck` | `tsc --noEmit`                                                                   |
| `npm run test:e2e`  | Playwright, against a stack that is already running — see [e2e/README.md](e2e/README.md) |

There is no CI in this repo (the two workflows that used to be here targeted branches that no
longer exist), so a gate is a command somebody runs: `lint`, `typecheck` and `build` before a
commit, `test:e2e` before a merge.

## Testing

The only tests are the Playwright specs in `e2e/`. They need Next, billing-backend, Minty and
Postgres all up, mint their own JWT from the shared `SECRET_KEY`, and sign in as the entity
`Minty/scripts/e2e_seed.py` creates — [e2e/README.md](e2e/README.md) has the variables and
the reason nothing is bypassed. Specs skip with a reason when a service is missing.

## Before changing anything

- [`docs/ERROR_COPY.md`](docs/ERROR_COPY.md) — the user-facing error standard shared across the
  Minty repos. A failure is a sentence, not a status; `detail` from the backend is rendered as
  is when it reads as one.
- [`docs/code_cleanse/CODE_CLEANSE_NOTES.md`](docs/code_cleanse/CODE_CLEANSE_NOTES.md) — the
  July cleanse of `lib/` and `components/`: what was deliberately kept and why. Historical, but
  several things that look like dead code are explained there.

## Docker

[`docker/Dockerfile`](docker/Dockerfile) is the dev image — dependencies only, source is
bind-mounted by `docker/stack/docker-compose.yml` in the Minty repo.
