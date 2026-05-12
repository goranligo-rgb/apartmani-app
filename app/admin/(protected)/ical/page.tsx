import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { spremiVanjskiKalendar, syncSveKalendare } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value?: Date | null) {
  if (!value) return "Nikad";
  return new Intl.DateTimeFormat("hr-HR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminIcalPage() {
  const jedinice = await prisma.jedinica.findMany({
    include: {
      objekt: true,
      vanjskiKalendari: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <main
      className="min-h-screen p-6 md:p-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(135deg, #f8fafc 0%, #eef2f7 45%, #e2e8f0 100%)",
        color: "#111827",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="mb-4 inline-block cursor-pointer text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          ← Povratak na admin
        </Link>

        <h1 className="text-3xl font-black text-slate-950">
          Booking iCal sync
        </h1>

        <p className="mt-2 text-slate-600">
          Ovdje vidiš iCal linkove po jedinici i ručno pokrećeš sinkronizaciju
          Booking zauzetosti.
        </p>

        <form action={syncSveKalendare} className="mt-6">
          <button
            type="submit"
            className="cursor-pointer border border-slate-950 bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-slate-950"
          >
            Sync sve kalendare
          </button>
        </form>

        <div className="mt-8 grid gap-5">
          {jedinice.map((jedinica) => {
            const exportUrl = `${baseUrl}/api/ical/jedinica/${jedinica.id}`;

            return (
              <section
                key={jedinica.id}
                className="border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      {jedinica.objekt.naziv}
                    </p>

                    <h2 className="mt-1 text-xl font-black text-slate-950">
                      {jedinica.naziv}
                    </h2>
                  </div>
                </div>

                {/* NAŠ EXPORT */}
                <div className="border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Naš export link za Booking
                  </p>

                  <input
                    readOnly
                    value={exportUrl}
                    className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                  />
                </div>

                {/* ➕ DODAJ BOOKING LINK */}
                <form
                  action={spremiVanjskiKalendar}
                  className="mt-4 border border-slate-200 bg-slate-50 p-4"
                >
                  <input
                    type="hidden"
                    name="jedinicaId"
                    value={jedinica.id}
                  />

                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Dodaj Booking iCal link
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto]">
                    <input
                      name="naziv"
                      defaultValue="Booking.com"
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                    />

                    <input
                      name="icalUrl"
                      required
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                      placeholder="Zalijepi Booking iCal link"
                    />

                    <button
                      type="submit"
                      className="cursor-pointer border border-slate-950 bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-white hover:text-slate-950"
                    >
                      Spremi
                    </button>
                  </div>
                </form>

                {/* POSTOJEĆI KALENDARI */}
                <div className="mt-4 grid gap-3">
                  {jedinica.vanjskiKalendari.length > 0 ? (
                    jedinica.vanjskiKalendari.map((kal) => (
                      <div
                        key={kal.id}
                        className="border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-black text-slate-950">
                              {kal.naziv}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              Zadnji sync: {formatDate(kal.lastSyncAt)}
                            </p>
                          </div>

                          <form action={syncSveKalendare}>
                            <input
                              type="hidden"
                              name="kalendarId"
                              value={kal.id}
                            />

                            <button
                              type="submit"
                              className="cursor-pointer border border-emerald-700 bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-emerald-700"
                            >
                              Sync sada
                            </button>
                          </form>
                        </div>

                        <input
                          readOnly
                          value={kal.icalUrl}
                          className="mt-3 w-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                      Nema dodan Booking iCal link za ovu jedinicu.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}