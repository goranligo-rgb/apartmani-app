import { NextResponse } from "next/server";
import { adminSessionOk } from "@/lib/admin-auth";
import { potvrdiNaplatu } from "@/lib/potvrdaNaplate";

export async function GET() {
  return NextResponse.json(
    { error: "Potvrda naplate ne smije ići preko GET metode." },
    { status: 405 }
  );
}

// Admin auth gate — bez sesije ne dozvoli naplatu/potvrdu plaćanja preko linka.
// Sama logika potvrde/naplate je u lib/potvrdaNaplate.ts (potvrdiNaplatu).
// Server akcije (evidentirajUplatu, admin "nova rezervacija") zovu taj helper
// DIREKTNO, bez prolaska kroz ovaj HTTP gate — server-side fetch ne nosi
// admin cookie pa bi dobio 401.
export async function POST(req: Request) {
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let placanjeId = "";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      placanjeId = String(body.placanjeId || "");
    } else {
      const formData = await req.formData();
      placanjeId = String(formData.get("placanjeId") || "");
    }

    const rezultat = await potvrdiNaplatu(placanjeId);

    if (!rezultat.ok) {
      return NextResponse.json(
        { error: rezultat.error },
        { status: rezultat.status }
      );
    }

    // Već potvrđeno (s računom) — bez ?potvrdeno=1 markera.
    if (rezultat.vecPotvrdeno) {
      return NextResponse.redirect(
        new URL(`/admin/rezervacije/${rezultat.rezervacijaId}`, req.url),
        303
      );
    }

    return NextResponse.redirect(
      new URL(
        `/admin/rezervacije/${rezultat.rezervacijaId}?potvrdeno=1&updated=${Date.now()}`,
        req.url
      ),
      303
    );
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Greška kod potvrde, naplate, računa ili slanja maila." },
      { status: 500 }
    );
  }
}
