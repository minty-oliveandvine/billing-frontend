// COPY of minty-web/features/profile (2026-09-30) - lifted into @minty/shared at Part 3 step 4.

/**
 * THE public surface of the My Profile copy: `app/layout.tsx` composes `ProfilePanel` into the
 * sidebar's slot, and nothing else imports anything deeper - the rule minty-web's boundaries
 * enforce, kept here by hand. `ProfilePanel` takes one slot, `subscriptions`, which the shell
 * fills with the subscription feature's overview card: features meet only in `app/`.
 */

export { ProfilePanel } from "@/features/profile/routes/ProfilePanel";
