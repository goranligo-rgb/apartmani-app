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
  await prisma.slikaObjekta.findMany({
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
      <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-[#071e24]/95 text-white backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10">

          <Link
            href="/"
            className="flex h-[88px] flex-1 items-center px-5"
          >
            <div>
              <div className="text-[22px] font-black tracking-[0.16em] md:text-[30px]">
                MALINSKA
              </div>

              <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-[#caa870] md:text-xs">
                Apartments & Experience
              </div>
            </div>
          </Link>

          <div className="flex">
            <Link
              href="/posebne-prilike"
              className="posebne-btn flex h-[88px] w-[122px] items-center justify-center px-3 text-center text-[11px] font-black uppercase leading-tight text-white md:w-[160px] md:text-sm"
            >
              Posebne
              <br />
              prilike
            </Link>

            <Link
              href="/kalendar"
              className="flex h-[88px] w-[110px] items-center justify-center bg-[#c79a57] px-3 text-center text-[11px] font-black uppercase leading-tight text-white transition hover:brightness-95 md:w-[150px] md:text-sm"
            >
              Book
              <br />
              now
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 text-center text-[12px] font-black uppercase tracking-wide md:text-sm">
          {objekti.map((o) => (
            <Link
              key={o.naziv}
              href={o.href}
              className="flex min-h-[96px] items-center justify-center border-r border-white/10 bg-[#071e24]/95 px-3 py-4 leading-snug transition hover:bg-white/10 md:min-h-[110px]"
            >
              {o.naziv}
            </Link>
          ))}
        </div>
      </header>

      <section className="relative min-h-[86vh] overflow-hidden pt-[184px] md:pt-[200px]">
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

        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/70" />

        <div className="relative z-10 flex min-h-[calc(92vh-174px)] items-end px-6 pb-12 md:min-h-[72vh] md:px-20 md:pb-16">
          <div className="max-w-4xl text-white">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-[#d6b36a] md:mb-4 md:text-sm md:tracking-[0.35em]">
              Otok Krk · Hrvatska
            </p>

            <h1 className="text-5xl font-bold leading-none md:text-8xl">
              Malinska
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90 md:mt-6 md:text-xl">
              Odaberite House Art, Luxury Apartments Marty ili Apartments Eva i
              provjerite slobodne termine, cijene i dostupnost.
            </p>

            <div className="mt-6 grid gap-3 text-sm font-bold text-white/95 md:flex md:flex-wrap md:items-center md:gap-4">
              <a
                href="tel:+38598700415"
                className="border border-white/30 bg-black/25 px-4 py-3 backdrop-blur transition hover:bg-white/15"
              >
                Rezervacije: +385 98 700 415
              </a>

              <a
                href="mailto:rezervacije@malinska-stay.hr"
                className="border border-white/30 bg-black/25 px-4 py-3 backdrop-blur transition hover:bg-white/15"
              >
                rezervacije@malinska-stay.hr
              </a>
            </div>

            <div className="mt-7 grid gap-3 md:mt-8 md:flex md:flex-wrap md:gap-4">
              <Link
                href="/kalendar"
                className="border border-[#caa870] bg-[#c79a57] px-7 py-4 text-center font-bold text-white transition hover:brightness-95"
              >
                Pogledaj kalendar
              </Link>

              <a
                href="#objekti"
                className="border border-white/70 bg-white/10 px-7 py-4 text-center font-bold text-white backdrop-blur transition hover:bg-white/20"
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
                  className="font-bold text-[#9b6b12] hover:underline"
                >
                  +385 98 700 415
                </a>
              </div>
              <div>
                ✓ Email:{" "}
                <a
                  href="mailto:rezervacije@malinska-stay.hr"
                  className="font-bold text-[#9b6b12] hover:underline"
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
              className="group border border-white/80 bg-white p-7 shadow-[0_12px_35px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
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
            className="border border-white/20 px-4 py-2 transition hover:bg-white/10"
          >
            +385 98 700 415
          </a>

          <a
            href="mailto:rezervacije@malinska-stay.hr"
            className="border border-white/20 px-4 py-2 transition hover:bg-white/10"
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
          background: linear-gradient(270deg, #0b3f4a, #00c8bd, #0b3f4a);
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