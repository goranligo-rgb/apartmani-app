import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  placanjeId?: string;
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

export default async function PlacanjeUspjehPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const placanjeId = params.placanjeId || "";

  const placanje = placanjeId
    ? await prisma.placanje.findUnique({
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
              racuni: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      })
    : null;

  if (!placanje) {
    return (
      <main className="min-h-screen bg-[#f4efe6] px-4 py-10">
        <div className="mx-auto max-w-xl bg-white p-8 shadow">
          <h1 className="text-3xl font-black text-[#2e2923]">
            Plaćanje je obrađeno
          </h1>

          <p className="mt-4 text-[#7b7165]">
            Hvala. Ako niste dobili potvrdu na email, slobodno nas kontaktirajte.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block bg-[#c79a57] px-6 py-3 font-black text-white"
          >
            Povratak na početnu
          </Link>
        </div>
      </main>
    );
  }

  const r = placanje.rezervacija;
  const gostIme = `${r.gost?.ime || "Gost"} ${r.gost?.prezime || ""}`.trim();
  const zadnjiRacun = r.racuni[0];

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-10">
      <div className="mx-auto max-w-2xl bg-white p-8 shadow">
        <div className="text-center">
          <div className="text-6xl">✅</div>

          <h1 className="mt-4 text-3xl font-black text-[#2e2923]">
            Hvala na uplati
          </h1>

          <p className="mt-3 text-[#7b7165]">
            Poštovani {gostIme}, vaša uplata je uspješno evidentirana.
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <Info label="Objekt" value={r.jedinica.objekt.naziv} />
          <Info label="Smještajna jedinica" value={r.jedinica.naziv} />
          <Info
            label="Termin"
            value={`${formatDate(r.datumOd)} – ${formatDate(r.datumDo)}`}
          />
          <Info label="Plaćeni iznos" value={money(placanje.iznos)} />
          <Info label="Status rezervacije" value={r.status} />
          {zadnjiRacun && (
            <Info label="Broj računa" value={zadnjiRacun.brojRacuna} />
          )}
        </div>

        <div className="mt-6 border border-[#e7dece] bg-[#f8f3ea] p-5 text-[#6f665a]">
          Potvrdu rezervacije i račun poslali smo na email adresu unesenu u
          rezervaciji.
        </div>

        {zadnjiRacun?.pdfUrl && (
          <div className="mt-5">
            <Link
              href={zadnjiRacun.pdfUrl}
              target="_blank"
              className="inline-block bg-[#c79a57] px-6 py-3 font-black text-white"
            >
              Otvori račun
            </Link>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href="/" className="font-bold text-[#9b6b12]">
            Povratak na početnu
          </Link>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e7dece] bg-[#fcfaf6] p-4">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8a8175]">
        {label}
      </div>
      <div className="mt-1 font-black text-[#2e2923]">{value || "-"}</div>
    </div>
  );
}