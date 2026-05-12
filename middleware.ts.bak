import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // dozvoli login page
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // dozvoli login/logout api
  if (
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout")
  ) {
    return NextResponse.next();
  }

  // zaštiti admin
  if (pathname.startsWith("/admin")) {
    const cookie = req.cookies.get("admin_session_v3");

    if (!cookie || cookie.value !== "ok") {
      return NextResponse.redirect(
        new URL("/admin/login", req.url)
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};