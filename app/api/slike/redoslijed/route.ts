import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminSessionOk } from "@/lib/admin-auth";

// Spremanje redoslijeda galerije slika za JEDAN objekt.
//
// Prima: { objektId, redoslijed: string[] } — niz SlikaObjekta.id u željenom
// poretku. Prenumerira sortOrder = 0..N-1 preko SVIH redova koji čine javnu
// galeriju tog objekta (objektId===objektId ILI jedinica.objektId===objektId),
// uključujući neaktivne (javni upit ih i dalje filtrira van) i dashboard
// (prikaziNaDashboardu) redove — sve u jedan neprekinut niz.
//
// Sigurnost opsega: iz `redoslijed`-a zadrži samo id-eve koji STVARNO pripadaju
// tom objekt-setu (strane ignoriraj), pa endpoint nikad ne piše sortOrder na
// redove drugog objekta. Redove koji fale u nizu doda na kraj (obrana od tie-a).
export async function POST(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli mijenjanje redoslijeda.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const objektId = body?.objektId ? String(body.objektId) : "";
    const redoslijedRaw: unknown = body?.redoslijed;

    if (!objektId) {
      return NextResponse.json({ error: "Nedostaje objektId" }, { status: 400 });
    }

    if (!Array.isArray(redoslijedRaw)) {
      return NextResponse.json(
        { error: "redoslijed mora biti niz id-eva" },
        { status: 400 }
      );
    }

    const redoslijed = redoslijedRaw.map((x) => String(x));

    // Svi redovi objekt-seta (i objekt-redovi i jedinica-redovi tog objekta).
    // Sortiramo po trenutnom poretku da redovi koji fale u payloadu zadrže
    // stabilan relativni redoslijed kad ih dodamo na kraj.
    const redovi = await prisma.slikaObjekta.findMany({
      where: {
        OR: [{ objektId }, { jedinica: { objektId } }],
      },
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const valjaniIds = new Set(redovi.map((r) => r.id));

    // 1) Zadrži iz payloada samo id-eve koji pripadaju ovom objekt-setu, bez
    //    duplikata (prvi nastup pobjeđuje). 2) Dodaj na kraj sve preostale
    //    redove seta koji nisu bili u payloadu.
    const vidjeni = new Set<string>();
    const poredani: string[] = [];

    for (const id of redoslijed) {
      if (valjaniIds.has(id) && !vidjeni.has(id)) {
        vidjeni.add(id);
        poredani.push(id);
      }
    }

    for (const r of redovi) {
      if (!vidjeni.has(r.id)) {
        vidjeni.add(r.id);
        poredani.push(r.id);
      }
    }

    // Prenumeracija 0..N-1 u jednoj transakciji (nema tie-a unutar objekta).
    await prisma.$transaction(
      poredani.map((id, index) =>
        prisma.slikaObjekta.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    return NextResponse.json({ ok: true, count: poredani.length });
  } catch (err) {
    console.error("REDOSLIJED SLIKE ERROR:", err);
    return NextResponse.json(
      { error: "Greška kod spremanja redoslijeda" },
      { status: 500 }
    );
  }
}
