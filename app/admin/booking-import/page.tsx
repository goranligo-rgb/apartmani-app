import Link from "next/link";
import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { formatZagreb } from "@/lib/dates";
import {
  OBJEKT_KEY_TO_NAZIV,
  type ObjektKey,
} from "@/lib/booking-unit-mapping";
import BookingImportClient from "./BookingImportClient";

export const dynamic = "force-dynamic";

export default async function AdminBookingImportPage() {
  // Provjeri koji ObjektKey-evi imaju odgovarajući Objekt zapis u bazi.
  // Filtriramo dropdown da ne nudimo objekt koji ne postoji.
  const nazivi = Object.values(OBJEKT_KEY_TO_NAZIV);
  const [objektiUBazi, povijest] = await Promise.all([
    prisma.objekt.findMany({
      where: { naziv: { in: nazivi } },
      select: { naziv: true },
    }),
    prisma.bookingExcelImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const postojeci = new Set(objektiUBazi.map((o) => o.naziv));

  const dostupniObjekti = (Object.keys(OBJEKT_KEY_TO_NAZIV) as ObjektKey[])
    .map((key) => ({ key, naziv: OBJEKT_KEY_TO_NAZIV[key] }))
    .filter((o) => postojeci.has(o.naziv));

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f4f1ec 0%, #eee8df 48%, #e7dfd3 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-[#2e2923]">
        <Link
          href="/admin"
          className="mb-4 inline-block text-sm font-semibold text-[#9b7a4c] hover:text-[#7a5a22]"
        >
          ← Povratak na admin
        </Link>

        <section className="mb-6 border border-white/80 bg-white p-7 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-[#9b7a4c]">
            Booking obogaćivanje
          </p>

          <h1 className="text-4xl font-black tracking-tight md:text-5xl">
            Booking Excel Import
          </h1>

          <p className="mt-4 max-w-3xl text-base text-[#6f665a]">
            Učitaj Booking Excel <em>&quot;Prijava s kontaktnim podacima&quot;</em>{" "}
            i nadopuni postojeće iCal blokade s gostima, kontaktima, brojem
            osoba, cijenom i provizijom. Otkazane rezervacije se brišu, ostale
            se ažuriraju spajanjem po jedinici i datumima.
          </p>

          <div className="mt-5 grid gap-3 text-sm text-[#6f665a] md:grid-cols-3">
            <Step n={1} title="Sync iCal prije uvoza">
              Da bi se rezervacije mogle spojiti, iCal blokade moraju postojati.
              Pokreni <Link href="/admin/ical" className="font-bold text-[#7a5a22] hover:underline">Booking iCal sync</Link> prije.
            </Step>
            <Step n={2} title="Izaberi objekt">
              Eva, Marty i House Art imaju zasebne Booking accounte. Odaberi
              ispravan objekt prije uploada.
            </Step>
            <Step n={3} title="Preview pa import">
              Pregledaj koje rezervacije će se ažurirati, a koje preskočiti.
              Tek nakon preview-a možeš pokrenuti import.
            </Step>
          </div>
        </section>

        {dostupniObjekti.length === 0 ? (
          <section className="border-2 border-rose-300 bg-rose-50 p-5 text-rose-900">
            <strong>Greška konfiguracije:</strong> nijedan od očekivanih
            objekata ({Object.values(OBJEKT_KEY_TO_NAZIV).join(", ")}) ne
            postoji u bazi. Provjeri tablicu Objekt.
          </section>
        ) : (
          <BookingImportClient dostupniObjekti={dostupniObjekti} />
        )}

        <section className="mt-6 border border-[#d8c8aa] bg-white p-6 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
          <h2 className="text-2xl font-black text-[#2e2923]">
            Povijest upload-a
          </h2>
          <p className="mt-1 text-sm text-[#6f665a]">
            Zadnjih 30 Excel upload-a, najnoviji prvi.
          </p>

          {povijest.length === 0 ? (
            <p className="mt-4 text-sm text-[#8a8175]">Još nema upload-a.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e2d8c8] bg-[#f8f3ea] text-xs uppercase tracking-[0.18em] text-[#7a5a22]">
                    <th className="p-3">Datum / vrijeme</th>
                    <th className="p-3">Objekt</th>
                    <th className="p-3">Naziv fajla</th>
                    <th className="p-3 text-right">Ukupno</th>
                    <th className="p-3 text-right">Obogaćeno</th>
                    <th className="p-3 text-right">Preskočeno</th>
                    <th className="p-3 text-right">Greške</th>
                  </tr>
                </thead>
                <tbody>
                  {povijest.map((p) => {
                    const greske = parseGreske(p.greske);
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-b border-[#eee3d4] hover:bg-[#fcfaf6]">
                          <td className="p-3 text-[#2e2923]">
                            {formatDateTime(p.createdAt)}
                          </td>
                          <td className="p-3 font-black text-[#2e2923]">
                            {p.objektNaziv}
                          </td>
                          <td className="p-3 text-[#6f665a]">
                            {p.imeFajla || "-"}
                          </td>
                          <td className="p-3 text-right text-[#6f665a]">
                            {p.brojRedakaUkupno}
                          </td>
                          <td className="p-3 text-right font-black text-emerald-700">
                            {p.brojObogaceno}
                          </td>
                          <td className="p-3 text-right text-amber-700">
                            {p.brojPreskoceno}
                          </td>
                          <td className="p-3 text-right">
                            {p.brojGresaka > 0 ? (
                              <span className="font-black text-red-700">
                                {p.brojGresaka}
                              </span>
                            ) : (
                              <span className="text-[#8a8175]">-</span>
                            )}
                          </td>
                        </tr>
                        {greske.length > 0 && (
                          <tr className="border-b border-[#eee3d4] bg-rose-50">
                            <td colSpan={7} className="p-3">
                              <ul className="space-y-1 text-xs text-red-800">
                                {greske.map((g, i) => (
                                  <li key={i}>· {g}</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#e2d8c8] bg-[#f8f3ea] p-4">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
        Korak {n}
      </div>
      <div className="mt-1 text-base font-black text-[#2e2923]">{title}</div>
      <div className="mt-1 text-xs leading-5">{children}</div>
    </div>
  );
}

function formatDateTime(d: Date) {
  // createdAt importa — pravi žig; Europe/Zagreb pokaže stvarni sat.
  return formatZagreb(d, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseGreske(s: string | null): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
