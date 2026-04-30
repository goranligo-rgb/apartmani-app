import { prisma } from "@/lib/prisma";

function parseDateOnly(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function nightsBetween(start: Date, end: Date) {
  return Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export async function pronadiSlobodneJedinice(
  datumOdStr: string,
  datumDoStr: string
) {
  const datumOd = parseDateOnly(datumOdStr);
  const datumDo = parseDateOnly(datumDoStr);

  if (Number.isNaN(datumOd.getTime()) || Number.isNaN(datumDo.getTime())) {
    throw new Error("Neispravan datum.");
  }

  if (datumOd >= datumDo) {
    throw new Error("Datum odlaska mora biti nakon dolaska.");
  }

  const brojNocenja = nightsBetween(datumOd, datumDo);

  const jedinice = await prisma.jedinica.findMany({
    where: {
      aktivna: true,
    },
    include: {
      objekt: true,
      rezervacije: {
        where: {
          status: {
            in: ["KAPARA", "PLACENO", "REZERVIRANO"],
          },
          datumOd: {
            lt: datumDo,
          },
          datumDo: {
            gt: datumOd,
          },
        },
      },
      cjenici: {
        where: {
          aktivno: true,
          datumOd: {
            lte: datumDo,
          },
          datumDo: {
            gte: datumOd,
          },
        },
      },
    },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  const slobodne = jedinice
    .filter((j) => j.rezervacije.length === 0)
    .map((j) => {
      let ukupno = 0;

      for (let i = 0; i < brojNocenja; i++) {
        const dan = new Date(datumOd);
        dan.setDate(dan.getDate() + i);

        const cjenikZaDan = j.cjenici.find((c) => {
          const od = new Date(c.datumOd);
          const doDatuma = new Date(c.datumDo);
          return dan >= od && dan <= doDatuma;
        });

        if (!cjenikZaDan) return null;

        ukupno += cjenikZaDan.cijenaNocenja;
      }

      return {
        id: j.id,
        naziv: j.naziv,
        objektNaziv: j.objekt.naziv,
        osnovniKapacitet: j.osnovniKapacitet,
        dodatniKapacitet: j.dodatniKapacitet,
        brojKupaona: j.brojKupaona,
        brojSpavacihSoba: j.brojSpavacihSoba,
        ukupnaCijena: Number(ukupno.toFixed(2)),
        cijenaPoNoci: Number((ukupno / brojNocenja).toFixed(2)),
        brojNocenja,
      };
    })
    .filter(Boolean);

  return slobodne;
}