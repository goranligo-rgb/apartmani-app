import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function POST(req: Request) {
  const body = await req.json();
  const jedinicaId = String(body.jedinicaId || "");

  if (!jedinicaId) {
    return NextResponse.json(
      { error: "Nedostaje jedinicaId" },
      { status: 400 }
    );
  }

  const jedinica = await prisma.jedinica.findUnique({
    where: { id: jedinicaId },
  });

  if (!jedinica) {
    return NextResponse.json(
      { error: "Jedinica nije pronađena" },
      { status: 404 }
    );
  }

  await prisma.rezervacija.deleteMany({
    where: {
      jedinicaId,
      napomena: "TEST_GAP",
    },
  });

  const gost = await prisma.gost.create({
    data: {
      ime: "Test",
      prezime: "Gost",
      napomena: "TEST_GAP",
    },
  });

  const r1 = await prisma.rezervacija.create({
    data: {
      jedinicaId,
      gostId: gost.id,
      datumOd: parseDate("2026-07-01"),
      datumDo: parseDate("2026-07-05"),
      brojNocenja: 4,
      brojOsoba: 2,
      status: "KAPARA",
      napomena: "TEST_GAP",
    },
  });

  const r2 = await prisma.rezervacija.create({
    data: {
      jedinicaId,
      gostId: gost.id,
      datumOd: parseDate("2026-07-08"),
      datumDo: parseDate("2026-07-12"),
      brojNocenja: 4,
      brojOsoba: 2,
      status: "KAPARA",
      napomena: "TEST_GAP",
    },
  });

  return NextResponse.json({
    success: true,
    jedinica: jedinica.naziv,
    jedinicaId: jedinica.id,
    rezervacije: [
      {
        id: r1.id,
        datumOd: r1.datumOd,
        datumDo: r1.datumDo,
      },
      {
        id: r2.id,
        datumOd: r2.datumOd,
        datumDo: r2.datumDo,
      },
    ],
  });
}