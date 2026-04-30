import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type BojaPerioda =
  | "PLAVA"
  | "ZELENA"
  | "ZUTA"
  | "NARANCASTA"
  | "CRVENA"
  | "LJUBICASTA";

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(req: Request) {
  const body = await req.json();

  const jedinicaId = String(body.jedinicaId || "");
  const datumOd = String(body.datumOd || "");
  const datumDo = String(body.datumDo || "");
  const cijenaNocenja = Number(body.cijenaNocenja || 0);
  const minimalniBoravak = Number(body.minimalniBoravak || 2);
  const bojaPerioda = String(body.bojaPerioda || "ZELENA") as BojaPerioda;
  const mode = String(body.mode || "NORMAL");

  if (!jedinicaId || !datumOd || !datumDo || !cijenaNocenja) {
    return NextResponse.json(
      { error: "Nedostaju podaci za cjenik." },
      { status: 400 }
    );
  }

  if (cijenaNocenja <= 0) {
    return NextResponse.json(
      { error: "Cijena noćenja mora biti veća od 0." },
      { status: 400 }
    );
  }

  if (minimalniBoravak < 1) {
    return NextResponse.json(
      { error: "Minimalni boravak mora biti barem 1 noć." },
      { status: 400 }
    );
  }

  const od = new Date(datumOd);
  const doDatuma = new Date(datumDo);

  if (Number.isNaN(od.getTime()) || Number.isNaN(doDatuma.getTime())) {
    return NextResponse.json({ error: "Neispravan datum." }, { status: 400 });
  }

  if (od > doDatuma) {
    return NextResponse.json(
      { error: "Datum od ne može biti nakon datuma do." },
      { status: 400 }
    );
  }

  const preklapanja = await prisma.cjenik.findMany({
    where: {
      jedinicaId,
      aktivno: true,
      datumOd: { lte: doDatuma },
      datumDo: { gte: od },
    },
    orderBy: { datumOd: "asc" },
  });

  if (mode !== "SPECIAL" && preklapanja.length > 0) {
    return NextResponse.json(
      { error: "Postoji preklapanje s drugim cjenikom." },
      { status: 409 }
    );
  }

  if (mode === "SPECIAL") {
    await prisma.$transaction(async (tx) => {
      for (const stari of preklapanja) {
        await tx.cjenik.update({
          where: { id: stari.id },
          data: { aktivno: false },
        });

        const stariOd = stari.datumOd;
        const stariDo = stari.datumDo;

        const lijeviOd = stariOd;
        const lijeviDo = addDays(od, -1);

        if (lijeviOd <= lijeviDo) {
          await tx.cjenik.create({
            data: {
              jedinicaId,
              datumOd: lijeviOd,
              datumDo: lijeviDo,
              cijenaNocenja: stari.cijenaNocenja,
              minimalniBoravak: stari.minimalniBoravak,
              bojaPerioda: stari.bojaPerioda,
              aktivno: true,
            },
          });
        }

        const desniOd = addDays(doDatuma, 1);
        const desniDo = stariDo;

        if (desniOd <= desniDo) {
          await tx.cjenik.create({
            data: {
              jedinicaId,
              datumOd: desniOd,
              datumDo: desniDo,
              cijenaNocenja: stari.cijenaNocenja,
              minimalniBoravak: stari.minimalniBoravak,
              bojaPerioda: stari.bojaPerioda,
              aktivno: true,
            },
          });
        }
      }

      await tx.cjenik.create({
        data: {
          jedinicaId,
          datumOd: od,
          datumDo: doDatuma,
          cijenaNocenja,
          minimalniBoravak,
          bojaPerioda,
          aktivno: true,
        },
      });
    });

    return NextResponse.json({ success: true, special: true });
  }

  const created = await prisma.cjenik.create({
    data: {
      jedinicaId,
      datumOd: od,
      datumDo: doDatuma,
      cijenaNocenja,
      minimalniBoravak,
      bojaPerioda,
      aktivno: true,
    },
  });

  return NextResponse.json({ success: true, id: created.id });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Nedostaje ID." }, { status: 400 });
  }

  await prisma.cjenik.update({
    where: { id },
    data: { aktivno: false },
  });

  return NextResponse.json({ success: true });
}