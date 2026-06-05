import { NextResponse } from "next/server";
import { StatusRezervacije } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { welcomeMailFromPage } from "@/lib/vodic/mailFromPage";
import { vodicJezik } from "@/lib/vodic";
import { dohvatiPrijevode } from "@/lib/mailovi";
import { nazivToSlug } from "@/lib/objekti";

export const dynamic = "force-dynamic";

// Vercel cron je u UTC. vercel.json: "0 9 * * *" = 09:00 UTC, IZA SMS crona
// (08:00 UTC) koji kreira TTLock šifre — tako welcome mail ode isti dan kad
// šifra nastane. Welcome mail = ista renderirana welcome stranica kao admin gumb.
const NEAKTIVNI_STATUSI: StatusRezervacije[] = [
  StatusRezervacije.OTKAZANO,
  StatusRezervacije.OBRISANO,
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// Baza za welcome stranicu koju mail fetcha. PostavkeNaplate.appUrl →
// NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost (isti redoslijed kao admin
// getAppUrl). welcomeMailFromPage mora moći fetchati ovaj URL.
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
  // 1) Auth — fail-closed, isto kao /api/cron/whatsapp-checkin: bez CRON_SECRET
  //    odbij sve. Vercel cron šalje `Authorization: Bearer ${CRON_SECRET}`.
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

  // 2) Koliko dana prije dolaska: PostavkeNaplate.mailDanaPrije, fallback na
  //    WELCOME_MAIL_DAYS_BEFORE env / 5 ako reda (postavki) nema.
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const envDana =
    Number.parseInt(process.env.WELCOME_MAIL_DAYS_BEFORE || "5", 10) || 5;
  const mailDanaPrije = postavke?.mailDanaPrije ?? envDana;
  const appUrl = rijesiAppUrl(postavke?.appUrl);

  // PROZOR = RASPON (ne točan dan): svi dolasci od danas do danas+mailDanaPrije
  // uključivo. S točnim danom "retry sutra" ne bi radio — rezervacija bi ispala
  // iz prozora. Idempotencija (DOBRODOSLICA POSLANO) sprječava duple mailove
  // unutar raspona.
  const danas = startOfDay(new Date());
  const ciljOd = danas;
  const ciljDo = addDays(danas, mailDanaPrije + 1);

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      izvor: "BOOKING",
      status: { notIn: NEAKTIVNI_STATUSI },
      datumOd: { gte: ciljOd, lt: ciljDo },
    },
    include: {
      gost: true,
      jedinica: { include: { objekt: true } },
      // idempotencija: ako je welcome mail već USPJEŠNO poslan, preskoči.
      emailovi: {
        where: { tip: "DOBRODOSLICA", status: "POSLANO" },
        select: { id: true },
      },
      // UVJET ŠIFRE: bez TTLock šifre mail se NE šalje (cron pokušava opet sutra).
      ttlockSifre: { select: { id: true }, take: 1 },
    },
  });

  let poslano = 0;
  let vecPoslano = 0;
  let nemaEmail = 0;
  let nemaSifra = 0;
  let nemaVodic = 0;
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

      // UVJET ŠIFRE: bez šifre ne šaljemo — sljedeći dan cron pokuša opet.
      if (r.ttlockSifre.length === 0) {
        nemaSifra++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_SIFRE" });
        continue;
      }

      const slug = nazivToSlug(r.jedinica.objekt.naziv);
      if (!slug) {
        nemaVodic++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_VODICA" });
        continue;
      }

      // Mail = DOSLOVNO renderirana welcome stranica (?t=rezervacija) → mehanička
      // obrada. Ime, šifra (čita se s rezervacije, TTLock se ne dira), eCheckin i
      // datumi dolaze sa stranice. Isti mail kao admin gumb (bez uvod override).
      const jezik = vodicJezik(r.gost.jezik);
      const tekst = dohvatiPrijevode(jezik).dobrodoslica;
      const subject = tekst.subject(r.jedinica.objekt.naziv);
      const html = await welcomeMailFromPage({
        appUrl,
        slug,
        jezik,
        t: r.id,
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
          tip: "DOBRODOSLICA",
          status: mailStatus,
          greska: mailGreska,
        },
      });

      await prisma.rezervacijaPromjena.create({
        data: {
          rezervacijaId: r.id,
          tip: "WELCOME_MAIL",
          opis:
            mailStatus === "POSLANO"
              ? "Poslan welcome mail (cron)."
              : "Welcome mail nije poslan (greška, cron).",
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
      console.error(`[welcome-mail] rez ${r.id}: ${poruka}`);
      greske++;
      detalji.push({ rezervacijaId: r.id, ishod: "GRESKA" });
    }
  }

  return NextResponse.json({
    success: true,
    mailDanaPrije,
    prozorOd: ciljOd,
    prozorDo: ciljDo,
    pronadeno: rezervacije.length,
    poslano,
    vecPoslano,
    nemaEmail,
    nemaSifra,
    nemaVodic,
    greske,
    detalji,
  });
}
