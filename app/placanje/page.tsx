import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string>>;

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

export default async function PlacanjePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const p = await searchParams;

  const placanjeId = p.placanjeId || "";

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
            Plaćanje nije pronađeno
          </h1>

          <p className="mt-4 text-[#7b7165]">
            Link za plaćanje nije ispravan ili plaćanje ne postoji.
          </p>
        </div>
      </main>
    );
  }

  const rezervacija = placanje.rezervacija;

  const gostIme = `${rezervacija.gost?.ime || "Gost"} ${
    rezervacija.gost?.prezime || ""
  }`.trim();

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-10">
      <div className="mx-auto max-w-xl bg-white p-8 shadow">
        <h1 className="text-3xl font-black text-[#2e2923]">
          Plaćanje rezervacije
        </h1>

        <p className="mt-2 text-[#7b7165]">
          Poštovani {gostIme}, molimo izvršite plaćanje za potvrdu rezervacije.
        </p>

        <div className="mt-6 border bg-[#f8f3ea] p-5">
          <div className="text-center text-5xl">💳</div>

          <div className="mt-4 grid gap-3">
            <Info label="Objekt" value={rezervacija.jedinica.objekt.naziv} />
            <Info label="Jedinica" value={rezervacija.jedinica.naziv} />
            <Info
              label="Termin"
              value={`${formatDate(rezervacija.datumOd)} – ${formatDate(
                rezervacija.datumDo
              )}`}
            />
            <Info label="Vrsta plaćanja" value={placanje.tip} />
            <Info label="Status plaćanja" value={placanje.status} />
          </div>

          <div className="mt-5 text-center">
            <div className="text-sm font-bold text-[#7b7165]">
              Iznos za plaćanje
            </div>
            <div className="mt-2 text-4xl font-black text-[#2e2923]">
              {money(placanje.iznos)}
            </div>
          </div>
        </div>

        {placanje.status === "PLACENO" ? (
          <div className="mt-6 border border-green-200 bg-green-50 p-4 text-center font-bold text-green-800">
            Ovo plaćanje je već evidentirano kao plaćeno.
          </div>
        ) : (
          <form action="/api/rezervacije/potvrdi" method="POST" className="mt-6">
            <input type="hidden" name="placanjeId" value={placanje.id} />

            <button className="w-full bg-[#c79a57] px-6 py-4 font-black text-white">
              Plati karticom
            </button>
          </form>
        )}

        <p className="mt-4 text-xs text-[#7b7165]">
          Ovo je trenutno testni ekran plaćanja. Kasnije ovdje spajamo pravi
          Stripe/WSPay/Monri checkout.
        </p>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e7dece] bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8a8175]">
        {label}
      </div>
      <div className="mt-1 font-black text-[#2e2923]">{value || "-"}</div>
    </div>
  );
}