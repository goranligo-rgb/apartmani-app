import { prisma } from "@/lib/prisma";
import { isRezervacijaOverlap } from "@/lib/dates";
import { STATUSI_KOJI_ZAUZIMAJU } from "@/lib/zauzeca";

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

  // Batched dohvat: jedinice + sve preklapajuće rezervacije, ručne blokade
  // i vanjske (Booking) blokade u jednom query-ju kroz `include`. Whitelist
  // statusa kroz `STATUSI_KOJI_ZAUZIMAJU` (lib/zauzeca.ts) — uključuje UPIT
  // i CEKA_POTVRDU, što je ranije propuštalo (slobodno kao zauzeto = nema
  // problema, zauzeto kao slobodno = dvostruka rezervacija — biramo prvo).
  const jedinice = await prisma.jedinica.findMany({
    where: {
      aktivna: true,
    },
    include: {
      objekt: true,
      rezervacije: {
        where: {
          status: {
            in: [...STATUSI_KOJI_ZAUZIMAJU],
          },
          obrisanoAt: null,
          datumOd: {
            lt: datumDo,
          },
          datumDo: {
            gt: datumOd,
          },
        },
      },
      blokade: {
        where: {
          aktivna: true,
          datumOd: {
            lt: datumDo,
          },
          datumDo: {
            gt: datumOd,
          },
        },
      },
      blokadeVanjskogKalendara: {
        where: {
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
    // Same-day turnover (a.datumDo == b.datumOd) dopušten kroz
    // isRezervacijaOverlap helper - rješava midnight/noon mix. Provjera
    // sve tri vrste zauzeća: rezervacije + ručne blokade + Booking iCal.
    .filter((j) => {
      const overlapRez = j.rezervacije.some((r) =>
        isRezervacijaOverlap(r, { datumOd, datumDo }),
      );
      if (overlapRez) return false;

      const overlapRucne = j.blokade.some((b) =>
        isRezervacijaOverlap(b, { datumOd, datumDo }),
      );
      if (overlapRucne) return false;

      const overlapVanjske = j.blokadeVanjskogKalendara.some((b) =>
        isRezervacijaOverlap(b, { datumOd, datumDo }),
      );
      if (overlapVanjske) return false;

      return true;
    })
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
