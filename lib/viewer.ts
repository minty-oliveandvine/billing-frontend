// COPY of minty-web/lib/viewer.ts (2026-09-30) - lifted into @minty/shared at Part 3 step 4;
// change all three (minty-web, here, Flask's port). Reads through this app's host (components/ui/sidebarHost.ts).

/**
 * Who is looking: the name and initials the header's badge and the side menu's profile block
 * show, on every page.
 *
 * The token carries neither (Flask mints only ids and flags), so they are read once per token
 * from Flask's `GET /api/me/profile` and kept here. DECORATION, and treated as such: a read
 * that fails leaves the badge empty and never moves the page (`onUnauthorized: "reject"`) -
 * a lapsed token is the page's own reads' business. My Profile calls `primeViewer` after a
 * save, so the header and menu show the new name at once instead of the old one until the
 * next token.
 *
 * Snapshots are CACHED objects, never fresh ones: `useSyncExternalStore` compares by
 * reference, and a new object per read loops forever.
 */

import { useCallback, useSyncExternalStore } from "react";

import { currentToken, mintyFetch } from "@/components/ui/sidebarHost";

export type Viewer = { name: string; initials: string };

type Loader = () => Promise<Viewer | null>;

const readFromFlask: Loader = async () => {
  const body = await mintyFetch<{ user?: { name?: unknown; initials?: unknown } }>(
    "/api/me/profile",
    { onUnauthorized: "reject" },
  );
  const user = body?.user;
  if (typeof user?.name !== "string" || typeof user.initials !== "string") return null;
  return { name: user.name, initials: user.initials };
};

let loader: Loader = readFromFlask;
let cache: { token: string; viewer: Viewer | null; loading: boolean } | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function ensureLoaded() {
  const token = currentToken();
  if (!token || (cache && cache.token === token)) return;
  const entry = { token, viewer: null as Viewer | null, loading: true };
  cache = entry;
  loader()
    .then((viewer) => {
      if (cache === entry) {
        cache = { token, viewer, loading: false };
        notify();
      }
    })
    .catch(() => {
      // Decoration: no badge beats a broken page. The page's own reads say what went wrong.
      if (cache === entry) cache = { token, viewer: null, loading: false };
    });
}

function snapshot(): Viewer | null {
  const token = currentToken();
  return cache && cache.token === token ? cache.viewer : null;
}

const serverSnapshot = () => null;

/**
 * The person looking, or null until known (or when the read failed). `known` - a viewer the
 * page already has - is returned as it stands and no read is made for it.
 */
export function useViewer(known?: Viewer | null): Viewer | null {
  const wanted = !known;
  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);
      if (wanted) ensureLoaded();
      return () => {
        listeners.delete(onChange);
      };
    },
    [wanted],
  );
  const viewer = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return known ?? viewer;
}

/** After the person changed their own name: every badge and menu shows it at once. */
export function primeViewer(viewer: Viewer) {
  cache = { token: currentToken(), viewer, loading: false };
  notify();
}

/** Test seam: where the viewer comes from, and a clean cache. */
export function _setViewerLoaderForTests(next: Loader | null) {
  loader = next ?? readFromFlask;
  cache = null;
}
