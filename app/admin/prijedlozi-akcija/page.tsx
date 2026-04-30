import { prisma } from "@/lib/prisma";
import PrijedloziAkcijaClient from "./PrijedloziAkcijaClient";

export default async function AdminPrijedloziAkcijaPage() {
  const prijedloziRaw = await prisma.prijedlogAkcije.findMany({
    include: {
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const prijedlozi = prijedloziRaw.map((p) => ({
    id: p.id,
    datumOd: p.datumOd.toISOString(),
    datumDo: p.datumDo.toISOString(),
    brojNocenja: p.brojNocenja,
    predlozeniPopust: p.predlozeniPopust,
    razlog: p.razlog || "",
    status: p.status,
    jedinicaNaziv: p.jedinica.naziv,
    objektNaziv: p.jedinica.objekt.naziv,
  }));

  return <PrijedloziAkcijaClient prijedlozi={prijedlozi} />;
}