import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  dana?: string;
}>;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDatum(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function guestName(gost: any) {
  return `${gost?.ime || ""} ${gost?.prezime || ""}`.trim() || "-";
}

function tipLabel(tip: string) {
  if (tip === "ZAVRSNO_CISCENJE") return "Završno čišćenje";
  if (tip === "MEDJUCISCENJE_I_POSTELJINA") {
    return "Međučisćenje + posteljina + ručnici";
  }
  if (tip === "DODATNO_CISCENJE") return "Dodatno čišćenje";
  return tip;
}

function martyBazenZaDan(postavke: any, datum: Date) {
  const day = datum.getDay();

  return [
    postavke?.martyBazenNedjelja,
    postavke?.martyBazenPonedjeljak,
    postavke?.martyBazenUtorak,
    postavke?.martyBazenSrijeda,
    postavke?.martyBazenCetvrtak,
    postavke?.martyBazenPetak,
    postavke?.martyBazenSubota,
  ][day];
}

type PlanItem = {
  id: string;
  datum: Date;
  tip: string;
  objekt: string;
  jedinica: string;
  gost: string;
  brojGostiju: number | string;
  opis: string;
  sljedeciUlazak: string;
  brziUlazak: boolean;
};

export default async function PlanCiscenjaPdfPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  const brojDanaZaPlan = Number(
    params?.dana || postavke?.brojDanaUnaprijed || 7
  );

  const danas = startOfDay(new Date());
  const doDatuma = addDays(danas, brojDanaZaPlan);

  const rezervacijeZaOdlazak = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      datumDo: {
        gte: danas,
        lte: doDatuma,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: {
      datumDo: "asc",
    },
  });

  const dugeRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      automatskaPosteljina: true,
      brojNocenja: {
        gt: 7,
      },
      datumOd: {
        lt: doDatuma,
      },
      datumDo: {
        gt: danas,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: {
      datumOd: "asc",
    },
  });

  const planItems: PlanItem[] = [];

  for (const r of rezervacijeZaOdlazak) {
    const sljedecaRezervacija = await prisma.rezervacija.findFirst({
      where: {
        id: {
          not: r.id,
        },
        jedinicaId: r.jedinicaId,
        status: {
          not: "OTKAZANO",
        },
        datumOd: {
          gte: r.datumDo,
        },
      },
      include: {
        gost: true,
      },
      orderBy: {
        datumOd: "asc",
      },
    });

    const brziUlazak = sljedecaRezervacija
      ? sameDay(r.datumDo, sljedecaRezervacija.datumOd)
      : false;

    const sljedeciUlazak = sljedecaRezervacija
      ? `${formatDatum(sljedecaRezervacija.datumOd)} — ${guestName(
        sljedecaRezervacija.gost
      )}`
      : "Nema najavljenog ulaska";

    planItems.push({
      id: `odlazak-${r.id}`,
      datum: startOfDay(r.datumDo),
      tip: "ZAVRSNO_CISCENJE",
      objekt: r.jedinica.objekt.naziv,
      jedinica: r.jedinica.naziv,
      gost: guestName(r.gost),
      brojGostiju: r.brojOsoba || "-",
      opis: brziUlazak
        ? "BRZI ULAZAK isti dan — očistiti odmah nakon odlaska gosta."
        : "Završno čišćenje nakon odlaska gosta.",
      sljedeciUlazak,
      brziUlazak,
    });
  }

  for (const r of dugeRezervacije) {
    const pocetak = startOfDay(r.datumOd);
    const kraj = startOfDay(r.datumDo);
    const polaBoravka = Math.floor(Number(r.brojNocenja || 0) / 2);
    const datumMedjuciscenja = addDays(pocetak, polaBoravka);

    if (datumMedjuciscenja <= pocetak || datumMedjuciscenja >= kraj) {
      continue;
    }

    if (datumMedjuciscenja < danas || datumMedjuciscenja > doDatuma) {
      continue;
    }

    planItems.push({
      id: `medju-${r.id}`,
      datum: datumMedjuciscenja,
      tip: "MEDJUCISCENJE_I_POSTELJINA",
      objekt: r.jedinica.objekt.naziv,
      jedinica: r.jedinica.naziv,
      gost: guestName(r.gost),
      brojGostiju: r.brojOsoba || "-",
      opis:
        "Gost ostaje dulje od 7 noći — očistiti apartman/kuću, promijeniti posteljinu i ostaviti nove ručnike.",
      sljedeciUlazak: "Gost ostaje u smještaju",
      brziUlazak: false,
    });
  }

  const prvaMartyJedinica = await prisma.jedinica.findFirst({
    where: {
      objekt: {
        naziv: {
          contains: "Marty",
        },
      },
    },
    include: {
      objekt: true,
    },
  });

  if (postavke && prvaMartyJedinica) {
    let d = new Date(danas);

    while (d <= doDatuma) {
      if (martyBazenZaDan(postavke, d)) {
        planItems.push({
          id: `bazen-${d.toISOString()}`,
          datum: new Date(d),
          tip: "DODATNO_CISCENJE",
          objekt: prvaMartyJedinica.objekt.naziv,
          jedinica: "Marty bazen / okoliš",
          gost: "-",
          brojGostiju: "-",
          opis: "Čišćenje bazena i okoliša.",
          sljedeciUlazak: "-",
          brziUlazak: false,
        });
      }

      d = addDays(d, 1);
    }
  }

  planItems.sort((a, b) => {
    const datumDiff = a.datum.getTime() - b.datum.getTime();
    if (datumDiff !== 0) return datumDiff;

    const objektDiff = a.objekt.localeCompare(b.objekt);
    if (objektDiff !== 0) return objektDiff;

    return a.jedinica.localeCompare(b.jedinica);
  });

  return (
    <main>
      <div className="no-print" style={toolbarStyle}>
        <Link href="/admin/ciscenje" style={backStyle}>
          ← Natrag
        </Link>

        <button
          type="button"
          onClick={undefined as any}
          style={hiddenButtonStyle}
        >
          Print
        </button>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', function () {
              setTimeout(function () {
                window.print();
              }, 500);
            });
          `,
        }}
      />
     
      <section style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Plan čišćenja</h1>
          <p style={subtitleStyle}>Malinska Stay</p>
        </div>

        <div style={periodStyle}>
          <strong>Period:</strong>
          <br />
          {formatDatum(danas)} – {formatDatum(doDatuma)}
          <br />
          <strong>Ukupno stavki:</strong> {planItems.length}
        </div>
      </section>

      {planItems.length === 0 ? (
        <div style={emptyStyle}>
          Nema planiranih čišćenja u ovom periodu prema trenutnim rezervacijama.
        </div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Datum</th>
              <th style={thStyle}>Objekt</th>
              <th style={thStyle}>Jedinica</th>
              <th style={thStyle}>Tip</th>
              <th style={thStyle}>Gost koji odlazi / boravi</th>
              <th style={thImportantStyle}>Broj gostiju</th>
              <th style={thStyle}>Opis</th>
              <th style={thImportantStyle}>Sljedeći ulazak</th>
            </tr>
          </thead>

          <tbody>
            {planItems.map((item) => (
              <tr
                key={item.id}
                style={item.brziUlazak ? quickRowStyle : undefined}
              >
                <td style={tdStyle}>{formatDatum(item.datum)}</td>
                <td style={tdStyle}>{item.objekt}</td>
                <td style={tdStyle}>{item.jedinica}</td>
                <td style={tdStyle}>
                  <strong>{tipLabel(item.tip)}</strong>
                  {item.brziUlazak && (
                    <div style={quickBadgeStyle}>BRZI ULAZAK</div>
                  )}
                </td>
                <td style={tdStyle}>{item.gost}</td>
                <td style={tdImportantStyle}>{item.brojGostiju || "-"}</td>
                <td style={tdStyle}>{item.opis}</td>
                <td style={tdImportantStyle}>
                  {item.brziUlazak ? (
                    <>
                      <strong>BRZI ULAZAK ISTI DAN</strong>
                      <br />
                      {item.sljedeciUlazak || "-"}
                    </>
                  ) : (
                    item.sljedeciUlazak || "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style>{`
        body {
          margin: 0;
          background: #f5f6f7;
          color: #111;
          font-family: Calibri, Segoe UI, Arial, sans-serif;
        }

        main {
          padding: 28px;
        }

        @media print {
          body {
            background: white;
          }

          main {
            padding: 0;
          }

          .no-print {
            display: none !important;
          }

          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>
    </main>
  );
}

const toolbarStyle: React.CSSProperties = {
  marginBottom: 20,
  display: "flex",
  gap: 10,
};

const backStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  background: "#111",
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
};

const hiddenButtonStyle: React.CSSProperties = {
  display: "none",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 24,
  borderBottom: "2px solid #111",
  paddingBottom: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  fontWeight: 900,
};

const subtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 16,
  color: "#555",
};

const periodStyle: React.CSSProperties = {
  textAlign: "right",
  fontSize: 14,
  lineHeight: 1.6,
};

const emptyStyle: React.CSSProperties = {
  padding: 18,
  background: "white",
  border: "1px solid #ddd",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "white",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  border: "1px solid #999",
  padding: 7,
  background: "#e9ecef",
  textAlign: "left",
  verticalAlign: "top",
};

const thImportantStyle: React.CSSProperties = {
  border: "1px solid #999",
  padding: 7,
  background: "#d1fae5",
  textAlign: "left",
  verticalAlign: "top",
  fontWeight: 900,
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: 7,
  verticalAlign: "top",
};

const tdImportantStyle: React.CSSProperties = {
  border: "1px solid #999",
  padding: 7,
  verticalAlign: "top",
  fontWeight: 900,
  background: "#f0fdf4",
};

const quickRowStyle: React.CSSProperties = {
  background: "#fff1f1",
};

const quickBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  padding: "3px 5px",
  background: "#b42318",
  color: "white",
  fontSize: 10,
  fontWeight: 900,
};