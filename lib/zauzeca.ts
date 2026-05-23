import type {
  BlokadaJedinice,
  BlokadaVanjskogKalendara,
  Rezervacija,
  StatusRezervacije,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRezervacijaOverlap } from "@/lib/dates";

/**
 * Statusi rezervacije koji STVARNO zauzimaju termin (whitelist).
 *
 * Whitelist je sigurniji od `not: "OTKAZANO"` — svaki novi status u shemi
 * `StatusRezervacije` mora se svjesno dodati ovdje. Ako se enum proširi, a
 * ovo ne ažurira, TypeScript pukne (satisfies clause), umjesto da novi
 * status tiho "ne zauzima".
 *
 * UPIT je uključen iako je riječ o "mekoj" rezervaciji prije Stripe
 * autorizacije. Razlog: dvije paralelne web rezervacije za isti termin
 * obje stvore UPIT u `create-payment` POST-u. Ako UPIT ne broji kao
 * zauzeće, obje mogu uspješno proći Stripe i nastat će dvostruka
 * rezervacija (atomska brava u `zaprimiAutoriziranuRezervaciju` radi po
 * pojedinoj rezervaciji, ne po preklapanju). Stale UPIT-i čiste se kroz
 * `checkout.session.expired` webhook (PR1) — terminalni prijelaz u
 * OTKAZANO.
 */
export const STATUSI_KOJI_ZAUZIMAJU = [
  "UPIT",
  "CEKA_POTVRDU",
  "CEKA_AKONTACIJU",
  "REZERVIRANO",
  "POTVRDENO",
  "CEKA_OSTATAK",
  "PLACENO",
] as const satisfies readonly StatusRezervacije[];

export type Preklapanja = {
  rezervacije: Rezervacija[];
  blokadeRucne: BlokadaJedinice[];
  blokadeVanjske: BlokadaVanjskogKalendara[];
};

type PronadiArgs = {
  jedinicaId: string;
  datumOd: Date;
  datumDo: Date;
  /** Ako se mijenja postojeća rezervacija, isključi je iz provjere kako bi
   *  helper ne prijavio rezervaciju samu protiv sebe. */
  iskljuciRezervacijuId?: string;
};

/**
 * Vraća sve rezervacije i blokade koje se preklapaju s `[datumOd, datumDo)`
 * za jedinicu `jedinicaId`. Razdvojeno po vrsti zauzeća kako bi pozivatelj
 * mogao prikazati razlikovne poruke ("zauzeto" / "ručno blokirano" /
 * "Booking").
 *
 * SQL prefilter (`datumOd < druga.datumDo && datumDo > druga.datumOd`) vraća
 * sve naivne preklapanja; post-filter kroz `isRezervacijaOverlap` izbacuje
 * same-day turnover (a.datumDo == b.datumOd) koji NIJE pravi sukob —
 * standardna hotelska konvencija.
 */
export async function pronadiPreklapanja(
  args: PronadiArgs,
): Promise<Preklapanja> {
  const { jedinicaId, datumOd, datumDo, iskljuciRezervacijuId } = args;

  const sqlPrefilter = {
    datumOd: { lt: datumDo },
    datumDo: { gt: datumOd },
  };

  const [kandidatiRez, kandidatiRucne, kandidatiVanjske] = await Promise.all([
    prisma.rezervacija.findMany({
      where: {
        jedinicaId,
        ...(iskljuciRezervacijuId
          ? { id: { not: iskljuciRezervacijuId } }
          : {}),
        status: { in: [...STATUSI_KOJI_ZAUZIMAJU] },
        obrisanoAt: null,
        ...sqlPrefilter,
      },
    }),
    prisma.blokadaJedinice.findMany({
      where: {
        jedinicaId,
        aktivna: true,
        ...sqlPrefilter,
      },
    }),
    prisma.blokadaVanjskogKalendara.findMany({
      where: {
        jedinicaId,
        ...sqlPrefilter,
      },
    }),
  ]);

  return {
    rezervacije: kandidatiRez.filter((k) =>
      isRezervacijaOverlap(k, { datumOd, datumDo }),
    ),
    blokadeRucne: kandidatiRucne.filter((k) =>
      isRezervacijaOverlap(k, { datumOd, datumDo }),
    ),
    blokadeVanjske: kandidatiVanjske.filter((k) =>
      isRezervacijaOverlap(k, { datumOd, datumDo }),
    ),
  };
}

/** Termin je slobodan ako ni jedna od tri vrste zauzeća nije pronađena. */
export function jeSlobodno(p: Preklapanja): boolean {
  return (
    p.rezervacije.length === 0 &&
    p.blokadeRucne.length === 0 &&
    p.blokadeVanjske.length === 0
  );
}

/** Kratak wrapper za pozivatelje koje ne zanima razlog, samo boolean. */
export async function jedinicaJeSlobodna(args: PronadiArgs): Promise<boolean> {
  return jeSlobodno(await pronadiPreklapanja(args));
}
