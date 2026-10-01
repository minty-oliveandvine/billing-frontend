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
 * Back and Forward are soft navigations (no click, no `beforeunload`), so the page holds them with
 * a SENTINEL: when it turns dirty it pushes one history entry at its own address (Next's state
 * object kept, so the router has nothing to do). Back then only pops the sentinel - a `popstate`
 * caught on `window` in the CAPTURE phase, which at the target runs before the app router's own
 * listener - and the page pushes it again and asks. "Discard changes" takes the sentinel off and
 * goes back once more, to where the person was going. Forward needs nothing: the push cut the
 * forward entries off. When the page is clean again (saved, ticks put back, or discarded through a
 * link) the sentinel is taken off with `history.back()` - that one `popstate` is swallowed so the
 * router never sees it - and a discarded link is replayed only after it, so Back from the next
 * page lands on the settings page once, not twice.
 *
 * A jump of several entries at once (the long-press history menu, `history.go(-3)`) lands past
 * the sentinel. The Navigation API's entry index (`navigation.currentEntry.index`) says how far:
 * the page swallows that `popstate` too, jumps straight back onto the sentinel with
 * `history.go(n)` (its own pop, swallowed like the one above) and asks. "Discard changes" then
 * takes the sentinel off and goes the rest of the way (`history.go(-(n - 1))`). The index, not
 * the address, decides what a pop was: an earlier entry at this same address is a jump, not the
 * sentinel. A jump to another document's entry unloads the page and gets `beforeunload`. Where
 * the browser has no Navigation API, a several-entry jump still leaves without asking (warned once
 * in the console).
 */

/** The Navigation API, where the browser has it (TypeScript's DOM lib may not declare it). */
function historyIndex(): number | null {
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number } | null } }).navigation;
  const index = nav?.currentEntry?.index;
  return typeof index === "number" && index >= 0 ? index : null;
}

let warnedNoIndex = false;

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
  /** The address the sentinel entry sits at, while it is the top history entry; else null. */
  const sentinel = useRef<string | null>(null);
  /** The sentinel entry's history index (Navigation API), or null where the browser has none. */
  const sentinelIndex = useRef<number | null>(null);
  /** Set while our own `history.back()` (taking the sentinel off) is on its way: what runs then. */
  const afterOwnPop = useRef<(() => void) | null>(null);
  /** Turned dirty again while that pop was on its way: push the sentinel once it lands. */
  const pushAfterOwnPop = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    resetRef.current = reset;
  });

  const pushSentinel = useCallback(() => {
    if (sentinel.current !== null) return;
    if (afterOwnPop.current) {
      pushAfterOwnPop.current = true;
      return;
    }
    const here = window.location.href;
    window.history.pushState(window.history.state, "", here);
    sentinel.current = here;
    sentinelIndex.current = historyIndex();
  }, []);

  /** Take the sentinel off (if it is there), then `then` - after the browser has moved. */
  const dropSentinel = useCallback((then?: () => void) => {
    pushAfterOwnPop.current = false;
    if (sentinel.current === null) {
      then?.();
      return;
    }
    sentinel.current = null;
    afterOwnPop.current = then ?? (() => {});
    window.history.back();
  }, []);

  // Back and Forward (see the header). Registered for the page's life, not only while dirty: the
  // pop that takes the sentinel off arrives after the page is clean again.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const own = afterOwnPop.current;
      if (own) {
        // our own `history.back()` - the same address; the router must not see it
        e.stopImmediatePropagation();
        afterOwnPop.current = null;
        own();
        if (pushAfterOwnPop.current) {
          pushAfterOwnPop.current = false;
          if (dirtyRef.current) pushSentinel();
        }
        return;
      }
      if (!dirtyRef.current || sentinel.current === null) return;
      const from = sentinelIndex.current;
      const to = historyIndex();
      const jump = from !== null && to !== null ? from - to : null;
      if (jump !== null && jump > 1) {
        // several entries at once (header): undo the jump onto the sentinel, then ask
        e.stopImmediatePropagation();
        const at = sentinel.current;
        sentinel.current = null;
        afterOwnPop.current = () => {
          sentinel.current = at;
          sentinelIndex.current = from;
          pending.current = () => window.history.go(-(jump - 1));
          setOpen(true);
        };
        window.history.go(jump);
        return;
      }
      if (jump === null ? window.location.href !== sentinel.current : jump !== 1) {
        // no index to measure with (header), or not a step back: the router takes it
        if (jump === null && !warnedNoIndex) {
          warnedNoIndex = true;
          console.warn(
            "[leave guard] this browser has no Navigation API: a jump of several history entries leaves without asking",
          );
        }
        sentinel.current = null;
        return;
      }
      // Back popped the sentinel: put it back and ask
      e.stopImmediatePropagation();
      sentinel.current = null;
      pushSentinel();
      pending.current = () => window.history.back();
      setOpen(true);
    };
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, [pushSentinel]);

  useEffect(() => {
    if (dirty) pushSentinel();
    else dropSentinel();
  }, [dirty, pushSentinel, dropSentinel]);

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
    // the sentinel off first, so Back from wherever this goes lands on the page once
    dropSentinel(proceed ?? undefined);
  }, [dropSentinel]);

  const stay = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  return { open, discard, stay };
}
