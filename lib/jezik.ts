import type { Locale } from "@/i18n/routing";

// Mapiraj državu (ISO 3166-1 alpha-2 kod ili hrvatski naziv) na jezik gosta.
// Booking import šalje 2-slovni kod ("de", "hr", "it"...).
// Admin "nova rezervacija" NE koristi ovaj helper — bira jezik direktno iz
// dropdown-a. Hrvatski nazivi su tu defenzivno za buduće tokove.
// Nepoznata / prazna država → null (mail layer u PR3 tretira kao "en" fallback).
const MAP: Record<string, Locale> = {
  // hr bucket (uključuje regionalno bliske + slovenski)
  hr: "hr", ba: "hr", rs: "hr", me: "hr", si: "hr",
  "hrvatska": "hr",
  "bosna i hercegovina": "hr",
  "srbija": "hr",
  "crna gora": "hr",
  "slovenija": "hr",

  // de bucket
  de: "de", at: "de", ch: "de", li: "de",
  "njemacka": "de",
  "austrija": "de",
  "svicarska": "de",

  // it bucket
  it: "it", sm: "it", va: "it",
  "italija": "it",

  // hu bucket
  hu: "hu",
  "madjarska": "hu",

  // pl bucket
  pl: "pl",
  "poljska": "pl",

  // cs bucket
  cs: "cs", cz: "cs",
  "ceska": "cs",

  // sk bucket
  sk: "sk",
  "slovacka": "sk",

  // en bucket — države čije jezike ne pokrivamo u routing.locales padaju na en
  nl: "en", be: "en", fr: "en", es: "en", pt: "en",
  se: "en", no: "en", dk: "en", fi: "en",
  gb: "en", uk: "en", ie: "en",
  us: "en", ca: "en", au: "en", nz: "en",
  "nizozemska": "en",
  "belgija": "en",
  "francuska": "en",
  "spanjolska": "en",
  "portugal": "en",
  "svedska": "en",
  "norveska": "en",
  "danska": "en",
  "finska": "en",
  "ujedinjeno kraljevstvo": "en",
  "irska": "en",
  "sjedinjene americke drzave": "en",
  "kanada": "en",
  "australija": "en",
};

export function drzavaUJezik(
  drzava: string | null | undefined
): Locale | null {
  if (!drzava) return null;
  const key = String(drzava).trim().toLowerCase();
  if (!key) return null;
  return MAP[key] ?? null;
}
