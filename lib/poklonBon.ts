// Get-or-create helper za poklon-bon zahvale. Idempotentan po rezervacijaId
// (UNIQUE u shemi): jedan bon po rezervaciji. Server-only (prisma + node crypto),
// zove se iz budućeg cron-a zahvale i iz admin gumba za ručno izdavanje.

import crypto from "crypto";
import { Prisma, type PoklonBon } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfTodayInZagreb } from "@/lib/dates";

// Abeceda bez zbunjujućih znakova: izbačeni O/0 i I/1. 31 znak.
const KOD_ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const KOD_DULJINA = 6;
const KOD_PREFIX = "MS-";
const MAX_POKUSAJA = 5;

// "MS-" + 6 nasumičnih znakova (crypto.randomInt → bez modulo-bias-a).
function generirajKod(): string {
  let s = "";
  for (let i = 0; i < KOD_DULJINA; i++) {
    s += KOD_ALFABET[crypto.randomInt(0, KOD_ALFABET.length)];
  }
  return `${KOD_PREFIX}${s}`;
}

// Datum isteka: 31.10. SLJEDEĆE godine od izdavanja, UTC PODNE.
// Podne je konvencija baze za "date-only" vrijednosti (vidi lib/dates
// normalizeToNoon) — usporedbe se rade na podne, pa nema TZ/DST pomaka.
// Godina izdavanja je hrvatska (startOfTodayInZagreb), ne sirovi UTC.
function vrijediDoZaIzdavanje(danas: Date): Date {
  const godina = danas.getUTCFullYear() + 1;
  return new Date(Date.UTC(godina, 9, 31, 12, 0, 0, 0)); // mjesec 9 = listopad
}

// P2002 = unique constraint violation. meta.target sadrži ime constrainta
// (npr. "PoklonBon_kod_key") ili polje — provjeravamo da spominje traženo polje.
function jeUnikatnaKolizija(e: unknown, polje: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    String((e.meta as { target?: unknown })?.target ?? "").includes(polje)
  );
}

/**
 * Vrati postojeći ili kreiraj novi PoklonBon za rezervaciju (idempotentno).
 *
 * - rezervacijaId je UNIQUE → najviše jedan bon po rezervaciji.
 * - imeVlasnika = snapshot Gost.ime u trenutku izdavanja (kopija, ne relacija).
 * - vrijediDo = 31.10. sljedeće godine; postotakPopusta=10 i iskoristen=false
 *   dolaze iz @default sheme.
 *
 * @throws ako rezervacija ne postoji ili se ne uspije generirati jedinstven kod.
 */
export async function osigurajPoklonBon(
  rezervacijaId: string
): Promise<PoklonBon> {
  // 1) Idempotencija: ako bon već postoji, vrati ga (ne diraj kod/datum/snapshot).
  const postojeci = await prisma.poklonBon.findUnique({
    where: { rezervacijaId },
  });
  if (postojeci) return postojeci;

  // 2) Snapshot imena iz gosta u trenutku izdavanja.
  const rez = await prisma.rezervacija.findUnique({
    where: { id: rezervacijaId },
    include: { gost: true },
  });
  if (!rez) throw new Error(`Rezervacija ${rezervacijaId} ne postoji.`);
  const imeVlasnika = (rez.gost?.ime || "").trim() || "Gost";

  const vrijediDo = vrijediDoZaIzdavanje(startOfTodayInZagreb());

  // 3) Kreiraj uz retry na koliziju koda; race na rezervacijaId → vrati postojeći.
  for (let pokusaj = 0; pokusaj < MAX_POKUSAJA; pokusaj++) {
    try {
      return await prisma.poklonBon.create({
        data: {
          kod: generirajKod(),
          imeVlasnika,
          rezervacijaId,
          vrijediDo,
        },
      });
    } catch (e) {
      // Konkurentno kreiranje za ISTU rezervaciju — vrati onaj koji je prošao.
      if (jeUnikatnaKolizija(e, "rezervacijaId")) {
        const drugi = await prisma.poklonBon.findUnique({
          where: { rezervacijaId },
        });
        if (drugi) return drugi;
      }
      // Kolizija KODA — regeneriraj i pokušaj ponovno.
      if (jeUnikatnaKolizija(e, "kod")) continue;
      // Bilo što drugo — propusti dalje.
      throw e;
    }
  }

  throw new Error(
    `Ne mogu generirati jedinstven kod poklon-bona nakon ${MAX_POKUSAJA} pokušaja.`
  );
}
