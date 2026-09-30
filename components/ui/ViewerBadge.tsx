"use client";

// COPY of minty-web/components/ui/ViewerBadge.tsx (2026-09-30) - lifted into @minty/shared at
// Part 3 step 4; change all three (minty-web, here, Flask's port). Here the no-sidebar fallback is Minty's profile router.

/**
 * The person's initials in the header - their name on hover, and My Profile on a click: the
 * sidebar opens over the page on the profile (the user's call, 2026-09-29). The menu's name
 * opens the same view.
 *
 * Without a sidebar that can hold the profile (a screen on its own), the badge is a link to
 * Minty's profile router instead - the same place, the long way round.
 *
 * `viewer` is what the page already knows; without one the badge reads it once per token from
 * Flask (`lib/viewer.ts`). Drawn only once known - an empty circle would be a guess.
 */

import { useRef } from "react";

import { useSidebar } from "@/components/ui/Sidebar";
import { links } from "@/components/ui/sidebarHost";
import { useViewer, type Viewer } from "@/lib/viewer";

const BADGE =
  "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--avatar-bg)] text-[12px] font-semibold text-[var(--avatar-fg)] transition-shadow hover:ring-2 hover:ring-primary/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function ViewerBadge({ viewer }: { viewer?: Viewer | null }) {
  const person = useViewer(viewer);
  const sidebar = useSidebar();
  const badge = useRef<HTMLButtonElement>(null);
  if (!person) return null;

  const label = `${person.name}, My Profile`;
  if (sidebar?.canOpenProfile) {
    return (
      <button
        ref={badge}
        type="button"
        onClick={() => sidebar.openProfile(badge.current)}
        className={BADGE}
        aria-label={label}
        aria-expanded={sidebar.open && sidebar.view === "profile"}
        aria-controls={sidebar.panelId}
        title={person.name}
      >
        <span aria-hidden>{person.initials}</span>
      </button>
    );
  }
  return (
    <a href={links.profile()} className={BADGE} aria-label={label} title={person.name}>
      <span aria-hidden>{person.initials}</span>
    </a>
  );
}
