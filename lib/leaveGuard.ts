"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Leave without saving?" for a page with changes not saved yet (Payment Settings' ticks,
 * `components/settings/AccountCodeSettings.tsx`) - minty-web's `LeaveDialog` (Figma A-11), copied
 * to `features/subscription/components/`. Flask's settings pages ask the same way
 * (Minty `static/js/minty_dialog.js`), with the same link rules.
 *
 * While the page is dirty a click on a link that would leave it is held - caught on `window` in
 * the CAPTURE phase, so before React's listeners on the root (Next's `<Link>` and the sidebar's
 * `onClose` never see it) - and the dialog opens. "Discard changes" puts the ticks back, then
 * replays the click on the same link, so each link keeps its own way of going (a soft move, a
 * full load, the drawer closing); "Go Back", Escape and the backdrop only close the dialog. A
 * reload, a typed address or a tab closed get the browser's own prompt (`beforeunload`).
 * `guardLeave(proceed)` is the same question for an exit that is not a link (Logout).
 *
 * KNOWN GAP: the browser's Back and Forward inside this app are soft navigations - no click and
 * no `beforeunload` - so they leave without asking.
 */

/** On the wrapper the page portals the dialog in: a link inside the open dialog is never held. */
const LEAVE_DIALOG_ATTR = "data-leave-dialog";

type Guard = { isDirty: () => boolean; ask: (proceed: () => void) => void };

/** The page that is asking - one at a time; the last to mount wins. */
let active: Guard | null = null;

/** One click let through untouched: the replay of the link "Discard changes" went on with. */
let bypass = false;

/**
 * Leave by `proceed` - at once when nothing is unsaved, otherwise only after the person picks
 * "Discard changes" ("Go Back" never calls it).
 */
export function guardLeave(proceed: () => void): void {
  if (active?.isDirty()) active.ask(proceed);
  else proceed();
}

function holdsTheClick(e: MouseEvent): HTMLAnchorElement | null {
  if (bypass) {
    bypass = false;
    return null;
  }
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.closest(`[${LEAVE_DIALOG_ATTR}]`) || anchor.hasAttribute("data-sidebar-open")) return null;
  const target = anchor.getAttribute("target");
  if (anchor.hasAttribute("download") || (target && target !== "_self")) return null;
  // the ATTRIBUTE: `anchor.href` is always absolute
  const href = (anchor.getAttribute("href") ?? "").trim();
  if (href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return null;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return null; // an address the browser cannot follow either - nothing leaves
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // a fragment of this very page scrolls; the same address WITHOUT one reloads (and asks)
  if (url.hash && url.href.split("#")[0] === window.location.href.split("#")[0]) return null;
  return anchor;
}

export type LeaveGuard = {
  /** The dialog is showing. */
  open: boolean;
  /** "Discard changes": put the saved state back and go where the person was going. */
  discard: () => void;
  /** "Go Back", Escape, the backdrop: close the dialog, stay. */
  stay: () => void;
};

/** Ask before leaving while `dirty`; `reset` puts the saved state back when the person discards. */
export function useLeaveGuard(dirty: boolean, reset: () => void): LeaveGuard {
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(dirty);
  const resetRef = useRef(reset);
  /** What "Discard changes" goes on with. */
  const pending = useRef<(() => void) | null>(null);
  /** The live `beforeunload` listener, removed before a discard leaves. */
  const unload = useRef<((e: BeforeUnloadEvent) => void) | null>(null);

  useEffect(() => {
    dirtyRef.current = dirty;
    resetRef.current = reset;
  });

  useEffect(() => {
    const guard: Guard = {
      isDirty: () => dirtyRef.current,
      ask: (proceed) => {
        pending.current = proceed;
        setOpen(true);
      },
    };
    active = guard;
    return () => {
      if (active === guard) active = null;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      const anchor = holdsTheClick(e);
      if (!anchor) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pending.current = () => {
        if (!anchor.isConnected) {
          window.location.assign(anchor.href);
          return;
        }
        bypass = true;
        // a replay the link did not take must not let a later click through
        setTimeout(() => {
          bypass = false;
        }, 0);
        anchor.click();
      };
      setOpen(true);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    unload.current = onBeforeUnload;
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unload.current = null;
    };
  }, [dirty]);

  // Escape answers the dialog alone: caught on the way down, before ModalFrame's and the sidebar
  // drawer's own Escape (both listen on window as it bubbles), so a drawer open under the dialog
  // stays open - as Flask's port does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pending.current = null;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const discard = useCallback(() => {
    const proceed = pending.current;
    pending.current = null;
    setOpen(false);
    resetRef.current();
    // first, or the browser's own prompt follows ours
    if (unload.current) {
      window.removeEventListener("beforeunload", unload.current);
      unload.current = null;
    }
    proceed?.();
  }, []);

  const stay = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  return { open, discard, stay };
}
