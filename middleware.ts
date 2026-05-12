import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pusti sve API rute slobodno
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Pusti Next.js interne rute i statične fajlove
  if (pathname.startsWith("/_next/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Pusti login stranicu
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Zaštiti sve ostale /admin/* stranice (samo UI, ne API)
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get("admin_session_v3")?.value;

    if (session !== "ok") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!login$).*)"],
};