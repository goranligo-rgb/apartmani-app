// Statički podaci o objektima koji nisu pohranjeni u bazi
// (adrese, SEO opisi, geo koordinate, sadržaji za structured data).

import type { Metadata } from "next";

export type ObjektSlug = "eva" | "marty" | "house-art";

export type ObjektPodaci = {
  slug: ObjektSlug;
  punNaziv: string;
  adresa: string;
  postanskiBroj: string;
  mjesto: string;
  drzava: string; // ISO 3166-1 alpha-2 (HR)
  seoTitle: string;
  seoDescription: string;
  ogImage: string; // putanja relativna na origin (npr. "/images/hero1.jpg")
  canonicalPath: string;
  priceRange: string;
  amenities: string[];
  // TODO: zamijeniti placeholder koordinatama točnima koordinatama svakog objekta
  geo: {
    latitude: number;
    longitude: number;
  };
};

// Privremene koordinate – sve postavljene na centar Malinske.
// Zamijeniti točnim koordinatama za svaki objekt prije pokretanja.
const MALINSKA_FALLBACK_GEO = {
  latitude: 45.1175,
  longitude: 14.5325,
};

export const OBJEKTI_PODACI: Record<ObjektSlug, ObjektPodaci> = {
  eva: {
    slug: "eva",
    punNaziv: "Apartments Eva",
    adresa: "Nikole Tesle 27, Malinska",
    postanskiBroj: "51511",
    mjesto: "Malinska",
    drzava: "HR",
    seoTitle: "Apartments Eva – Malinska, Krk",
    seoDescription:
      "Apartments Eva u Malinskoj na otoku Krku: 3 apartmana s 2 spavaće sobe, do 6 osoba po jedinici. Direktna rezervacija bez provizija.",
    ogImage: "/images/hero1.jpg",
    canonicalPath: "/objekti/eva",
    priceRange: "€€",
    amenities: [
      "Besplatan WiFi",
      "Klima uređaj",
      "Parking",
      "Terasa",
      "Kuhinja",
      "Strojno pranje rublja",
    ],
    geo: MALINSKA_FALLBACK_GEO,
  },
  marty: {
    slug: "marty",
    punNaziv: "Luxury Apartments Marty",
    adresa: "Riječka 45b, Malinska",
    postanskiBroj: "51511",
    mjesto: "Malinska",
    drzava: "HR",
    seoTitle: "Luxury Apartments Marty – Malinska, Krk",
    seoDescription:
      "Luxury Apartments Marty u Malinskoj na otoku Krku: 5 apartmana s zajedničkim bazenom, idealno za obitelji i veće grupe. Direktna rezervacija.",
    ogImage: "/images/hero2.jpg",
    canonicalPath: "/objekti/marty",
    priceRange: "€€€",
    amenities: [
      "Zajednički bazen",
      "Besplatan WiFi",
      "Klima uređaj",
      "Parking",
      "Terasa / balkon",
      "Kuhinja",
    ],
    geo: MALINSKA_FALLBACK_GEO,
  },
  "house-art": {
    slug: "house-art",
    punNaziv: "House Art",
    adresa: "Braće Turčić 25a, Malinska",
    postanskiBroj: "51511",
    mjesto: "Malinska",
    drzava: "HR",
    seoTitle: "House Art – Privatna kuća u Malinskoj, Krk",
    seoDescription:
      "House Art je privatna kuća u Malinskoj na otoku Krku za do 10 osoba, s 5 spavaćih soba, 3 kupaone i zajedničkim bazenom.",
    ogImage: "/images/hero3.jpg",
    canonicalPath: "/objekti/house-art",
    priceRange: "€€€",
    amenities: [
      "Zajednički bazen",
      "Besplatan WiFi",
      "Klima uređaj",
      "Parking",
      "Vrt",
      "Kuhinja",
      "5 spavaćih soba",
    ],
    geo: MALINSKA_FALLBACK_GEO,
  },
};

export function buildObjectMetadata(slug: ObjektSlug): Metadata {
  const p = OBJEKTI_PODACI[slug];

  return {
    title: p.seoTitle,
    description: p.seoDescription,
    alternates: {
      canonical: p.canonicalPath,
    },
    openGraph: {
      type: "website",
      locale: "hr_HR",
      url: p.canonicalPath,
      siteName: "Malinska Stay",
      title: p.seoTitle,
      description: p.seoDescription,
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
      title: p.seoTitle,
      description: p.seoDescription,
      images: [p.ogImage],
    },
  };
}
