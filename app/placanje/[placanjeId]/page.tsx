import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{
    placanjeId: string;
  }>;
};

export default async function PlacanjePage({ params }: Props) {
  const { placanjeId } = await params;

  const placanje = await prisma.placanje.findUnique({
    where: { id: placanjeId },
    include: {
      rezervacija: {
        include: {
          gost: true,
          jedinica: {
            include: {
              objekt: true,
            },
          },
        },
      },
    },
  });

  if (!placanje) notFound();

  const r = placanje.rezervacija;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f1eb",
        padding: "40px",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
          background: "white",
          padding: "32px",
          border: "1px solid #ddd",
        }}
      >
        <h1 style={{ marginBottom: "8px" }}>Plaćanje rezervacije</h1>

        <p style={{ color: "#666", marginBottom: "28px" }}>
          Molimo provjerite podatke prije plaćanja.
        </p>

        <p>
          <strong>Gost:</strong> {r.gost?.ime} {r.gost?.prezime || ""}
        </p>

        <p>
          <strong>Objekt:</strong> {r.jedinica.objekt.naziv}
        </p>

        <p>
          <strong>Smještajna jedinica:</strong> {r.jedinica.naziv}
        </p>

        <p>
          <strong>Dolazak:</strong>{" "}
          {new Date(r.datumOd).toLocaleDateString("hr-HR")}
        </p>

        <p>
          <strong>Odlazak:</strong>{" "}
          {new Date(r.datumDo).toLocaleDateString("hr-HR")}
        </p>

        <hr style={{ margin: "28px 0" }} />

        <h2>
          Iznos za plaćanje: {placanje.iznos.toFixed(2)} {placanje.valuta}
        </h2>

        {placanje.status === "PLACENO" ? (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              background: "#e8f5e9",
              border: "1px solid #b7dfba",
            }}
          >
            Ovo plaćanje je već zaprimljeno.
          </div>
        ) : (
          <Link
            href={`/api/placanja/potvrdi-demo?placanjeId=${placanje.id}`}
            style={{
              display: "inline-block",
              marginTop: "24px",
              padding: "14px 24px",
              background: "#111",
              color: "white",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Plati ostatak
          </Link>
        )}
      </div>
    </main>
  );
}