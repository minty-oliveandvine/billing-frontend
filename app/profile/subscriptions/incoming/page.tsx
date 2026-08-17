"use client";

import { IncomingTransfersContent } from "@/components/profile/IncomingTransfersContent";
import { PortalShell } from "@/components/profile/PortalShell";

/**
 * /profile/subscriptions/incoming — requests to take over a company's subscription.
 *
 * No query string, so no Suspense boundary is needed here: the list is scoped by the
 * token, and there is deliberately nothing in the URL that could point it at somebody
 * else's requests.
 *
 * `showTabs={false}`, like the other sub-pages: this is reached from an email or the
 * profile card, not by moving between tabs, and a tab strip would suggest it belongs to a
 * section the viewer may have nothing in.
 */
export default function IncomingTransfersPage() {
  return (
    <PortalShell
      tab="subscriptions"
      title="Subscription requests"
      subtitle="Companies whose billing someone would like to hand over to you."
      crumbs={[
        { label: "My Profile", href: "/profile" },
        { label: "Subscription requests" },
      ]}
      showTabs={false}
    >
      <IncomingTransfersContent />
    </PortalShell>
  );
}
