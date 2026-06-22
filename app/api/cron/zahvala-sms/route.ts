import { NextResponse } from "next/server";
import { StatusRezervacije } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizirajE164 } from "@/lib/twilio";
import { imaInfobipKonfiguraciju, posaljiSmsInfobip } from "@/lib/infobip";
import { sastaviZahvalaSms } from "@/lib/smsZahvala";
import { vodicJezik } from "@/lib/vodic";
import { rezerviraniJezik } from "@/lib/jezik";
import { nazivToSlug } from "@/lib/objekti";
import { osigurajPoklonBon } from "@/lib/poklonBon";
import { startOfTodayInZagreb } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Vercel cron je u UTC. vercel.json: "30 6 * * *" = 06:30 UTC — iza mail-zahvale
// (06:00). Zrcalo check-in SMS crona, ALI cilja datumDo (ODLAZAK), šalje link na
// /zahvala stranicu i — KLJUČNA RAZLIKA — NEMA TTLock uvjet (gost odlazi, šifra
// je nebitna). Bon ide SVIM gostima (bez izvor filtera).
const NEAKTIVNI_STATUSI: StatusRezervacije[] = [
  StatusRezervacije.OTKAZANO,
  StatusRezervacije.OBRISANO,
];

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// Baza za link u SMS-u: PostavkeNaplate.appUrl → NEXT_PUBLIC_APP_URL →
// VERCEL_URL → localhost (isti redoslijed kao mail-zahvala / welcome-mail cron).
function rijesiAppUrl(appUrlPostavke?: string | null): string {
  if (appUrlPostavke) return appUrlPostavke.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

export async function GET(request: Request) {
  // 1) Auth — fail-closed, isto kao check-in cron: bez CRON_SECRET odbij sve.
  //    Vercel cron šalje `Authorization: Bearer ${CRON_SECRET}`.
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

  // Kill-switch: automatsko slanje SMS-a zahvale je onemogućeno dok se ne
  // uključi postavljanjem THANK_YOU_SMS_ENABLED="true" na serveru.
  if (process.env.THANK_YOU_SMS_ENABLED !== "true") {
    return NextResponse.json({ success: true, disabled: true });
  }

  if (!imaInfobipKonfiguraciju()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message:
        "Infobip SMS nije konfiguriran (nedostaju env varijable) — preskačem slanje.",
    });
  }

  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const appUrl = rijesiAppUrl(postavke?.appUrl);

  // PROZOR = mali raspon (ne točan dan): odlasci DANAS i SUTRA → [danas, danas+2).
  // Primarno "dan prije odlaska" (sutrašnji odlasci), uz današnje kao retry-mrežu.
  // Idempotencija (ZAHVALA POSLANO) sprječava duple. TZ-safe (startOfTodayInZagreb)
  // — isti prozor kao mail-zahvala cron.
  const danas = startOfTodayInZagreb();
  const ciljOd = danas;
  const ciljDo = addDays(danas, 2);

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      // BEZ izvor filtera — bon ide svim gostima (svi izvori).
      status: { notIn: NEAKTIVNI_STATUSI },
      datumDo: { gte: ciljOd, lt: ciljDo },
    },
    include: {
      gost: true,
      jedinica: { include: { objekt: true } },
      // idempotencija: ako je SMS zahvale (tip ZAHVALA) već POSLANO, preskoči.
      // Tip-specifično — check-in SMS (tip CHECKIN) NE blokira ovaj cron.
      whatsappPoruke: {
        where: { status: "POSLANO", tip: "ZAHVALA" },
        select: { id: true },
      },
    },
  });

  let poslano = 0;
  let vecPoslano = 0;
  let nemaTelefon = 0;
  let nemaSlug = 0;
  let greske = 0;
  const detalji: Array<{ rezervacijaId: string; ishod: string }> = [];

  for (const r of rezervacije) {
    try {
      if (r.whatsappPoruke.length > 0) {
        vecPoslano++;
        detalji.push({ rezervacijaId: r.id, ishod: "VEC_POSLANO" });
        continue;
      }

      const e164 = normalizirajE164(r.gost?.telefon);
      if (!e164) {
        nemaTelefon++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_TELEFONA" });
        continue;
      }

      const slug = nazivToSlug(r.jedinica.objekt.naziv);
      if (!slug) {
        nemaSlug++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_VODICA" });
        continue;
      }

      // Bon se izdaje/dohvaća PRIJE slanja — da link na /zahvala stranicu radi
      // odmah. NEMA TTLock uvjeta: gost odlazi, šifra je nebitna.
      await osigurajPoklonBon(r.id);

      // Jezik preko resolvera (drzava korigira zaglavljeni "hr" default) — isto
      // kao welcome/check-in.
      const jezik = vodicJezik(rezerviraniJezik(r.gost));
      const smsTekst = sastaviZahvalaSms({
        jezik,
        ime: r.gost?.ime || "gost",
        objekt: r.jedinica.objekt.naziv,
        appUrl,
        slug,
        rezervacijaId: r.id,
      });

      const infobip = await posaljiSmsInfobip({ to: e164, text: smsTekst });

      await prisma.whatsappPoruka.create({
        data: {
          rezervacijaId: r.id,
          kanal: "SMS",
          tip: "ZAHVALA",
          primatelj: e164,
          templateSid: null,
          varijable: {},
          tekstPregled: smsTekst,
          twilioSid: infobip.messageId, // polje zadržava ime; sadrži Infobip messageId
          status: "POSLANO",
        },
      });

      await prisma.rezervacijaPromjena.create({
        data: {
          rezervacijaId: r.id,
          tip: "ZAHVALA_SMS",
          opis: "Poslan SMS zahvale s poklon-bonom (cron).",
          noviPodaci: JSON.stringify({ jezik, messageId: infobip.messageId }),
          korisnikIme: "Cron",
        },
      });

      poslano++;
      detalji.push({ rezervacijaId: r.id, ishod: "POSLANO" });
    } catch (err: any) {
      // Infobip ili neočekivana greška — jedna pala poruka NE ruši batch.
      const poruka = err?.message || "Nepoznata greška kod slanja.";
      console.error(`[zahvala-sms] rez ${r.id}: ${poruka}`);

      try {
        await prisma.whatsappPoruka.create({
          data: {
            rezervacijaId: r.id,
            kanal: "SMS",
            tip: "ZAHVALA",
            primatelj: normalizirajE164(r.gost?.telefon) || "(nepoznato)",
            templateSid: null,
            varijable: {},
            tekstPregled: "Poruka NIJE poslana — greska kod slanja SMS-a.",
            status: "GRESKA",
            greska: poruka,
          },
        });
      } catch (_) {
        // ako ni log ne uspije, samo nastavi
      }

      greske++;
      detalji.push({ rezervacijaId: r.id, ishod: "GRESKA" });
    }
  }

  return NextResponse.json({
    success: true,
    prozorOd: ciljOd,
    prozorDo: ciljDo,
    pronadeno: rezervacije.length,
    poslano,
    vecPoslano,
    nemaTelefon,
    nemaSlug,
    greske,
    detalji,
  });
}
