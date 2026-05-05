import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  objektId?: string;
  mjesec?: string;
  sort?: string;
  dir?: string;
}>;

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR");
}

function money(v?: number | null) {
  return `${Number(v || 0).toFixed(2)} €`;
}

function monthValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(value: string) {
  const [y, m] = value.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("hr-HR", {
    month: "long",
    year: "numeric",
  });
}

function sortLabel(currentSort: string, currentDir: string, key: string) {
  if (currentSort !== key) return "";
  return currentDir === "asc" ? " ▲" : " ▼";
}

function sortHref({
  objektId,
  mjesec,
  currentSort,
  currentDir,
  nextSort,
}: {
  objektId?: string;
  mjesec?: string;
  currentSort: string;
  currentDir: string;
  nextSort: string;
}) {
  const q = new URLSearchParams();

  if (objektId) q.set("objektId", objektId);
  if (mjesec) q.set("mjesec", mjesec);

  q.set("sort", nextSort);

  if (currentSort === nextSort) {
    q.set("dir", currentDir === "asc" ? "desc" : "asc");
  } else {
    q.set("dir", "asc");
  }

  return `/admin/rezervacije?${q.toString()}`;
}

function statusClass(status: string) {
  if (status === "PLACENO") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (status === "POTVRDENO" || status === "CEKA_OSTATAK") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (status === "CEKA_AKONTACIJU" || status === "REZERVIRANO") {
    return "border-orange-300 bg-orange-50 text-orange-800";
  }

  if (status === "OTKAZANO") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-[#d8c8aa] bg-[#f8f3ea] text-[#6f665a]";
}

export default async function AdminRezervacijePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const currentSort = params.sort || "termin";
  const currentDir = params.dir === "asc" ? "asc" : "desc";

  const objekti = await prisma.objekt.findMany({
    orderBy: { naziv: "asc" },
  });

  const sveRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OBRISANO",
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
      placanja: {
        orderBy: { createdAt: "desc" },
      },
      racuni: {
        orderBy: { createdAt: "desc" },
      },
      emailovi: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ datumOd: "desc" }],
  });

  const dostupniMjeseci = Array.from(
    new Set(sveRezervacije.map((r) => monthValue(r.datumOd)))
  ).sort((a, b) => b.localeCompare(a));

  let filtrirane = sveRezervacije.filter((r) => {
    const objektOk =
      !params.objektId || r.jedinica.objekt.id === params.objektId;

    const mjesecOk = !params.mjesec || monthValue(r.datumOd) === params.mjesec;

    return objektOk && mjesecOk;
  });

  filtrirane = [...filtrirane].sort((a, b) => {
    const dir = currentDir === "asc" ? 1 : -1;

    if (currentSort === "gost") {
      const aGost = `${a.gost?.ime || ""} ${a.gost?.prezime || ""}`
        .trim()
        .toLocaleLowerCase("hr-HR");

      const bGost = `${b.gost?.ime || ""} ${b.gost?.prezime || ""}`
        .trim()
        .toLocaleLowerCase("hr-HR");

      return aGost.localeCompare(bGost, "hr-HR") * dir;
    }

    if (currentSort === "objekt") {
      const aObjekt = `${a.jedinica.objekt.naziv} ${a.jedinica.naziv}`
        .trim()
        .toLocaleLowerCase("hr-HR");

      const bObjekt = `${b.jedinica.objekt.naziv} ${b.jedinica.naziv}`
        .trim()
        .toLocaleLowerCase("hr-HR");

      return aObjekt.localeCompare(bObjekt, "hr-HR") * dir;
    }

    if (currentSort === "placeno") {
      return (Number(a.iznosPlaceno || 0) - Number(b.iznosPlaceno || 0)) * dir;
    }

    if (currentSort === "ostatak") {
      const aUkupno = Number(a.dogovoreniIznos || a.iznosUkupno || 0);
      const bUkupno = Number(b.dogovoreniIznos || b.iznosUkupno || 0);

      const aOstatak = Math.max(aUkupno - Number(a.iznosPlaceno || 0), 0);
      const bOstatak = Math.max(bUkupno - Number(b.iznosPlaceno || 0), 0);

      return (aOstatak - bOstatak) * dir;
    }

    if (currentSort === "zavrsna") {
      const aUkupno = Number(a.dogovoreniIznos || a.iznosUkupno || 0);
      const bUkupno = Number(b.dogovoreniIznos || b.iznosUkupno || 0);

      const aPlaceno = Number(a.iznosPlaceno || 0);
      const bPlaceno = Number(b.iznosPlaceno || 0);

      const aCeka = aPlaceno > 0 && aPlaceno < aUkupno ? 1 : 0;
      const bCeka = bPlaceno > 0 && bPlaceno < bUkupno ? 1 : 0;

      return (aCeka - bCeka) * dir;
    }

    return (a.datumOd.getTime() - b.datumOd.getTime()) * dir;
  });

  const ukupnoRezervacija = filtrirane.length;

  const ukupnoIznos = filtrirane.reduce((sum, r) => {
    return sum + Number(r.dogovoreniIznos || r.iznosUkupno || 0);
  }, 0);

  const ukupnoPlaceno = filtrirane.reduce(
    (sum, r) => sum + Number(r.iznosPlaceno || 0),
    0
  );

  const ukupnoOstatak = Math.max(ukupnoIznos - ukupnoPlaceno, 0);

  const selectedObjekt = objekti.find((o) => o.id === params.objektId);

  function buildAllObjectsHref() {
    const q = new URLSearchParams();
    if (params.mjesec) q.set("mjesec", params.mjesec);
    if (params.sort) q.set("sort", params.sort);
    if (params.dir) q.set("dir", params.dir);

    const s = q.toString();
    return s ? `/admin/rezervacije?${s}` : "/admin/rezervacije";
  }

  function buildAllMonthsHref() {
    const q = new URLSearchParams();
    if (params.objektId) q.set("objektId", params.objektId);
    if (params.sort) q.set("sort", params.sort);
    if (params.dir) q.set("dir", params.dir);

    const s = q.toString();
    return s ? `/admin/rezervacije?${s}` : "/admin/rezervacije";
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 48%, #eadfce 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-[#2e2923]">
        <div className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black">Sve rezervacije</h1>

              <p className="mt-2 text-[#6f665a]">
                Zbirni pregled svih rezervacija, uz filtriranje po objektu i
                mjesecu.
              </p>
            </div>

            <Link
              href="/admin/rezervacije/nova"
              className="inline-block cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black text-white transition hover:brightness-95"
            >
              + Nova ručna rezervacija
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={buildAllObjectsHref()}
              className={`cursor-pointer border px-4 py-2 text-sm font-black ${!params.objektId
                ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
            >
              Svi objekti
            </Link>

            {objekti.map((o) => {
              const q = new URLSearchParams();
              q.set("objektId", o.id);
              if (params.mjesec) q.set("mjesec", params.mjesec);
              if (params.sort) q.set("sort", params.sort);
              if (params.dir) q.set("dir", params.dir);

              return (
                <Link
                  key={o.id}
                  href={`/admin/rezervacije?${q.toString()}`}
                  className={`cursor-pointer border px-4 py-2 text-sm font-black ${params.objektId === o.id
                    ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                    : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                    }`}
                >
                  {o.naziv}
                </Link>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildAllMonthsHref()}
              className={`cursor-pointer border px-4 py-2 text-sm font-black ${!params.mjesec
                ? "border-[#7a5a22] bg-[#f8f3ea] text-[#2e2923]"
                : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
            >
              Svi mjeseci
            </Link>

            {dostupniMjeseci.map((m) => {
              const q = new URLSearchParams();
              if (params.objektId) q.set("objektId", params.objektId);
              q.set("mjesec", m);
              if (params.sort) q.set("sort", params.sort);
              if (params.dir) q.set("dir", params.dir);

              return (
                <Link
                  key={m}
                  href={`/admin/rezervacije?${q.toString()}`}
                  className={`cursor-pointer border px-4 py-2 text-sm font-black capitalize ${params.mjesec === m
                    ? "border-[#7a5a22] bg-[#f8f3ea] text-[#2e2923]"
                    : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                    }`}
                >
                  {monthLabel(m)}
                </Link>
              );
            })}
          </div>

          <div className="mt-5 text-sm text-[#6f665a]">
            Prikaz:{" "}
            <span className="font-black text-[#2e2923]">
              {selectedObjekt?.naziv || "Svi objekti"}
            </span>
            {" · "}
            <span className="font-black text-[#2e2923]">
              {params.mjesec ? monthLabel(params.mjesec) : "Svi mjeseci"}
            </span>
            {" · "}
            <span className="font-black text-[#2e2923]">
              Sortiranje: {currentSort} {currentDir === "asc" ? "↑" : "↓"}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-white/80 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <table className="w-full min-w-[1450px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#e2d8c8] bg-[#f8f3ea] text-xs uppercase tracking-[0.18em] text-[#7a5a22]">
                <th className="p-3">
                  <Link
                    href={sortHref({
                      objektId: params.objektId,
                      mjesec: params.mjesec,
                      currentSort,
                      currentDir,
                      nextSort: "gost",
                    })}
                    className="cursor-pointer hover:text-[#2e2923]"
                  >
                    Gost{sortLabel(currentSort, currentDir, "gost")}
                  </Link>
                </th>

                <th className="p-3">
                  <Link
                    href={sortHref({
                      objektId: params.objektId,
                      mjesec: params.mjesec,
                      currentSort,
                      currentDir,
                      nextSort: "objekt",
                    })}
                    className="cursor-pointer hover:text-[#2e2923]"
                  >
                    Objekt / jedinica
                    {sortLabel(currentSort, currentDir, "objekt")}
                  </Link>
                </th>

                <th className="p-3">
                  <Link
                    href={sortHref({
                      objektId: params.objektId,
                      mjesec: params.mjesec,
                      currentSort,
                      currentDir,
                      nextSort: "termin",
                    })}
                    className="cursor-pointer hover:text-[#2e2923]"
                  >
                    Termin{sortLabel(currentSort, currentDir, "termin")}
                  </Link>
                </th>

                <th className="p-3">Status</th>

                <th className="p-3 text-right">Ukupno</th>

                <th className="p-3 text-right">
                  <Link
                    href={sortHref({
                      objektId: params.objektId,
                      mjesec: params.mjesec,
                      currentSort,
                      currentDir,
                      nextSort: "placeno",
                    })}
                    className="cursor-pointer hover:text-[#2e2923]"
                  >
                    Plaćeno{sortLabel(currentSort, currentDir, "placeno")}
                  </Link>
                </th>

                <th className="p-3 text-right">
                  <Link
                    href={sortHref({
                      objektId: params.objektId,
                      mjesec: params.mjesec,
                      currentSort,
                      currentDir,
                      nextSort: "ostatak",
                    })}
                    className="cursor-pointer hover:text-[#2e2923]"
                  >
                    Ostatak{sortLabel(currentSort, currentDir, "ostatak")}
                  </Link>
                </th>

                <th className="p-3">
                  <Link
                    href={sortHref({
                      objektId: params.objektId,
                      mjesec: params.mjesec,
                      currentSort,
                      currentDir,
                      nextSort: "zavrsna",
                    })}
                    className="cursor-pointer hover:text-[#2e2923]"
                  >
                    Završna uplata
                    {sortLabel(currentSort, currentDir, "zavrsna")}
                  </Link>
                </th>

                <th className="p-3">Mail ostatak</th>
                <th className="p-3">Računi</th>
              </tr>
            </thead>

            <tbody>
              {filtrirane.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-[#6f665a]">
                    Nema rezervacija za odabrani filter.
                  </td>
                </tr>
              ) : (
                filtrirane.map((r) => {
                  const ukupno = Number(
                    r.dogovoreniIznos || r.iznosUkupno || 0
                  );
                  const placeno = Number(r.iznosPlaceno || 0);
                  const ostatak = Math.max(ukupno - placeno, 0);

                  const gostIme = `${r.gost?.ime || "Gost"} ${r.gost?.prezime || ""
                    }`.trim();

                  const mailOstatakPoslan = r.emailovi.some(
                    (e) =>
                      e.tip === "ZAHTJEV_OSTATAK" ||
                      e.subject?.toLowerCase().includes("ostat")
                  );

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[#eee3d4] transition hover:bg-[#fcfaf6]"
                    >
                      <td className="p-3">
                        <Link
                          href={`/admin/rezervacije/${r.id}`}
                          className="cursor-pointer font-black text-[#2e2923] hover:text-[#9b6b12]"
                        >
                          {gostIme}
                        </Link>

                        <div className="text-xs text-[#6f665a]">
                          {r.gost?.email || "-"}
                        </div>

                        <Link
                          href={`/admin/rezervacije/${r.id}`}
                          className="mt-2 inline-block cursor-pointer border border-[#caa870] bg-[#fff6e2] px-3 py-1 text-[11px] font-black text-[#7a5a22] transition hover:bg-[#f8f3ea]"
                        >
                          Otvori
                        </Link>
                      </td>

                      <td className="p-3">
                        <div className="font-black text-[#2e2923]">
                          {r.jedinica.objekt.naziv}
                        </div>

                        <div className="text-xs text-[#6f665a]">
                          {r.jedinica.naziv}
                        </div>
                      </td>

                      <td className="p-3 text-[#2e2923]">
                        <div>
                          <div>{formatDate(r.datumOd)}</div>
                          <div>{formatDate(r.datumDo)}</div>
                        </div>

                        <div className="mt-1 text-xs text-[#6f665a]">
                          {r.brojNocenja} noći<br />
                          {r.brojOsoba} osoba
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-block border px-2 py-1 text-xs font-black ${statusClass(
                            r.status
                          )}`}
                        >
                          {r.status}
                        </span>

                        <div className="mt-1 text-xs text-[#8a8175]">
                          {r.izvor}
                        </div>

                        {r.izvor === "BOOKING" && (
                          <div className="mt-2 border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-800">
                            BOOKING — oprez kod izmjena
                          </div>
                        )}

                        {r.izvor === "WEB" && (
                          <div className="mt-2 border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-black text-sky-800">
                            WEB — provjeri uplatu
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-right font-black text-[#2e2923]">
                        {money(ukupno)}
                      </td>

                      <td className="p-3 text-right font-black text-emerald-700">
                        {money(placeno)}
                      </td>

                      <td className="p-3 text-right font-black text-amber-700">
                        {money(ostatak)}
                      </td>

                      <td className="p-3">
                        {ostatak <= 0 ? (
                          <span className="border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-800">
                            Plaćeno
                          </span>
                        ) : placeno > 0 ? (
                          <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">
                            Čeka završnu
                          </span>
                        ) : (
                          <span className="border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-black text-orange-800">
                            Čeka akontaciju
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        {mailOstatakPoslan ? (
                          <span className="border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-black text-sky-800">
                            Poslan
                          </span>
                        ) : ostatak > 0 && placeno > 0 ? (
                          <span className="border border-red-300 bg-red-50 px-2 py-1 text-xs font-black text-red-700">
                            Nije poslan
                          </span>
                        ) : (
                          <span className="text-xs text-[#8a8175]">-</span>
                        )}
                      </td>

                      <td className="p-3">
                        {r.racuni.length === 0 ? (
                          <span className="text-xs text-[#8a8175]">Nema</span>
                        ) : (
                          <div className="space-y-1">
                            {r.racuni.map((racun) => (
                              <div key={racun.id}>
                                {racun.pdfUrl ? (
                                  <Link
                                    href={racun.pdfUrl}
                                    target="_blank"
                                    className="cursor-pointer text-xs font-black text-[#9b6b12] hover:text-[#2e2923]"
                                  >
                                    {racun.brojRacuna}
                                  </Link>
                                ) : (
                                  <span className="text-xs">
                                    {racun.brojRacuna}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}

              <tr className="border-t border-[#d8c8aa] bg-[#f8f3ea] text-[#2e2923]">
                <td className="p-4 font-black" colSpan={4}>
                  UKUPNO ZA PRIKAZ · {ukupnoRezervacija} rezervacija
                </td>

                <td className="p-4 text-right text-lg font-black">
                  {money(ukupnoIznos)}
                </td>

                <td className="p-4 text-right text-lg font-black text-emerald-700">
                  {money(ukupnoPlaceno)}
                </td>

                <td className="p-4 text-right text-lg font-black text-amber-700">
                  {money(ukupnoOstatak)}
                </td>

                <td className="p-4 text-xs text-[#6f665a]" colSpan={4}>
                  {selectedObjekt?.naziv || "Svi objekti"} ·{" "}
                  {params.mjesec ? monthLabel(params.mjesec) : "Svi mjeseci"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}