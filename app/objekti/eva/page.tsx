import Link from "next/link";
import { prisma } from "@/lib/prisma";
import GalerijaSlika from "@/components/GalerijaSlika";

const apartmani = [
  {
    naziv: "Eva 1",
    opis: "Prizemlje + kat · 2 spavaće sobe · 2 kupaone · dnevna soba s kuhinjom i terasa",
  },
  {
    naziv: "Eva 2",
    opis: "Kat · 2 spavaće sobe · 1 kupaona · dnevna soba s kuhinjom",
  },
  {
    naziv: "Eva 3",
    opis: "Kat · 2 spavaće sobe · 1 kupaona · dnevna soba s kuhinjom",
  },
];

export const dynamic = "force-dynamic";

export default async function EvaPage() {
  const objekt = await prisma.objekt.findFirst({
    where: {
      naziv: "House Eva",
    },
  });

  const slike = objekt
    ? await prisma.slikaObjekta.findMany({
        where: {
          aktivna: true,
          OR: [
            {
              objektId: objekt.id,
            },
            {
              jedinica: {
                objektId: objekt.id,
              },
            },
          ],
        },
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "desc" },
        ],
      })
    : [];

  const heroSlika = slike[0]?.url || "/images/4-malinska.webp";

  return (
    <main className="min-h-screen bg-[#f4efe6]">
      <section
        className="relative h-[62vh] bg-cover bg-center"
        style={{ backgroundImage: `url('${heroSlika}')` }}
      >
        <div className="absolute inset-0 bg-black/40" />

        <div className="relative z-10 flex h-full items-end p-10">
          <div className="text-white">
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-[#d6b36a]">
              Malinska · Otok Krk
            </p>

            <h1 className="text-6xl font-bold">House Eva</h1>

            <p className="mt-3 text-xl">3 apartmana za obiteljski odmor</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-4xl font-bold text-[#2e2923]">
          Apartmani House Eva
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#6f665a]">
          House Eva ima tri apartmana. Eva 1 je raspoređena kroz prizemlje i
          kat, dok su Eva 2 i Eva 3 apartmani na katu.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Apartmani</b>
            <div>3</div>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Spavaće sobe</b>
            <div>2 po apartmanu</div>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Kupaone</b>
            <div>1–2</div>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Kapacitet</b>
            <div>4+2</div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {apartmani.map((a) => (
            <div
              key={a.naziv}
              className="border border-[#e4d6c0] bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
            >
              <h3 className="text-2xl font-bold text-[#2e2923]">
                {a.naziv}
              </h3>

              <p className="mt-3 text-[#6f665a]">{a.opis}</p>
            </div>
          ))}
        </div>

        <section className="mt-14">
          <h2 className="mb-6 text-4xl font-bold text-[#2e2923]">
            Galerija slika
          </h2>

          {slike.length > 0 ? (
            <GalerijaSlika slike={slike} />
          ) : (
            <div className="border border-dashed border-[#d8c7aa] bg-white p-8 text-center text-[#6f665a]">
              Još nema uploadanih slika za House Eva.
            </div>
          )}
        </section>

        <Link
          href="/kalendar?objekt=eva"
          className="mt-10 inline-block bg-[#c79a57] px-7 py-4 font-bold text-white"
        >
          Provjeri dostupnost
        </Link>
      </section>
    </main>
  );
}