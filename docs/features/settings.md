# Payment Settings (`/settings`) and the maintenance page

Moved out of `payer-portal.md` on 2026-10-01, when the profile and payer-portal pages left this
app for minty-web.

## `/settings` (`components/settings/`)

The settings pills mirror Minty's tabs (Users, Entity & Integration, Petty Cash
Settings, Payment Settings — `SettingsPills.tsx`). Only **Payment Settings** lives here:
the account-code picker (`AccountCodeSettings.tsx` — which of the entity's bill account
codes are offered, default and order; elevated roles, backed by
`/api/entity-bill-accounts/*`). The other three link back to Minty's settings page for
the entity (`lib/mintyUrls.ts`), with a placeholder while unresolved. The sidebar's
**Settings** opens this page ([sidebar.md](sidebar.md)).

## `/maintenance`

A static page the Vercel apps can be pointed at during a cutover window (Minty has no
maintenance gate of its own yet; a real `MAINTENANCE_MODE` is a Part 2 deliverable in
`Minty/docs/modernisation/modernisation_plan.md`).

## Tests

`e2e/06_settings.spec.ts`: the account-code picker offers the entity's seeded codes.
