import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  rezervacijaId?: string;
}>;

function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Stranica na koju Stripe vodi gosta kad NE dovrši plaćanje (cancel_url).
// Samo informativna + "pokušaj ponovno" — čišćenje isteklih rezervacija
// radi Stripe webhook (checkout.session.expired), NE ova stranica.
// (Stranica ne dira bazu na write — gost se može vratiti i ipak platiti.)
export default async function NeuspjehPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rezervacijaId = params.rezervacijaId || "";

  // Najnovije plaćanje za ovu rezervaciju — za "pokušaj ponovno platiti".
  const placanje = rezervacijaId
    ? await prisma.placanje.findFirst({
        where: { rezervacijaId },
        orderBy: { createdAt: "desc" },
        include: {
          rezervacija: {
            include: {
              jedinica: {
                include: {
                  objekt: true,
                },
              },
            },
          },
        },
      })
    : null;

  const r = placanje?.rezervacija ?? null;

  // Retry ima smisla samo dok rezervacija nije plaćena ni otkazana.
  const retryUrl =
    placanje &&
    placanje.status !== "PLACENO" &&
    r &&
    r.status !== "OTKAZANO"
      ? `/api/rezervacije/create-payment?placanjeId=${placanje.id}`
      : null;

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-10">
      <div className="mx-auto max-w-2xl bg-white p-8 shadow">
        <div className="text-center">
          <div className="text-6xl">⚠️</div>

          <h1 className="mt-4 text-3xl font-black text-[#2e2923]">
            Plaćanje nije dovršeno
          </h1>

          <p className="mt-3 text-[#7b7165]">
            Kartično plaćanje je prekinuto ili otkazano. Rezervacija nije
            potvrđena i sredstva s kartice nisu rezervirana.
          </p>
        </div>

        {r && (
          <div className="mt-8 grid gap-3">
            <Info label="Objekt" value={r.jedinica.objekt.naziv} />
            <Info label="Smještajna jedinica" value={r.jedinica.naziv} />
            <Info
              label="Termin"
              value={`${formatDate(r.datumOd)} – ${formatDate(r.datumDo)}`}
            />
          </div>
        )}

        <div className="mt-6 border border-[#e7dece] bg-[#f8f3ea] p-5 text-[#6f665a]">
          Termin se kratko drži dok traje kartično plaćanje. Ako plaćanje ne
          dovršite, termin se automatski oslobađa.
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {retryUrl && (
            <a
              href={retryUrl}
              className="inline-block bg-[#c79a57] px-6 py-3 font-black text-white"
            >
              Pokušaj ponovno platiti
            </a>
          )}

          <Link
            href="/"
            className="inline-block border border-[#d9cfbf] bg-white px-6 py-3 font-bold text-[#2e2923]"
          >
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
