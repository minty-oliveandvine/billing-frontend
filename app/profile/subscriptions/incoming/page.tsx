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
 * `showTabs={false}`, like the other sub-pages: this is reached from an email, the
 * profile card or the banner on Manage Subscriptions, not by moving between tabs, and a
 * tab strip would suggest it belongs to a section the viewer may have nothing in.
 *
 * The trail starts at Manage Subscriptions, not My Profile. That banner is how most
 * people get here, so it is the place to go back to; My Profile is a level nobody
 * passed through on the way in and offering it only widens the trail.
 */
export default function IncomingTransfersPage() {
  return (
    <PortalShell
      tab="subscriptions"
      title="Subscription requests"
      subtitle="Companies whose billing someone would like to hand over to you."
      crumbs={[
        { label: "Manage Subscriptions", href: "/profile/subscriptions" },
        { label: "Subscription requests" },
      ]}
      showTabs={false}
    >
      <IncomingTransfersContent />
    </PortalShell>
  );
}
