import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();

  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (
    !adminUsername ||
    !adminPassword ||
    username !== adminUsername ||
    password !== adminPassword
  ) {
    return NextResponse.redirect(
      new URL("/admin/login?error=1", request.url),
      { status: 303 }
    );
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), {
    status: 303,
  });

  response.cookies.set("admin_session_v3", "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}