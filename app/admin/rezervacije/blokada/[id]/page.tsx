import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatZagreb } from "@/lib/dates";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  id: string;
}>;

function money(value?: number | null, valuta?: string | null) {
  if (value === null || value === undefined) return "-";
  const symbol = !valuta || valuta === "EUR" ? "€" : valuta;
  return `${Number(value).toFixed(2)} ${symbol}`;
}

function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | null) {
  if (!value) return "-";

  // createdAt/excelImportiranoAt — pravi žig; Europe/Zagreb pokaže stvarni sat.
  return formatZagreb(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function brojNoci(od: Date, doDatum: Date) {
  return Math.max(
    Math.round((doDatum.getTime() - od.getTime()) / 86400000),
    0
  );
}

export default async function BookingBlokadaDetaljPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;

  const blokada = await prisma.blokadaVanjskogKalendara.findUnique({
    where: { id },
    include: {
      jedinica: { include: { objekt: true } },
    },
  });

  if (!blokada) notFound();

  const noci = brojNoci(blokada.datumOd, blokada.datumDo);

  const imeGost = `${blokada.gostIme || ""} ${blokada.gostPrezime || ""}`.trim();
  const subtitleGost = imeGost || "Booking";

  const nemaGostPodataka =
    !blokada.gostIme &&
    !blokada.gostPrezime &&
    !blokada.gostTelefon &&
    !blokada.gostEmail &&
    !blokada.gostDrzava;

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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/admin/rezervacije"
                className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
              >
                ← Sve rezervacije
              </Link>

              <h1 className="mt-4 text-4xl font-black">Booking blokada</h1>

              <p className="mt-2 text-[#6f665a]">
                {subtitleGost} · {blokada.jedinica.objekt.naziv} /{" "}
                {blokada.jedinica.naziv}
              </p>

              <p className="mt-1 text-xs text-[#9b7a4c]">ID: {blokada.id}</p>
            </div>

            <div className="text-right">
              <div className="inline-block border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-black text-indigo-800">
                BOOKING
              </div>

              <div className="mt-2 text-xs font-bold text-[#6f665a]">
                Izvor: {blokada.izvor || "BOOKING"}
              </div>
            </div>
          </div>

          <div className="mt-5 border border-indigo-300 bg-indigo-50 p-4 text-sm font-bold text-indigo-800">
            Ovo je Booking blokada — sinhronizirana iz Booking.com iCal feed-a.
            Podaci su read-only. Račun, TTLock i ostalo dolazi naknadno.
          </div>
        </div>

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <Stat
            title="Iznos bruto"
            value={money(blokada.iznosBruto, blokada.valuta)}
            color="text-[#2e2923]"
          />
          <Stat
            title="Iznos provizije"
            value={money(blokada.iznosProvizije, blokada.valuta)}
            color="text-[#9b6b12]"
          />
          <Stat
            title="Iznos neto"
            value={money(blokada.iznosNeto, blokada.valuta)}
            color="text-[#2e2923]"
          />
          <Stat title="Broj noći" value={`${noci}`} color="text-[#2e2923]" />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <Card title="Gost">
            {nemaGostPodataka ? (
              <p className="text-sm italic text-[#6f665a]">
                (podaci stižu iz Excel uploada)
              </p>
            ) : (
              <>
                <Detail label="Ime" value={blokada.gostIme || "-"} />
                <Detail label="Prezime" value={blokada.gostPrezime || "-"} />

                <div className="mb-3 border border-[#e2d8c8] bg-[#fcfaf6] p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
                    Telefon
                  </div>
                  <div className="mt-1 text-sm font-black text-[#2e2923]">
                    {blokada.gostTelefon ? (
                      <a
                        href={`tel:${blokada.gostTelefon}`}
                        className="cursor-pointer text-[#9b6b12] hover:text-[#2e2923]"
                      >
                        {blokada.gostTelefon}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>

                <div className="mb-3 border border-[#e2d8c8] bg-[#fcfaf6] p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
                    Email
                  </div>
                  <div className="mt-1 text-sm font-black text-[#2e2923]">
                    {blokada.gostEmail ? (
                      <a
                        href={`mailto:${blokada.gostEmail}`}
                        className="cursor-pointer text-[#9b6b12] hover:text-[#2e2923]"
                      >
                        {blokada.gostEmail}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>

                <Detail label="Država" value={blokada.gostDrzava || "-"} />
              </>
            )}
          </Card>

          <Card title="Termin">
            <Detail label="Dolazak" value={formatDate(blokada.datumOd)} />
            <Detail label="Odlazak" value={formatDate(blokada.datumDo)} />
            <Detail label="Noćenja" value={`${noci}`} />
            <Detail
              label="Jedinica"
              value={`${blokada.jedinica.objekt.naziv} / ${blokada.jedinica.naziv}`}
            />
          </Card>

          <Card title="Broj osoba">
            <Detail
              label="Ukupno"
              value={
                blokada.brojOsoba !== null && blokada.brojOsoba !== undefined
                  ? `${blokada.brojOsoba}`
                  : "-"
              }
            />
            <Detail
              label="Odrasli"
              value={
                blokada.brojOdraslih !== null &&
                blokada.brojOdraslih !== undefined
                  ? `${blokada.brojOdraslih}`
                  : "-"
              }
            />
            <Detail
              label="Djeca"
              value={
                blokada.brojDjece !== null && blokada.brojDjece !== undefined
                  ? `${blokada.brojDjece}`
                  : "-"
              }
            />
            <Detail label="Dob djece" value={blokada.dobDjece || "-"} />
          </Card>

          <Card title="Booking meta">
            <Detail label="Booking ID" value={blokada.bookingId || "-"} />
            <Detail label="iCal UID" value={blokada.uid || "-"} />
            <Detail label="Naslov iCal" value={blokada.naslov || "-"} />
            <Detail
              label="Kreirano"
              value={formatDateTime(blokada.createdAt)}
            />
            <Detail
              label="Excel obogaćeno"
              value={formatDateTime(blokada.excelImportiranoAt)}
            />
          </Card>
        </section>
      </div>
    </main>
  );
}

function Stat({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
        {title}
      </div>
      <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <h2 className="mb-4 text-xl font-black text-[#2e2923]">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 border border-[#e2d8c8] bg-[#fcfaf6] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-[#2e2923]">
        {value || "-"}
      </div>
    </div>
  );
}
