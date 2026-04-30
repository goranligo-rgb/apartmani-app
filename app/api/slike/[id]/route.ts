import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const slika = await prisma.slikaObjekta.update({
    where: { id },
    data: {
      aktivna: body.aktivna,
      prikaziNaPocetnoj: body.prikaziNaPocetnoj,
      prikaziNaDashboardu: body.prikaziNaDashboardu,
      sortOrder:
        body.sortOrder === "" || body.sortOrder === null || body.sortOrder === undefined
          ? 0
          : Number(body.sortOrder),
    },
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