import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(value: unknown) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function daysBetween(from?: Date | string | null, to?: Date | string | null) {
  if (!from || !to) return 0;

  const a = new Date(from);
  const b = new Date(to);

  const diff = b.getTime() - a.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function parseOznake(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function statusStyle(status?: string | null) {
  const s = String(status || "").toUpperCase();

  if (s.includes("OTKAZ")) {
    return {
      label: "Otkazano",
      bg: "#fee2e2",
      color: "#991b1b",
      border: "#fecaca",
    };
  }

  if (s.includes("POTVR")) {
    return {
      label: "Potvrđeno",
      bg: "#ede9fe",
      color: "#5b21b6",
      border: "#ddd6fe",
    };
  }

  if (s.includes("PLAĆ") || s.includes("PLAC")) {
    return {
      label: "Plaćeno",
      bg: "#dcfce7",
      color: "#166534",
      border: "#bbf7d0",
    };
  }

  return {
    label: status || "Rezervacija",
    bg: "#fef3c7",
    color: "#92400e",
    border: "#fde68a",
  };
}

export default async function GostDetaljiPage(props: PageProps) {
  const params = await props.params;

  const gost = await prisma.gost.findUnique({
    where: {
      id: params.id,
    },
    include: {
      rezervacije: {
        include: {
          jedinica: {
            include: {
              objekt: true,
            },
          },
        },
        orderBy: {
          datumOd: "desc",
        },
      },
    },
  });

  if (!gost) notFound();

  const oznake = parseOznake(gost.oznake);

  const rezervacije = gost.rezervacije || [];

  const aktivneRezervacije = rezervacije.filter(
    (r) => !String(r.status || "").toUpperCase().includes("OTKAZ")
  );

  const ukupnoNocenja = aktivneRezervacije.reduce(
    (sum, r) => sum + daysBetween(r.datumOd, r.datumDo),
    0
  );

  const ukupnoPrihod = aktivneRezervacije.reduce(
    (sum, r) => sum + Number((r as any).iznosUkupno || 0),
    0
  );

  const zadnjaRezervacija = rezervacije[0];

  const punoIme = `${gost.ime || ""} ${gost.prezime || ""}`.trim();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #fff7ed 0, #f8fafc 34%, #f1f5f9 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        color: "#172554",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            marginBottom: 22,
          }}
        >
          <div>
            <Link
              href="/admin/gosti"
              style={{
                display: "inline-flex",
                textDecoration: "none",
                color: "#475569",
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              ← Natrag na goste
            </Link>

            <h1
              style={{
                margin: 0,
                fontSize: 34,
                letterSpacing: -0.8,
                color: "#111827",
              }}
            >
              {punoIme || "Gost"}
            </h1>

            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 16 }}>
              Pregled gosta, kontakt, adresa, oznake, napomena i sve rezervacije.
            </p>
          </div>

          <Link
            href={`/admin/rezervacije/nova?gostId=${gost.id}`}
            style={{
              background: "linear-gradient(135deg, #7c3aed, #db2777)",
              color: "white",
              padding: "13px 18px",
              textDecoration: "none",
              fontWeight: 900,
              boxShadow: "0 14px 30px rgba(124,58,237,0.24)",
            }}
          >
            + Nova rezervacija
          </Link>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <StatCard title="Rezervacija" value={rezervacije.length} subtitle="ukupno" />
          <StatCard title="Aktivnih" value={aktivneRezervacije.length} subtitle="bez otkazanih" />
          <StatCard title="Noćenja" value={ukupnoNocenja} subtitle="ukupno" />
          <StatCard title="Prihod" value={formatMoney(ukupnoPrihod)} subtitle="aktivne rezervacije" />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "380px 1fr",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <Card title="Kontakt">
              <Info label="Ime" value={gost.ime} />
              <Info label="Prezime" value={gost.prezime} />
              <Info label="Email" value={gost.email} />
              <Info label="Telefon" value={gost.telefon} />
            </Card>

            <Card title="Adresa">
              <Info label="Adresa" value={gost.adresa} />
              <Info label="Grad" value={gost.grad} />
              <Info label="Država" value={gost.drzava} />
            </Card>

            <Card title="Oznake">
              {oznake.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {oznake.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        background: "#fce7f3",
                        color: "#9d174d",
                        border: "1px solid #fbcfe8",
                        padding: "7px 10px",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyText text="Gost nema upisane oznake." />
              )}
            </Card>

            <Card title="Napomena">
              {gost.napomena ? (
                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.55,
                    color: "#334155",
                    margin: 0,
                  }}
                >
                  {gost.napomena}
                </p>
              ) : (
                <EmptyText text="Nema napomene za ovog gosta." />
              )}
            </Card>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <Card title="Sažetak gosta">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <MiniBox label="Zadnja rezervacija" value={zadnjaRezervacija ? formatDate(zadnjaRezervacija.datumOd) : "—"} />
                <MiniBox label="Zadnji objekt" value={zadnjaRezervacija?.jedinica?.objekt?.naziv || "—"} />
                <MiniBox label="Zadnja jedinica" value={zadnjaRezervacija?.jedinica?.naziv || "—"} />
              </div>
            </Card>

            <Card title="Sve rezervacije">
              {rezervacije.length === 0 ? (
                <EmptyText text="Ovaj gost još nema rezervacija." />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 14,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <Th>Termin</Th>
                        <Th>Objekt / jedinica</Th>
                        <Th>Noći</Th>
                        <Th>Iznos</Th>
                        <Th>Status</Th>
                        <Th>Akcija</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rezervacije.map((r) => {
                        const style = statusStyle(r.status);
                        const noci = daysBetween(r.datumOd, r.datumDo);

                        return (
                          <tr
                            key={r.id}
                            style={{
                              borderBottom: "1px solid #e5e7eb",
                            }}
                          >
                            <Td>
                              <strong>{formatDate(r.datumOd)}</strong>
                              <span style={{ color: "#64748b" }}> → </span>
                              <strong>{formatDate(r.datumDo)}</strong>
                            </Td>

                            <Td>
                              <div style={{ fontWeight: 900, color: "#111827" }}>
                                {r.jedinica?.objekt?.naziv || "—"}
                              </div>
                              <div style={{ color: "#64748b", fontSize: 13 }}>
                                {r.jedinica?.naziv || "—"}
                              </div>
                            </Td>

                            <Td>{noci}</Td>

                            <Td style={{ fontWeight: 900 }}>
                              {formatMoney((r as any).iznosUkupno)}
                            </Td>

                            <Td>
                              <span
                                style={{
                                  display: "inline-flex",
                                  background: style.bg,
                                  color: style.color,
                                  border: `1px solid ${style.border}`,
                                  padding: "6px 9px",
                                  fontWeight: 900,
                                  fontSize: 12,
                                }}
                              >
                                {style.label}
                              </span>
                            </Td>

                            <Td style={{ textAlign: "right" }}>
                              <Link
                                href={`/admin/rezervacije/${r.id}`}
                                style={{
                                  color: "#7c3aed",
                                  fontWeight: 900,
                                  textDecoration: "none",
                                }}
                              >
                                Otvori →
                              </Link>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </section>
      </div>
    </main>
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
    <section
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(226,232,240,0.95)",
        boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
        padding: 18,
      }}
    >
      <h2
        style={{
          margin: "0 0 14px",
          color: "#111827",
          fontSize: 20,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </h2>

      {children}
    </section>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ffffff, #f8fafc)",
        border: "1px solid #e2e8f0",
        boxShadow: "0 14px 30px rgba(15,23,42,0.07)",
        padding: 18,
      }}
    >
      <div style={{ color: "#64748b", fontWeight: 800, fontSize: 13 }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          fontWeight: 950,
          color: "#111827",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 13 }}>
        {subtitle}
      </div>
    </div>
  );
}

function MiniBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        padding: 14,
      }}
    >
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 800 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color: "#111827",
          fontSize: 16,
          fontWeight: 950,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 1fr",
        gap: 10,
        padding: "9px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <div style={{ color: "#64748b", fontWeight: 800 }}>{label}</div>
      <div style={{ color: "#111827", fontWeight: 900 }}>{value || "—"}</div>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        color: "#94a3b8",
        fontStyle: "italic",
      }}
    >
      {text}
    </p>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "12px 10px",
        color: "#475569",
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: "13px 10px",
        verticalAlign: "middle",
        color: "#334155",
        ...style,
      }}
    >
      {children}
    </td>
  );
}