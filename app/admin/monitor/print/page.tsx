import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  datumOd?: string;
  datumDo?: string;
}>;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
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

export default async function MonitorPrintPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;

  const danas = startOfDay(new Date());

  const datumOd = searchParams.datumOd
    ? startOfDay(new Date(searchParams.datumOd))
    : danas;

  const datumDoInput = searchParams.datumDo
    ? startOfDay(new Date(searchParams.datumDo))
    : addDays(datumOd, 3);

  const datumDo = datumDoInput < datumOd ? datumOd : datumDoInput;

  const queryDoExclusive = addDays(datumDo, 1);

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      status: { not: "OTKAZANO" },
      datumOd: { lt: queryDoExclusive },
      datumDo: { gt: datumOd },
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

  const zadaci = await prisma.zadatak.findMany({
    where: {
      datum: {
        gte: datumOd,
        lt: queryDoExclusive,
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
    orderBy: [{ datum: "asc" }],
  });

  const dani: Date[] = [];
  let d = datumOd;
  while (d <= datumDo) {
    dani.push(new Date(d));
    d = addDays(d, 1);
  }

  return (
    <main
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background: "#f4efe6",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <style>{`
        @media print {
          body {
            background: white !important;
          }

          main {
            background: white !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .page-break {
            page-break-before: always;
          }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20 }}>
        <Link
          href={`/admin/monitor?datum=${toIsoDate(datumOd)}`}
          style={{
            display: "inline-block",
            marginRight: 12,
            fontWeight: 900,
            color: "#9b6b12",
          }}
        >
          ← Natrag na monitor
        </Link>

        <button
          onClick={undefined as any}
          style={{
            background: "#2e2923",
            color: "white",
            border: 0,
            padding: "10px 16px",
            fontWeight: 900,
          }}
        >
          Ctrl + P za PDF
        </button>
      </div>

      <section
        className="print-card"
        style={{
          background: "white",
          border: "1px solid #ddd",
          padding: 22,
          marginBottom: 18,
        }}
      >
        <p
          style={{
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontWeight: 900,
            color: "#9b7a4c",
            fontSize: 12,
          }}
        >
          Apartmani — dnevni izvještaj
        </p>

        <h1 style={{ margin: "8px 0 0", fontSize: 30, color: "#2e2923" }}>
          Izvještaj zauzeća
        </h1>

        <p style={{ margin: "8px 0 0", color: "#6f665a" }}>
          Period: <b>{shortDate(datumOd)}</b> – <b>{shortDate(datumDo)}</b>
        </p>
      </section>

      {dani.map((dan, index) => {
        const iso = toIsoDate(dan);

        const dolasci = rezervacije.filter((r) => toIsoDate(r.datumOd) === iso);
        const odlasci = rezervacije.filter((r) => toIsoDate(r.datumDo) === iso);
        const borave = rezervacije.filter(
          (r) => dan >= startOfDay(r.datumOd) && dan < startOfDay(r.datumDo)
        );
        const zadaciDana = zadaci.filter((z) => toIsoDate(z.datum) === iso);

        return (
          <section
            key={iso}
            className={`print-card ${index > 0 ? "page-break" : ""}`}
            style={{
              background: "white",
              border: "1px solid #ddd",
              padding: 22,
              marginBottom: 18,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 24,
                color: "#2e2923",
                textTransform: "capitalize",
              }}
            >
              {formatDate(dan)}
            </h2>

            <ReportBlock title="Dolasci">
              {dolasci.length === 0 ? (
                <Empty />
              ) : (
                dolasci.map((r) => <ReservationRow key={r.id} r={r} />)
              )}
            </ReportBlock>

            <ReportBlock title="Odlasci">
              {odlasci.length === 0 ? (
                <Empty />
              ) : (
                odlasci.map((r) => <ReservationRow key={r.id} r={r} />)
              )}
            </ReportBlock>

            <ReportBlock title="Tko je u apartmanima">
              {borave.length === 0 ? (
                <Empty />
              ) : (
                borave.map((r) => <ReservationRow key={r.id} r={r} />)
              )}
            </ReportBlock>

            <ReportBlock title="Zadaci / čišćenje">
              {zadaciDana.length === 0 ? (
                <Empty text="Nema zadataka." />
              ) : (
                zadaciDana.map((z) => (
                  <div key={z.id} style={rowStyle}>
                    <div>
                      <b>{z.naslov}</b>
                      <div style={smallStyle}>
                        {z.jedinica.objekt.naziv} / {z.jedinica.naziv}
                      </div>
                      {z.opis && <div style={noteStyle}>{z.opis}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <b>{z.tip}</b>
                      <div style={smallStyle}>{z.status}</div>
                    </div>
                  </div>
                ))
              )}
            </ReportBlock>
          </section>
        );
      })}
    </main>
  );
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <h3
        style={{
          margin: "0 0 8px",
          padding: "8px 10px",
          background: "#f8f3ea",
          color: "#2e2923",
          fontSize: 16,
        }}
      >
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function ReservationRow({ r }: { r: any }) {
  const gost = `${r.gost?.ime || ""} ${r.gost?.prezime || ""}`.trim() || "Gost";

  return (
    <div style={rowStyle}>
      <div>
        <b>{gost}</b>
        <div style={smallStyle}>
          {r.jedinica.objekt.naziv} / {r.jedinica.naziv}
        </div>
        <div style={smallStyle}>
          {shortDate(r.datumOd)} – {shortDate(r.datumDo)} · {r.brojNocenja} noći ·{" "}
          {r.brojOsoba} osoba
        </div>
        {r.napomena && <div style={noteStyle}>Napomena: {r.napomena}</div>}
      </div>

      <div style={{ textAlign: "right" }}>
        <b>{r.izvor}</b>
        <div style={smallStyle}>{r.status}</div>
        <div style={smallStyle}>{r.gost?.telefon || "-"}</div>
        <div style={smallStyle}>{r.gost?.email || "-"}</div>
      </div>
    </div>
  );
}

function Empty({ text = "Nema zapisa." }: { text?: string }) {
  return <p style={{ margin: "8px 0", color: "#8a8175" }}>{text}</p>;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  border: "1px solid #e2d8c8",
  padding: 10,
  marginBottom: 8,
  background: "#fff",
};

const smallStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6f665a",
  marginTop: 2,
};

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#2e2923",
  marginTop: 6,
  background: "#f8f3ea",
  padding: 6,
};