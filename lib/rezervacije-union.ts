import { prisma } from "@/lib/prisma";

export type CardSource = "REZERVACIJA" | "BLOKADA";

type CardBase = {
  id: string;
  source: CardSource;
  izvor: string;

  jedinica: {
    id: string;
    naziv: string;
    objekt: { id: string; naziv: string };
  };

  ime: string | null;
  prezime: string | null;
  telefon: string | null;
  email: string | null;
  drzava: string | null;
  brojOsoba: number | null;

  datumOd: Date;
  datumDo: Date;
  brojNocenja: number;

  iznosUkupno: number | null;
  iznosPlaceno: number;
  valuta: string;

  status: string;

  detailHref: string | null;
};

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

export type RezervacijaFull = Awaited<ReturnType<typeof fetchRezervacije>>[number];

export type BlokadaFull = Awaited<ReturnType<typeof fetchBlokade>>[number];

export type RezervacijaCard =
  | (CardBase & { source: "REZERVACIJA"; rezervacija: RezervacijaFull })
  | (CardBase & { source: "BLOKADA"; blokada: BlokadaFull });

export type GetRezervacijeIBlokadeParams = {
  objektId?: string;
  jediniceIds?: string[];
  datumOd?: Date;
  datumDo?: Date;
  ukljuciOtkazane?: boolean;
  ukljuciObrisane?: boolean;
};

export async function getRezervacijeIBlokade(
  p: GetRezervacijeIBlokadeParams = {}
): Promise<RezervacijaCard[]> {
  const rezWhere: any = {};

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

  const [rezervacije, blokade] = await Promise.all([
    fetchRezervacije(rezWhere),
    fetchBlokade(blokWhere),
  ]);

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

  cards.sort((a, b) => b.datumOd.getTime() - a.datumOd.getTime());

  return cards;
}
