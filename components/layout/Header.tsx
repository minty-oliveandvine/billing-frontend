import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavMenu } from "./NavMenu";
import { ProfileInitialsBadge } from "./ProfileInitialsBadge";

type HeaderProps = {
  title?: string;
  showLogo?: boolean;
  brandHref?: string | null;
  /** When set, shows a back link to the payment request dashboard (Bills table). Title is not linked to home. */
  backHref?: string;
  backLabel?: string;
  statusBadge?: ReactNode;
  titleActions?: ReactNode;
  navItems?: { href: string; label: string }[];
  companyName?: string;
  companyAbbreviation?: string;
  onLogout?: () => void;
  /** When true, tints the company icon green to indicate an active Xero connection. */
  xeroConnected?: boolean;
  /** Omit top safe-area padding when a row above the header already applies it. */
  suppressTopSafeArea?: boolean;
  /** Drop the bottom border (separator) — e.g. when a sticky pills row sits directly below. */
  noBorder?: boolean;
};

export function Header({
  title = "Payment Request",
  showLogo = false,
  brandHref,
  backHref,
  backLabel = "Bills",
  statusBadge,
  titleActions,
  navItems,
  companyName = "Insert Company Here",
  companyAbbreviation = "---",
  onLogout,
  xeroConnected,
  suppressTopSafeArea = false,
  noBorder = false,
}: HeaderProps) {
  const homeHref = brandHref === undefined ? "/" : brandHref;
  const showBack = Boolean(backHref);

  const brand = (
    <>
      {showLogo ? (
        <Image src="/logo-selection.webp" alt="" width={40} height={40} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
      ) : null}
      <span className="min-w-0 cursor-default truncate text-base font-semibold text-black sm:text-lg">{title}</span>
    </>
  );

  const leftSection = showBack && backHref ? (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 sm:gap-3">
      <Link href={backHref} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary transition-colors hover:text-secondary sm:text-base">
        <span className="material-symbols-outlined text-[22px] leading-none sm:text-[24px]" aria-hidden>
          chevron_left
        </span>
        {backLabel}
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {showLogo ? (
          <Image src="/logo-selection.webp" alt="" width={40} height={40} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
        ) : null}
        <span className="min-w-0 cursor-default truncate text-base font-semibold text-black sm:text-lg">{title}</span>
        {titleActions ? <div className="flex shrink-0 items-center">{titleActions}</div> : null}
        {statusBadge}
      </div>
    </div>
  ) : homeHref ? (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      {showLogo ? (
        <Link href={homeHref} className="shrink-0">
          <Image src="/logo-selection.webp" alt="" width={40} height={40} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
        </Link>
      ) : null}
      <span className="min-w-0 cursor-default truncate text-base font-semibold text-black sm:text-lg">{title}</span>
      {titleActions ? <div className="flex shrink-0 items-center">{titleActions}</div> : null}
    </div>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">{brand}</div>
  );

  return (
    <header
      className={`bg-white ${noBorder ? "" : "border-b border-gray-200"} ${suppressTopSafeArea ? "" : "pt-[env(safe-area-inset-top,0px)]"}`}
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-row items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 min-h-10 flex-1 items-center sm:min-h-0">{leftSection}</div>
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-3">
          <span className="relative inline-flex shrink-0">
            <span
              className="material-symbols-outlined text-[22px] leading-none text-primary sm:text-[26px]"
              aria-hidden
            >
              corporate_fare
            </span>
          </span>
          <span className="min-w-0 max-w-[min(100%,6.5rem)] truncate text-sm font-medium text-primary sm:max-w-[9rem] sm:text-base md:max-w-[14rem] lg:max-w-md">
            {companyName}
          </span>
          <div className="flex shrink-0 items-center gap-1.5 pl-0.5 sm:gap-2 sm:pl-2">
            <ProfileInitialsBadge />
            <NavMenu items={navItems} companyAbbreviation={companyAbbreviation} onLogout={onLogout} />
          </div>
        </div>
      </div>
    </header>
  );
}
