import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavMenu } from "./NavMenu";
import { ProfileInitialsBadge } from "./ProfileInitialsBadge";

/** One step in the header trail. No `href` on the last one — you are already there. */
export type Crumb = { label: string; href?: string };

type HeaderProps = {
  title?: string;
  showLogo?: boolean;
  brandHref?: string | null;
  /** When set, shows a back link to the payment request dashboard (Bills table). Title is not linked to home. */
  backHref?: string;
  backLabel?: string;
  /**
   * A breadcrumb trail, replacing the back-link-plus-title arrangement.
   *
   * The two say different things and the portal needs the second: `backHref` gives ONE
   * step back, which is all a two-level page needs, but "Billing account" sits under
   * Billing which sits under My Profile, and a lone "‹ Billing" hides where that is.
   * The last crumb is the page and is not a link.
   */
  crumbs?: Crumb[];
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
  backLabel = "Payments",
  crumbs,
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

  const trail = crumbs?.length ? (
    <nav
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5"
      aria-label="Breadcrumb"
    >
      <span
        className="material-symbols-outlined -ml-1 shrink-0 text-[20px] leading-none text-[#737A87] sm:text-[22px]"
        aria-hidden
      >
        chevron_left
      </span>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? (
              <span className="shrink-0 text-sm text-[#9EA6B0]" aria-hidden>
                ›
              </span>
            ) : null}
            {isLast || !crumb.href ? (
              <span
                aria-current={isLast ? "page" : undefined}
                className="min-w-0 truncate text-[15px] font-bold text-[#292E38] sm:text-base"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="min-w-0 truncate text-[15px] text-[#737A87] transition-colors hover:text-secondary"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  ) : null;

  const leftSection = trail ? (
    trail
  ) : showBack && backHref ? (
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
