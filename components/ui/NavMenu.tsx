"use client";

// COPY of minty-web/components/ui/NavMenu.tsx (2026-09-30) - lifted into @minty/shared at
// Part 3 step 4; change all three (minty-web, here, Flask's port). It replaced this app's own drawer (components/layout/NavMenu.tsx).

/**
 * The header's ≡ - the "sandwich" - on every page of this app: it opens the sidebar on the side
 * menu (Figma 02 / 10-C, `components/ui/SideMenu.tsx`). The sidebar belongs to the layout
 * (`SidebarProvider`); this button tells it the page's own knowledge for the menu (fresh
 * modules, a known viewer) and opens it.
 *
 * Rendered where no provider is (a screen on its own), it keeps a drawer of its own with the
 * menu only, whose person block is a link to Minty's profile router.
 */

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SideMenu, type MenuContext } from "@/components/ui/SideMenu";
import { SidebarDrawer, useMounted, useSidebar } from "@/components/ui/Sidebar";

export type NavMenuProps = MenuContext;

export function NavMenu({ modules, viewer }: NavMenuProps) {
  const sidebar = useSidebar();
  const setMenuContext = sidebar?.setMenuContext;
  const mounted = useMounted();
  const trigger = useRef<HTMLButtonElement>(null);
  const localPanelId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const closeLocal = useCallback(() => setLocalOpen(false), []);

  useEffect(() => {
    setMenuContext?.({ modules, viewer });
  }, [setMenuContext, modules, viewer]);

  const expanded = sidebar ? sidebar.open && sidebar.view === "menu" : localOpen;

  return (
    <div className="flex shrink-0 items-center">
      <button
        ref={trigger}
        type="button"
        onClick={() => (sidebar ? sidebar.openMenu(trigger.current) : setLocalOpen(true))}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-primary/10"
        aria-expanded={expanded}
        aria-controls={sidebar ? sidebar.panelId : localPanelId}
        aria-label="Open navigation menu"
      >
        <Image src="/menu/menu.svg" alt="" width={29} height={32} unoptimized aria-hidden />
      </button>
      {!sidebar && mounted
        ? createPortal(
            <SidebarDrawer
              open={localOpen}
              view="menu"
              panelId={localPanelId}
              opener={trigger}
              onClose={closeLocal}
            >
              <SideMenu modules={modules} viewer={viewer} onClose={closeLocal} />
            </SidebarDrawer>,
            document.body,
          )
        : null}
    </div>
  );
}
