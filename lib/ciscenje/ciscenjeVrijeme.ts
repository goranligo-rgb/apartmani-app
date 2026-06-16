// ── Vrijeme početka čišćenja — JEDINI izvor istine ──
//
// Po uzoru na `daniCiscenja.ts`: logika koja bi se inače duplicirala u 4
// datoteke (generirajINaPosalji.ts, nadopunaRaspored.ts, ciscenje-pdf/page.tsx,
// ciscenje/page.tsx) živi ovdje, pa se ne može razići. Čista funkcija (bez
// prisma/IO).
//
// "Čišćenje od" = vrijeme kad čistačice mogu početi (stupac u mailu/PDF-u).
// Vrijednost se računa kao:  per-slučaj override  ??  FIKSNI default "10:00".
//   - default: tvrdo kodirano "10:00" (NE čita se više iz postavki — polja
//     CiscenjeMailPostavke.ciscenjeOdSat/Minuta su sada MRTVA).
//   - per-slučaj override: Rezervacija.ciscenjeOdOverride ("HH:MM"), uređuje se
//     po kartici završnog čišćenja u /admin/ciscenje.
//
// Pravilo: vrijeme se prikazuje SAMO za ZAVRSNO_CISCENJE; svi ostali tipovi
// (bazen/stubište = DODATNO_CISCENJE, te međučišćenje) vraćaju "-".

// Fiksni default — kad rezervacija nema svoj override.
export const CISCENJE_OD_DEFAULT = "10:00";

// UTC ponoć kalendarskog datuma (TZ-safe "day key").
//
// Datumi u bazi (datumDo/datumOd) spremljeni su kao UTC PODNE hrvatskog dana,
// pa su UTC komponente == hrvatski datum. Vraćamo UTC ponoć tog datuma — ista
// konvencija koju koriste `startOfTodayInZagreb()` (lib/dates.ts) i stranica
// /admin/troskovi (Date.UTC granice mjeseca + getUTCDate prikaz).
//
// Zašto NE `new Date(y, m, d)` (lokalna ponoć, kako je bilo prije): to na
// ne-UTC stroju (dev = Europe/Zagreb) daje instant `...T22:00Z` umjesto
// `...T00:00Z`, pa se zadatak/trošak datum razilazi dev↔prod (pomak dana -1 +
// duplikati zadataka). Na UTC serveru (Vercel) je `Date.UTC(y,m,d)` identičan
// dotadašnjem `new Date(y,m,d)` → NULA promjene na produkciji.
function pocetakDanaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Efektivni datum završnog čišćenja = dan odlaska gosta + odgoda (u danima).
 * odgoda null/undefined/negativno → 0 (no-op, vraća dan odlaska).
 * Čista funkcija (bez prisma); jedini izvor istine za pomak datuma.
 */
export function efektivniDatumCiscenja(
  datumDo: Date,
  odgodaDana?: number | null
): Date {
  const base = pocetakDanaUtc(datumDo);
  const n = Math.max(0, Math.trunc(Number(odgodaDana) || 0));
  // setUTCDate (NE setDate) — base je UTC ponoć; setDate bi čitao/pisao lokalno
  // i opet uveo TZ offset na ne-UTC stroju.
  base.setUTCDate(base.getUTCDate() + n);
  return base;
}

/**
 * Je li efektivni datum čišćenja BAŠ na dan dolaska sljedećeg gosta?
 * → upozorenje "Ulazak isti dan - očistiti ujutro". Bez sljedeće rezervacije
 * (null) → false. Usporedba po UTC ponoći (TZ-safe).
 */
export function ulazakIstiDan(
  efektivni: Date,
  sljedecaDatumOd?: Date | null
): boolean {
  if (!sljedecaDatumOd) return false;
  return pocetakDanaUtc(efektivni).getTime() === pocetakDanaUtc(sljedecaDatumOd).getTime();
}

/**
 * Fiksni default vremena "10:00". (Prije se računao iz postavki; sada konstanta.)
 */
export function ciscenjeOdGlobalDefault(): string {
  return CISCENJE_OD_DEFAULT;
}

/**
 * Vrijednost stupca "Čišćenje od" za jedan redak.
 * Override (per-slučaj "HH:MM") ima prednost; inače fiksni default "10:00".
 */
export function ciscenjeOdText(override?: string | null): string {
  if (override && override.trim()) return override.trim();
  return CISCENJE_OD_DEFAULT;
}

/**
 * Vrijednost stupca "Čišćenje od" ovisno o TIPU zadatka.
 * Vrijeme (override ?? "10:00") SAMO za završno čišćenje; ostali tipovi → "-".
 * Jedini izvor istine za to pravilo (koriste ga sva 3 render mjesta + admin).
 */
export function ciscenjeOdZaTip(
  tip: string,
  override?: string | null
): string {
  if (tip !== "ZAVRSNO_CISCENJE") return "-";
  return ciscenjeOdText(override);
}
