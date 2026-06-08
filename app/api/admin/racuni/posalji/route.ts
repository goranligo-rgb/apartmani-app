import { NextResponse } from "next/server";
import { adminSessionOk } from "@/lib/admin-auth";
import { posaljiRacunMail } from "@/lib/posaljiRacunMail";

export async function POST(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli slanje računa gostima.
  // Guard ostaje na ruti zbog eventualnih vanjskih poziva; sama logika slanja
  // živi u lib/posaljiRacunMail.ts (zove je i admin inline akcija in-process).
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { racunId } = await req.json();

    const result = await posaljiRacunMail(racunId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Greška kod slanja računa." },
      { status: 500 }
    );
  }
}
