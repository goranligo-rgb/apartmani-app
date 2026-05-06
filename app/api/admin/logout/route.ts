import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(
    new URL("/admin/login", request.url),
    {
      status: 303,
    }
  );

  const url = new URL(request.url);
  const hostname = url.hostname;

  response.cookies.set("admin_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
    ...(hostname.endsWith("malinska-stay.hr")
      ? { domain: ".malinska-stay.hr" }
      : {}),
  });

  return response;
}