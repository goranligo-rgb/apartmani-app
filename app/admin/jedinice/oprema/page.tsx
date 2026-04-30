import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { spremiOpremuJedinice } from "./actions";

type SearchParams = Promise<{
  jedinicaId?: string;
  saved?: string;
  error?: string;
}>;

function groupByKategorija(
  oprema: {
    id: string;
    naziv: string;
    kategorija: string | null;
    sortOrder: number;
  }[]
) {
  return oprema.reduce<Record<string, typeof oprema>>((acc, item) => {
    const key = item.kategorija || "Ostalo";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default async function OpremaJedinicePage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const selectedJedinicaId = searchParams.jedinicaId || "";
  const saved = searchParams.saved === "1";
  const error = searchParams.error === "1";

  const objekti = await prisma.objekt.findMany({
    include: {
      jedinice: {
        orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
      },
    },
    orderBy: {
      naziv: "asc",
    },
  });

  const sveJedinice = objekti.flatMap((objekt) =>
    objekt.jedinice.map((jedinica) => ({
      ...jedinica,
      objektNaziv: objekt.naziv,
    }))
  );

  const selectedJedinica =
    sveJedinice.find((j) => j.id === selectedJedinicaId) || sveJedinice[0];

  const oprema = await prisma.opremaJedinice.findMany({
    where: {
      aktivna: true,
    },
    orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
  });

  const oznacenaOprema = selectedJedinica
    ? await prisma.jedinicaOprema.findMany({
        where: {
          jedinicaId: selectedJedinica.id,
        },
        select: {
          opremaId: true,
        },
      })
    : [];

  const oznaceniIds = new Set(oznacenaOprema.map((x) => x.opremaId));
  const grupirano = groupByKategorija(oprema);

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
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-block cursor-pointer text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              ← Povratak na admin
            </Link>

            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              Sadržaj jedinice
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Oprema apartmana
            </h1>

            <p className="mt-2 max-w-2xl text-base text-slate-600">
              Odaberi jedinicu i označi što apartman ili kuća ima. Ovo će se
              kasnije prikazivati gostima na stranici objekta.
            </p>
          </div>

          <div className="border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Odabrano
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {selectedJedinica
                ? `${selectedJedinica.objektNaziv} / ${selectedJedinica.naziv}`
                : "Nema jedinice"}
            </p>
          </div>
        </div>

        {saved && (
          <div className="mb-6 border border-emerald-300 bg-emerald-100 p-4 font-black text-emerald-800 shadow-sm">
            ✅ Oprema je uspješno spremljena.
          </div>
        )}

        {error && (
          <div className="mb-6 border border-red-300 bg-red-100 p-4 font-black text-red-800 shadow-sm">
            Greška kod spremanja opreme.
          </div>
        )}

        <div className="mb-6 border border-slate-200 bg-white p-5 shadow-sm">
          <form method="GET" className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Odaberi jedinicu
              </span>

              <select
                name="jedinicaId"
                defaultValue={selectedJedinica?.id || ""}
                className="w-full cursor-pointer border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900"
              >
                {objekti.map((objekt) => (
                  <optgroup key={objekt.id} label={objekt.naziv}>
                    {objekt.jedinice.map((jedinica) => (
                      <option key={jedinica.id} value={jedinica.id}>
                        {jedinica.naziv}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="cursor-pointer self-end border border-slate-950 bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-slate-950"
            >
              Prikaži
            </button>
          </form>
        </div>

        {selectedJedinica ? (
          <form action={spremiOpremuJedinice}>
            <input type="hidden" name="jedinicaId" value={selectedJedinica.id} />

            <div className="grid gap-5 md:grid-cols-2">
              {Object.entries(grupirano).map(([kategorija, items]) => (
                <section
                  key={kategorija}
                  className="border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-black text-slate-950">
                      {kategorija}
                    </h2>
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      {items.length}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    {items.map((item) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center justify-between border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                      >
                        <span className="text-sm font-bold text-slate-800">
                          {item.naziv}
                        </span>

                        <input
                          type="checkbox"
                          name="opremaIds"
                          value={item.id}
                          defaultChecked={oznaceniIds.has(item.id)}
                          className="h-5 w-5 cursor-pointer accent-slate-950"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="sticky bottom-4 mt-6 border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    Spremi sadržaj za {selectedJedinica.naziv}
                  </p>
                  <p className="text-sm text-slate-500">
                    Nakon spremanja, ova oprema će se prikazivati u detalju
                    jedinice.
                  </p>
                </div>

                <button
                  type="submit"
                  className="cursor-pointer border border-emerald-700 bg-emerald-700 px-7 py-3 text-sm font-black text-white transition hover:bg-white hover:text-emerald-700"
                >
                  Spremi opremu
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="border border-slate-200 bg-white p-6 text-slate-600">
            Nema unesene jedinice.
          </div>
        )}
      </div>
    </main>
  );
}