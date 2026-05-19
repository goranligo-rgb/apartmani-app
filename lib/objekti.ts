// Statički podaci o objektima koji nisu pohranjeni u bazi
// (adrese, SEO opisi za metadata na detail stranicama).

import type { Metadata } from "next";

export type ObjektSlug = "eva" | "marty" | "house-art";

export type ObjektPodaci = {
  slug: ObjektSlug;
  punNaziv: string;
  adresa: string;
  mjesto: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string; // putanja relativna na origin (npr. "/images/hero1.jpg")
  canonicalPath: string;
};

export const OBJEKTI_PODACI: Record<ObjektSlug, ObjektPodaci> = {
  eva: {
    slug: "eva",
    punNaziv: "Apartments Eva",
    adresa: "Nikole Tesle 27, Malinska",
    mjesto: "Malinska",
    seoTitle: "Apartments Eva – Malinska, Krk",
    seoDescription:
      "Apartments Eva u Malinskoj na otoku Krku: 3 apartmana s 2 spavaće sobe, do 6 osoba po jedinici. Direktna rezervacija bez provizija.",
    ogImage: "/images/hero1.jpg",
    canonicalPath: "/objekti/eva",
  },
  marty: {
    slug: "marty",
    punNaziv: "Luxury Apartments Marty",
    adresa: "Riječka 45b, Malinska",
    mjesto: "Malinska",
    seoTitle: "Luxury Apartments Marty – Malinska, Krk",
    seoDescription:
      "Luxury Apartments Marty u Malinskoj na otoku Krku: 5 apartmana s zajedničkim bazenom, idealno za obitelji i veće grupe. Direktna rezervacija.",
    ogImage: "/images/hero2.jpg",
    canonicalPath: "/objekti/marty",
  },
  "house-art": {
    slug: "house-art",
    punNaziv: "House Art",
    adresa: "Braće Turčić 25a, Malinska",
    mjesto: "Malinska",
    seoTitle: "House Art – Privatna kuća u Malinskoj, Krk",
    seoDescription:
      "House Art je privatna kuća u Malinskoj na otoku Krku za do 10 osoba, s 5 spavaćih soba, 3 kupaone i zajedničkim bazenom.",
    ogImage: "/images/hero3.jpg",
    canonicalPath: "/objekti/house-art",
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
