import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getRezervacijeIBlokade,
  type RezervacijaCard,
} from "@/lib/rezervacije-union";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  objektId?: string;
  mjesec?: string;
  sort?: string;
  dir?: string;
  izvor?: string; // "" | "WEB" | "ADMIN" | "BOOKING"
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
  izvor,
  currentSort,
  currentDir,
  nextSort,
}: {
  objektId?: string;
  mjesec?: string;
  izvor?: string;
  currentSort: string;
  currentDir: string;
  nextSort: string;
}) {
  const q = new URLSearchParams();

  if (objektId) q.set("objektId", objektId);
  if (mjesec) q.set("mjesec", mjesec);
  if (izvor) q.set("izvor", izvor);

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

  if (status === "BOOKING") {
    return "border-indigo-300 bg-indigo-50 text-indigo-800";
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

  // Union dohvat: naše rezervacije + Booking blokade.
  // Default skriva OBRISANO i OTKAZANO; uključujemo OTKAZANO da
  // admin može pregledati otkazane rezervacije (kao i prije).
  const sveRezervacije: RezervacijaCard[] = await getRezervacijeIBlokade({
    ukljuciOtkazane: true,
  });

  const dostupniMjeseci = Array.from(
    new Set(sveRezervacije.map((card) => monthValue(card.datumOd)))
  ).sort((a, b) => b.localeCompare(a));

  let filtrirane = sveRezervacije.filter((card) => {
    const objektOk =
      !params.objektId || card.jedinica.objekt.id === params.objektId;

    const mjesecOk =
      !params.mjesec || monthValue(card.datumOd) === params.mjesec;

    // Filter po izvoru:
    //   "WEB"     → samo naše s izvor=WEB
    //   "ADMIN"   → naše s izvor=ADMIN ili DIREKTNO
    //   "BOOKING" → vanjske blokade (source=BLOKADA)
    //   ""/undef  → sve
    const izvorOk = !params.izvor
      ? true
      : params.izvor === "BOOKING"
      ? card.source === "BLOKADA"
      : params.izvor === "WEB"
      ? card.source === "REZERVACIJA" && card.izvor === "WEB"
      : params.izvor === "ADMIN"
      ? card.source === "REZERVACIJA" &&
        (card.izvor === "ADMIN" || card.izvor === "DIREKTNO")
      : true;

    return objektOk && mjesecOk && izvorOk;
  });

  filtrirane = [...filtrirane].sort((a, b) => {
    const dir = currentDir === "asc" ? 1 : -1;

    if (currentSort === "gost") {
      const aGost = `${a.ime || ""} ${a.prezime || ""}`
        .trim()
        .toLocaleLowerCase("hr-HR");

      const bGost = `${b.ime || ""} ${b.prezime || ""}`
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
      return (a.iznosPlaceno - b.iznosPlaceno) * dir;
    }

    if (currentSort === "ostatak") {
      const aUkupno = Number(a.iznosUkupno || 0);
      const bUkupno = Number(b.iznosUkupno || 0);

      const aOstatak = Math.max(aUkupno - a.iznosPlaceno, 0);
      const bOstatak = Math.max(bUkupno - b.iznosPlaceno, 0);

      return (aOstatak - bOstatak) * dir;
    }

    if (currentSort === "zavrsna") {
      const aUkupno = Number(a.iznosUkupno || 0);
      const bUkupno = Number(b.iznosUkupno || 0);

      const aCeka = a.iznosPlaceno > 0 && a.iznosPlaceno < aUkupno ? 1 : 0;
      const bCeka = b.iznosPlaceno > 0 && b.iznosPlaceno < bUkupno ? 1 : 0;

      return (aCeka - bCeka) * dir;
    }

    return (a.datumOd.getTime() - b.datumOd.getTime()) * dir;
  });

  const ukupnoRezervacija = filtrirane.length;

  const ukupnoIznos = filtrirane.reduce((sum, card) => {
    return sum + Number(card.iznosUkupno || 0);
  }, 0);

  const ukupnoPlaceno = filtrirane.reduce(
    (sum, card) => sum + card.iznosPlaceno,
    0
  );

  const ukupnoOstatak = Math.max(ukupnoIznos - ukupnoPlaceno, 0);

  const selectedObjekt = objekti.find((o) => o.id === params.objektId);

  function buildAllObjectsHref() {
    const q = new URLSearchParams();
    if (params.mjesec) q.set("mjesec", params.mjesec);
    if (params.izvor) q.set("izvor", params.izvor);
    if (params.sort) q.set("sort", params.sort);
    if (params.dir) q.set("dir", params.dir);

    const s = q.toString();
    return s ? `/admin/rezervacije?${s}` : "/admin/rezervacije";
  }

  function buildAllMonthsHref() {
    const q = new URLSearchParams();
    if (params.objektId) q.set("objektId", params.objektId);
    if (params.izvor) q.set("izvor", params.izvor);
    if (params.sort) q.set("sort", params.sort);
    if (params.dir) q.set("dir", params.dir);

    const s = q.toString();
    return s ? `/admin/rezervacije?${s}` : "/admin/rezervacije";
  }

  function buildAllIzvorHref() {
    const q = new URLSearchParams();
    if (params.objektId) q.set("objektId", params.objektId);
    if (params.mjesec) q.set("mjesec", params.mjesec);
    if (params.sort) q.set("sort", params.sort);
    if (params.dir) q.set("dir", params.dir);

    const s = q.toString();
    return s ? `/admin/rezervacije?${s}` : "/admin/rezervacije";
  }

  function buildIzvorHref(izvor: string) {
    const q = new URLSearchParams();
    if (params.objektId) q.set("objektId", params.objektId);
    if (params.mjesec) q.set("mjesec", params.mjesec);
    q.set("izvor", izvor);
    if (params.sort) q.set("sort", params.sort);
    if (params.dir) q.set("dir", params.dir);

    return `/admin/rezervacije?${q.toString()}`;
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
              if (params.izvor) q.set("izvor", params.izvor);
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

          {/* IZVOR FILTER — Sve / Web / Admin / Booking */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildAllIzvorHref()}
              className={`cursor-pointer border px-4 py-2 text-sm font-black ${!params.izvor
                ? "border-[#7a5a22] bg-[#f8f3ea] text-[#2e2923]"
                : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
            >
              Svi izvori
            </Link>

            <Link
              href={buildIzvorHref("WEB")}
              className={`cursor-pointer border px-4 py-2 text-sm font-black ${params.izvor === "WEB"
                ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
            >
              Web
            </Link>

            <Link
              href={buildIzvorHref("ADMIN")}
              className={`cursor-pointer border px-4 py-2 text-sm font-black ${params.izvor === "ADMIN"
                ? "border-[#7a5a22] bg-[#fff6e2] text-[#2e2923]"
                : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
            >
              Admin
            </Link>

            <Link
              href={buildIzvorHref("BOOKING")}
              className={`cursor-pointer border px-4 py-2 text-sm font-black ${params.izvor === "BOOKING"
                ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
            >
              Booking
            </Link>
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
              if (params.izvor) q.set("izvor", params.izvor);
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
                      izvor: params.izvor,
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
                      izvor: params.izvor,
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
                      izvor: params.izvor,
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
                      izvor: params.izvor,
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
                      izvor: params.izvor,
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
                      izvor: params.izvor,
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
                filtrirane.map((card) => {
                  const ukupno = Number(card.iznosUkupno ?? 0);
                  const placeno = card.iznosPlaceno;
                  const ostatak = Math.max(ukupno - placeno, 0);

                  const imeRaw = `${card.ime || ""} ${card.prezime || ""}`.trim();

                  // Fallback ime za blokade bez Excel-imena: koristi iCal naslov
                  const gostFallback =
                    card.source === "BLOKADA"
                      ? card.blokada.naslov || "Booking gost"
                      : "Gost";

                  const gostIme = imeRaw || gostFallback;

                  const mailOstatakPoslan =
                    card.source === "REZERVACIJA" &&
                    card.rezervacija.emailovi.some(
                      (e) =>
                        e.tip === "ZAHTJEV_OSTATAK" ||
                        e.subject?.toLowerCase().includes("ostat")
                    );

                  // Sekundarni izvor badge — samo za AIRBNB/TEKUCI_RACUN/OSTALO
                  const showSekundarniIzvorBadge =
                    card.source === "REZERVACIJA" &&
                    (card.izvor === "AIRBNB" ||
                      card.izvor === "TEKUCI_RACUN" ||
                      card.izvor === "OSTALO");

                  // Web badge — samo za naše rezervacije iz javne stranice
                  const showWebBadge =
                    card.source === "REZERVACIJA" && card.izvor === "WEB";

                  return (
                    <tr
                      key={card.id}
                      className="border-b border-[#eee3d4] transition hover:bg-[#fcfaf6]"
                    >
                      <td className="p-3">
                        {card.detailHref ? (
                          <Link
                            href={card.detailHref}
                            className="cursor-pointer font-black text-[#2e2923] hover:text-[#9b6b12]"
                          >
                            {gostIme}
                          </Link>
                        ) : (
                          <span
                            className={`font-black ${imeRaw ? "text-[#2e2923]" : "italic text-[#9b8a6f]"}`}
                          >
                            {gostIme}
                          </span>
                        )}

                        <div className="text-xs text-[#6f665a]">
                          {card.email || card.telefon || "-"}
                        </div>

                        {card.detailHref ? (
                          <Link
                            href={card.detailHref}
                            className="mt-2 inline-block cursor-pointer border border-[#caa870] bg-[#fff6e2] px-3 py-1 text-[11px] font-black text-[#7a5a22] transition hover:bg-[#f8f3ea]"
                          >
                            Otvori
                          </Link>
                        ) : (
                          <span className="mt-2 inline-block border border-[#e2d8c8] bg-[#f8f3ea] px-3 py-1 text-[11px] font-black text-[#9b8a6f]">
                            Bez detalja
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-black text-[#2e2923]">
                          {card.jedinica.objekt.naziv}
                        </div>

                        <div className="text-xs text-[#6f665a]">
                          {card.jedinica.naziv}
                        </div>
                      </td>

                      <td className="p-3 text-[#2e2923]">
                        <div>
                          <div>{formatDate(card.datumOd)}</div>
                          <div>{formatDate(card.datumDo)}</div>
                        </div>

                        <div className="mt-1 text-xs text-[#6f665a]">
                          {card.brojNocenja} noći
                          {card.brojOsoba ? (
                            <>
                              <br />
                              {card.brojOsoba} osoba
                            </>
                          ) : null}
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-block border px-2 py-1 text-xs font-black ${statusClass(card.status)}`}
                        >
                          {card.status}
                        </span>

                        {showWebBadge && (
                          <div className="mt-2 border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-800">
                            WEB — provjeri uplatu
                          </div>
                        )}

                        {showSekundarniIzvorBadge && (
                          <div className="mt-2 border border-[#d8c8aa] bg-[#f8f3ea] px-2 py-1 text-[11px] font-black text-[#6f665a]">
                            {card.izvor}
                          </div>
                        )}

                        {card.source === "BLOKADA" && (
                          <div className="mt-2 border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-800">
                            Booking — vanjska rezervacija (uredi u Extranet-u)
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
                        {card.source === "BLOKADA" ? (
                          <span className="text-xs text-[#8a8175]">-</span>
                        ) : ostatak <= 0 ? (
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
                        {card.source === "BLOKADA" ? (
                          <span className="text-xs text-[#8a8175]">-</span>
                        ) : mailOstatakPoslan ? (
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
                        {card.source === "BLOKADA" ? (
                          <span className="text-xs text-[#8a8175]">-</span>
                        ) : card.rezervacija.racuni.length === 0 ? (
                          <span className="text-xs text-[#8a8175]">Nema</span>
                        ) : (
                          <div className="space-y-1">
                            {card.rezervacija.racuni.map((racun) => (
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