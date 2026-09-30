"use client";

// COPY of minty-web/components/ui/Sidebar.tsx (2026-09-30) - lifted into @minty/shared at
// Part 3 step 4; change all three (minty-web, here, Flask's port). What differs is only what this app is (./sidebarHost.ts): the
// scroll lock, and no `/profile` page of this app's own for the menu's name to special-case.

/**
 * The sidebar - ONE drawer on the right with two views (the user's call, 2026-09-29):
 *
 * - the MENU (Figma 02 / 10-C, `SideMenu`), opened by the header's ≡;
 * - MY PROFILE (Figma 10-A), opened by the header's initials, or from the menu by the person's
 *   name; its ‹ goes back to the menu.
 *
 * Nothing navigates to open it: it slides over whatever page is showing and closes back onto
 * it (Escape, a click beside it) - or by itself when a link inside it moves this app to another
 * page (the layout, and so the sidebar, outlives a client-side move). 353 px for the menu,
 * 440 px for the profile from 640 px up - and on a phone the whole screen, as 10-A is drawn.
 *
 * `SidebarProvider` holds it for every page (`app/layout.tsx`). The profile view is a SLOT
 * the shell fills with the profile feature's panel - shared chrome never reaches into a
 * feature - and is mounted only once asked for, so nothing is read before then.
 *
 * Without a provider (a screen rendered on its own) the ≡ keeps a drawer of its own with the
 * menu only, and the initials and the menu's name are links to Minty's profile router - a page
 * can never lose its menu.
 */

import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import { SideMenu, type MenuContext } from "@/components/ui/SideMenu";
import { lockScroll } from "@/components/ui/sidebarHost";

export type SidebarView = "menu" | "profile";

export type SidebarControls = {
  open: boolean;
  view: SidebarView;
  /** The drawer's id - what the openers name in `aria-controls`. */
  panelId: string;
  /** ≡: open on the menu. `opener` takes the focus back when the sidebar closes. */
  openMenu: (opener?: HTMLElement | null) => void;
  /** The header's initials: open on My Profile. */
  openProfile: (opener?: HTMLElement | null) => void;
  /** My Profile's ‹: back to the menu. */
  showMenu: () => void;
  close: () => void;
  /** The page's own knowledge for the menu (fresh modules, a known viewer) - set by its ≡. */
  setMenuContext: (context: MenuContext) => void;
  /** Whether My Profile opens in here - the shell filled the slot. Else it is Minty's router. */
  canOpenProfile: boolean;
};

const SidebarContext = createContext<SidebarControls | null>(null);

/** The sidebar, or null outside a provider (the openers then fall back - see above). */
export function useSidebar(): SidebarControls | null {
  return useContext(SidebarContext);
}

// The drawer is a portal, and the cookie and the URL its menu reads exist only in the browser:
// "mounted" is the server/client seam.
const noSubscribe = () => () => {};
const clientTrue = () => true;
const serverFalse = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(noSubscribe, clientTrue, serverFalse);
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";

/**
 * The drawer itself: the washed-out page behind (a click on it closes), the panel sliding in
 * from the right, the page's scroll held, Escape to close, the keyboard moved inside on
 * opening (and to the new view's first control on switching) and back to the opener after.
 */
export function SidebarDrawer({
  open,
  view,
  panelId,
  opener,
  onClose,
  children,
}: {
  open: boolean;
  view: SidebarView;
  panelId: string;
  opener: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const release = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const back = opener.current;
    return () => {
      release();
      window.removeEventListener("keydown", onKey);
      back?.focus();
    };
  }, [open, opener, onClose]);

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open, view]);

  const profile = view === "profile";
  return (
    <div
      className={`fixed inset-0 z-[200] overflow-x-hidden overscroll-x-none ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
      // closed, nothing in it takes the keyboard's focus either
      inert={!open}
    >
      {/* Figma "Rectangle 398": the page behind washes out; a click on it closes the sidebar */}
      <button
        type="button"
        className={`absolute inset-0 cursor-pointer bg-[#d9d9d9]/70 transition-opacity duration-300 ease-out ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        aria-label={profile ? "Close My Profile" : "Close menu"}
      />
      <div
        id={panelId}
        ref={panel}
        className={`absolute right-0 top-0 h-full overflow-y-auto overscroll-contain border border-[#ededed] shadow-[-6px_4px_18px_0px_rgba(15,23,42,0.1)] transition-[transform,width] duration-300 ease-out ${profile ? "w-full bg-[#f9fafb] sm:w-[440px]" : "w-[min(100%,353px)] bg-white"} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {children}
      </div>
    </div>
  );
}

// `at`: the page it was opened on. Open means open ON THIS PAGE - a move elsewhere closes it
// without an effect having to notice.
type State = { open: boolean; view: SidebarView; at: string | null };

// By value: a page passing `modules={{...}}` inline must not re-set the context every render.
const sameContext = (a: MenuContext, b: MenuContext) =>
  (a.modules === b.modules ||
    (!!a.modules &&
      !!b.modules &&
      a.modules.pettyCash === b.modules.pettyCash &&
      a.modules.billing === b.modules.billing)) &&
  (a.viewer === b.viewer ||
    (!!a.viewer &&
      !!b.viewer &&
      a.viewer.name === b.viewer.name &&
      a.viewer.initials === b.viewer.initials));

export function SidebarProvider({
  profile,
  children,
}: {
  /** My Profile's view - the profile feature's panel, composed in by the shell. */
  profile?: ReactNode;
  children: ReactNode;
}) {
  const mounted = useMounted();
  const pathname = usePathname();
  const panelId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<State>({ open: false, view: "menu", at: null });
  const [menuContext, setMenuContextState] = useState<MenuContext>({});
  const open = state.open && state.at === pathname;
  const view = state.view;

  const openAt = useCallback(
    (next: SidebarView, from?: HTMLElement | null) => {
      opener.current =
        from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setState({ open: true, view: next, at: pathname });
    },
    [pathname],
  );
  const openMenu = useCallback((from?: HTMLElement | null) => openAt("menu", from), [openAt]);
  const openProfile = useCallback((from?: HTMLElement | null) => openAt("profile", from), [openAt]);
  const showMenu = useCallback(() => setState((s) => ({ ...s, view: "menu" })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const setMenuContext = useCallback((next: MenuContext) => {
    setMenuContextState((current) => (sameContext(current, next) ? current : next));
  }, []);

  const canOpenProfile = profile != null;
  const controls = useMemo<SidebarControls>(
    () => ({
      open,
      view,
      panelId,
      openMenu,
      openProfile,
      showMenu,
      close,
      setMenuContext,
      canOpenProfile,
    }),
    [open, view, panelId, openMenu, openProfile, showMenu, close, setMenuContext, canOpenProfile],
  );

  // The menu's name: My Profile in place.
  const toProfile = useCallback(() => setState((s) => ({ ...s, view: "profile" })), []);

  return (
    <SidebarContext.Provider value={controls}>
      {children}
      {mounted
        ? createPortal(
            <SidebarDrawer
              open={open}
              view={view}
              panelId={panelId}
              opener={opener}
              onClose={close}
            >
              {view === "profile" ? (
                <section className="flex min-h-full flex-col" aria-label="My Profile">
                  {profile}
                </section>
              ) : (
                <SideMenu
                  {...menuContext}
                  onClose={close}
                  onProfile={canOpenProfile ? toProfile : undefined}
                />
              )}
            </SidebarDrawer>,
            document.body,
          )
        : null}
    </SidebarContext.Provider>
  );
}
