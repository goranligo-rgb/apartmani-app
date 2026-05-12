import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
}>;

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatDate(value?: Date | null) {
  if (!value) return "-";
  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function daysUntil(date?: Date | null) {
  if (!date) return null;
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function paymentGroup(r: any) {
  const ukupno = Number(r.dogovoreniIznos || r.iznosUkupno || 0);
  const placeno = Number(r.iznosPlaceno || 0);
  const ostatak = Math.max(ukupno - placeno, 0);

  const danas = startOfDay(new Date());
  const dolazakZaDana = daysUntil(r.datumOd);

  const rokAkontacijeIstekao =
    r.rokUplateAkontacije &&
    startOfDay(r.rokUplateAkontacije).getTime() < danas.getTime() &&
    placeno <= 0 &&
    r.status !== "OTKAZANO";

  if (r.status === "OTKAZANO") return "OTKAZANO";

  if (ukupno > 0 && ostatak <= 0) return "PLACENO";

  if (rokAkontacijeIstekao) return "ISTEKAO_ROK_AKONTACIJE";

  if (
    ostatak > 0 &&
    dolazakZaDana !== null &&
    dolazakZaDana >= 0 &&
    dolazakZaDana <= 7 &&
    r.status !== "OTKAZANO"
  ) {
    return "DOLAZI_USKORO_NIJE_PLACENO";
  }

  if (
    placeno <= 0 &&
    (r.status === "CEKA_AKONTACIJU" || r.status === "REZERVIRANO")
  ) {
    return "CEKA_AKONTACIJU";
  }

  if (placeno > 0 && ostatak > 0) return "CEKA_OSTATAK";

  return "OSTALO";
}

function totals(rezervacije: any[]) {
  const ukupno = rezervacije.reduce(
    (sum, r) => sum + Number(r.dogovoreniIznos || r.iznosUkupno || 0),
    0
  );

  const placeno = rezervacije.reduce(
    (sum, r) => sum + Number(r.iznosPlaceno || 0),
    0
  );

  const ostatak = Math.max(ukupno - placeno, 0);

  return {
    broj: rezervacije.length,
    ukupno,
    placeno,
    ostatak,
  };
}

const GROUPS = [
  {
    key: "ISTEKAO_ROK_AKONTACIJE",
    title: "1. Rok akontacije istekao",
    description:
      "Rezervacije bez evidentirane uplate nakon roka. Potrebna je ručna provjera prije bilo kakvog storna.",
    color: "border-red-300 bg-red-50 text-red-800",
  },
  {
    key: "DOLAZI_USKORO_NIJE_PLACENO",
    title: "2. Dolazi uskoro, nije plaćeno do kraja",
    description:
      "Gost dolazi kroz 7 dana ili manje, a još postoji otvoren iznos za uplatu.",
    color: "border-orange-300 bg-orange-50 text-orange-800",
  },
  {
    key: "CEKA_AKONTACIJU",
    title: "3. Čeka akontaciju",
    description:
      "Termin je rezerviran ili je poslan poziv, ali uplata još nije evidentirana.",
    color: "border-amber-300 bg-amber-50 text-amber-800",
  },
  {
    key: "CEKA_OSTATAK",
    title: "4. Čeka ostatak",
    description: "Akontacija je plaćena, ali još postoji ostatak za uplatu.",
    color: "border-blue-300 bg-blue-50 text-blue-800",
  },
  {
    key: "PLACENO",
    title: "5. Plaćeno",
    description: "Rezervacije koje su plaćene u cijelosti.",
    color: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  {
    key: "OSTALO",
    title: "6. Ostalo",
    description: "Rezervacije koje ne ulaze u glavne skupine naplate.",
    color: "border-slate-300 bg-slate-50 text-slate-800",
  },
];

export default async function AdminNaplataPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const sveRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
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
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const filtrirane = params.status
    ? sveRezervacije.filter((r) => paymentGroup(r) === params.status)
    : sveRezervacije;

  const predlozenoZaStorno = sveRezervacije.filter(
    (r) => paymentGroup(r) === "ISTEKAO_ROK_AKONTACIJE"
  );

  const ukupnoSve = totals(filtrirane);

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
        <div className="mb-6 border border-white/70 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black">Pregled naplate</h1>

              <p className="mt-2 text-[#6f665a]">
                Operativni pregled rezervacija po naplati: akontacije, ostatak
                uplate, dolasci uskoro i ručna provjera prije storna.
              </p>
            </div>

            <Link
              href="/admin/rezervacije/nova"
              className="inline-block border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black text-white transition hover:brightness-95"
            >
              + Nova rezervacija
            </Link>
          </div>
        </div>

        {predlozenoZaStorno.length > 0 && (
          <section className="mb-6 border-2 border-red-400 bg-red-50 p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.16em] text-red-700">
                  ⚠ Rezervacije za ručnu provjeru
                </div>

                <h2 className="mt-1 text-2xl font-black text-red-900">
                  {predlozenoZaStorno.length} rezervacija ima istekao rok
                  akontacije
                </h2>

                <p className="mt-2 text-sm text-red-800">
                  Uplata nije evidentirana. Prije bilo kakvog storna ili povrata
                  obavezno provjeriti s gostom. Povrat sredstava se nikad ne
                  izvršava automatski.
                </p>
              </div>

              <Link
                href="/admin/rezervacije/naplata?status=ISTEKAO_ROK_AKONTACIJE"
                className="inline-block border border-red-500 bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700"
              >
                Otvori rezervacije
              </Link>
            </div>
          </section>
        )}

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          <SummaryCard label="Rezervacija" value={`${ukupnoSve.broj}`} />
          <SummaryCard label="Ukupno" value={money(ukupnoSve.ukupno)} />
          <SummaryCard label="Plaćeno" value={money(ukupnoSve.placeno)} />
          <SummaryCard label="Ostatak" value={money(ukupnoSve.ostatak)} />
        </section>

        {params.status && (
          <div className="mb-6 border border-[#e2d8c8] bg-[#fffaf0] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-black text-[#7a5a22]">
                Prikazan je samo odabrani status naplate.
              </div>

              <Link
                href="/admin/rezervacije/naplata"
                className="inline-block border border-[#caa870] bg-white px-4 py-2 text-sm font-black text-[#7a5a22] hover:bg-[#f8f3ea]"
              >
                Prikaži sve grupe
              </Link>
            </div>
          </div>
        )}

        {params.status ? (
          <PaymentGroup
            group={GROUPS.find((g) => g.key === params.status) || GROUPS[5]}
            reservations={filtrirane}
          />
        ) : (
          <div className="space-y-6">
            {GROUPS.map((group) => {
              const items = filtrirane.filter(
                (r) => paymentGroup(r) === group.key
              );

              return (
                <PaymentGroup
                  key={group.key}
                  group={group}
                  reservations={items}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-[#9b7a4c]">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black text-[#2e2923]">{value}</div>
    </div>
  );
}

function PaymentGroup({
  group,
  reservations,
}: {
  group: (typeof GROUPS)[number];
  reservations: any[];
}) {
  const t = totals(reservations);

  return (
    <section className="border border-white/70 bg-white shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <div className={`border-b p-4 ${group.color}`}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black">{group.title}</h2>
            <p className="mt-1 text-sm">{group.description}</p>
          </div>

          <div className="text-sm font-black">
            {t.broj} rezervacija · ukupno {money(t.ukupno)} · plaćeno{" "}
            {money(t.placeno)} · ostatak {money(t.ostatak)}
          </div>
        </div>
      </div>

      {reservations.length === 0 ? (
        <div className="p-5 text-sm text-[#8a8175]">Nema zapisa.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-[#f8f3ea] text-xs uppercase tracking-[0.14em] text-[#7a5a22]">
                <th className="p-3">Gost</th>
                <th className="p-3">Objekt / jedinica</th>
                <th className="p-3">Termin</th>
                <th className="p-3">Rokovi</th>
                <th className="p-3 text-right">Ukupno</th>
                <th className="p-3 text-right">Plaćeno</th>
                <th className="p-3 text-right">Ostatak</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Akcija</th>
              </tr>
            </thead>

            <tbody>
              {reservations.map((r) => {
                const ukupno = Number(r.dogovoreniIznos || r.iznosUkupno || 0);
                const placeno = Number(r.iznosPlaceno || 0);
                const ostatak = Math.max(ukupno - placeno, 0);

                const gost = `${r.gost?.ime || "Gost"} ${
                  r.gost?.prezime || ""
                }`.trim();

                const danaDoDolaska = daysUntil(r.datumOd);
                const danaDoRokaAkontacije = daysUntil(r.rokUplateAkontacije);
                const danaDoRokaOstatka = daysUntil(r.rokUplateOstatka);

                return (
                  <tr key={r.id} className="border-b hover:bg-[#fcfaf6]">
                    <td className="p-3">
                      <Link
                        href={`/admin/rezervacije/${r.id}`}
                        className="font-black text-[#2e2923] hover:text-[#9b6b12]"
                      >
                        {gost}
                      </Link>

                      <div className="text-xs text-[#6f665a]">
                        {r.gost?.email || "-"}
                      </div>

                      <div className="text-xs text-[#8a8175]">
                        {r.gost?.telefon || ""}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-black">
                        {r.jedinica?.objekt?.naziv || "-"}
                      </div>
                      <div className="text-xs text-[#6f665a]">
                        {r.jedinica?.naziv || "-"}
                      </div>
                    </td>

                    <td className="p-3">
                      <div>
                        {formatDate(r.datumOd)} – {formatDate(r.datumDo)}
                      </div>
                      <div className="text-xs text-[#6f665a]">
                        {r.brojNocenja} noći · dolazak za{" "}
                        {danaDoDolaska === null ? "-" : danaDoDolaska} dana
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="text-xs">
                        Akontacija:{" "}
                        <b>{formatDate(r.rokUplateAkontacije)}</b>
                        {danaDoRokaAkontacije !== null && (
                          <span> ({danaDoRokaAkontacije} dana)</span>
                        )}
                      </div>

                      <div className="mt-1 text-xs">
                        Ostatak: <b>{formatDate(r.rokUplateOstatka)}</b>
                        {danaDoRokaOstatka !== null && (
                          <span> ({danaDoRokaOstatka} dana)</span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-right font-black">
                      {money(ukupno)}
                    </td>

                    <td className="p-3 text-right font-black text-emerald-700">
                      {money(placeno)}
                    </td>

                    <td className="p-3 text-right font-black text-amber-700">
                      {money(ostatak)}
                    </td>

                    <td className="p-3">
                      <span className="inline-block border border-[#e2d8c8] bg-[#f8f3ea] px-2 py-1 text-xs font-black">
                        {r.status}
                      </span>

                      <div className="mt-1 text-xs text-[#8a8175]">
                        {r.izvor}
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/rezervacije/${r.id}`}
                        className="inline-block border border-[#caa870] bg-[#c79a57] px-4 py-2 text-xs font-black text-white hover:brightness-95"
                      >
                        Otvori
                      </Link>
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-[#f8f3ea]">
                <td className="p-3 font-black" colSpan={4}>
                  UKUPNO GRUPA
                </td>
                <td className="p-3 text-right font-black">
                  {money(t.ukupno)}
                </td>
                <td className="p-3 text-right font-black text-emerald-700">
                  {money(t.placeno)}
                </td>
                <td className="p-3 text-right font-black text-amber-700">
                  {money(t.ostatak)}
                </td>
                <td className="p-3 text-xs text-[#8a8175]" colSpan={2}>
                  {t.broj} rezervacija
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}