import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import SiteHeader from "@/components/SiteHeader";

const fallbackHeroImages = [
  "/images/hero1.jpg",
  "/images/hero2.jpg",
  "/images/hero3.jpg",
  "/images/hero4.jpg",
];

const OBJEKTI_KEYS = [
  { key: "houseArt", href: "/objekti/house-art" },
  { key: "marty", href: "/objekti/marty" },
  { key: "eva", href: "/objekti/eva" },
] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  await prisma.slikaObjekta.findMany({
    where: {
      aktivna: true,
      prikaziNaPocetnoj: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const heroImages = fallbackHeroImages;
  const t = await getTranslations("Home");
  const tFooter = await getTranslations("Footer");

  return (
    <main
      className="min-h-screen bg-[#f4efe6]"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <SiteHeader />

      <section className="relative min-h-[86vh] overflow-hidden pt-[180px] md:pt-[224px]">
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
              {t("heroEyebrow")}
            </p>

            <h1 className="text-5xl font-bold leading-none md:text-8xl">
              {t("heroTitle")}
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90 md:mt-6 md:text-xl">
              {t("heroSubtitle")}
            </p>

            <div className="mt-6 grid gap-3 text-sm font-bold text-white/95 md:flex md:flex-wrap md:items-center md:gap-4">
              <a
                href="tel:+38598700415"
                className="border border-white/30 bg-black/25 px-4 py-3 backdrop-blur transition hover:bg-white/15"
              >
                {t("heroPhoneLabel")}
              </a>

              <a
                href="mailto:rezervacije@malinska-stay.hr"
                className="border border-white/30 bg-black/25 px-4 py-3 backdrop-blur transition hover:bg-white/15"
              >
                {t("heroEmail")}
              </a>
            </div>

            <div className="mt-7 grid gap-3 md:mt-8 md:flex md:flex-wrap md:gap-4">
              <Link
                href="/kalendar"
                className="border border-[#caa870] bg-[#c79a57] px-7 py-4 text-center font-bold text-white transition hover:brightness-95"
              >
                {t("heroCtaCalendar")}
              </Link>

              <a
                href="#objekti"
                className="border border-white/70 bg-white/10 px-7 py-4 text-center font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                {t("heroCtaObjekti")}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="objekti" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.28em] text-[#9b7a4c]">
              {t("sectionEyebrow")}
            </p>

            <h2 className="text-4xl font-bold text-[#2e2923]">
              {t("sectionTitle")}
            </h2>

            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#6f665a]">
              {t("sectionDescription")}
            </p>
          </div>

          <div className="border border-[#e4d6c0] bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <div className="text-lg font-bold text-[#2e2923]">
              {t("quickOverviewTitle")}
            </div>

            <div className="mt-4 space-y-3 text-sm text-[#6f665a]">
              <div>✓ {t("quickOverview.houseArt")}</div>
              <div>✓ {t("quickOverview.marty")}</div>
              <div>✓ {t("quickOverview.eva")}</div>
              <div>✓ {t("quickOverview.calendar")}</div>
              <div>
                ✓ {t("phoneLabel")}{" "}
                <a
                  href="tel:+38598700415"
                  className="font-bold text-[#9b6b12] hover:underline"
                >
                  +385 98 700 415
                </a>
              </div>
              <div>
                ✓ {t("emailLabel")}{" "}
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
          {OBJEKTI_KEYS.map((objekt, index) => (
            <Link
              key={objekt.key}
              href={objekt.href}
              className="group border border-white/80 bg-white p-7 shadow-[0_12px_35px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
              style={{
                animation: "cardUp 700ms ease both",
                animationDelay: `${index * 120}ms`,
              }}
            >
              <div className="mb-5 text-sm font-bold uppercase tracking-[0.22em] text-[#c79a57]">
                {t("objektNumberPrefix")} 0{index + 1}
              </div>

              <h3 className="text-2xl font-bold text-[#2e2923]">
                {t(`objekti.${objekt.key}.naziv`)}
              </h3>

              <div className="mt-3 border-l-4 border-[#c79a57] pl-4 text-sm font-bold text-[#5f5549]">
                {t(`objekti.${objekt.key}.info`)}
              </div>

              <p className="mt-5 min-h-[96px] text-base leading-relaxed text-[#6f665a]">
                {t(`objekti.${objekt.key}.opis`)}
              </p>

              <div className="mt-7 font-bold text-[#9b6b12]">
                {t("openObjekt")}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#e4d6c0] bg-[#0b252b] px-6 py-10 text-center text-white">
        <div className="text-xl font-bold tracking-[0.18em]">
          {tFooter("brand")}
        </div>

        <div className="mt-3 text-sm uppercase tracking-[0.25em] text-[#d6b36a]">
          {tFooter("tagline")}
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
