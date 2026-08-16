"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Header } from "@/components/layout";
import type { Crumb } from "@/components/layout/Header";
import {
  PORTAL_TAB_LABELS,
  PortalTabs,
  type PortalTabId,
} from "@/components/profile/PortalTabs";
import { logoutSession } from "@/lib/api";
import { clearAuth, getAuth, type AuthInfo } from "@/lib/auth";
import { MINTY_MODULE_URL as MODULE1_URL } from "@/lib/mintyUrls";

/**
 * Chrome shared by the three payer-portal pages.
 *
 * The design draws a bare breadcrumb bar here. This uses the app's own `Header`
 * instead — same back link and title, but it keeps the avatar, the nav menu and Log
 * out, which the bare bar would have quietly removed from every screen in the portal.
 *
 * The page background is the portal's own light grey (#F7F9FA) rather than the app's
 * white: the content is a card floating on it, and on white the card's border is the
 * only thing separating table from page.
 */
export function PortalShell({
  tab,
  children,
  title,
  subtitle,
  crumbs,
  showTabs = true,
}: {
  tab: PortalTabId;
  children: ReactNode;
  /** Overrides the tab's own name — for a sub-page like "Billing account". */
  title?: string;
  subtitle?: string;
  /**
   * The header trail. Defaults to `My Profile › <section>`, which is what the section
   * pages want; a sub-page passes its own deeper one.
   */
  crumbs?: Crumb[];
  /** Off for sub-pages: the tab bar switches between SECTIONS, and a form is inside one. */
  showTabs?: boolean;
}) {
  const [auth, setAuth] = useState<AuthInfo | null>(null);

  useEffect(() => {
    setAuth(getAuth());
  }, []);

  // Server call drops sign-in presence; the Minty session survives so the entity
  // list is still reachable. See app/profile/page.tsx.
  const handleLogout = async () => {
    await logoutSession();
    clearAuth();
    window.location.href = `${MODULE1_URL}/entity`;
  };

  const entityName = (auth?.entityName ?? "").trim();
  const entityAbbr = entityName
    ? entityName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3)
    : "---";

  return (
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-[#F7F9FA] pb-[env(safe-area-inset-bottom,0px)]">
      <Header
        title={title ?? PORTAL_TAB_LABELS[tab]}
        showLogo={false}
        crumbs={
          crumbs ?? [
            { label: "My Profile", href: "/profile" },
            { label: PORTAL_TAB_LABELS[tab] },
          ]
        }
        companyName={!auth ? "Loading…" : entityName || "—"}
        companyAbbreviation={entityAbbr}
        onLogout={handleLogout}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-7">
          <h1 className="text-2xl font-bold text-[#21262E] sm:text-[26px]">
            {title ?? PORTAL_TAB_LABELS[tab]}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[15px] text-[#6B7380]">{subtitle}</p>
          ) : null}
          {showTabs ? (
            <div className="mb-5 mt-5">
              <PortalTabs active={tab} />
            </div>
          ) : (
            <div className="mb-5" />
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
