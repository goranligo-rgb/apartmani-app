import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { jedinicaJeSlobodna } from "@/lib/zauzeca";

export const dynamic = "force-dynamic";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export default async function PosebnePrilikePage() {
  const danas = startOfDay(new Date());

  const akcijeIzBaze = await prisma.akcija.findMany({
    where: {
      aktivna: true,
      prikaziNaWebu: true,
      datumDo: {
        gte: danas,
      },
    },
    include: {
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumOd: "asc" }],
  });

  // Filtriraj zauzete prilike kroz `jedinicaJeSlobodna` (lib/zauzeca.ts) — sad
  // gleda i vanjske blokade (Booking/iCal), što stari `imaPreklapanje` filter
  // nije radio. Posljedica: posebna prilika kojoj je termin u Booking-u više
  // se ne prikazuje na webu (prije se prikazivala pa bi `create-payment` POST
  // vratio 409). Više zaokruženih DB poziva (jedna provjera po akciji), ali
  // popis posebnih prilika je obično kratak.
  const slobodneZastavice = await Promise.all(
    akcijeIzBaze.map((a) =>
      jedinicaJeSlobodna({
        jedinicaId: a.jedinicaId,
        datumOd: a.datumOd,
        datumDo: a.datumDo,
      }),
    ),
  );

  const akcije = akcijeIzBaze.filter((_, i) => slobodneZastavice[i]);

  return (
    <main
      className="min-h-screen bg-[#f4efe6] px-6 py-10"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="font-bold text-[#9b6b12]">
          ← Natrag na početnu
        </Link>

        <h1 className="mt-8 text-4xl font-bold text-[#2e2923]">
          Posebne prilike
        </h1>

        {akcije.length === 0 ? (
          <div className="mt-8 border bg-white p-6 text-[#6f665a]">
            Trenutno nema aktivnih posebnih prilika za prikaz.
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {akcije.map((a) => (
              <Link
                key={a.id}
                href={`/rezervacije/posebne-prilike?id=${a.id}`}
                className="cursor-pointer border border-white/80 bg-white p-7 shadow-[0_12px_35px_rgba(0,0,0,0.08)] transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
              >
                <div className="text-sm font-bold uppercase tracking-[0.22em] text-[#c79a57]">
                  {a.jedinica.objekt.naziv}
                </div>

                <h2 className="mt-2 text-2xl font-bold text-[#2e2923]">
                  {a.naziv}
                </h2>

                <div className="mt-3 text-sm font-bold text-[#5f5549]">
                  {a.jedinica.naziv}
                </div>

                <div className="mt-4 text-sm text-[#6f665a]">
                  {a.datumOd.toLocaleDateString("hr-HR")} –{" "}
                  {a.datumDo.toLocaleDateString("hr-HR")}
                </div>

                <div className="mt-5 text-3xl font-bold text-[#2e2923]">
                  {Number(a.cijenaUkupno || 0).toFixed(0)} €
                </div>

                {a.opis && (
                  <p className="mt-4 text-sm leading-relaxed text-[#6f665a]">
                    {a.opis}
                  </p>
                )}

                <div className="mt-6 font-bold text-[#9b6b12]">
                  Rezerviraj →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}