"use client";

import { BillingContent } from "@/components/profile/BillingContent";
import { PortalShell } from "@/components/profile/PortalShell";

export default function BillingPage() {
  return (
    <PortalShell tab="billing">
      <BillingContent />
    </PortalShell>
  );
}
