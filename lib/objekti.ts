// Statički podaci o objektima koji nisu pohranjeni u bazi
// (adrese, geo koordinate, slike, cjenovni rang).
// SEO tekstovi (title, description, amenities) sad žive u messages/{locale}.json
// pod ključem "SEOObjekti.<slug>" i dohvaćaju se preko next-intl.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

export type ObjektSlug = "eva" | "marty" | "house-art";

export type ObjektPodaci = {
  slug: ObjektSlug;
  punNaziv: string;
  adresa: string;
  postanskiBroj: string;
  mjesto: string;
  drzava: string; // ISO 3166-1 alpha-2 (HR)
  ogImage: string; // putanja relativna na origin (npr. "/images/hero1.jpg")
  canonicalPath: string; // bez locale prefiksa, npr. "/objekti/eva"
  priceRange: string;
  geo: {
    latitude: number;
    longitude: number;
  };
};

export const OBJEKTI_PODACI: Record<ObjektSlug, ObjektPodaci> = {
  eva: {
    slug: "eva",
    punNaziv: "Apartments Eva",
    adresa: "Nikole Tesle 27, Malinska",
    postanskiBroj: "51511",
    mjesto: "Malinska",
    drzava: "HR",
    ogImage: "/images/hero1.jpg",
    canonicalPath: "/objekti/eva",
    priceRange: "€€",
    geo: {
      latitude: 45.12402264305271,
      longitude: 14.532067282880549,
    },
  },
  marty: {
    slug: "marty",
    punNaziv: "Luxury Apartments Marty",
    adresa: "Riječka 45b, Malinska",
    postanskiBroj: "51511",
    mjesto: "Malinska",
    drzava: "HR",
    ogImage: "/images/hero2.jpg",
    canonicalPath: "/objekti/marty",
    priceRange: "€€€",
    geo: {
      latitude: 45.11500376423832,
      longitude: 14.517710784481592,
    },
  },
  "house-art": {
    slug: "house-art",
    punNaziv: "House Art",
    adresa: "Braće Turčić 25a, Malinska",
    postanskiBroj: "51511",
    mjesto: "Malinska",
    drzava: "HR",
    ogImage: "/images/hero3.jpg",
    canonicalPath: "/objekti/house-art",
    priceRange: "€€€",
    geo: {
      latitude: 45.11482568813671,
      longitude: 14.517004516558073,
    },
  },
};

// Mapiraj puni naziv objekta iz baze (Objekt.naziv) na URL slug. Koristi se za
// welcome stranice / linkove (npr. "Apartments Eva" → "eva"). Vraća null ako
// naziv ne odgovara nijednom poznatom objektu.
export function nazivToSlug(naziv: string | null | undefined): ObjektSlug | null {
  const n = String(naziv || "").trim().toLowerCase();
  if (!n) return null;

  // Točni nazivi iz baze (seed): "Apartments Eva", "Luxury Apartments Marty",
  // "House Art". Prvo egzaktno, pa fuzzy kao zaštita od sitnih izmjena naziva.
  if (n === "apartments eva") return "eva";
  if (n === "luxury apartments marty") return "marty";
  if (n === "house art") return "house-art";

  if (n.includes("house art")) return "house-art";
  if (n.includes("marty")) return "marty";
  if (n.includes("eva")) return "eva";

  return null;
}

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

// Vraća URL putanju s prefiksom locale-a, osim za default locale (hr)
// gdje prefiksa nema (kompatibilno s localePrefix: 'as-needed').
function localizedPath(locale: Locale, path: string) {
  if (locale === routing.defaultLocale) return path;
  return `/${locale}${path}`;
}

function buildLanguageAlternates(canonicalPath: string) {
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = localizedPath(loc, canonicalPath);
  }
  languages["x-default"] = canonicalPath;
  return languages;
}

export async function buildObjectMetadata(
  slug: ObjektSlug,
  locale: Locale
): Promise<Metadata> {
  const p = OBJEKTI_PODACI[slug];
  const t = await getTranslations({ locale, namespace: `SEOObjekti.${slug}` });
  const tMeta = await getTranslations({ locale, namespace: "Meta" });

  const title = t("title");
  const description = t("description");
  const canonical = localizedPath(locale, p.canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates(p.canonicalPath),
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: canonical,
      siteName: tMeta("siteName"),
      title,
      description,
      images: [
        {
          url: p.ogImage,
          width: 1200,
          height: 630,
          alt: `${p.punNaziv} – ${p.mjesto}, Krk`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [p.ogImage],
    },
  };
}

// Vraća lokalizirani popis amenities za dani objekt (koristi SEOObjekti.<slug>.amenities array).
export async function getObjectAmenities(
  slug: ObjektSlug,
  locale: Locale
): Promise<string[]> {
  const t = await getTranslations({ locale, namespace: `SEOObjekti.${slug}` });
  // amenities je array u messages JSON-u; next-intl ga eksponira preko raw
  const raw = t.raw("amenities") as unknown;
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}
