import { NextResponse } from "next/server";
import { StatusRezervacije } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { renderZahvalaMail, zahvalaSubject } from "@/lib/vodic/zahvalaMail";
import { zahvalaUrl } from "@/lib/vodic/mail";
import { vodicJezik, OBJEKT_BOJA } from "@/lib/vodic";
import { rezerviraniJezik } from "@/lib/jezik";
import { nazivToSlug } from "@/lib/objekti";
import { osigurajPoklonBon } from "@/lib/poklonBon";
import { startOfTodayInZagreb } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Vercel cron je u UTC. vercel.json: "0 6 * * *" = 06:00 UTC (08:00 CEST /
// 07:00 CET) — ujutro prije check-outa (10h), da retry-mreža za današnje
// odlaske stigne na vrijeme. Zrcalo welcome-mail crona, ali cilja datumDo
// (ODLAZAK) umjesto datumOd (dolazak). Bon ide SVIM gostima (bez izvor filtera).
const NEAKTIVNI_STATUSI: StatusRezervacije[] = [
  StatusRezervacije.OTKAZANO,
  StatusRezervacije.OBRISANO,
];

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// Baza za link u mailu: PostavkeNaplate.appUrl → NEXT_PUBLIC_APP_URL →
// VERCEL_URL → localhost (isti redoslijed kao welcome-mail cron).
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
  // 1) Auth — fail-closed, isto kao welcome-mail cron: bez CRON_SECRET odbij sve.
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

  // Kill-switch: automatsko slanje maila zahvale je onemogućeno dok se ne
  // uključi postavljanjem THANK_YOU_MAIL_ENABLED="true" na serveru.
  if (process.env.THANK_YOU_MAIL_ENABLED !== "true") {
    return NextResponse.json({ success: true, disabled: true });
  }

  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const appUrl = rijesiAppUrl(postavke?.appUrl);

  // PROZOR = mali raspon (ne točan dan): odlasci DANAS i SUTRA → [danas, danas+2).
  // Primarno "dan prije odlaska" (sutrašnji odlasci), uz današnje kao retry-mrežu
  // ako prethodni cron padne. Idempotencija (ZAHVALA POSLANO) sprječava duple.
  // TZ-safe: startOfTodayInZagreb() vraća UTC ponoć hrvatskog "danas" (lib/dates),
  // pa prozor ne klizi u rubnom slučaju 00:00–02:00 (za razliku od lokalnog startOfDay).
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
      // idempotencija: ako je mail zahvale već USPJEŠNO poslan, preskoči.
      emailovi: {
        where: { tip: "ZAHVALA", status: "POSLANO" },
        select: { id: true },
      },
    },
  });

  let poslano = 0;
  let vecPoslano = 0;
  let nemaEmail = 0;
  let nemaSlug = 0;
  let greske = 0;
  const detalji: Array<{ rezervacijaId: string; ishod: string }> = [];

  for (const r of rezervacije) {
    try {
      if (r.emailovi.length > 0) {
        vecPoslano++;
        detalji.push({ rezervacijaId: r.id, ishod: "VEC_POSLANO" });
        continue;
      }

      if (!r.gost?.email) {
        nemaEmail++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_EMAILA" });
        continue;
      }

      const slug = nazivToSlug(r.jedinica.objekt.naziv);
      if (!slug) {
        nemaSlug++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_VODICA" });
        continue;
      }

      // Bon se izdaje/dohvaća PRIJE slanja — da link na /zahvala stranicu radi
      // odmah (stranica i sama izdaje idempotentno, ovo je za svaki slučaj).
      await osigurajPoklonBon(r.id);

      // Jezik preko resolvera (drzava korigira zaglavljeni "hr" default) — isto
      // kao welcome.
      const jezik = vodicJezik(rezerviraniJezik(r.gost));
      const subject = zahvalaSubject(jezik, r.jedinica.objekt.naziv);
      const html = renderZahvalaMail({
        jezik,
        ime: r.gost.ime || "goste",
        nazivObjekta: r.jedinica.objekt.naziv,
        zahvalaUrl: zahvalaUrl(appUrl, jezik, slug, r.id),
        boja: OBJEKT_BOJA[slug],
      });

      let mailStatus: "POSLANO" | "GRESKA" = "GRESKA";
      let mailGreska: string | null = null;
      try {
        const res = await sendMail({ to: r.gost.email, subject, html });
        if (res.ok) mailStatus = "POSLANO";
        else mailGreska = res.error || "Greška kod slanja maila.";
      } catch (error: any) {
        mailGreska = error?.message || "Greška kod slanja maila.";
      }

      await prisma.emailLog.create({
        data: {
          rezervacijaId: r.id,
          to: r.gost.email,
          subject,
          tip: "ZAHVALA",
          status: mailStatus,
          greska: mailGreska,
          sadrzaj: html,
        },
      });

      await prisma.rezervacijaPromjena.create({
        data: {
          rezervacijaId: r.id,
          tip: "ZAHVALA_MAIL",
          opis:
            mailStatus === "POSLANO"
              ? "Poslan mail zahvale s poklon-bonom (cron)."
              : "Mail zahvale nije poslan (greška, cron).",
          razlog: mailGreska,
          noviPodaci: JSON.stringify({ jezik, mailStatus, mailGreska }),
          korisnikIme: "Cron",
        },
      });

      if (mailStatus === "POSLANO") {
        poslano++;
        detalji.push({ rezervacijaId: r.id, ishod: "POSLANO" });
      } else {
        greske++;
        detalji.push({ rezervacijaId: r.id, ishod: "GRESKA" });
      }
    } catch (err: any) {
      // Neočekivana greška — jedna pala poruka NE ruši batch.
      const poruka = err?.message || "Nepoznata greška kod slanja.";
      console.error(`[zahvala-mail] rez ${r.id}: ${poruka}`);
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
    nemaEmail,
    nemaSlug,
    greske,
    detalji,
  });
}
