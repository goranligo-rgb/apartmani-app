import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { pronadiPreklapanja } from "@/lib/zauzeca";
import { adminSessionOk } from "@/lib/admin-auth";

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli izmjenu blokada.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const jedinicaId = String(body.jedinicaId || "");
  const datumOd = String(body.datumOd || body.datum || "");
  const datumDo = String(body.datumDo || body.datum || "");
  const razlog = String(body.razlog || "Ručno zatvoreno");

  if (!jedinicaId || !datumOd || !datumDo) {
    return NextResponse.json({ error: "Nedostaju podaci." }, { status: 400 });
  }

  const od = new Date(datumOd);
  const doZakljucno = new Date(datumDo);

  if (Number.isNaN(od.getTime()) || Number.isNaN(doZakljucno.getTime())) {
    return NextResponse.json({ error: "Neispravan datum." }, { status: 400 });
  }

  if (od > doZakljucno) {
    return NextResponse.json(
      { error: "Datum od ne može biti nakon datuma do." },
      { status: 400 }
    );
  }

  const doDatuma = addDays(doZakljucno, 1);

  // Jedinstvena provjera dostupnosti kroz `pronadiPreklapanja`. Tri vrste
  // preklapanja se ovdje različito tretiraju:
  // - rezervacije → REJECT (ne smije se blokirati preko žive rezervacije)
  // - ručne blokade → TOGGLE (klik na blokirani dan otvara / deaktivira ih)
  // - vanjske (Booking) blokade → IGNORIRAJ (admin svjesno dodaje ručnu
  //   blokadu pa preko Booking termina; to je trenutno ponašanje, ne mijenjamo)
  const preklapanja = await pronadiPreklapanja({
    jedinicaId,
    datumOd: od,
    datumDo: doDatuma,
  });

  if (preklapanja.rezervacije.length > 0) {
    return NextResponse.json(
      {
        error:
          "Ne možeš zatvoriti ili otvoriti raspon u kojem postoji rezervacija.",
      },
      { status: 400 }
    );
  }

  const postojeceBlokade = preklapanja.blokadeRucne;

  if (postojeceBlokade.length > 0) {
    await prisma.blokadaJedinice.updateMany({
      where: {
        id: { in: postojeceBlokade.map((b) => b.id) },
      },
      data: {
        aktivna: false,
      },
    });

    return NextResponse.json({ success: true, action: "OPEN" });
  }

  await prisma.blokadaJedinice.create({
    data: {
      jedinicaId,
      datumOd: od,
      datumDo: doDatuma,
      razlog,
      izvor: "ADMIN",
      aktivna: true,
    },
  });

  return NextResponse.json({ success: true, action: "CLOSED" });
}