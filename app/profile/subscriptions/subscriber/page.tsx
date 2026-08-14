"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { ChangeSubscriberContent } from "@/components/profile/ChangeSubscriberContent";
import { PortalShell } from "@/components/profile/PortalShell";

/**
 * /profile/subscriptions/subscriber?entity=<id> — "Change subscriber" on the row menu.
 *
 * The entity rides in the query string rather than the path, as `/profile/invoices?entity=`
 * does. `useSearchParams` opts a route out of static prerendering unless it sits behind a
 * Suspense boundary, hence the split.
 */
function ChangeSubscriberView() {
  const entityId = useSearchParams().get("entity") ?? undefined;

  return (
    <PortalShell
      tab="subscriptions"
      title="Change subscriber"
      subtitle="Assign this entity's subscription billing to a different person."
      crumbs={[
        { label: "My Profile", href: "/profile" },
        { label: "Manage Subscriptions", href: "/profile/subscriptions" },
        { label: "Change subscriber" },
      ]}
      showTabs={false}
    >
      <ChangeSubscriberContent entityId={entityId} />
    </PortalShell>
  );
}

export default function ChangeSubscriberPage() {
  return (
    <Suspense fallback={null}>
      <ChangeSubscriberView />
    </Suspense>
  );
}
