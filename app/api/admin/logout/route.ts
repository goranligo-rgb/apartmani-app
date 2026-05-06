import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(
    new URL("/admin/login", request.url),
    {
      status: 303,
    }
  );

  response.cookies.set("admin_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}