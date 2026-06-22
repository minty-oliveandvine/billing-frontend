"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import { getAuth } from "@/lib/auth";
import { useEntitlements } from "@/lib/moduleClaims";
import { MINTY_MODULE_URL as MODULE1_URL } from "@/lib/mintyUrls";

function navItemIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavMenuItem = { href: string; label: string; icon?: string; external?: boolean };

type NavMenuSection = { title: string; items: NavMenuItem[] };

function buildModule1EntryUrl(path?: string): string {
  const auth = getAuth();
  if (auth?.entityId && auth?.token) {
    const base = `${MODULE1_URL}/entity/${auth.entityId}/enter?token=${auth.token}`;
    return path ? `${base}&next=${encodeURIComponent(path)}` : base;
  }
  return `${MODULE1_URL}/entity`;
}

function buildMenuSections(pettyCashEnabled: boolean): NavMenuSection[] {
  const auth = getAuth();
  const dashboardHref = buildModule1EntryUrl();
  const reportsPath = auth?.entityId ? `/entity/${auth.entityId}/reports` : undefined;
  const reportsHref = buildModule1EntryUrl(reportsPath);
  const sections: NavMenuSection[] = [];
  // Petty Cash links cross into Module 1 — only surface them when the
  // entity actually has the petty cash module turned on. Bill-only customers
  // never see these handoffs (they'd land on a screen they can't use).
  if (pettyCashEnabled) {
    sections.push({
      title: "Petty Cash",
      items: [
        { href: dashboardHref, label: "Dashboard", icon: "space_dashboard", external: true },
        { href: reportsHref, label: "Reports", icon: "bar_chart", external: true },
      ],
    });
  }
  sections.push({
    title: "Payment Request",
    items: [{ href: "/", label: "Bills", icon: "local_atm" }],
  });
  return sections;
}

function buildDefaultItems(sections: NavMenuSection[]): NavMenuItem[] {
  return [
    { href: `${MODULE1_URL}/entity`, label: "Select entity", icon: "corporate_fare", external: true },
    ...sections.flatMap((s) => s.items),
    { href: "/settings", label: "Settings", icon: "settings" },
  ];
}

type NavMenuProps = {
  items?: NavMenuItem[];
  menuSections?: NavMenuSection[];
  companyAbbreviation?: string;
  onLogout?: () => void;
};

function NavMenuItemLink({
  item,
  pathname,
  onNavigate,
  className = "",
}: {
  item: NavMenuItem;
  pathname: string;
  onNavigate: () => void;
  className?: string;
}) {
  const active = !item.external && navItemIsActive(pathname, item.href);
  const classes = `flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors ${active ? "bg-secondary/15 text-secondary" : "text-primary hover:bg-primary/10"} ${className}`;
  const iconEl = item.icon ? <span className={`material-symbols-outlined shrink-0 text-[22px] leading-none ${active ? "text-secondary" : "text-primary"}`} aria-hidden>{item.icon}</span> : null;

  if (item.external) {
    return (
      <a href={item.href} onClick={onNavigate} className={classes}>
        {iconEl}
        {item.label}
      </a>
    );
  }

  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={classes}>
      {iconEl}
      {item.label}
    </Link>
  );
}

export function NavMenu({ items, menuSections, companyAbbreviation = "---", onLogout }: NavMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [hasEntity, setHasEntity] = useState(false);
  const panelId = useId();

  // Subscribe to DB-fresh entitlements so a CLI/admin toggle of PETTY_CASH
  // takes effect on the next page load without needing a re-handoff through
  // Module 1 (the cookie JWT claim can be hours stale).
  const { pettyCashEnabled } = useEntitlements();
  const resolvedSections = useMemo(
    () => menuSections ?? buildMenuSections(pettyCashEnabled),
    [menuSections, pettyCashEnabled],
  );
  const resolvedItems = useMemo(() => items ?? buildDefaultItems(resolvedSections), [items, resolvedSections]);

  const selectEntityItem = resolvedItems.find((i) => i.label === "Select entity");
  const settingsItem = resolvedItems.find((i) => i.href === "/settings");

  useEffect(() => {
    setPortalReady(true);
    setHasEntity(!!getAuth()?.entityId);
  }, []);

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const drawer = (
    <div className={`fixed inset-0 z-[200] overflow-x-hidden overscroll-x-none ${open ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!open}>
      <button type="button" className={`absolute inset-0 cursor-pointer bg-black/40 transition-opacity duration-300 ease-out ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} aria-label="Close menu" />
      <nav
        id={panelId}
        className={`absolute right-0 top-0 flex h-full w-[min(100%,14rem)] max-w-[calc(100%-env(safe-area-inset-left)-env(safe-area-inset-right))] flex-col bg-white pt-[env(safe-area-inset-top,0px)] shadow-xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-label="Main navigation"
      >
          <div className="flex flex-col gap-3 border-b border-primary/20 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold tracking-wide text-primary sm:text-base" title={companyAbbreviation}>
                {companyAbbreviation}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Close menu">
                <span className="material-symbols-outlined text-[26px] leading-none">close</span>
              </button>
            </div>
            {hasEntity && selectEntityItem ? (
              <NavMenuItemLink item={selectEntityItem} pathname={pathname} onNavigate={() => setOpen(false)} />
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {hasEntity ? (
                <div className="w-full max-h-[calc(100%-11.5rem)] flex-none overflow-y-auto overscroll-contain">
                  <div className="flex flex-col gap-3">
                    {resolvedSections.map((section) => (
                      <div key={section.title} className={`flex flex-col ${section.title === "Payment Request" ? "mt-6 gap-3" : "gap-1"}`} role="group" aria-label={section.title}>
                        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-primary/70">{section.title}</p>
                        <ul className="flex flex-col gap-1">
                          {section.items.map((item) => (
                            <li key={item.label} className="w-full">
                              <NavMenuItemLink item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className={`shrink-0 -mx-4 sm:-mx-6 ${hasEntity ? "mt-4 border-t border-primary/15" : ""}`} role="presentation">
                <div className="flex flex-col gap-1 px-4 pt-4 sm:px-6 sm:pt-4">
                  {hasEntity && settingsItem ? <NavMenuItemLink item={settingsItem} pathname={pathname} onNavigate={() => setOpen(false)} /> : null}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onLogout?.();
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left text-base font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="material-symbols-outlined shrink-0 text-[22px] leading-none text-primary" aria-hidden>
                      logout
                    </span>
                    Logout
                  </button>
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1" aria-hidden />
              {hasEntity ? (
                <div className="flex shrink-0 justify-center px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                  <Image
                    src="/cat.png"
                    alt=""
                    width={200}
                    height={180}
                    className="h-auto w-[min(100%,10rem)] object-contain object-bottom select-none"
                    draggable={false}
                    priority={false}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </nav>
    </div>
  );

  return (
    <div className="flex shrink-0 items-center">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-expanded={open} aria-controls={panelId} aria-label="Open navigation menu">
        <span className="material-symbols-outlined text-[26px] leading-none">menu</span>
      </button>
      {portalReady ? createPortal(drawer, document.body) : null}
    </div>
  );
}
