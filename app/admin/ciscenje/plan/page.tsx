import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  dana?: string;
}>;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function tipLabel(tip: string) {
  if (tip === "ZAVRSNO_CISCENJE") return "Završno čišćenje";
  if (tip === "MEDJUCISCENJE") return "Međučisćenje";
  if (tip === "PROMJENA_POSTELJINE") return "Promjena posteljine";
  if (tip === "MEDJUCISCENJE_I_POSTELJINA") {
    return "Međučisćenje + posteljina + ručnici";
  }
  if (tip === "DODATNO_CISCENJE") return "Dodatno čišćenje";
  return tip;
}

function statusClass(status: string) {
  if (status === "GOTOVO") return "border-emerald-300 bg-emerald-400/15 text-emerald-100";
  if (status === "U_TOKU") return "border-amber-300 bg-amber-400/15 text-amber-100";
  if (status === "OTKAZANO") return "border-rose-300 bg-rose-400/15 text-rose-100";
  return "border-cyan-300 bg-cyan-400/15 text-cyan-100";
}

export default async function PlanCiscenjaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const dana = Number(params.dana || 14);

  const danas = startOfDay(new Date());
  const doDatuma = addDays(danas, dana);

  const zadaci = await prisma.zadatak.findMany({
    where: {
      datum: {
        gte: danas,
        lte: doDatuma,
      },
      tip: {
        in: [
          "ZAVRSNO_CISCENJE",
          "MEDJUCISCENJE",
          "PROMJENA_POSTELJINE",
          "MEDJUCISCENJE_I_POSTELJINA",
          "DODATNO_CISCENJE",
        ],
      },
      status: {
        not: "OTKAZANO",
      },
    },
    include: {
      jedinica: {
        include: {
          objekt: true,
        },
      },
      rezervacija: {
        include: {
          gost: true,
        },
      },
    },
    orderBy: [
      {
        datum: "asc",
      },
      {
        jedinica: {
          objekt: {
            naziv: "asc",
          },
        },
      },
      {
        jedinica: {
          naziv: "asc",
        },
      },
    ],
  });

  const grupirano = zadaci.reduce<Record<string, typeof zadaci>>((acc, z) => {
    const key = z.datum.toISOString().slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(z);
    return acc;
  }, {});

  const rasponi = [
    { label: "7 dana", value: 7 },
    { label: "14 dana", value: 14 },
    { label: "30 dana", value: 30 },
  ];

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "radial-gradient(circle at top left, #2dd4bf 0%, transparent 28%), radial-gradient(circle at top right, #7c3aed 0%, transparent 32%), linear-gradient(135deg, #060816 0%, #0b1024 45%, #120818 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-white">
        <section className="mb-6 border border-white/15 bg-white/10 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Link href="/admin/ciscenje" className="text-sm font-black text-cyan-200">
                ← Čišćenje
              </Link>

              <h1 className="mt-4 text-4xl font-black">Plan čišćenja</h1>

              <p className="mt-2 max-w-3xl text-slate-300">
                Pregled svih zadataka čišćenja, završnih čišćenja, bazena,
                međučisćenja, promjene posteljine i ručnika.
              </p>
            </div>

            <Link
              href="/admin"
              className="border border-white/20 bg-black/25 px-4 py-3 text-sm font-black text-white hover:bg-white/10"
            >
              Admin
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {rasponi.map((r) => (
              <Link
                key={r.value}
                href={`/admin/ciscenje/plan?dana=${r.value}`}
                className={`border px-4 py-2 text-sm font-black ${
                  dana === r.value
                    ? "border-cyan-300 bg-cyan-300/20 text-cyan-100"
                    : "border-white/20 bg-black/20 text-slate-200 hover:bg-white/10"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="border border-white/15 bg-white/10 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
              Period
            </div>
            <div className="mt-2 text-2xl font-black">
              {formatDate(danas)} – {formatDate(doDatuma)}
            </div>
          </div>

          <div className="border border-white/15 bg-white/10 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
              Ukupno zadataka
            </div>
            <div className="mt-2 text-4xl font-black">{zadaci.length}</div>
          </div>

          <div className="border border-white/15 bg-white/10 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-200">
              Međučisćenja
            </div>
            <div className="mt-2 text-4xl font-black">
              {zadaci.filter((z) => z.tip === "MEDJUCISCENJE_I_POSTELJINA").length}
            </div>
          </div>
        </section>

        {zadaci.length === 0 ? (
          <section className="border border-white/15 bg-white/10 p-6 text-center text-slate-300 shadow-[0_20px_65px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            Nema zadataka čišćenja u odabranom periodu.
          </section>
        ) : (
          <section className="space-y-5">
            {Object.entries(grupirano).map(([datum, items]) => (
              <div
                key={datum}
                className="border border-white/15 bg-white/10 p-5 shadow-[0_20px_65px_rgba(0,0,0,0.38)] backdrop-blur-xl"
              >
                <h2 className="mb-4 text-2xl font-black text-white">
                  {formatDate(new Date(datum))}
                </h2>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/15 bg-black/30 text-xs uppercase tracking-[0.16em] text-cyan-200">
                        <th className="p-3">Objekt</th>
                        <th className="p-3">Jedinica</th>
                        <th className="p-3">Tip</th>
                        <th className="p-3">Gost</th>
                        <th className="p-3">Broj gostiju</th>
                        <th className="p-3">Opis</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {items.map((z) => {
                        const gost = z.rezervacija?.gost
                          ? `${z.rezervacija.gost.ime || ""} ${
                              z.rezervacija.gost.prezime || ""
                            }`.trim()
                          : "-";

                        const brojGostiju = z.rezervacija?.brojOsoba || "-";

                        return (
                          <tr
                            key={z.id}
                            className="border-b border-white/10 transition hover:bg-white/10"
                          >
                            <td className="p-3 font-black">
                              {z.jedinica.objekt.naziv}
                            </td>
                            <td className="p-3">{z.jedinica.naziv}</td>
                            <td className="p-3 font-black text-cyan-100">
                              {tipLabel(z.tip)}
                            </td>
                            <td className="p-3">{gost}</td>
                            <td className="p-3">{brojGostiju}</td>
                            <td className="p-3 text-slate-300">
                              {z.opis || "-"}
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-block border px-2 py-1 text-xs font-black ${statusClass(
                                  z.status
                                )}`}
                              >
                                {z.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}