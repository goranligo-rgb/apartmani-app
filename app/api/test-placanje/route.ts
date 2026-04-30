import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rezervacija = await prisma.rezervacija.findFirst();

  if (!rezervacija) {
    return NextResponse.json({ error: "Nema rezervacije" });
  }

  const placanje = await prisma.placanje.create({
    data: {
      rezervacijaId: rezervacija.id,
      tip: "POTVRDA_REZERVACIJE",
      iznos: 100,
    },
  });

  return NextResponse.json(placanje);
}