"use client";

import { useCallback, useEffect, useState } from "react";
import {
  paymentRequestDetailCancelButtonClass,
  paymentRequestDetailSaveButtonClass,
} from "@/components/payment-request/PaymentRequestDetailedInfo";
import { ConfirmDialog } from "@/components/payment-request/ConfirmDialog";
import { ProfilePortalLinks } from "@/components/profile/ProfilePortalLinks";
import {
  ApiError,
  deactivateAccount,
  fetchAuthMe,
  updateProfile,
  type AuthMeUser,
} from "@/lib/api";

export type MyProfileContentProps = {
  onLogOut: () => void;
  /**
   * Whether to offer Sign out — closing the ACCOUNT, not leaving a company.
   *
   * True only on the profile reached from the entity list, where no company is in
   * scope. Inside a company the same button would read as "leave this one", which is
   * not what it does.
   */
  showAccountSignOut?: boolean;
  /** Called once the account is switched off, to take the user out of the app. */
  onAccountDeactivated?: () => void;
};

/**
 * The profile's card language, shared by the email and name cards — and matched by
 * `ProfilePortalLinks` above them, so all five cards on the screen read as one stack.
 *
 * The icon tiles that used to head each card are gone. With three navigation cards now
 * sitting above these two, a column of teal squares was doing the opposite of its job:
 * it made every card look equally clickable, when only three of them are.
 *
 * The email card's Edit needed the backend fixed before it could exist. Minty signs
 * users in on `User.username` (auth/routes/login.py) and sets it from the email at
 * registration, while password reset looks up `User.email` — and `PUT /profile/me` used
 * to write `email` alone, which would have left an account signing in under the old
 * address and resetting under the new one. `update_user_profile` now moves the login
 * handle with the address and refuses one another account holds; this card is safe on
 * top of that, not instead of it.
 */
const PROFILE_CARD_CLASS =
  "rounded-[14px] border border-gray-200 bg-white px-5 py-[18px] shadow-[0_4px_14px_rgba(15,23,41,0.05)]";
const PROFILE_CARD_LABEL_CLASS =
  "block text-[15px] font-bold uppercase leading-tight text-[#16202E] sm:text-base";
const PROFILE_CARD_VALUE_CLASS = "text-[15px] font-bold text-[#6B7280]";
const PROFILE_CARD_INPUT_CLASS =
  "mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-[15px] font-bold text-[#16202E] focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60";

function initialsFromNames(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const a = f.charAt(0);
  const b = l.charAt(0);
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  if (b) return b.toUpperCase();
  return "—";
}

function displayName(me: AuthMeUser | null): string {
  if (!me) return "—";
  const parts = [me.first_name, me.last_name].map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

export function MyProfileContent({
  onLogOut,
  showAccountSignOut = false,
  onAccountDeactivated,
}: MyProfileContentProps) {
  const [profile, setProfile] = useState<AuthMeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [updateHint, setUpdateHint] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  /** The email card edits independently of the name card — one Edit each, as designed. */
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Closing the account — its own state, so a refusal never clears a name/email edit. */
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const me = await fetchAuthMe();
      setProfile(me);
    } catch (e) {
      setProfile(null);
      setError(e instanceof ApiError ? e.message : "Your profile didn't come through. Mind trying again?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const handleUpdateProfile = () => {
    setRefreshTick((n) => n + 1);
    setUpdateHint(true);
    window.setTimeout(() => setUpdateHint(false), 2500);
  };

  const handleEditClick = () => {
    if (!profile) return;
    setEditFirstName((profile.first_name ?? "").trim());
    setEditLastName((profile.last_name ?? "").trim());
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  const handleEditEmailClick = () => {
    if (!profile) return;
    setEditEmail((profile.email ?? "").trim());
    setSaveError(null);
    setIsEditingEmail(true);
  };

  const handleCancelEmailEdit = () => {
    setIsEditingEmail(false);
    setSaveError(null);
  };

  /**
   * The one write path, shared by both cards.
   *
   * `PUT /profile/me` replaces all three fields, so whichever card is being edited has
   * to send the other two as they stand — otherwise saving a new email would blank the
   * name. Each card passes only its own patch and the rest comes from `profile`.
   *
   * Server-side validation is what actually decides an email is acceptable: it refuses
   * addresses another account holds and keeps the login handle in step (see
   * `update_user_profile`). A 422 comes back with copy meant for a person, and
   * `ApiError` passes that through untouched, so it is shown as-is.
   */
  const persistProfile = async (patch: {
    email?: string;
    first_name?: string;
    last_name?: string;
  }): Promise<boolean> => {
    const email = (patch.email ?? profile?.email ?? "").trim();
    if (!email) {
      setSaveError("We'll need an email here.");
      return false;
    }

    setSaving(true);
    setSaveError(null);

    try {
      await updateProfile({
        email,
        first_name: (patch.first_name ?? profile?.first_name ?? "").trim(),
        last_name: (patch.last_name ?? profile?.last_name ?? "").trim(),
      });

      setRefreshTick((n) => n + 1);
      setUpdateHint(true);
      window.setTimeout(() => setUpdateHint(false), 2500);
      return true;
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "That didn't quite save. Mind trying again?");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    const saved = await persistProfile({
      first_name: editFirstName,
      last_name: editLastName,
    });
    // Stay in the form when it failed, so the rejected value is still there to fix.
    if (saved) setIsEditing(false);
  };

  const handleSaveEmail = async () => {
    const saved = await persistProfile({ email: editEmail });
    if (saved) setIsEditingEmail(false);
  };

  /**
   * The refusal is the server's call, not the client's. Whether this person's card
   * pays for any of their companies is a question about every company they belong
   * to, and the browser can see none of them — guessing would either hide the
   * button from people allowed to use it or promise an action that fails. So the
   * button is always live and the 422, which NAMES the companies still on their
   * card, does the explaining inside the dialog where they are still looking.
   */
  const handleConfirmSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await deactivateAccount();
      setConfirmSignOutOpen(false);
      onAccountDeactivated?.();
    } catch (e) {
      setSignOutError(
        e instanceof ApiError ? e.message : "That didn't go through. Mind trying again?",
      );
    } finally {
      setSigningOut(false);
    }
  };

  const abbr = initialsFromNames(profile?.first_name, profile?.last_name);
  const emailRaw = (profile?.email ?? "").trim();
  const emailDisplay = loading ? "…" : emailRaw || "—";

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#FFE6B1] text-3xl font-semibold text-[#6B3A12] sm:h-28 sm:w-28 sm:text-[2rem]">
            {loading ? <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary/30" aria-hidden /> : abbr}
          </div>
        </div>
        <h1 className="mt-5 text-xl font-bold text-black sm:text-2xl">{loading ? "…" : displayName(profile)}</h1>
      </div>

      {/* Above the portal cards, not below them. This is the "your profile didn't load"
          failure, and everything under it — Manage subscriptions, Billing, Invoices — is
          what the reader is about to click. Printed after that stack it was off the
          bottom of the screen on a phone, so the first sign of trouble was a card that
          did not work. */}
      {error ? (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </div>
      ) : null}

      <ProfilePortalLinks />

      {/* Stays here: this one belongs to the fields below, not to the cards above. */}
      {saveError ? (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-[18px]">
        <section className={PROFILE_CARD_CLASS} aria-label="Email address">
          <div className="flex items-start justify-between gap-4">
            {!isEditingEmail ? (
              <h2 className={PROFILE_CARD_LABEL_CLASS}>Email address</h2>
            ) : (
              <label htmlFor="email" className={PROFILE_CARD_LABEL_CLASS}>
                Email address
              </label>
            )}
            {!isEditingEmail ? (
              <button type="button" onClick={handleEditEmailClick} disabled={loading} className="shrink-0 cursor-pointer select-none text-sm font-semibold text-[#2E9B9B] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50" title="Edit email address">
                Edit
              </button>
            ) : (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={handleCancelEmailEdit} disabled={saving} className={paymentRequestDetailCancelButtonClass}>
                  Cancel
                </button>
                <button type="button" onClick={handleSaveEmail} disabled={saving} className={paymentRequestDetailSaveButtonClass}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
          {!isEditingEmail ? (
            <p className={`mt-3 break-all ${PROFILE_CARD_VALUE_CLASS}`}>{emailDisplay}</p>
          ) : (
            <>
              <input id="email" type="email" inputMode="email" autoComplete="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={saving} className={PROFILE_CARD_INPUT_CLASS} placeholder="you@company.com" />
              {/* Said before the change, not after: this is the address the account signs
                  in and resets its password with, and that is not obvious from a field
                  labelled "email address". */}
              <p className="mt-2 text-xs text-primary/70">
                This is what you sign in and reset your password with — it changes both.
              </p>
            </>
          )}
        </section>

        <section className={PROFILE_CARD_CLASS} aria-label="Name">
          <div className="flex items-start justify-between gap-4">
            {!isEditing ? (
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-10 text-left">
                <div className="min-w-0">
                  <h2 className={PROFILE_CARD_LABEL_CLASS}>First name</h2>
                  <p className={`mt-1.5 truncate ${PROFILE_CARD_VALUE_CLASS}`}>
                    {loading ? "…" : (profile?.first_name ?? "").trim() || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <h2 className={PROFILE_CARD_LABEL_CLASS}>Last name</h2>
                  <p className={`mt-1.5 truncate ${PROFILE_CARD_VALUE_CLASS}`}>
                    {loading ? "…" : (profile?.last_name ?? "").trim() || "—"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 text-left">
                <div className="min-w-0">
                  <label htmlFor="firstName" className={PROFILE_CARD_LABEL_CLASS}>
                    First name
                  </label>
                  <input id="firstName" type="text" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} disabled={saving} className={PROFILE_CARD_INPUT_CLASS} placeholder="First name" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="lastName" className={PROFILE_CARD_LABEL_CLASS}>
                    Last name
                  </label>
                  <input id="lastName" type="text" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} disabled={saving} className={PROFILE_CARD_INPUT_CLASS} placeholder="Last name" />
                </div>
              </div>
            )}
            {!isEditing ? (
              <button type="button" onClick={handleEditClick} disabled={loading} className="shrink-0 cursor-pointer select-none text-sm font-semibold text-[#2E9B9B] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50" title="Edit name">
                Edit
              </button>
            ) : (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={handleCancelEdit} disabled={saving} className={paymentRequestDetailCancelButtonClass}>
                  Cancel
                </button>
                <button type="button" onClick={handleSaveProfile} disabled={saving} className={paymentRequestDetailSaveButtonClass}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-sm text-primary/80">
          <a href="https://identity.xero.com/account" target="_blank" rel="noopener noreferrer" className="cursor-pointer font-semibold text-secondary underline underline-offset-2 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            Reset Password
          </a>
        </p>
      </div>

      {updateHint ? (
        <p className="mt-4 text-center text-sm text-primary/70" role="status">
          Profile refreshed from server.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {/* Sign out closes the ACCOUNT; Log out below ends the SESSION. Two
            near-synonyms for outcomes that could not differ more, and the labels alone
            do not distinguish them — the confirm dialog is now the only thing that
            says which one is permanent, so it has to keep saying it. */}
        {showAccountSignOut && onAccountDeactivated ? (
          <button
            type="button"
            onClick={() => {
              setSignOutError(null);
              setConfirmSignOutOpen(true);
            }}
            className="box-border flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-[#FF6B6B] bg-white text-sm font-semibold text-[#FF6B6B] transition-colors hover:bg-[#FF6B6B]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B6B]"
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              no_accounts
            </span>
            Sign out
          </button>
        ) : null}

        <button type="button" className="box-border flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-[#FF6B6B] bg-white text-sm font-semibold text-[#FF6B6B] transition-colors hover:bg-[#FF6B6B]/10" onClick={() => onLogOut()}>
          <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
            logout
          </span>
          Log out
        </button>
        <button type="button" onClick={handleUpdateProfile} disabled={loading} className="box-border flex h-12 w-full cursor-pointer items-center justify-center rounded-lg border border-transparent bg-secondary text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          Update profile
        </button>
      </div>

      {showAccountSignOut ? (
        <ConfirmDialog
          open={confirmSignOutOpen}
          zIndex={430}
          pending={signingOut}
          onClose={() => setConfirmSignOutOpen(false)}
          onConfirm={handleConfirmSignOut}
          title="Sign out of Minty for good?"
          confirmLabel={signingOut ? "Signing out…" : "Sign out"}
        >
          This closes your account across every company you belong to — not just this
          session, and not just one company. You won&apos;t be able to sign in again.
          Everything you recorded stays where it is, attributed to you, so your companies
          keep their history.
          {signOutError ? (
            <span className="mt-3 block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {signOutError}
            </span>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
