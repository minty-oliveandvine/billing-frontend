import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isPortalPath, subscriptionsEnabled } from "@/lib/subscriptions";

const AUTH_COOKIE = "billing_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/module-selection" ||
    pathname.startsWith("/module-selection/") ||
    pathname === "/landing" ||
    pathname.startsWith("/landing/")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/module-selection";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Subscriptions dark (lib/subscriptions.ts): the payer portal's pages go back to the
  // profile, which shows no portal cards in that state either.
  if (!subscriptionsEnabled() && isPortalPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/profile";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
