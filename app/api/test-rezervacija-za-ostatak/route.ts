import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const danas = new Date();

  const dolazak = new Date();
  dolazak.setDate(danas.getDate() + 7);
  dolazak.setHours(12, 0, 0, 0);

  const odlazak = new Date(dolazak);
  odlazak.setDate(dolazak.getDate() + 3);

  const rezervacija = await prisma.rezervacija.findFirst({
    include: {
      gost: true,
    },
  });

  if (!rezervacija) {
    return NextResponse.json({ error: "Nema rezervacije" });
  }

  if (rezervacija.gostId) {
    await prisma.gost.update({
      where: { id: rezervacija.gostId },
      data: {
        email: "goran.ligo@gmail.com",
      },
    });
  }

  const updated = await prisma.rezervacija.update({
    where: { id: rezervacija.id },
    data: {
      status: "POTVRDENO",
      datumOd: dolazak,
      datumDo: odlazak,
      brojNocenja: 3,
      iznosUkupno: 500,
      iznosPlaceno: 100,
    },
  });

  return NextResponse.json({
    success: true,
    rezervacijaId: updated.id,
    status: updated.status,
    datumOd: updated.datumOd,
    datumDo: updated.datumDo,
    iznosUkupno: updated.iznosUkupno,
    iznosPlaceno: updated.iznosPlaceno,
  });
}