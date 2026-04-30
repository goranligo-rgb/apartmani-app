import Link from "next/link";
import { prisma } from "@/lib/prisma";
import GalerijaSlika from "@/components/GalerijaSlika";

const detalji = [
  {
    naziv: "Master soba",
    opis: "Master bedroom s vlastitom kupaonom.",
  },
  {
    naziv: "Prvi kat",
    opis: "2 spavaće sobe + 1 kupaona.",
  },
  {
    naziv: "Drugi kat",
    opis: "2 spavaće sobe + 1 kupaona.",
  },
];

export const dynamic = "force-dynamic";

export default async function HouseArtPage() {
  const objekt = await prisma.objekt.findFirst({
    where: {
      naziv: "House Art",
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

  const heroSlika = slike[0]?.url || "/images/2-malinska.webp";

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

            <h1 className="text-6xl font-bold">House Art</h1>

            <p className="mt-3 text-xl">
              Privatna kuća za do 10 osoba · zajednički bazen
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-4xl font-bold text-[#2e2923]">
          House Art
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#6f665a]">
          House Art je privatna kuća za obiteljski odmor s 5 spavaćih soba,
          3 kupaone i zajedničkim bazenom koji dijeli s objektom Luxury
          Apartments Marty.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Tip</b>
            <div>Privatna kuća</div>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Spavaće sobe</b>
            <div>5</div>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Kupaone</b>
            <div>3</div>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <b>Kapacitet</b>
            <div>10 osoba</div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {detalji.map((d) => (
            <div
              key={d.naziv}
              className="border border-[#e4d6c0] bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
            >
              <h3 className="text-2xl font-bold text-[#2e2923]">
                {d.naziv}
              </h3>

              <p className="mt-3 text-[#6f665a]">{d.opis}</p>
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
              Još nema uploadanih slika za House Art.
            </div>
          )}
        </section>

        <Link
          href="/kalendar?objekt=house-art"
          className="mt-10 inline-block bg-[#c79a57] px-7 py-4 font-bold text-white"
        >
          Provjeri dostupnost
        </Link>
      </section>
    </main>
  );
}