"use client";

import { useSyncExternalStore } from "react";

import { buildMintyProfileUrl, MINTY_PROFILE_URL } from "@/lib/mintyUrls";

// The cookie that names the company exists only in the browser: a server render links to the
// unscoped profile and the browser swaps in the company's. A string snapshot, so the store
// never loops.
const noSubscribe = () => () => {};
const serverUrl = () => MINTY_PROFILE_URL;

/** Where "My Profile" goes from this app - see `buildMintyProfileUrl`. */
export function useMintyProfileUrl(): string {
  return useSyncExternalStore(noSubscribe, buildMintyProfileUrl, serverUrl);
}
