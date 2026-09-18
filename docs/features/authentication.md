# Authentication — billing-frontend's half

Nobody signs in here. Minty (Flask) authenticates the person, mints a short-lived JWT and
sends the browser to this app; everything after that is carrying that token to
billing-backend, and — for the payer portal — straight to Minty. The system-wide picture
is `Minty/docs/features/authentication.md`; billing-backend's verification is
`billing-backend/docs/features/authentication.md`.

## Arriving: `/landing`

Minty links **Payments** to `/landing?token=<jwt>&entity_id=&entity_name=&next=&from=`
(`app/landing/page.tsx`). The page stores the token, the entity id and name in cookies
(`lib/auth.ts`: `billing_token`, `billing_entity_id`, `billing_entity_name`, `SameSite=Lax`,
`Secure` on https, **8 hours**), records where the person came from (`billing_from`,
`bills` or `pettycash` — provenance for the "back" links only, never a permission), and
forwards to `next` (the bill list by default). Without a token the middleware sends every
page except `/landing` and `/module-selection` to `/module-selection`
(`middleware.ts`), which offers the way back into Minty.

The cookies are readable by script on purpose (the app itself attaches the token); they
are cleared client-side on logout and by `POST /api/auth/logout` on the backend.

## Using the token

`lib/api.ts::apiFetch` sends `Authorization: Bearer <token>` and `X-Entity-Id` on every
call to billing-backend (`NEXT_PUBLIC_MODULE2_BACKEND_URL`). The JWT itself lives **30
minutes**; the cookie 8 hours; `lib/auth.ts::refreshToken` calls
`POST /api/auth/token/refresh` when the token is expiring soon (`isTokenExpiringSoon`) so
an open tab keeps working — a 401 that survives a refresh sends the person back to Minty
(`/entity/<id>/enter`).

The role and the module claims in the token (`lib/moduleClaims.ts`, `useUserRole`) are
read for the **first paint only**; `components/ModuleGate.tsx` then confirms the
entitlement from `GET /api/auth/entitlements` and the backend re-checks role and
membership on every call — the database decides, not the claim
(`e2e/01_handoff.spec.ts` proves it).

## What the role changes on screen

`useUserRole()` decides which actions render: cashiers and shop managers create and
edit; accountant / admin / super_admin (the *elevated* roles) also record payments,
return, void and publish. The backend refuses the rest regardless
(`billing-backend/core/permissions.py`).

## The payer portal talks to Minty directly

`/profile/subscriptions`, `/profile/billing`, `/profile/invoices` and the subscription
notice fetch Minty's `/api/me/*` with the same billing JWT (`lib/payerPortal.ts`,
`lib/subscriptionNotice.ts`; the origin from `lib/mintyEnv.ts`): Minty signed it, so
Minty verifies it. No entity id travels — the endpoints filter on the payer in the token.
While subscriptions are dark those endpoints answer 404, so the portal is hidden
([payer-portal.md](payer-portal.md)).

## Configuration

`NEXT_PUBLIC_MODULE2_BACKEND_URL` (billing-backend), `NEXT_PUBLIC_MODULE1_URL` or
`NEXT_PUBLIC_APP_ENV` + `NEXT_PUBLIC_MODULE1_URL_<ENV>` (Minty — see the apex/www trap in
the `README`), `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`; all inlined at build time.

## Tests

`e2e/01_handoff.spec.ts` (no token → module selection; the hand-off sets the cookies; the
database entitlement decides). There is no unit-test runner in this repo — the Playwright
suite is the test suite, and it mints its own token with the shared `SECRET_KEY`
(`e2e/README.md`).
