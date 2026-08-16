"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout";
import { MyProfileContent } from "@/components/profile/MyProfileContent";
import {
  getAuth,
  clearAuth,
  getHandoffOrigin,
  type AuthInfo,
  type HandoffOrigin,
} from "@/lib/auth";
import { deactivateAccount, fetchXeroStatus, logoutSession } from "@/lib/api";
import { useEntitlements } from "@/lib/moduleClaims";
import { buildMintyEnterUrl, MINTY_MODULE_URL as MODULE1_URL } from "@/lib/mintyUrls";

export default function ProfilePage() {
  const [auth, setAuthState] = useState<AuthInfo | null>(null);
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);
  const [from, setFrom] = useState<HandoffOrigin>("pettycash");
  const { billingEnabled } = useEntitlements();

  useEffect(() => {
    const a = getAuth();
    setAuthState(a);
    setFrom(getHandoffOrigin());
    if (a?.token) {
      void fetchXeroStatus().then(setXeroConnected);
    }
  }, []);

  // The server call is what drops the user's sign-in presence — it is why they
  // leave Minty's Settings > Users list. clearAuth() drops the billing cookies.
  //
  // The redirect lands on Minty's entity list, not its /logout: the Minty session
  // deliberately survives, so the user can pick another company instead of signing
  // in again. That works because presence tells "signed out" apart from "never
  // stamped" (see services/user_presence.py in Minty) — landing on an authenticated
  // Minty page does NOT put them back on the list.
  const handleLogout = async () => {
    await logoutSession();
    clearAuth();
    window.location.href = `${MODULE1_URL}/entity`;
  };

  // Not a logout: the user is still signed in, they just have no membership of this
  // company any more. Their token was only valid because of that membership, so it
  // is already dead — clear it and hand them back to the company list to pick
  // another. Minty's session is left alone, so they stay signed in there.
  // The account is switched off, so unlike Log out there is nothing to come back to:
  // the Minty session has to end as well, or they would keep browsing on a session
  // belonging to an account that can no longer sign in.
  const handleAccountDeactivated = () => {
    clearAuth();
    window.location.href = `${MODULE1_URL}/logout`;
  };

  const entityNameTrim = (auth?.entityName ?? "").trim();
  const entityAbbr = entityNameTrim
    ? entityNameTrim
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3)
    : "---";

  /**
   * Back to WHERE THEY CAME FROM, which is not always this app.
   *
   * The profile is shared: it is reached from Payment Request and from Petty Cash, and
   * from the entity list with no company at all. The link used to read "Payments" and
   * point at `/` for anyone with an entity — so a Petty Cash user who opened their
   * profile was offered a way into a module their company may never have bought, and
   * taking it landed them on a Payment Request page that failed every call.
   *
   * Two conditions, and both are needed. Provenance alone would send a Payment Request
   * user back into a module that has since lapsed; entitlements alone would send a Petty
   * Cash user to Payments merely because the company happens to own it.
   *
   * Petty Cash goes through `/enter` so the billing token buys a Flask session on the way
   * in — a bare Minty path would land them on the login form.
   */
  const hasEntity = !!auth?.entityId;
  const backToPayments = hasEntity && from === "bills" && billingEnabled;

  const backHref = !hasEntity
    ? `${MODULE1_URL}/entity`
    : backToPayments
      ? "/"
      : buildMintyEnterUrl(`/entity/${auth!.entityId}`);
  const backLabel = !hasEntity
    ? "Entity List"
    : backToPayments
      ? "Payments"
      : "Petty Cash";

  return (
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <Header
        title="My Profile"
        showLogo={false}
        backHref={backHref}
        backLabel={backLabel}
        companyName={!auth ? "Loading…" : entityNameTrim || "—"}
        companyAbbreviation={entityAbbr}
        onLogout={handleLogout}
        xeroConnected={xeroConnected}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {/* Sign out shows only on the UNSCOPED profile — the one reached from the
            entity list. It closes the whole account, not this company, so offering it
            from inside a company would read as "leave this one". */}
        <MyProfileContent
          onLogOut={handleLogout}
          showAccountSignOut={!hasEntity}
          onAccountDeactivated={handleAccountDeactivated}
        />
      </main>
    </div>
  );
}
