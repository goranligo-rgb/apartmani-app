import Link from "next/link";
import { prisma } from "@/lib/prisma";

const fallbackHeroImages = [
  "/images/hero1.jpg",
  "/images/hero2.jpg",
  "/images/hero3.jpg",
  "/images/hero4.jpg",
];

const objekti = [
  {
    naziv: "House Art",
    href: "/objekti/house-art",
    opis: "Privatna kuća za do 10 osoba, 5 spavaćih soba, 3 kupaone i privatni bazen samo za goste kuće House Art.",
    info: "1 kuća · 5 soba · 3 kupaone · privatni bazen",
  },
  {
    naziv: "Luxury Apartments Marty",
    href: "/objekti/marty",
    opis: "Pet apartmana različitih kapaciteta, idealno za obitelji i veće grupe. Objekt ima vlastiti bazen za goste apartmana Marty.",
    info: "5 apartmana · 1–3 sobe · 1–3 kupaone · bazen",
  },
  {
    naziv: "Apartments Eva",
    href: "/objekti/eva",
    opis: "Tri apartmana za 4+2 osobe, svaki s dvije spavaće sobe i jednom ili dvije kupaone.",
    info: "3 apartmana · 2 sobe · 1–2 kupaone",
  },
];

export default async function HomePage() {
  const slikeIzBaze = await prisma.slikaObjekta.findMany({
    where: {
      aktivna: true,
      prikaziNaPocetnoj: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const heroImages = fallbackHeroImages;

  return (
    <main
      className="min-h-screen bg-[#f4efe6]"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-[#0b252b]/95 text-white backdrop-blur">
        <div className="grid grid-cols-3 items-center">
          <div />

          <div className="text-center">
            <div className="text-2xl font-bold tracking-[0.25em]">
              MALINSKA
            </div>
            <div className="text-xs uppercase tracking-[0.35em] text-[#d6b36a]">
              Apartments & Houses
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href="/posebne-prilike"
              className="posebne-btn h-16 cursor-pointer bg-[#0b3f4a] px-8 py-5 text-sm font-bold uppercase text-white"
            >
              Posebne prilike
            </Link>

            <Link
              href="/kalendar"
              className="h-16 cursor-pointer bg-[#c79a57] px-8 py-5 text-sm font-bold uppercase text-white transition hover:brightness-95"
            >
              Book now
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-white/10 text-center text-sm font-bold uppercase tracking-wide">
          {objekti.map((o) => (
            <Link
              key={o.naziv}
              href={o.href}
              className="cursor-pointer border-r border-white/10 px-4 py-3 transition hover:bg-white/10"
            >
              {o.naziv}
            </Link>
          ))}
        </div>
      </header>

      <section className="relative min-h-[86vh] overflow-hidden pt-28">
        {heroImages.map((src, index) => (
          <div
            key={`${src}-${index}`}
            className="absolute inset-0 bg-cover bg-center opacity-0"
            style={{
              backgroundImage: `url(${src})`,
              animation: `heroFade ${heroImages.length * 6}s infinite`,
              animationDelay: `${index * 6}s`,
            }}
          />
        ))}

        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/65" />

        <div className="relative z-10 flex min-h-[72vh] items-end px-8 pb-16 md:px-20">
          <div className="max-w-4xl text-white">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.35em] text-[#d6b36a]">
              Otok Krk · Hrvatska
            </p>

            <h1 className="text-6xl font-bold leading-none md:text-8xl">
              Malinska
            </h1>

            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white/90">
              Odaberite House Art, Luxury Apartments Marty ili Apartments Eva i
              provjerite slobodne termine, cijene i dostupnost.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm font-bold text-white/95">
              <a
                href="tel:+38598700415"
                className="cursor-pointer border border-white/30 bg-black/20 px-4 py-2 backdrop-blur transition hover:bg-white/15"
              >
                Rezervacije: +385 98 700 415
              </a>

              <a
                href="mailto:rezervacije@malinska-stay.hr"
                className="cursor-pointer border border-white/30 bg-black/20 px-4 py-2 backdrop-blur transition hover:bg-white/15"
              >
                rezervacije@malinska-stay.hr
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/kalendar"
                className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-7 py-4 font-bold text-white transition hover:brightness-95"
              >
                Pogledaj kalendar
              </Link>

              <a
                href="#objekti"
                className="cursor-pointer border border-white/70 bg-white/10 px-7 py-4 font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                Pogledaj objekte
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="objekti" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.28em] text-[#9b7a4c]">
              Smještaj u Malinskoj
            </p>

            <h2 className="text-4xl font-bold text-[#2e2923]">
              Tri objekta za obiteljski odmor
            </h2>

            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#6f665a]">
              Malinska je mirno mjesto na zapadnoj strani otoka Krka, poznato po
              šetnicama uz more, plažama, restoranima i ugodnoj atmosferi za
              obiteljski odmor.
            </p>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <div className="text-lg font-bold text-[#2e2923]">
              Brzi pregled
            </div>

            <div className="mt-4 space-y-3 text-sm text-[#6f665a]">
              <div>✓ House Art — kuća za 10 osoba + privatni bazen</div>
              <div>✓ Marty — 5 apartmana + bazen za goste Martyja</div>
              <div>✓ Eva — 3 apartmana za 4+2 osobe</div>
              <div>✓ Online kalendar dostupnosti</div>
              <div>
                ✓ Rezervacije:{" "}
                <a
                  href="tel:+38598700415"
                  className="cursor-pointer font-bold text-[#9b6b12] hover:underline"
                >
                  +385 98 700 415
                </a>
              </div>
              <div>
                ✓ Email:{" "}
                <a
                  href="mailto:rezervacije@malinska-stay.hr"
                  className="cursor-pointer font-bold text-[#9b6b12] hover:underline"
                >
                  rezervacije@malinska-stay.hr
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {objekti.map((objekt, index) => (
            <Link
              key={objekt.naziv}
              href={objekt.href}
              className="group cursor-pointer border border-white/80 bg-white p-7 shadow-[0_12px_35px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
              style={{
                animation: "cardUp 700ms ease both",
                animationDelay: `${index * 120}ms`,
              }}
            >
              <div className="mb-5 text-sm font-bold uppercase tracking-[0.22em] text-[#c79a57]">
                Objekt 0{index + 1}
              </div>

              <h3 className="text-2xl font-bold text-[#2e2923]">
                {objekt.naziv}
              </h3>

              <div className="mt-3 border-l-4 border-[#c79a57] pl-4 text-sm font-bold text-[#5f5549]">
                {objekt.info}
              </div>

              <p className="mt-5 min-h-[96px] text-base leading-relaxed text-[#6f665a]">
                {objekt.opis}
              </p>

              <div className="mt-7 font-bold text-[#9b6b12]">
                Otvori objekt →
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#e4d6c0] bg-[#0b252b] px-6 py-10 text-center text-white">
        <div className="text-xl font-bold tracking-[0.18em]">MALINSKA</div>

        <div className="mt-3 text-sm uppercase tracking-[0.25em] text-[#d6b36a]">
          Apartments & Houses
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm font-bold">
          <a
            href="tel:+38598700415"
            className="cursor-pointer border border-white/20 px-4 py-2 transition hover:bg-white/10"
          >
            +385 98 700 415
          </a>

          <a
            href="mailto:rezervacije@malinska-stay.hr"
            className="cursor-pointer border border-white/20 px-4 py-2 transition hover:bg-white/10"
          >
            rezervacije@malinska-stay.hr
          </a>
        </div>
      </footer>

      <style>{`
        @keyframes heroFade {
          0% { opacity: 0; transform: scale(1.04); }
          8% { opacity: 1; }
          30% { opacity: 1; }
          40% { opacity: 0; transform: scale(1.10); }
          100% { opacity: 0; }
        }

        @keyframes cardUp {
          from { opacity: 0; transform: translateY(22px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .posebne-btn {
          background: linear-gradient(270deg, #0b3f4a, #00e0d2, #0b3f4a);
          background-size: 300% 300%;
          animation: posebneGlow 3s ease infinite;
        }

        @keyframes posebneGlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </main>
  );
}