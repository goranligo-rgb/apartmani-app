import { prisma } from "@/lib/prisma";

export type CardSource = "REZERVACIJA" | "BLOKADA";

// Sažeti view-model za listanje u admin ekranima.
// Discriminated union po `source` polju: TypeScript narrowing daje pristup
// `card.rezervacija` ili `card.blokada` ovisno o izvoru.
type CardBase = {
  id: string;
  source: CardSource;

  // Izvor: IzvorRezervacije enum za naše, "BOOKING" za vanjske blokade
  izvor: string;

  jedinica: {
    id: string;
    naziv: string;
    objekt: { id: string; naziv: string };
  };

  // Gost — može doći iz Gost relacije (naše) ili iz Excel-obogaćene blokade
  ime: string | null;
  prezime: string | null;
  telefon: string | null;
  email: string | null;
  drzava: string | null;
  brojOsoba: number | null;

  datumOd: Date;
  datumDo: Date;
  brojNocenja: number;

  // Iznosi (blokade imaju iznosBruto iz Excela; iznosPlaceno = 0)
  iznosUkupno: number | null;
  iznosPlaceno: number;
  valuta: string;

  // Status: StatusRezervacije za naše, "BOOKING" pseudo-status za blokade
  status: string;

  // Detail page: null za Booking blokade (nemaju vlastiti detail)
  detailHref: string | null;
};

// Privatne dohvat funkcije — koriste se za inferenciju Prisma payload tipa.
async function fetchRezervacije(where: any) {
  return prisma.rezervacija.findMany({
    where,
    include: {
      gost: true,
      jedinica: { include: { objekt: true } },
      placanja: { orderBy: { createdAt: "desc" } },
      racuni: { orderBy: { createdAt: "desc" } },
      emailovi: { orderBy: { createdAt: "desc" } },
    },
  });
}

async function fetchBlokade(where: any) {
  return prisma.blokadaVanjskogKalendara.findMany({
    where,
    include: {
      jedinica: { include: { objekt: true } },
    },
  });
}

export type RezervacijaFull = Awaited<
  ReturnType<typeof fetchRezervacije>
>[number];

export type BlokadaFull = Awaited<ReturnType<typeof fetchBlokade>>[number];

// Discriminated union: konzument može sigurno pristupiti `card.rezervacija`
// ili `card.blokada` nakon provjere `card.source`.
export type RezervacijaCard =
  | (CardBase & { source: "REZERVACIJA"; rezervacija: RezervacijaFull })
  | (CardBase & { source: "BLOKADA"; blokada: BlokadaFull });

export type GetRezervacijeIBlokadeParams = {
  objektId?: string;
  jediniceIds?: string[];
  // Window filter — uključuje sve čiji se period preklapa s [datumOd, datumDo)
  datumOd?: Date;
  datumDo?: Date;
  // Default: skrivaju se OTKAZANO i OBRISANO statusi rezervacija.
  // Blokade nemaju status; uvijek su uključene.
  ukljuciOtkazane?: boolean;
  ukljuciObrisane?: boolean;
};

export async function getRezervacijeIBlokade(
  p: GetRezervacijeIBlokadeParams = {}
): Promise<RezervacijaCard[]> {
  // ─── Where filter za Rezervacija ────────────────────────────────────────
  const rezWhere: any = {};

  // Status filter — kombiniramo OBRISANO i OTKAZANO u jedan notIn
  const skriveni: string[] = [];
  if (!p.ukljuciObrisane) skriveni.push("OBRISANO");
  if (!p.ukljuciOtkazane) skriveni.push("OTKAZANO");
  if (skriveni.length === 1) {
    rezWhere.status = { not: skriveni[0] };
  } else if (skriveni.length > 1) {
    rezWhere.status = { notIn: skriveni };
  }

  if (p.objektId) {
    rezWhere.jedinica = { objektId: p.objektId };
  }
  if (p.jediniceIds && p.jediniceIds.length > 0) {
    rezWhere.jedinicaId = { in: p.jediniceIds };
  }
  if (p.datumOd) {
    rezWhere.datumDo = { gt: p.datumOd };
  }
  if (p.datumDo) {
    rezWhere.datumOd = { lt: p.datumDo };
  }

  // ─── Where filter za BlokadaVanjskogKalendara ───────────────────────────
  const blokWhere: any = {};

  if (p.objektId) {
    blokWhere.jedinica = { objektId: p.objektId };
  }
  if (p.jediniceIds && p.jediniceIds.length > 0) {
    blokWhere.jedinicaId = { in: p.jediniceIds };
  }
  if (p.datumOd) {
    blokWhere.datumDo = { gt: p.datumOd };
  }
  if (p.datumDo) {
    blokWhere.datumOd = { lt: p.datumDo };
  }

  // ─── Paralelni dohvat ────────────────────────────────────────────────────
  const [rezervacije, blokade] = await Promise.all([
    fetchRezervacije(rezWhere),
    fetchBlokade(blokWhere),
  ]);

  // ─── Mapping u RezervacijaCard ───────────────────────────────────────────
  const cards: RezervacijaCard[] = [];

  for (const r of rezervacije) {
    cards.push({
      source: "REZERVACIJA",
      id: r.id,
      izvor: r.izvor,
      jedinica: {
        id: r.jedinica.id,
        naziv: r.jedinica.naziv,
        objekt: {
          id: r.jedinica.objekt.id,
          naziv: r.jedinica.objekt.naziv,
        },
      },
      ime: r.gost?.ime ?? null,
      prezime: r.gost?.prezime ?? null,
      telefon: r.gost?.telefon ?? null,
      email: r.gost?.email ?? null,
      drzava: r.gost?.drzava ?? null,
      brojOsoba: r.brojOsoba,
      datumOd: r.datumOd,
      datumDo: r.datumDo,
      brojNocenja: r.brojNocenja,
      iznosUkupno: r.dogovoreniIznos ?? r.iznosUkupno ?? null,
      iznosPlaceno: Number(r.iznosPlaceno ?? 0),
      valuta: r.valuta,
      status: r.status,
      detailHref: `/admin/rezervacije/${r.id}`,
      rezervacija: r,
    });
  }

  for (const b of blokade) {
    cards.push({
      source: "BLOKADA",
      id: b.id,
      izvor: b.izvor || "BOOKING",
      jedinica: {
        id: b.jedinica.id,
        naziv: b.jedinica.naziv,
        objekt: {
          id: b.jedinica.objekt.id,
          naziv: b.jedinica.objekt.naziv,
        },
      },
      ime: b.gostIme,
      prezime: b.gostPrezime,
      telefon: b.gostTelefon,
      email: b.gostEmail,
      drzava: b.gostDrzava,
      brojOsoba: b.brojOsoba,
      datumOd: b.datumOd,
      datumDo: b.datumDo,
      brojNocenja: Math.round(
        (b.datumDo.getTime() - b.datumOd.getTime()) / 86400000
      ),
      iznosUkupno: b.iznosBruto,
      iznosPlaceno: 0,
      valuta: b.valuta,
      status: "BOOKING",
      detailHref: null,
      blokada: b,
    });
  }

  // Default sort: najnoviji termini prvo (datumOd desc) — match /admin/rezervacije default.
  // Konzument ekran može resortirati.
  cards.sort((a, b) => b.datumOd.getTime() - a.datumOd.getTime());

  return cards;
}
