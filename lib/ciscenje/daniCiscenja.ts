// ── Dani čišćenja zajedničkih prostora — JEDINI izvor istine ──
//
// Prije ovog modula su funkcije `martyBazenZaDan` / `evaStubisteZaDan` bile
// DUPLICIRANE u 4 datoteke (generirajINaPosalji.ts, nadopunaRaspored.ts,
// ciscenje-pdf/page.tsx, ciscenje/page.tsx) i gledale dan u tjednu preko 7
// boolean stupaca. Redizajn (feat/ciscenje-dani-datumi): biramo KONKRETNE
// datume, spremljene kao `String[]` u formatu "YYYY-MM-DD" (vidi schema.prisma,
// polja martyBazenDatumi / evaStubisteDatumi / martyStubisteDatumi).
//
// Sve 4 datoteke sada IMPORTAJU iz ovog modula → nemoguće je da se logika
// raziđe. Modul je čista funkcija (bez prisma/resend/IO).

import { formatZagreb } from "@/lib/dates";

/**
 * Datum (instant) → kanonski "YYYY-MM-DD" u zoni Europe/Zagreb.
 *
 * Namjerno preko `formatZagreb` (Intl, DST-aware), a NE preko getUTC/getDate
 * komponenti — tako se zidni (Zagreb) kalendarski dan instanta čita ispravno
 * i na Vercel
 * UTC serveru i na lokalnom (Zagreb) devu. Mora dati ISTI string kao onaj koji
 * UI sprema u listu, da `includes` radi.
 *
 * Primjer: instant 2026-06-15T22:00:00Z (= Zagreb 16.06. 00:00) → "2026-06-16".
 */
export function formatYMD(d: Date): string {
  // en-CA locale formatira kao "YYYY-MM-DD".
  return formatZagreb(d, {
    locale: "en-CA",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Je li `d` jedan od odabranih datuma čišćenja?
 * Usporedba po kanonskom "YYYY-MM-DD" stringu (lista.includes).
 */
export function jeDatumZaCiscenje(
  datumi: string[] | null | undefined,
  d: Date
): boolean {
  if (!datumi || datumi.length === 0) return false;
  return datumi.includes(formatYMD(d));
}

// ── Tanki wrapperi po kanalu — čitaju nova *Datumi polja iz postavki ──
// (postavke je `any` jer ga pozivatelji već tako tipiziraju; polja dolaze iz
// CiscenjeMailPostavke.)

export function martyBazenZaDan(postavke: any, datum: Date): boolean {
  return jeDatumZaCiscenje(postavke?.martyBazenDatumi, datum);
}

export function evaStubisteZaDan(postavke: any, datum: Date): boolean {
  return jeDatumZaCiscenje(postavke?.evaStubisteDatumi, datum);
}

export function martyStubisteZaDan(postavke: any, datum: Date): boolean {
  return jeDatumZaCiscenje(postavke?.martyStubisteDatumi, datum);
}
