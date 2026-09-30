// COPY of minty-web/features/profile/api/profile.ts (2026-09-30) - lifted into @minty/shared at
// Part 3 step 4; change all three (minty-web, here, Flask's port). Flask is reached through this app's host (sidebarHost.mintyFetch).

/**
 * My Profile's reads and its one write: Flask's `GET` / `PATCH /api/me/profile` (Minty's
 * `blueprints/user_management/routes/me_api.py`, rules in `services/profile.py`) - identity is
 * Flask's until minty-accounts-api takes this contract in Part 3.
 *
 * `entityId` names the company the profile was opened from (`?entity=`): the answer then says
 * the company, the person's role there and its modules. Flask refuses a company the person may
 * not see (403) - the cookie's company is the only one ever sent.
 */

import { mintyFetch } from "@/components/ui/sidebarHost";

export type ProfileUser = {
  id: string;
  first_name: string;
  last_name: string;
  /** "First Last", or the email when the account has no name. */
  name: string;
  /** The avatar's letters; "?" with no name at all. */
  initials: string;
  email: string;
};

export type ProfileCompany = {
  id: string;
  name: string;
  /** `entity_role`, or null for a superuser who is not a member. */
  role: string | null;
  /** "Shop Manager" - Flask's own words for the role. */
  role_label: string | null;
  /** Module codes switched on: `PETTY_CASH`, `PAYMENT_REQUEST`. */
  modules: string[];
};

export type Profile = { user: ProfileUser; entity: ProfileCompany | null };

export type ProfileChanges = Partial<Pick<ProfileUser, "first_name" | "last_name" | "email">>;

const query = (entityId: string | null | undefined) => ({ entity: entityId || undefined });

export function fetchProfile({
  entityId,
  signal,
}: { entityId?: string | null; signal?: AbortSignal } = {}): Promise<Profile> {
  return mintyFetch<Profile>("/api/me/profile", { query: query(entityId), signal });
}

/** Saves the person's own name and email; answers with the fresh profile. A refusal rejects
 *  with Flask's sentence (422), to be shown as it stands. */
export function saveProfile(changes: ProfileChanges, entityId?: string | null): Promise<Profile> {
  return mintyFetch<Profile>("/api/me/profile", {
    method: "PATCH",
    json: changes,
    query: query(entityId),
  });
}
