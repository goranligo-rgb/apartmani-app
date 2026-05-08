import { prisma } from "@/lib/prisma";
import CjenikClient from "./CjenikClient";

export const dynamic = "force-dynamic";

function toLocalIso(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function AdminCjenikPage() {
  const jediniceRaw = await prisma.jedinica.findMany({
    include: {
      objekt: true,
      cjenici: {
        where: { aktivno: true },
        orderBy: { datumOd: "asc" },
      },
    },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  const jedinice = jediniceRaw.map((j) => ({
    id: j.id,
    naziv: j.naziv,
    objektNaziv: j.objekt.naziv,
    cjenici: j.cjenici.map((c) => ({
      id: c.id,
      datumOd: toLocalIso(c.datumOd),
      datumDo: toLocalIso(c.datumDo),
      cijenaNocenja: Number(c.cijenaNocenja),
      minimalniBoravak: c.minimalniBoravak,
      bojaPerioda: c.bojaPerioda,
      aktivno: c.aktivno,
    })),
  }));

  return (
    <main
      className="min-h-screen px-4 py-6 md:px-8"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="mx-auto max-w-[1600px]">
        <CjenikClient jedinice={jedinice} />
      </div>
    </main>
  );
}