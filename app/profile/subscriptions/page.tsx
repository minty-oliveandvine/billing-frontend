"use client";

import { ManageSubscriptionsContent } from "@/components/profile/ManageSubscriptionsContent";
import { PortalShell } from "@/components/profile/PortalShell";

export default function ManageSubscriptionsPage() {
  return (
    <PortalShell tab="subscriptions">
      <ManageSubscriptionsContent />
    </PortalShell>
  );
}
