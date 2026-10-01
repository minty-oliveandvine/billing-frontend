"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { setAuth } from "@/lib/auth";

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token") ?? "";
    const entityId = searchParams.get("entity_id") ?? "";
    const entityName = searchParams.get("entity_name") ?? "";
    const rawNext = searchParams.get("next") ?? "";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/module-selection";

    if (!token) {
      router.replace("/module-selection");
      return;
    }

    setAuth(token, entityId, entityName);
    router.replace(next);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-dvh min-h-screen items-center justify-center bg-white">
      <span className="text-sm text-gray-400">Loading…</span>
    </div>
  );
}

export default function Landing() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
