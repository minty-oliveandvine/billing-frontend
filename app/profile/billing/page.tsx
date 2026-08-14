"use client";

import { PaymentMethodsPanel } from "@/components/profile/PaymentMethodsPanel";
import { PortalShell } from "@/components/profile/PortalShell";

/**
 * Billing accounts — the saved payment methods.
 *
 * Same table as before; a ROW is now a payment method rather than a company. The old rows
 * listed entities and reprinted the account's single card under every name, which read as
 * several billing accounts holding several cards. There is one, and the only thing on
 * this screen anybody can act on is which saved method it charges. The per-company
 * columns it used to carry (plan, status) live on Manage Subscriptions, the tab about
 * companies.
 */
export default function BillingPage() {
  return (
    <PortalShell tab="billing">
      <PaymentMethodsPanel />
    </PortalShell>
  );
}
