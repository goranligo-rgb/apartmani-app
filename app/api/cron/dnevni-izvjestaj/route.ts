import { NextResponse } from "next/server";
import { StatusRezervacije } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { imaInfobipKonfiguraciju, posaljiSmsInfobip } from "@/lib/infobip";
import {
  kratkaJedinica,
  sastaviIzvjestajSms,
  type IzvjestajStavka,
  type IzvjestajPaznja,
} from "@/lib/smsIzvjestaj";

export const dynamic = "force-dynamic";

// Vercel cron je u UTC. vercel.json: "0 5 * * *" = 05:00 UTC — jutarnji sažetak
// vlasnici prije ostalih cronova. Idempotencija: cron ide 1×/dan (nema DB zapisa).
const NEAKTIVNI_STATUSI: StatusRezervacije[] = [
  StatusRezervacije.OTKAZANO,
  StatusRezervacije.OBRISANO,
];

const PAZNJA_DANA = 2; // BOOKING dolasci unutar <= 2 dana bez šifre/welcome maila

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDatumKratko(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.`;
}

// Prezime, fallback ime, fallback "Gost".
function gostKratko(gost?: { ime: string | null; prezime: string | null } | null): string {
  return (gost?.prezime || gost?.ime || "Gost").trim();
}

export async function GET(request: Request) {
  // Auth — fail-closed, isto kao ostali cronovi.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET nije konfiguriran na serveru." },
      { status: 503 }
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const danas = startOfDay(new Date());
  const sutra = addDays(danas, 1);
  const jedinicaSel = { select: { naziv: true, vrsta: true } } as const;
  const gostSel = { select: { ime: true, prezime: true } } as const;

  // Ulasci danas (svi izvori, aktivni statusi).
  const ulasciRez = await prisma.rezervacija.findMany({
    where: {
      status: { notIn: NEAKTIVNI_STATUSI },
      datumOd: { gte: danas, lt: sutra },
    },
    include: { gost: gostSel, jedinica: jedinicaSel },
    orderBy: { jedinica: { naziv: "asc" } },
  });

  // Izlasci danas.
  const izlasciRez = await prisma.rezervacija.findMany({
    where: {
      status: { notIn: NEAKTIVNI_STATUSI },
      datumDo: { gte: danas, lt: sutra },
    },
    include: { gost: gostSel, jedinica: jedinicaSel },
    orderBy: { jedinica: { naziv: "asc" } },
  });

  // PAZNJA: BOOKING dolasci unutar <= PAZNJA_DANA dana, bez TTLock šifre ILI bez
  // uspješno poslanog DOBRODOSLICA maila.
  const paznjaRez = await prisma.rezervacija.findMany({
    where: {
      izvor: "BOOKING",
      status: { notIn: NEAKTIVNI_STATUSI },
      datumOd: { gte: danas, lt: addDays(danas, PAZNJA_DANA + 1) },
      OR: [
        { ttlockSifre: { none: {} } },
        { emailovi: { none: { tip: "DOBRODOSLICA", status: "POSLANO" } } },
      ],
    },
    include: { gost: gostSel, jedinica: jedinicaSel },
    orderBy: { datumOd: "asc" },
  });

  const ulasci: IzvjestajStavka[] = ulasciRez.map((r) => ({
    jedinica: kratkaJedinica(r.jedinica.naziv, r.jedinica.vrsta),
    gost: gostKratko(r.gost),
  }));
  const izlasci: IzvjestajStavka[] = izlasciRez.map((r) => ({
    jedinica: kratkaJedinica(r.jedinica.naziv, r.jedinica.vrsta),
    gost: gostKratko(r.gost),
  }));
  const paznja: IzvjestajPaznja[] = paznjaRez.map((r) => ({
    jedinica: kratkaJedinica(r.jedinica.naziv, r.jedinica.vrsta),
    gost: gostKratko(r.gost),
    datum: formatDatumKratko(r.datumOd),
  }));

  const tekst = sastaviIzvjestajSms({ ulasci, izlasci, paznja });
  const sazetak = {
    ulasci: ulasci.length,
    izlasci: izlasci.length,
    paznja: paznja.length,
  };

  // Nema nijednog događaja → ne šaljemo.
  if (!tekst) {
    return NextResponse.json({
      success: true,
      skipped: true,
      razlog: "Nema ulazaka, izlazaka ni PAZNJA stavki za danas.",
      sazetak,
    });
  }

  // Bez broja vlasnice → samo logiraj (ne šalji).
  const broj = (process.env.VLASNIK_SMS_BROJ || "").trim();
  if (!broj) {
    console.log(`[dnevni-izvjestaj] VLASNIK_SMS_BROJ nije postavljen. Tekst:\n${tekst}`);
    return NextResponse.json({
      success: true,
      skipped: true,
      razlog: "VLASNIK_SMS_BROJ nije postavljen — SMS nije poslan.",
      sazetak,
      tekst,
    });
  }

  if (!imaInfobipKonfiguraciju()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      razlog: "Infobip SMS nije konfiguriran — SMS nije poslan.",
      sazetak,
      tekst,
    });
  }

  try {
    const res = await posaljiSmsInfobip({ to: broj, text: tekst });
    return NextResponse.json({
      success: true,
      poslano: true,
      messageId: res.messageId,
      sazetak,
      tekst,
    });
  } catch (err: any) {
    const poruka = err?.message || "Greška kod slanja SMS-a.";
    console.error(`[dnevni-izvjestaj] ${poruka}`);
    return NextResponse.json(
      { success: false, greska: poruka, sazetak, tekst },
      { status: 500 }
    );
  }
}
