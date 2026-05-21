import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import GalerijaSlika from "@/components/GalerijaSlika";
import ObjectLocation from "@/components/ObjectLocation";
import ObjectStructuredData from "@/components/ObjectStructuredData";
import {
  OBJEKTI_PODACI,
  buildObjectMetadata,
  type ObjektSlug,
} from "@/lib/objekti";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const SLUG: ObjektSlug = "marty";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) return {};

  return buildObjectMetadata(SLUG, locale as Locale);
}

export const dynamic = "force-dynamic";

export default async function MartyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const t = await getTranslations("Objekti.marty");
  const tCommon = await getTranslations("Objekti.common");
  const tBack = await getTranslations("Common");
  const tOprema = await getTranslations("DbOprema");
  const tKategorija = await getTranslations("DbKategorija");
  const tJedinica = await getTranslations("DbJedinica");

  const objekt = await prisma.objekt.findFirst({
    where: { naziv: "Luxury Apartments Marty" },
    include: {
      jedinice: {
        orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
        include: {
          oprema: {
            include: { oprema: true },
            orderBy: { oprema: { sortOrder: "asc" } },
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
            { jedinica: { objektId: objekt.id } },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      })
    : [];

  const heroImages = slike
    .filter((s) => s.objektId === objekt?.id && s.prikaziNaDashboardu)
    .map((s) => s.url);

  const tr = (
    fn:
      | typeof tOprema
      | typeof tKategorija
      | typeof tJedinica,
    key: string
  ): string => (fn.has(key) ? fn(key) : key);

  const opisJedinice = (naziv: string): string =>
    t.has(`apartmaniOpis.${naziv}`) ? t(`apartmaniOpis.${naziv}`) : "";

  const formatKapacitet = (osnovni: number, dodatni: number) =>
    dodatni > 0
      ? tCommon("kapacitetSDodatnim", { base: osnovni, extra: dodatni })
      : tCommon("kapacitetSamo", { count: osnovni });

  const infoKartice = [
    { label: t("infoApartmaniLabel"), value: t("infoApartmaniValue") },
    { label: t("infoEtazeLabel"), value: t("infoEtazeValue") },
    { label: t("infoBazenLabel"), value: t("infoBazenValue") },
    { label: t("infoRasporedLabel"), value: t("infoRasporedValue") },
  ];

  return (
    <main className="min-h-screen bg-[#f4efe6]">
      <ObjectStructuredData slug={SLUG} locale={locale as Locale} />

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
            {tBack("back")}
          </Link>
        </div>

        <div className="absolute bottom-10 left-10 z-20 text-white">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-[#d6b36a]">
            {tCommon("eyebrow")}
          </p>

          <h1 className="text-6xl font-bold">{OBJEKTI_PODACI[SLUG].punNaziv}</h1>

          <p className="mt-3 text-xl">{t("heroSubtitle")}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-4xl font-bold text-[#2e2923]">
          {t("sectionTitle")}
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#6f665a]">
          {t("intro")}
        </p>

        <ObjectLocation
          address={OBJEKTI_PODACI[SLUG].adresa}
          title={OBJEKTI_PODACI[SLUG].punNaziv}
        />

        <section className="mt-10">
          {slike.length > 0 ? (
            <GalerijaSlika slike={slike} />
          ) : (
            <div className="border border-dashed border-[#d8c7aa] bg-white p-8 text-center text-[#6f665a]">
              {tCommon("noImages", { naziv: OBJEKTI_PODACI[SLUG].punNaziv })}
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
            const opis = opisJedinice(jedinica.naziv);
            const opremaPoKategoriji = groupOpremaByKategorija(jedinica.oprema);

            return (
              <div
                key={jedinica.id}
                className="border border-[#e4d6c0] bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-[#2e2923]">
                      {tr(tJedinica, jedinica.naziv)}
                    </h3>

                    <p className="mt-3 text-[#6f665a]">{opis}</p>
                  </div>

                  <div className="min-w-[128px] border border-[#e4d6c0] bg-[#f8f2e8] px-3 py-2 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9b7b45]">
                      {tCommon("kapacitet")}
                    </p>

                    <p className="mt-1 text-sm font-black leading-snug text-[#2e2923]">
                      {formatKapacitet(
                        jedinica.osnovniKapacitet,
                        jedinica.dodatniKapacitet
                      )}
                    </p>

                    {jedinica.dodatniKapacitet > 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-[#6f665a]">
                        {tCommon("extraGuestsNote")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 border-y border-[#eee1cc] py-4 text-sm text-[#6f665a] md:grid-cols-3">
                  <div>
                    <b className="text-[#2e2923]">{tCommon("bedrooms")}</b>
                    <div>{jedinica.brojSpavacihSoba ?? 0}</div>
                  </div>

                  <div>
                    <b className="text-[#2e2923]">{tCommon("bathrooms")}</b>
                    <div>{jedinica.brojKupaona}</div>
                  </div>

                  <div>
                    <b className="text-[#2e2923]">{tCommon("pool")}</b>
                    <div>
                      {jedinica.sharedPool
                        ? tCommon("shared")
                        : tCommon("no")}
                    </div>
                  </div>
                </div>

                {jedinica.oprema.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="text-lg font-black text-[#2e2923]">
                        {tCommon("amenitiesTitle")}
                      </h4>

                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b7b45]">
                        {tCommon("amenitiesCount", {
                          count: jedinica.oprema.length,
                        })}
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
                              {tr(tKategorija, kategorija)}
                            </p>

                            <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm leading-7 text-[#3b332a]">
                              {items.map((naziv, index) => (
                                <span key={naziv} className="font-semibold">
                                  {tr(tOprema, naziv)}
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
          href={`/kalendar?objekt=${SLUG}`}
          className="mt-10 inline-block bg-[#c79a57] px-7 py-4 font-bold text-white"
        >
          {tCommon("checkAvailability")}
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
