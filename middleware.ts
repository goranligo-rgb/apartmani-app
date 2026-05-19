import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Prefiksi internih ruta koje zahtijevaju admin login.
// /rezervacije/* je namjerno izvan ovog popisa – ta ruta je javna.
const INTERNAL_PREFIXES = ["/admin", "/kalendar", "/posebne-prilike"];

function isInternal(pathname: string) {
  return INTERNAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

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

  // Zaštiti sve interne rute (admin UI + interni alati) istim auth mehanizmom
  if (isInternal(pathname)) {
    const session = req.cookies.get("admin_session_v3")?.value;

    if (session !== "ok") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/((?!login$).*)",
    "/kalendar/:path*",
    "/posebne-prilike/:path*",
  ],
};