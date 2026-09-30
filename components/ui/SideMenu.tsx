"use client";

// COPY of minty-web/components/ui/SideMenu.tsx (2026-09-30) - lifted into @minty/shared at
// Part 3 step 4; change all three (minty-web, here, Flask's port). What differs is only what this app is (./sidebarHost.ts): where
// the items lead FROM HERE, the company in this app's cookie, and this app's Logout.

/**
 * The side menu's contents - Figma 02 / 10-C (`43YI3MYtTfX5Xzz6dRoRuT`, frames 1410:2899,
 * 1867:3304, 1871:3057) - drawn in the sidebar's menu view (`components/ui/Sidebar.tsx`).
 *
 * Top to bottom: the Minty mark; THE PERSON (avatar + name), which switches the sidebar to My
 * Profile (the header's initials open it there directly); Select Entity; Manage subscriptions
 * (only while subscriptions are switched on); then, INSIDE A COMPANY only (02-D), its Petty
 * Cash and Payment Request sections; the cat, above the last group (the user's rule); and
 * Settings (inside a company only) and Logout.
 *
 * Where the links go from this app: Select Entity and Manage subscriptions into Minty (its entity
 * list, minty-web through the re-handoff); Petty Cash into Minty through `/entity/<id>/enter`;
 * Bills to this app's own home; Settings to this app's own settings (the settings of the app it is
 * pressed in - the user's call, 2026-09-30); Logout ends the session everywhere.
 */

import Image from "next/image";
import type { ReactNode } from "react";

import {
  currentOf,
  entityId as companyInCookie,
  links,
  logOut,
  moduleAccess,
  SUBSCRIPTIONS_ENABLED,
  type ModuleAccess,
} from "@/components/ui/sidebarHost";
import { useViewer, type Viewer } from "@/lib/viewer";

export type MenuContext = {
  /**
   * Which modules the company has, when the page knows better than the token. Omitted, the
   * token's claims decide. A module that is off gets no section.
   */
  modules?: ModuleAccess;
  /** The person looking, when the page already knows them; else read once per token. */
  viewer?: Viewer | null;
};

export type SideMenuProps = MenuContext & {
  /** Every link calls it as it navigates, and Logout before it leaves. */
  onClose: () => void;
  /**
   * The person's block. Given (inside the sidebar), it is a button that does this - switch to
   * My Profile. Omitted, it is a link to Minty's profile router.
   */
  onProfile?: () => void;
};

// Figma: Inter 500 18px #8f8f8f. The page being shown is NOT drawn differently - 02-A opens the
// menu over the entity list and Select Entity stays grey - so it is marked for assistive
// technology only (aria-current). The one tinted row is Bills, which the design draws as a
// button ("Bill Button").
const ROW =
  "flex w-full items-center rounded-[12px] text-[18px] font-medium leading-[22px] transition-colors";
const IDLE = "text-[#8f8f8f] hover:bg-[#f5f5f5]";
const BUTTON = "bg-[rgba(202,241,244,0.5)] text-[#54d3da] hover:bg-[rgba(202,241,244,0.8)]";

function MenuLink({
  href,
  current,
  className,
  onNavigate,
  children,
}: {
  href: string;
  current: boolean;
  className: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={`${ROW} ${IDLE} ${className}`}
    >
      {children}
    </a>
  );
}

function Separator() {
  return <div className="h-px w-full shrink-0 bg-[#ededed]" role="presentation" />;
}

/** Figma "Manage subscriptions": four outlined rings, placed as the design places them. */
function SubscriptionsIcon() {
  return (
    <span className="relative block h-[31px] w-[28px] shrink-0" aria-hidden>
      <Image
        className="absolute left-[3px] top-[4px]"
        src="/menu/subscriptions-ring.svg"
        alt=""
        width={22}
        height={23}
        unoptimized
      />
      <Image
        className="absolute left-0 top-0"
        src="/menu/subscriptions-dot-large.svg"
        alt=""
        width={16}
        height={16}
        unoptimized
      />
      <Image
        className="absolute left-[20px] top-[6px]"
        src="/menu/subscriptions-dot-small.svg"
        alt=""
        width={8}
        height={8}
        unoptimized
      />
      <Image
        className="absolute left-[6px] top-[21px]"
        src="/menu/subscriptions-dot-medium.svg"
        alt=""
        width={10}
        height={10}
        unoptimized
      />
    </span>
  );
}

function ModuleHeading({
  title,
  tone,
  icon,
  iconBox,
}: {
  title: ReactNode;
  tone: string;
  icon: { src: string; width: number; height: number };
  iconBox: string;
}) {
  return (
    <div className="flex items-center justify-between pl-[19px]">
      <p className={`text-[18px] font-bold leading-[22px] ${tone}`}>{title}</p>
      <span
        className={`flex size-[76px] shrink-0 items-center justify-center rounded-full ${iconBox}`}
        aria-hidden
      >
        <Image src={icon.src} alt="" width={icon.width} height={icon.height} unoptimized />
      </span>
    </div>
  );
}

const PERSON =
  "mt-[30px] flex w-full cursor-pointer items-center gap-[40px] rounded-[12px] py-[3px] pl-[35px] text-left hover:bg-[#f5f5f5]";

/** Rendered only in the browser (inside the sidebar's portal), so the cookie and the URL exist. */
export function SideMenu({ modules, viewer, onClose, onProfile }: SideMenuProps) {
  const person = useViewer(viewer);
  const current = currentOf();
  const entityId = companyInCookie();
  // Inside a company only - and never on the entity list, where a person is choosing one.
  const inCompany = entityId !== "" && current !== "entities";
  // Read at every render, never memoised: the sidebar outlives a client-side move, so a value
  // kept from mount could describe a company the cookie no longer names.
  const access = modules ?? moduleAccess();

  const logout = () => {
    onClose();
    void logOut();
  };

  const who = (
    <>
      <span
        className="flex h-[57px] w-[56px] shrink-0 items-center justify-center rounded-[91px] bg-[var(--avatar-bg)] text-[30px] font-medium text-[var(--avatar-fg)]"
        aria-hidden
      >
        {person?.initials ?? ""}
      </span>
      <span
        className="max-w-[130px] break-words text-[18px] leading-[22px] text-[#1f2937]"
        aria-hidden
      >
        {person?.name ?? "My Profile"}
      </span>
    </>
  );
  const whoLabel = person ? `${person.name}, My Profile` : "My Profile";

  return (
    <nav
      className="flex min-h-full flex-col pl-[49px] pr-[53px] pt-[max(49px,env(safe-area-inset-top,0px))] pb-[max(42px,env(safe-area-inset-bottom,0px))]"
      aria-label="Main navigation"
    >
      <Image
        className="ml-[89px] h-auto w-[99px] shrink-0"
        src="/menu/minty-logo.svg"
        alt="Minty"
        width={99}
        height={71}
        unoptimized
      />

      {onProfile ? (
        <button
          type="button"
          onClick={onProfile}
          aria-current={current === "profile" ? "page" : undefined}
          aria-label={whoLabel}
          className={PERSON}
        >
          {who}
        </button>
      ) : (
        <a
          href={links.profile()}
          onClick={onClose}
          aria-current={current === "profile" ? "page" : undefined}
          aria-label={whoLabel}
          className={PERSON}
        >
          {who}
        </a>
      )}

      <div className="mt-[32px]">
        <Separator />
      </div>
      <div className="mt-[15px] flex flex-col gap-[3px]">
        <MenuLink
          href={links.entities()}
          current={current === "entities"}
          onNavigate={onClose}
          className="min-h-[52px] gap-[21px] pl-[32px]"
        >
          <span className="flex w-[28px] shrink-0 justify-center" aria-hidden>
            <Image src="/menu/select-entity.svg" alt="" width={22} height={20} unoptimized />
          </span>
          Select Entity
        </MenuLink>
        {SUBSCRIPTIONS_ENABLED ? (
          <MenuLink
            href={links.subscriptions()}
            current={current === "subscriptions"}
            onNavigate={onClose}
            className="min-h-[66px] gap-[21px] pl-[32px]"
          >
            <SubscriptionsIcon />
            <span className="max-w-[130px]">Manage subscriptions</span>
          </MenuLink>
        ) : null}
      </div>
      <div className="mt-[16px]">
        <Separator />
      </div>

      {inCompany && (access.pettyCash || access.billing) ? (
        <div className="flex flex-col">
          {access.pettyCash ? (
            <div className="mt-[25px] flex flex-col" role="group" aria-label="Petty Cash">
              <ModuleHeading
                title="Petty Cash"
                tone="text-[#16202e]"
                icon={{ src: "/menu/petty-cash.svg", width: 42, height: 45 }}
                iconBox="bg-[#f7efd9]"
              />
              <MenuLink
                href={links.pettyCashDashboard()}
                current={false}
                onNavigate={onClose}
                className="mt-[14px] min-h-[44px] gap-[24px] pl-[19px]"
              >
                <Image
                  src="/menu/dashboard.svg"
                  alt=""
                  width={23}
                  height={23}
                  unoptimized
                  aria-hidden
                />
                Dashboard
              </MenuLink>
              <MenuLink
                href={links.pettyCashReports(entityId)}
                current={false}
                onNavigate={onClose}
                className="min-h-[44px] gap-[24px] pl-[19px]"
              >
                <Image
                  src="/menu/reports.svg"
                  alt=""
                  width={23}
                  height={23}
                  unoptimized
                  aria-hidden
                />
                Reports
              </MenuLink>
            </div>
          ) : null}
          {access.pettyCash && access.billing ? (
            <div className="mt-[26px]">
              <Separator />
            </div>
          ) : null}
          {access.billing ? (
            <div className="mt-[30px] flex flex-col" role="group" aria-label="Payment Request">
              <ModuleHeading
                title={
                  <>
                    Payment
                    <br aria-hidden /> Request
                  </>
                }
                tone="text-[#2374f2]"
                icon={{ src: "/menu/payment-request.svg", width: 76, height: 76 }}
                iconBox=""
              />
              <a
                href={links.bills()}
                onClick={onClose}
                className={`${ROW} ${BUTTON} mt-[28px] min-h-[41px] gap-[25px] pl-[17px]`}
              >
                <Image
                  src="/menu/bills.svg"
                  alt=""
                  width={27}
                  height={20}
                  unoptimized
                  aria-hidden
                />
                Bills
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-[24px] flex-1" aria-hidden />
      {/* The cat sits above Settings and Logout on every page (the user's rule, 2026-09-29) -
          decoration, not navigation. Flask's own side panel draws the same one. */}
      <div className="flex shrink-0 justify-center pb-[16px]">
        <Image
          src="/menu/sidepanel_cat.webp"
          alt=""
          width={1370}
          height={1101}
          className="h-auto w-[min(100%,10rem)] select-none object-contain"
          draggable={false}
          unoptimized
        />
      </div>
      <Separator />
      <div className="mt-[14px] flex flex-col gap-[3px]">
        {inCompany ? (
          <MenuLink
            href={links.settings()}
            current={current === "settings"}
            onNavigate={onClose}
            className="min-h-[52px] gap-[16px] pl-[14px]"
          >
            <span className="flex size-[31px] shrink-0 items-center justify-center" aria-hidden>
              <Image
                className="-scale-y-100"
                src="/menu/settings.svg"
                alt=""
                width={27}
                height={27}
                unoptimized
              />
            </span>
            Settings
          </MenuLink>
        ) : null}
        <button
          type="button"
          onClick={logout}
          className={`${ROW} ${IDLE} min-h-[44px] cursor-pointer gap-[16px] pl-[14px] text-left`}
        >
          <span className="flex size-[31px] shrink-0 items-center justify-center" aria-hidden>
            <Image src="/menu/logout.svg" alt="" width={23} height={23} unoptimized />
          </span>
          Logout
        </button>
      </div>
    </nav>
  );
}
