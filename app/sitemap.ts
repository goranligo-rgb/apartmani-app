import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = "https://malinska-stay.hr";

function localized(path: string, locale: string) {
  if (locale === routing.defaultLocale) {
    return path === "/" ? `${BASE_URL}/` : `${BASE_URL}${path}`;
  }
  return path === "/" ? `${BASE_URL}/${locale}` : `${BASE_URL}/${locale}${path}`;
}

function buildAlternates(path: string) {
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = localized(path, loc);
  }
  return languages;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const homeAlternates = buildAlternates("/");

  const entries: MetadataRoute.Sitemap = [];

  for (const loc of routing.locales) {
    entries.push({
      url: localized("/", loc),
      lastModified: now,
      changeFrequency: "monthly",
      priority: loc === routing.defaultLocale ? 1.0 : 0.8,
      alternates: { languages: homeAlternates },
    });
  }

  entries.push({
    url: `${BASE_URL}/objekti/eva`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.9,
  });

  entries.push({
    url: `${BASE_URL}/objekti/marty`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.9,
  });

  entries.push({
    url: `${BASE_URL}/objekti/house-art`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.9,
  });

  entries.push({
    url: `${BASE_URL}/rezervacije/nova`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  });

  return entries;
}
