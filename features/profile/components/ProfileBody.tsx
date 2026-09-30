// COPY of minty-web/features/profile/components/ProfileBody.tsx (2026-09-30) - lifted into
// @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port).

/**
 * My Profile's body (Figma 10-A / 10-B): the head, the details card, the `subscriptions` slot
 * and Log Out, with the loading and failed states. In minty-web both the `/profile` page and the
 * sidebar's My Profile draw it; here only the sidebar's (`ProfilePanel`) does. Whoever draws it
 * reads the profile (`useProfile`) and hands it in.
 */

import type { ReactNode } from "react";

import { DetailsCard } from "@/features/profile/components/DetailsCard";
import {
  LogOutButton,
  ProfileError,
  ProfileHero,
  ProfileLoading,
} from "@/features/profile/components/ProfileParts";
import type { ProfileModel } from "@/features/profile/hooks/useProfile";

export function ProfileBody({
  model: p,
  subscriptions,
}: {
  model: ProfileModel;
  /** The subscription feature's overview card, composed in by the shell - or nothing. */
  subscriptions?: ReactNode;
}) {
  return (
    <>
      {p.status === "loading" ? <ProfileLoading /> : null}
      {p.status === "error" ? <ProfileError message={p.error ?? ""} onRetry={p.retry} /> : null}
      {p.profile ? (
        <>
          <ProfileHero profile={p.profile} />
          <DetailsCard
            user={p.profile.user}
            draft={p.draft}
            saving={p.saving}
            error={p.saveError}
            onEdit={p.startEditing}
            onCancel={p.stopEditing}
            onChange={p.change}
            onSave={p.save}
          />
          {subscriptions}
        </>
      ) : null}
      <LogOutButton />
    </>
  );
}
