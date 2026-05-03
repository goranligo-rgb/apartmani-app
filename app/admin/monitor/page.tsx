import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  datum?: string;
  rezervacijaId?: string;
  mjesec?: string;
}>;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function parseMonth(value?: string | null) {
  if (!value) return null;

  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return null;

  return new Date(year, month - 1, 1);
}

function monthParam(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function shortDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function monthName(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    month: "long",
    year: "numeric",
  });
}

export default async function AdminMonitorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const danas = startOfDay(new Date());
  const odabraniDatum = params.datum
    ? startOfDay(new Date(params.datum))
    : danas;

  const mjesecIzParametra = parseMonth(params.mjesec);
  const kalendarOd =
    mjesecIzParametra || new Date(danas.getFullYear(), danas.getMonth(), 1);

  const kalendarDo = addMonths(kalendarOd, 4);

  const prevMonth = addMonths(kalendarOd, -1);
  const nextMonth = addMonths(kalendarOd, 1);

  function buildMonthHref(targetMonth: Date) {
    const q = new URLSearchParams();

    q.set("mjesec", monthParam(targetMonth));
    q.set("datum", toIsoDate(odabraniDatum));

    if (params.rezervacijaId) {
      q.set("rezervacijaId", params.rezervacijaId);
    }

    return `/admin/monitor?${q.toString()}`;
  }

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      status: { not: "OTKAZANO" },
      datumOd: { lt: kalendarDo },
      datumDo: { gt: kalendarOd },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumOd: "asc" }, { datumDo: "asc" }],
  });

  const detaljRezervacije = params.rezervacijaId
    ? await prisma.rezervacija.findUnique({
        where: { id: params.rezervacijaId },
        include: {
          gost: true,
          jedinica: {
            include: {
              objekt: true,
            },
          },
        },
      })
    : null;

  const mjeseci = [0, 1, 2, 3].map((i) => {
    const m = addMonths(kalendarOd, i);
    return new Date(m.getFullYear(), m.getMonth(), 1);
  });

  const selectedIso = toIsoDate(odabraniDatum);

  const dolasci = rezervacije.filter(
    (r) => toIsoDate(r.datumOd) === selectedIso
  );

  const odlasci = rezervacije.filter(
    (r) => toIsoDate(r.datumDo) === selectedIso
  );

  const uApartmanima = rezervacije.filter(
    (r) =>
      odabraniDatum >= startOfDay(r.datumOd) &&
      odabraniDatum < startOfDay(r.datumDo)
  );

  return (
    <main
      className="min-h-screen px-4 py-6 md:px-8"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 border border-white/70 bg-white p-5 shadow-[0_10px_25px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin"
            className="mb-3 inline-block text-sm font-bold text-[#9b6b12]"
          >
            ← Admin
          </Link>

          <h1 className="text-3xl font-black text-[#2e2923]">
            Monitor zauzeća
          </h1>

          <p className="mt-2 text-sm text-[#6f665a]">
            Klikni dan u kalendaru. Gore se prikazuju dolasci, odlasci i gosti
            koji su taj dan u apartmanima.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span style={legend("#2fa84f", "white")}>Gosti u apartmanu</span>
            <span style={legend("#2f80ed", "white")}>Dolazak</span>
            <span style={legend("#d93b3b", "white")}>Odlazak</span>
            <span style={legend("#ffffff", "#6f665a")}>Nema gostiju</span>
          </div>
        </div>

        <section className="mb-5 border border-white/80 bg-white p-4 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9b7a4c]">
                Odabrani dan
              </p>

              <h2 className="mt-1 text-2xl font-black capitalize text-[#2e2923]">
                {formatDate(odabraniDatum)}
              </h2>
            </div>

            <form
              action="/admin/monitor/print"
              method="GET"
              className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
            >
              <input
                type="date"
                name="datumOd"
                defaultValue={selectedIso}
                className="border border-[#d8c8aa] p-2 text-sm"
              />

              <input
                type="date"
                name="datumDo"
                defaultValue={toIsoDate(addDays(odabraniDatum, 3))}
                className="border border-[#d8c8aa] p-2 text-sm"
              />

              <button
                type="submit"
                className="bg-[#2e2923] px-4 py-2 text-sm font-black text-white"
              >
                Print / PDF
              </button>
            </form>
          </div>
        </section>

        <section className="mb-5 grid gap-3 lg:grid-cols-3">
          <InfoBox title="1. Dolasci" color="#2f80ed">
            {dolasci.length === 0 ? (
              <Empty text="Nema dolazaka." />
            ) : (
              dolasci.map((r) => (
                <RezCard key={r.id} r={r} datum={selectedIso} />
              ))
            )}
          </InfoBox>

          <InfoBox title="2. Odlasci" color="#d93b3b">
            {odlasci.length === 0 ? (
              <Empty text="Nema odlazaka." />
            ) : (
              odlasci.map((r) => (
                <RezCard key={r.id} r={r} datum={selectedIso} />
              ))
            )}
          </InfoBox>

          <InfoBox title="3. Gosti u apartmanima" color="#2fa84f">
            {uApartmanima.length === 0 ? (
              <Empty text="Nitko nije u apartmanima." />
            ) : (
              uApartmanima.map((r) => (
                <RezCard key={r.id} r={r} datum={selectedIso} />
              ))
            )}
          </InfoBox>
        </section>

        {detaljRezervacije && (
          <section className="mb-5 border border-[#d8c8aa] bg-white p-4 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
            <h2 className="text-xl font-black text-[#2e2923]">
              Detalj rezervacije
            </h2>

            <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <Detail
                label="Gost"
                value={`${detaljRezervacije.gost?.ime || ""} ${
                  detaljRezervacije.gost?.prezime || ""
                }`}
              />
              <Detail
                label="Email"
                value={detaljRezervacije.gost?.email || "-"}
              />
              <Detail
                label="Telefon"
                value={detaljRezervacije.gost?.telefon || "-"}
              />
              <Detail
                label="Jedinica"
                value={`${detaljRezervacije.jedinica.objekt.naziv} / ${detaljRezervacije.jedinica.naziv}`}
              />
              <Detail
                label="Dolazak"
                value={shortDate(detaljRezervacije.datumOd)}
              />
              <Detail
                label="Odlazak"
                value={shortDate(detaljRezervacije.datumDo)}
              />
              <Detail label="Izvor" value={detaljRezervacije.izvor} />
              <Detail label="Status" value={detaljRezervacije.status} />
            </div>

            {detaljRezervacije.napomena && (
              <p className="mt-3 border bg-[#f8f3ea] p-3 text-sm text-[#6f665a]">
                {detaljRezervacije.napomena}
              </p>
            )}
          </section>
        )}

        <section className="mb-5 border border-white/80 bg-white p-4 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={buildMonthHref(prevMonth)}
              className="cursor-pointer border border-[#d8c8aa] bg-[#f8f3ea] px-4 py-2 text-lg font-black text-[#7a5a22] hover:bg-[#fff6e2]"
            >
              ←
            </Link>

            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
                Prikaz kalendara
              </div>
              <div className="mt-1 text-xl font-black capitalize text-[#2e2923]">
                {monthName(kalendarOd)} / {monthName(addMonths(kalendarOd, 1))}{" "}
                / {monthName(addMonths(kalendarOd, 2))} /{" "}
                {monthName(addMonths(kalendarOd, 3))}
              </div>
            </div>

            <Link
              href={buildMonthHref(nextMonth)}
              className="cursor-pointer border border-[#d8c8aa] bg-[#f8f3ea] px-4 py-2 text-lg font-black text-[#7a5a22] hover:bg-[#fff6e2]"
            >
              →
            </Link>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-2">
          {mjeseci.map((mjesec) => (
            <MonthCalendar
              key={mjesec.toISOString()}
              mjesec={mjesec}
              odabraniDatum={odabraniDatum}
              rezervacije={rezervacije}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function MonthCalendar({
  mjesec,
  odabraniDatum,
  rezervacije,
}: {
  mjesec: Date;
  odabraniDatum: Date;
  rezervacije: any[];
}) {
  const first = new Date(mjesec.getFullYear(), mjesec.getMonth(), 1);
  const last = new Date(mjesec.getFullYear(), mjesec.getMonth() + 1, 0);

  const startOffset = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }

  let d = first;
  while (d <= last) {
    cells.push(new Date(d));
    d = addDays(d, 1);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <section className="border border-white/80 bg-white p-3 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
      <h2 className="mb-3 text-lg font-black capitalize text-[#2e2923]">
        {monthName(mjesec)}
      </h2>

      <div className="grid grid-cols-7 border-l border-t text-center text-xs font-black text-[#6f665a]">
        {["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"].map((d) => (
          <div key={d} className="border-b border-r bg-[#f8f3ea] p-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l">
        {cells.map((dan, index) => {
          if (!dan) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-[60px] border-b border-r bg-[#f7f1e8]"
              />
            );
          }

          const iso = toIsoDate(dan);
          const selected = iso === toIsoDate(odabraniDatum);

          const dolasci = rezervacije.filter(
            (r) => toIsoDate(r.datumOd) === iso
          );

          const odlasci = rezervacije.filter(
            (r) => toIsoDate(r.datumDo) === iso
          );

          const uApartmanima = rezervacije.filter(
            (r) =>
              dan >= startOfDay(r.datumOd) &&
              dan < startOfDay(r.datumDo)
          );

          return (
            <Link
              key={iso}
              href={`/admin/monitor?datum=${iso}&mjesec=${monthParam(
                mjesec
              )}`}
              className="min-h-[60px] border-b border-r bg-white p-1 transition hover:bg-[#fff8eb]"
              style={{
                outline: selected ? "2px solid #9b6b12" : "none",
                outlineOffset: "-2px",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-[#2e2923]">
                  {dan.getDate()}
                </span>

                <span className="text-[10px] font-bold text-[#8a8175]">
                  {uApartmanima.length + dolasci.length + odlasci.length > 0
                    ? `${uApartmanima.length + dolasci.length + odlasci.length}`
                    : ""}
                </span>
              </div>

              <div className="mt-2 flex h-[3px] overflow-hidden">
                {uApartmanima.length > 0 && (
                  <div
                    title="Gosti u apartmanu"
                    style={{
                      background: "#2fa84f",
                      width: `${100 / countSignals(
                        uApartmanima.length,
                        dolasci.length,
                        odlasci.length
                      )}%`,
                    }}
                  />
                )}

                {dolasci.length > 0 && (
                  <div
                    title="Dolazak"
                    style={{
                      background: "#2f80ed",
                      width: `${100 / countSignals(
                        uApartmanima.length,
                        dolasci.length,
                        odlasci.length
                      )}%`,
                    }}
                  />
                )}

                {odlasci.length > 0 && (
                  <div
                    title="Odlazak"
                    style={{
                      background: "#d93b3b",
                      width: `${100 / countSignals(
                        uApartmanima.length,
                        dolasci.length,
                        odlasci.length
                      )}%`,
                    }}
                  />
                )}
              </div>

              <div className="mt-1 space-y-[1px] text-[10px] font-bold leading-tight">
                {dolasci.length > 0 && (
                  <div style={{ color: "#2f80ed" }}>
                    + {dolasci.length} dol.
                  </div>
                )}
                {odlasci.length > 0 && (
                  <div style={{ color: "#d93b3b" }}>
                    - {odlasci.length} odl.
                  </div>
                )}
                {uApartmanima.length > 0 && (
                  <div style={{ color: "#2fa84f" }}>
                    ● {uApartmanima.length} unutra
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function countSignals(stay: number, arrival: number, departure: number) {
  let count = 0;
  if (stay > 0) count++;
  if (arrival > 0) count++;
  if (departure > 0) count++;
  return count || 1;
}

function InfoBox({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-white/80 bg-white p-3 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
      <div className="mb-2 flex items-center gap-2">
        <span
          style={{
            width: 10,
            height: 10,
            background: color,
            display: "inline-block",
          }}
        />
        <h2 className="text-base font-black text-[#2e2923]">{title}</h2>
      </div>

      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RezCard({ r, datum }: { r: any; datum: string }) {
  const ime = `${r.gost?.ime || ""} ${r.gost?.prezime || ""}`.trim() || "Gost";

  return (
    <Link
      href={`/admin/monitor?datum=${datum}&rezervacijaId=${r.id}`}
      className="block border bg-[#f8f3ea] p-2 transition hover:bg-[#efe2cc]"
    >
      <div className="text-sm font-black text-[#2e2923]">{ime}</div>

      <div className="text-xs text-[#6f665a]">
        {r.jedinica?.objekt?.naziv} / {r.jedinica?.naziv}
      </div>

      <div className="mt-1 flex justify-between gap-2 text-xs font-bold text-[#9b6b12]">
        <span>{r.izvor}</span>
        <span>
          {shortDate(r.datumOd)} – {shortDate(r.datumDo)}
        </span>
      </div>
    </Link>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border bg-[#f8f3ea] p-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#9b7a4c]">
        {label}
      </div>

      <div className="mt-1 text-sm font-black text-[#2e2923]">
        {value || "-"}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[#8a8175]">{text}</p>;
}

function legend(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    padding: "6px 9px",
    border: "1px solid rgba(0,0,0,0.08)",
  };
}