import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import GalerijaSlika from "@/components/GalerijaSlika";
import ObjectLocation from "@/components/ObjectLocation";
import { OBJEKTI_PODACI, buildObjectMetadata } from "@/lib/objekti";

export const metadata: Metadata = buildObjectMetadata("marty");

const apartmaniOpis = [
  {
    naziv: "Marty 1",
    opis: "Prizemlje · 1 spavaća soba · dnevna s kuhinjom · terasa",
  },
  {
    naziv: "Marty 2",
    opis: "Prizemlje · 2 spavaće sobe · 2 kupaone · dnevna · terasa",
  },
  {
    naziv: "Marty 3",
    opis: "1. kat · 1 spavaća soba · dnevna s kuhinjom · balkon",
  },
  {
    naziv: "Marty 4",
    opis: "1. kat · 2 spavaće sobe · 2 kupaone · dnevna · balkon",
  },
  {
    naziv: "Marty 5",
    opis: "2. kat · velika terasa · dnevna s kuhinjom · 3 spavaće sobe · 3 kupaone",
  },
];

const infoKartice = [
  {
    label: "Apartmani",
    value: "5 jedinica",
  },
  {
    label: "Etaže",
    value: "Prizemlje, 1. i 2. kat",
  },
  {
    label: "Bazen",
    value: "Zajednički bazen za Marty apartmane",
  },
  {
    label: "Raspored",
    value: "2 jednosobna · 2 dvosobna · 1 trosobni",
  },
];

type OpremaItem = {
  oprema: {
    naziv: string;
    kategorija: string | null;
    sortOrder: number;
  };
};

function groupOpremaByKategorija(oprema: OpremaItem[]) {
  return oprema.reduce<Record<string, string[]>>((acc, item) => {
    const kategorija = item.oprema.kategorija || "Ostalo";

    if (!acc[kategorija]) {
      acc[kategorija] = [];
    }

    acc[kategorija].push(item.oprema.naziv);

    return acc;
  }, {});
}

function formatKapacitet(osnovni: number, dodatni: number) {
  if (dodatni > 0) {
    return `${osnovni} osobe + ${dodatni} osoba`;
  }
  return `${osnovni} osoba`;
}

export const dynamic = "force-dynamic";

export default async function MartyPage() {
  const objekt = await prisma.objekt.findFirst({
    where: {
      naziv: "Luxury Apartments Marty",
    },
    include: {
      jedinice: {
        orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
        include: {
          oprema: {
            include: {
              oprema: true,
            },
            orderBy: {
              oprema: {
                sortOrder: "asc",
              },
            },
          },
        },
      },
    },
  });

  const slike = objekt
    ? await prisma.slikaObjekta.findMany({
        where: {
          aktivna: true,
          OR: [
            { objektId: objekt.id },
            {
              jedinica: {
                objektId: objekt.id,
              },
            },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      })
    : [];

  // ✅ HERO slike – SAMO aktivne + označene za dashboard + ovog objekta
  const heroImages = slike
    .filter((s) => s.objektId === objekt?.id && s.prikaziNaDashboardu)
    .map((s) => s.url);

  return (
    <main className="min-h-screen bg-[#f4efe6]">
      
      {/* HERO */}
      <section className="relative h-[62vh] overflow-hidden bg-[#0b252b]">
        {heroImages.length > 0 &&
          heroImages.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="absolute inset-0 bg-cover bg-center opacity-0"
              style={{
                backgroundImage: `url(${src})`,
                animation: `heroFade ${heroImages.length * 6}s infinite`,
                animationDelay: `${index * 6}s`,
                willChange: "opacity, transform",
                transform: "translateZ(0)",
              }}
            />
          ))}

        <div className="absolute inset-0 bg-black/40" />

        <div className="absolute left-6 top-6 z-20">
          <Link
            href="/"
            className="inline-block bg-white/90 px-4 py-2 text-sm font-bold text-[#2e2923] shadow hover:bg-white"
          >
            ← Natrag
          </Link>
        </div>

        <div className="absolute bottom-10 left-10 z-20 text-white">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-[#d6b36a]">
            Malinska · Otok Krk
          </p>

          <h1 className="text-6xl font-bold">Luxury Apartments Marty</h1>

          <p className="mt-3 text-xl">5 apartmana · zajednički bazen</p>
        </div>
      </section>

      {/* CONTENT */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-4xl font-bold text-[#2e2923]">
          Apartmani Marty
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#6f665a]">
          Kompleks od 5 apartmana različitih veličina. Svaki apartman ima
          pristup zajedničkom bazenu koji pripada Marty apartmanima.
        </p>

        <ObjectLocation
          address={OBJEKTI_PODACI.marty.adresa}
          title={OBJEKTI_PODACI.marty.punNaziv}
        />

        <section className="mt-10">
          {slike.length > 0 ? (
            <GalerijaSlika slike={slike} />
          ) : (
            <div className="border border-dashed border-[#d8c7aa] bg-white p-8 text-center text-[#6f665a]">
              Još nema uploadanih slika za Luxury Apartments Marty.
            </div>
          )}
        </section>

        <div className="mt-10 grid gap-3 md:grid-cols-4">
          {infoKartice.map((item) => (
            <div
              key={item.label}
              className="border border-[#e4d6c0] bg-white px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.06)]"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9b7b45]">
                {item.label}
              </p>

              <p className="mt-2 text-base font-black leading-snug text-[#2e2923]">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {objekt?.jedinice.map((jedinica) => {
            const opis =
              apartmaniOpis.find((a) => a.naziv === jedinica.naziv)?.opis ||
              "";

            const opremaPoKategoriji = groupOpremaByKategorija(
              jedinica.oprema
            );

            return (
              <div
                key={jedinica.id}
                className="border border-[#e4d6c0] bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-[#2e2923]">
                      {jedinica.naziv}
                    </h3>

                    <p className="mt-3 text-[#6f665a]">{opis}</p>
                  </div>

                  <div className="min-w-[128px] border border-[#e4d6c0] bg-[#f8f2e8] px-3 py-2 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9b7b45]">
                      Kapacitet
                    </p>

                    <p className="mt-1 text-sm font-black leading-snug text-[#2e2923]">
                      {formatKapacitet(
                        jedinica.osnovniKapacitet,
                        jedinica.dodatniKapacitet
                      )}
                    </p>

                    {jedinica.dodatniKapacitet > 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-[#6f665a]">
                        dodatno u dnevnom boravku
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 border-y border-[#eee1cc] py-4 text-sm text-[#6f665a] md:grid-cols-3">
                  <div>
                    <b className="text-[#2e2923]">Spavaće sobe</b>
                    <div>{jedinica.brojSpavacihSoba ?? 0}</div>
                  </div>

                  <div>
                    <b className="text-[#2e2923]">Kupaonice</b>
                    <div>{jedinica.brojKupaona}</div>
                  </div>

                  <div>
                    <b className="text-[#2e2923]">Bazen</b>
                    <div>{jedinica.sharedPool ? "Zajednički" : "Ne"}</div>
                  </div>
                </div>

                {jedinica.oprema.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="text-lg font-black text-[#2e2923]">
                        Oprema apartmana
                      </h4>

                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b7b45]">
                        {jedinica.oprema.length} stavki
                      </span>
                    </div>

                    <div className="space-y-4">
                      {Object.entries(opremaPoKategoriji).map(
                        ([kategorija, items]) => (
                          <div
                            key={kategorija}
                            className="border-t border-[#eadcc5] pt-4"
                          >
                            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#9b7b45]">
                              {kategorija}
                            </p>

                            <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm leading-7 text-[#3b332a]">
                              {items.map((naziv, index) => (
                                <span key={naziv} className="font-semibold">
                                  {naziv}
                                  {index < items.length - 1 && (
                                    <span className="ml-3 text-[#c79a57]">
                                      •
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Link
          href="/kalendar?objekt=marty"
          className="mt-10 inline-block bg-[#c79a57] px-7 py-4 font-bold text-white"
        >
          Provjeri dostupnost
        </Link>
      </section>

      <style>{`
        @keyframes heroFade {
          0% { opacity: 0; transform: scale(1.04); }
          8% { opacity: 1; }
          30% { opacity: 1; }
          40% { opacity: 0; transform: scale(1.10); }
          100% { opacity: 0; }
        }
      `}</style>
    </main>
  );
}