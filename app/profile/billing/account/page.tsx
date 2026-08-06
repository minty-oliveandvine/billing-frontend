"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { NewBillingAccountForm } from "@/components/profile/NewBillingAccountForm";
import { PortalShell } from "@/components/profile/PortalShell";

/**
 * One route, two jobs — see the form's own header.
 *
 *   /profile/billing/account              a blank form (+ New billing account)
 *   /profile/billing/account?entity=<id>  the account that company bills to
 *                                         (View billing account, on the row menu)
 *
 * `useSearchParams` opts a route out of static prerendering unless it sits behind a
 * Suspense boundary, so the reading half is split into its own component.
 */
function BillingAccountView() {
  const entityId = useSearchParams().get("entity") ?? undefined;
  const viewing = Boolean(entityId);

  return (
    <PortalShell
      tab="billing"
      title="Billing account"
      subtitle={
        viewing
          ? "The billing entity, plan and payment details this company bills to."
          : "Enter the billing entity, plan and payment details."
      }
      crumbs={[
        { label: "My Profile", href: "/profile" },
        { label: "Billing", href: "/profile/billing" },
        { label: "Billing account" },
      ]}
      showTabs={false}
    >
      <NewBillingAccountForm entityId={entityId} />
    </PortalShell>
  );
}

export default function BillingAccountPage() {
  return (
    <Suspense fallback={null}>
      <BillingAccountView />
    </Suspense>
  );
}
