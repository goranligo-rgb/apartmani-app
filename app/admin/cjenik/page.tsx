import { prisma } from "@/lib/prisma";
import CjenikClient from "./CjenikClient";

function toDateOnly(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");

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
      datumOd: toDateOnly(c.datumOd),
      datumDo: toDateOnly(c.datumDo),
      cijenaNocenja: c.cijenaNocenja,
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
        <div className="mb-6 border border-white/70 bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#9b7a4c]">
            Admin
          </p>
          <h1 className="text-3xl font-bold text-[#2e2923]">Cjenik jedinica</h1>
          <p className="mt-2 text-[#6f665a]">
            Odabir perioda, boja po cjenovnom razredu, pregled 4 mjeseca i kontrola preklapanja.
          </p>
        </div>

        <CjenikClient jedinice={jedinice} />
      </div>
    </main>
  );
}