"use client";

import { useCallback, useEffect, useState } from "react";
import { EasyViewToggle, Header } from "@/components/layout";
import { PaymentRequestView } from "@/components/payment-request";
import { getAuth, clearAuth, type AuthInfo } from "@/lib/auth";
import { fetchXeroStatus, fetchMe } from "@/lib/api";
import { MINTY_MODULE_URL as MODULE1_URL } from "@/lib/mintyUrls";

const API_BASE =
  process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000";

const EASY_VIEW_STORAGE_KEY = "payment-request-easy-view";

function readStoredEasyView(): boolean | null {
  try {
    const raw = localStorage.getItem(EASY_VIEW_STORAGE_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    /* private mode / unavailable */
  }
  return null;
}

export default function Home() {
  const [auth, setAuthState] = useState<AuthInfo | null>(null);
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);
  const [easyView, setEasyViewState] = useState(true);

  useEffect(() => {
    const stored = readStoredEasyView();
    if (stored !== null) setEasyViewState(stored);
  }, []);

  const setEasyView = useCallback((next: boolean) => {
    setEasyViewState(next);
    try {
      localStorage.setItem(EASY_VIEW_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const a = getAuth();
    setAuthState(a);
    if (a?.token) {
      fetchXeroStatus().then(setXeroConnected);
      fetchMe().then((profile) => console.log("Profile:", profile));
    }
  }, []);

  const handleLogout = async () => {
    const currentAuth = getAuth();
    if (currentAuth?.token) {
      try {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${currentAuth.token}`,
            "X-Entity-Id": currentAuth.entityId,
          },
        });
      } catch {
        // proceed with local logout even if the server call fails
      }
    }
    clearAuth();
    try {
      localStorage.removeItem(EASY_VIEW_STORAGE_KEY);
    } catch {
      /* private mode / unavailable */
    }
    window.location.href = `${MODULE1_URL}/`;
  };

  const entityAbbr = auth?.entityName
    ? auth.entityName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3)
    : "---";

  return (
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <Header
        title="Payment Request"
        showLogo={false}
        companyName={auth?.entityName || "Loading…"}
        companyAbbreviation={entityAbbr}
        titleActions={
          <div className="hidden shrink-0 items-center lg:flex">
            <EasyViewToggle enabled={easyView} onChange={setEasyView} />
          </div>
        }
        onLogout={handleLogout}
        xeroConnected={xeroConnected}
      />
      <PaymentRequestView easyView={easyView} />
    </div>
  );
}
