import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

const OG_LOCALE: Record<Locale, string> = {
  hr: "hr_HR",
  en: "en_US",
  de: "de_DE",
  it: "it_IT",
  hu: "hu_HU",
  pl: "pl_PL",
  cs: "cs_CZ",
  sk: "sk_SK",
};

const COUNTRY_KEYS = [
  "Hrvatska",
  "Slovenija",
  "Austrija",
  "Njemačka",
  "Italija",
  "Mađarska",
  "Češka",
  "Slovačka",
  "Poljska",
  "Nizozemska",
  "Belgija",
  "Francuska",
  "Švicarska",
  "Bosna i Hercegovina",
  "Srbija",
  "Crna Gora",
  "Sjeverna Makedonija",
  "Danska",
  "Švedska",
  "Norveška",
  "Finska",
  "Ujedinjeno Kraljevstvo",
  "Irska",
  "Španjolska",
  "Portugal",
  "Sjedinjene Američke Države",
  "Kanada",
  "Australija",
] as const;

function localizedPath(locale: Locale, path: string) {
  if (locale === routing.defaultLocale) return path;
  return `/${locale}${path}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Rezervacija.nova" });
  const canonical = localizedPath(locale as Locale, "/rezervacije/nova");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical },
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      type: "website",
      locale: OG_LOCALE[locale as Locale],
    },
  };
}

type SearchParams = Promise<{
  jedinicaId?: string;
  datumOd?: string;
  datumDo?: string;
  iznosUkupno?: string;
  ime?: string;
  prezime?: string;
  email?: string;
  telefon?: string;
  adresa?: string;
  grad?: string;
  drzava?: string;
  brojOsoba?: string;
  napomena?: string;
  error?: string;
}>;

function parseDateOnly(value: string, errMsg: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(errMsg);
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export default async function NovaRezervacijaPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await props.params;

  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const t = await getTranslations("Rezervacija.nova");
  const tCountries = await getTranslations("Countries");

  const defaultDatumOd = searchParams.datumOd || "";
  const defaultDatumDo = searchParams.datumDo || "";
  const defaultIznosUkupno = searchParams.iznosUkupno || "0";

  const jedinice = await prisma.jedinica.findMany({
    include: { objekt: true },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  const localeForAction = locale as Locale;

  async function createReservation(formData: FormData) {
    "use server";

    // Unutar server akcije ponovno dohvati prijevode za locale s kojeg je dolazio request.
    const tAction = await getTranslations({
      locale: localeForAction,
      namespace: "Rezervacija.nova",
    });

    const jedinicaId = String(formData.get("jedinicaId") || "");
    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const telefon = String(formData.get("telefon") || "").trim();
    const adresa = String(formData.get("adresa") || "").trim();
    const grad = String(formData.get("grad") || "").trim();
    const drzava = String(formData.get("drzava") || "").trim();
    const datumOd = String(formData.get("datumOd") || "");
    const datumDo = String(formData.get("datumDo") || "");
    const brojOsoba = Number(formData.get("brojOsoba") || 1);
    const iznosUkupno = Number(formData.get("iznosUkupno") || 0);
    const napomena = String(formData.get("napomena") || "").trim();

    if (
      !jedinicaId ||
      !ime ||
      !prezime ||
      !email ||
      !telefon ||
      !adresa ||
      !grad ||
      !drzava ||
      !datumOd ||
      !datumDo ||
      !iznosUkupno
    ) {
      throw new Error(tAction("errMissingFields"));
    }

    const od = parseDateOnly(datumOd, tAction("errInvalidDate"));
    const doDatuma = parseDateOnly(datumDo, tAction("errInvalidDate"));

    if (od >= doDatuma) {
      throw new Error(tAction("errDateOrder"));
    }

    const brojNocenja = Math.ceil(
      (doDatuma.getTime() - od.getTime()) / 86400000
    );

    const jedinica = await prisma.jedinica.findUnique({
      where: { id: jedinicaId },
      select: {
        naziv: true,
        osnovniKapacitet: true,
        dodatniKapacitet: true,
        ukupniKapacitet: true,
      },
    });

    if (!jedinica) {
      throw new Error(tAction("errUnitNotFound"));
    }

    const kapacitet =
      Number(jedinica.ukupniKapacitet || 0) ||
      Number(jedinica.osnovniKapacitet || 0) +
        Number(jedinica.dodatniKapacitet || 0);

    const prefix =
      localeForAction === routing.defaultLocale ? "" : `/${localeForAction}`;

    if (kapacitet > 0 && brojOsoba > kapacitet) {
      const params = new URLSearchParams({
        jedinicaId,
        ime,
        prezime,
        email,
        telefon,
        adresa,
        grad,
        drzava,
        datumOd,
        datumDo,
        brojOsoba: String(brojOsoba),
        iznosUkupno: String(iznosUkupno),
        napomena,
        error: tAction("errCapacity", {
          naziv: jedinica.naziv,
          kapacitet,
          brojOsoba,
        }),
      });

      redirect(`${prefix}/rezervacije/nova?${params.toString()}`);
    }

    const postojiPreklapanje = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId,
        status: { not: "OTKAZANO" },
        obrisanoAt: null,
        datumOd: { lt: doDatuma },
        datumDo: { gt: od },
      },
    });

    if (postojiPreklapanje) {
      throw new Error(tAction("errOverlap"));
    }

    const params = new URLSearchParams({
      jedinicaId,
      ime,
      prezime,
      email,
      telefon,
      adresa,
      grad,
      drzava,
      datumOd,
      datumDo,
      brojOsoba: String(brojOsoba),
      brojNocenja: String(brojNocenja),
      iznosUkupno: String(iznosUkupno),
      napomena,
    });

    redirect(`${prefix}/rezervacije/pregled?${params.toString()}`);
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="mx-auto max-w-3xl border border-white/70 bg-white p-8 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
        <h1 className="text-3xl font-bold text-[#2e2923]">{t("title")}</h1>

        <p className="mt-2 text-[#6f665a]">{t("subtitle")}</p>

        {searchParams.error && (
          <div className="mt-5 border border-red-300 bg-red-50 p-4 font-bold text-red-800">
            {searchParams.error}
          </div>
        )}

        <form action={createReservation} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-bold text-[#2e2923]">
              {t("labelJedinica")}
            </label>

            <select
              name="jedinicaId"
              defaultValue={searchParams.jedinicaId || ""}
              className="w-full cursor-pointer border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold outline-none"
              required
            >
              <option value="">{t("selectJedinica")}</option>
              {jedinice.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.objekt.naziv} — {j.naziv}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelDatumOd")}
              </label>

              <input
                name="datumOd"
                type="date"
                defaultValue={defaultDatumOd}
                readOnly
                className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelDatumDo")}
              </label>

              <input
                name="datumDo"
                type="date"
                defaultValue={defaultDatumDo}
                readOnly
                className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold outline-none"
                required
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelIme")}
              </label>

              <input
                name="ime"
                defaultValue={searchParams.ime || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelPrezime")}
              </label>

              <input
                name="prezime"
                defaultValue={searchParams.prezime || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelEmail")}
              </label>

              <input
                name="email"
                type="email"
                defaultValue={searchParams.email || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelTelefon")}
              </label>

              <input
                name="telefon"
                defaultValue={searchParams.telefon || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#2e2923]">
              {t("labelAdresa")}
            </label>

            <input
              name="adresa"
              defaultValue={searchParams.adresa || ""}
              className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
              required
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelGrad")}
              </label>

              <input
                name="grad"
                defaultValue={searchParams.grad || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelDrzava")}
              </label>

              <select
                name="drzava"
                defaultValue={searchParams.drzava || "Hrvatska"}
                className="w-full cursor-pointer border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              >
                <option value="" disabled>
                  {t("selectDrzava")}
                </option>

                {COUNTRY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {tCountries(key)}
                  </option>
                ))}
              </select>

              <p className="mt-1 text-xs text-[#7b6f62]">{t("drzavaHelp")}</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelBrojOsoba")}
              </label>

              <input
                name="brojOsoba"
                type="number"
                min={1}
                defaultValue={searchParams.brojOsoba || "2"}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                {t("labelIznos")}
              </label>

              <input
                name="iznosUkupno"
                type="number"
                step="0.01"
                defaultValue={defaultIznosUkupno}
                readOnly
                className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold text-[#2e2923] outline-none"
                required
              />

              <p className="mt-1 text-xs text-[#7b6f62]">{t("iznosHelp")}</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#2e2923]">
              {t("labelNapomena")}
            </label>

            <textarea
              name="napomena"
              rows={4}
              defaultValue={searchParams.napomena || ""}
              className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-6 py-3 font-bold text-white transition hover:brightness-95"
            >
              {t("submit")}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
