import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { adminSessionOk } from "@/lib/admin-auth";

type BojaPerioda =
  | "PLAVA"
  | "ZELENA"
  | "ZUTA"
  | "NARANCASTA"
  | "CRVENA"
  | "LJUBICASTA";

function parseLocalDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);

  if (!y || !m || !d) return null;

  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isValidBoja(value: string): value is BojaPerioda {
  return [
    "PLAVA",
    "ZELENA",
    "ZUTA",
    "NARANCASTA",
    "CRVENA",
    "LJUBICASTA",
  ].includes(value);
}

export async function POST(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli pisanje u cjenik.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const jedinicaId = String(body.jedinicaId || "");
    const datumOd = String(body.datumOd || "");
    const datumDo = String(body.datumDo || "");
    const cijenaNocenja = Number(body.cijenaNocenja || 0);
    const minimalniBoravak = Number(body.minimalniBoravak || 2);
    const mode = String(body.mode || "NORMAL");

    const bojaRaw = String(body.bojaPerioda || "ZELENA");
    const bojaPerioda: BojaPerioda = isValidBoja(bojaRaw)
      ? bojaRaw
      : "ZELENA";

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

    const od = parseLocalDate(datumOd);
    const doDatuma = parseLocalDate(datumDo);

    if (!od || !doDatuma) {
      return NextResponse.json({ error: "Neispravan datum." }, { status: 400 });
    }

    if (od > doDatuma) {
      return NextResponse.json(
        { error: "Datum od ne može biti nakon datuma do." },
        { status: 400 }
      );
    }

    const jedinica = await prisma.jedinica.findUnique({
      where: { id: jedinicaId },
      select: { id: true },
    });

    if (!jedinica) {
      return NextResponse.json(
        { error: "Jedinica ne postoji." },
        { status: 404 }
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
      if (preklapanja.length === 0) {
        return NextResponse.json(
          { error: "Nema postojećeg perioda koji treba razrezati." },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        for (const stari of preklapanja) {
          await tx.cjenik.update({
            where: { id: stari.id },
            data: { aktivno: false },
          });

          const lijeviOd = stari.datumOd;
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
          const desniDo = stari.datumDo;

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
  } catch (error) {
    console.error("CJENIK_POST_ERROR", error);

    return NextResponse.json(
      { error: "Greška kod spremanja cjenika." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli brisanje cjenika.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
  } catch (error) {
    console.error("CJENIK_DELETE_ERROR", error);

    return NextResponse.json(
      { error: "Greška kod brisanja cjenika." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli izmjenu cjenika.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const id = String(body.id || "");
    const minimalniBoravak = Number(body.minimalniBoravak);

    if (!id) {
      return NextResponse.json({ error: "Nedostaje ID." }, { status: 400 });
    }

    if (!Number.isInteger(minimalniBoravak) || minimalniBoravak < 1) {
      return NextResponse.json(
        { error: "Minimalni boravak mora biti cijeli broj barem 1." },
        { status: 400 }
      );
    }

    // Ažuriraj ISKLJUČIVO minimalniBoravak — cijena, datumi, boja i aktivno
    // ostaju netaknuti (namjerno se ne prosljeđuju u data).
    const updated = await prisma.cjenik.update({
      where: { id },
      data: { minimalniBoravak },
    });

    return NextResponse.json({
      success: true,
      id: updated.id,
      minimalniBoravak: updated.minimalniBoravak,
    });
  } catch (error) {
    console.error("CJENIK_PATCH_ERROR", error);

    return NextResponse.json(
      { error: "Greška kod ažuriranja minimalnog boravka." },
      { status: 500 }
    );
  }
}
