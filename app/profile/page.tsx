"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout";
import { MyProfileContent } from "@/components/profile/MyProfileContent";
import { getAuth, clearAuth, type AuthInfo } from "@/lib/auth";
import { fetchXeroStatus } from "@/lib/api";
import { MINTY_MODULE_URL as MODULE1_URL } from "@/lib/mintyUrls";

export default function ProfilePage() {
  const [auth, setAuthState] = useState<AuthInfo | null>(null);
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);

  useEffect(() => {
    const a = getAuth();
    setAuthState(a);
    if (a?.token) {
      void fetchXeroStatus().then(setXeroConnected);
    }
  }, []);

  const handleLogout = () => {
    clearAuth();
    window.location.href = `${MODULE1_URL}/entity`;
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

  const hasEntity = !!auth?.entityId;
  const backHref = hasEntity ? "/" : `${MODULE1_URL}/entity`;
  const backLabel = hasEntity ? "Bills" : "Entity List";

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
        <MyProfileContent onLogOut={handleLogout} />
      </main>
    </div>
  );
}
