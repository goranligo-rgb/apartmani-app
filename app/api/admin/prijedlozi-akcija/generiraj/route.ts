import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { adminSessionOk } from "@/lib/admin-auth";

function toDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nightsBetween(start: Date, end: Date) {
  return Math.round(
    (toDateOnly(end).getTime() - toDateOnly(start).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

export async function POST() {
  // Admin auth gate — bez sesije ne dozvoli generiranje prijedloga akcija.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jedinice = await prisma.jedinica.findMany({
    where: {
      aktivna: true,
      autoGapDiscountEnabled: true,
    },
    include: {
      rezervacije: {
        where: {
          status: {
            in: ["POTVRDENO", "CEKA_OSTATAK", "PLACENO", "REZERVIRANO"],
          },
        },
        orderBy: {
          datumOd: "asc",
        },
      },
    },
  });

  let brojKreiranih = 0;
  const debug: any[] = [];

  for (const jedinica of jedinice) {
    const rezervacije = jedinica.rezervacije;

    debug.push({
      jedinica: jedinica.naziv,
      jedinicaId: jedinica.id,
      autoGapDiscountEnabled: jedinica.autoGapDiscountEnabled,
      gapDiscountPercent: jedinica.gapDiscountPercent,
      gapDiscountMaxNights: jedinica.gapDiscountMaxNights,
      brojRezervacija: rezervacije.length,
      rezervacije: rezervacije.map((r) => ({
        id: r.id,
        datumOd: r.datumOd,
        datumDo: r.datumDo,
        status: r.status,
        napomena: r.napomena,
      })),
    });

    if (rezervacije.length < 2) continue;

    for (let i = 0; i < rezervacije.length - 1; i++) {
      const lijevaDo = toDateOnly(new Date(rezervacije[i].datumDo));
      const desnaOd = toDateOnly(new Date(rezervacije[i + 1].datumOd));

      const gapNights = nightsBetween(lijevaDo, desnaOd);

      if (gapNights <= 0) continue;
      if (gapNights > jedinica.gapDiscountMaxNights) continue;

      const datumOd = lijevaDo;
      const datumDo = desnaOd;

      const vecPostoji = await prisma.prijedlogAkcije.findFirst({
        where: {
          jedinicaId: jedinica.id,
          datumOd,
          datumDo,
        },
      });

      if (vecPostoji) {
        debug.push({
          jedinica: jedinica.naziv,
          info: "Prijedlog već postoji",
          datumOd,
          datumDo,
        });
        continue;
      }

      await prisma.prijedlogAkcije.create({
        data: {
          jedinicaId: jedinica.id,
          datumOd,
          datumDo,
          brojNocenja: gapNights,
          predlozeniPopust: jedinica.gapDiscountPercent,
          razlog: `Kratka rupa od ${gapNights} noći između dvije rezervacije`,
          status: "CEKA_ODOBRENJE",
        },
      });

      brojKreiranih++;

      debug.push({
        jedinica: jedinica.naziv,
        info: "Kreiran prijedlog",
        datumOd,
        datumDo,
        gapNights,
      });
    }
  }

  return NextResponse.json({
    success: true,
    created: brojKreiranih,
    debug,
  });
}