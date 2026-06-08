import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  // Parcijalni update — diramo SAMO polja koja su stvarno poslana u tijelu.
  // (Stari kod je izostavljeni sortOrder resetirao na 0 i rušio redoslijed.)
  const data: Prisma.SlikaObjektaUncheckedUpdateInput = {};

  if ("aktivna" in body) data.aktivna = Boolean(body.aktivna);
  if ("prikaziNaPocetnoj" in body) {
    data.prikaziNaPocetnoj = Boolean(body.prikaziNaPocetnoj);
  }
  if ("prikaziNaDashboardu" in body) {
    data.prikaziNaDashboardu = Boolean(body.prikaziNaDashboardu);
  }

  // sortOrder se mijenja SAMO ako je poslan kao broj — nikad se ne resetira.
  if (
    "sortOrder" in body &&
    body.sortOrder !== null &&
    body.sortOrder !== "" &&
    Number.isFinite(Number(body.sortOrder))
  ) {
    data.sortOrder = Number(body.sortOrder);
  }

  // jedinicaId: string → poveži na jedinicu i uskladi objektId na njezin objekt
  // (red ostaje u ispravnom objekt-setu); null → ukloni jedinicu (objekt-razina,
  // objektId nepromijenjen).
  if ("jedinicaId" in body) {
    const jedinicaId = body.jedinicaId ? String(body.jedinicaId) : null;

    if (jedinicaId) {
      const jedinica = await prisma.jedinica.findUnique({
        where: { id: jedinicaId },
        select: { objektId: true },
      });

      if (!jedinica) {
        return NextResponse.json(
          { error: "Jedinica ne postoji" },
          { status: 400 }
        );
      }

      data.jedinicaId = jedinicaId;
      data.objektId = jedinica.objektId;
    } else {
      data.jedinicaId = null;
    }
  }

  const slika = await prisma.slikaObjekta.update({
    where: { id },
    data,
  });

  return NextResponse.json(slika);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;

  await prisma.slikaObjekta.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
