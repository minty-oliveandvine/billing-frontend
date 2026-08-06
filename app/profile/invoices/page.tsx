"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { InvoicesContent } from "@/components/profile/InvoicesContent";
import { PortalShell } from "@/components/profile/PortalShell";

/**
 * `/profile/invoices` shows everything; `?entity=<id>` starts narrowed to one company,
 * which is what "View invoices" on a row passes. The filter stays changeable either way —
 * arriving filtered is a starting point, not a lock.
 *
 * `useSearchParams` opts a route out of static prerendering unless it sits behind a
 * Suspense boundary, so the reading half is its own component.
 */
function InvoicesView() {
  const entityId = useSearchParams().get("entity") ?? undefined;

  return (
    <PortalShell tab="invoices">
      <InvoicesContent initialEntityId={entityId} />
    </PortalShell>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesView />
    </Suspense>
  );
}
