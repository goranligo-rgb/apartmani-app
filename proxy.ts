import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Samo pravi admin dashboard zahtijeva login — /kalendar i /posebne-prilike
// su javne stranice za goste i NE smiju zahtijevati login.
// Admin API rute (/api/admin/*) imaju vlastitu opt-in zaštitu kroz lib/admin-auth.ts.
const INTERNAL_PREFIXES = ["/admin"];

function isInternal(pathname: string) {
  return INTERNAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (isInternal(pathname)) {
    const session = req.cookies.get("admin_session_v3")?.value;

    if (session !== "ok") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    return NextResponse.next();
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
