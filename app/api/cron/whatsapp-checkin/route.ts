import { NextResponse } from "next/server";
import { StatusRezervacije } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sinkronizirajTtlockSifru } from "@/lib/ttlock";
import { normalizirajE164 } from "@/lib/twilio";
import { imaInfobipKonfiguraciju, posaljiSmsInfobip } from "@/lib/infobip";
import { sastaviCheckinSms } from "@/lib/smsCheckin";
import { rezerviraniJezik } from "@/lib/jezik";
import { nazivToSlug, brojApartmanaIzNaziva } from "@/lib/objekti";
import { zagrebWallClockToInstant } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Vercel cron je u UTC. vercel.json: "0 8 * * *" = 08:00 UTC.
// Ljeti (CEST, UTC+2) = 10:00 lokalno; zimi (CET, UTC+1) = 09:00 lokalno.
const CHECKIN_TIME_HOUR = 16; // šifra vrijedi od datuma PRIJAVE 16:00
const CHECKOUT_TIME_HOUR = 10; // do datuma ODJAVE 10:00

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

// Ista logika kao postojeći ručni TTLock flow: zadnje 4 znamenke telefona.
function generirajSifruIzTelefona(telefon?: string | null): string {
  const brojevi = String(telefon || "").replace(/\D/g, "");
  if (brojevi.length >= 4) return brojevi.slice(-4);
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Kratak format DD.MM. (npr. "06.06.") za SMS — bez godine, štedi znakove.
function formatDatumKratko(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.`;
}

export async function GET(request: Request) {
  // 1) Auth — fail-closed, isto kao /api/cron/ciscenje-tjedni: ako CRON_SECRET
  //    nije postavljen, odbij sve (umjesto da propustimo "Bearer undefined").
  //    Vercel cron sam šalje header `Authorization: Bearer ${CRON_SECRET}`.
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

  if (!imaInfobipKonfiguraciju()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message:
        "Infobip SMS nije konfiguriran (nedostaju env varijable) — preskačem slanje.",
    });
  }

  // Koliko dana prije dolaska cron šalje SMS: iz PostavkeNaplate.smsDanaPrije,
  // fallback na CHECKIN_DAYS_BEFORE env / 3 ako reda (postavki) nema.
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const envDana =
    Number.parseInt(process.env.CHECKIN_DAYS_BEFORE || "3", 10) || 3;
  const danaPrije = postavke?.smsDanaPrije ?? envDana;

  // Baza za welcome link u SMS-u: PostavkeNaplate.appUrl → env. Bez nje se
  // welcome red izostavlja (ne stavljamo localhost u stvarni SMS).
  const appUrl =
    postavke?.appUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  const danas = startOfDay(new Date());
  const ciljOd = addDays(danas, danaPrije);
  const ciljDo = addDays(ciljOd, 1);

  const kontakt = process.env.KONTAKT_TEL || "+385 98 700 415";

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      izvor: "BOOKING",
      status: { notIn: NEAKTIVNI_STATUSI },
      datumOd: { gte: ciljOd, lt: ciljDo },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
          ttlockBrave: { include: { brava: true } },
        },
      },
      // idempotencija: ako već postoji uspješno poslana poruka, preskoči.
      whatsappPoruke: {
        where: { status: "POSLANO", tip: "CHECKIN" },
        select: { id: true },
      },
    },
  });

  let poslano = 0;
  let preskoceno = 0;
  let greske = 0;
  const detalji: Array<{ rezervacijaId: string; ishod: string }> = [];

  for (const r of rezervacije) {
    try {
      if (r.whatsappPoruke.length > 0) {
        preskoceno++;
        detalji.push({ rezervacijaId: r.id, ishod: "VEC_POSLANO" });
        continue;
      }

      const e164 = normalizirajE164(r.gost?.telefon);
      if (!e164) {
        preskoceno++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_TELEFONA" });
        continue;
      }

      if (r.jedinica.ttlockBrave.length === 0) {
        preskoceno++;
        detalji.push({ rezervacijaId: r.id, ishod: "NEMA_BRAVE" });
        continue;
      }

      // ── (b) Osiguraj zapise šifre (ne diraj postojeće ako već postoje) ──
      const sifra = generirajSifruIzTelefona(r.gost?.telefon);
      // Hrvatski zidni sat (16:00 prijava / 10:00 odjava) → ispravan UTC instant.
      // setHours bi na UTC serveru (Vercel) protumačio 16:00 kao UTC i brava bi
      // dobila +2h (ljeti). zagrebWallClockToInstant je DST-aware.
      const vrijediOd = zagrebWallClockToInstant(r.datumOd, CHECKIN_TIME_HOUR, 0);
      const vrijediDo = zagrebWallClockToInstant(r.datumDo, CHECKOUT_TIME_HOUR, 0);

      for (const veza of r.jedinica.ttlockBrave) {
        await prisma.rezervacijaTtlockSifra.upsert({
          where: {
            rezervacijaId_bravaId: {
              rezervacijaId: r.id,
              bravaId: veza.bravaId,
            },
          },
          update: {}, // ne prepisuj postojeću šifru/prozor
          create: {
            rezervacijaId: r.id,
            bravaId: veza.bravaId,
            sifra,
            vrijediOd,
            vrijediDo,
            status: "CEKA",
          },
        });
      }

      // ── (c) Push šifre na fizičke brave; sve koje nisu POSLANO ──
      const sifre = await prisma.rezervacijaTtlockSifra.findMany({
        where: { rezervacijaId: r.id },
        include: { brava: true },
      });

      let pushGreska: string | null = null;

      for (const s of sifre) {
        if (s.status === "POSLANO") continue;
        try {
          // Orkestrator: ADD ako brava još nema šifru, inače CHANGE (zadrži
          // postojeći keyboardPwdId), s DELETE+ADD fallbackom. Sprječava
          // "The same passcode already exists." kod ponovnog slanja.
          const resp = await sinkronizirajTtlockSifru({
            lockId: s.brava.lockId,
            keyboardPwdId: s.ttlockKeyboardPwdId,
            sifra: s.sifra,
            naziv: `${r.jedinica.naziv} ${r.gost?.ime || "Gost"}`,
            vrijediOd: s.vrijediOd,
            vrijediDo: s.vrijediDo,
          });

          await prisma.rezervacijaTtlockSifra.update({
            where: { id: s.id },
            data: {
              status: "POSLANO",
              // CHANGE vrati isti pwdId; ADD/DELETE_ADD vrate novi. Ne gazi
              // postojeći s null ako iz nekog razloga nije vraćen.
              ttlockKeyboardPwdId:
                resp.keyboardPwdId ?? s.ttlockKeyboardPwdId ?? null,
              greska: null,
            },
          });
        } catch (err: any) {
          pushGreska = err?.message || "TTLock push nije uspio.";
          await prisma.rezervacijaTtlockSifra.update({
            where: { id: s.id },
            data: { status: "GRESKA", greska: pushGreska },
          });
        }
      }

      // Provjera: je li baš SVE aktivno (POSLANO) na bravama?
      const neaktivnih = await prisma.rezervacijaTtlockSifra.count({
        where: { rezervacijaId: r.id, status: { not: "POSLANO" } },
      });

      if (pushGreska || neaktivnih > 0) {
        // Šifra nije aktivna → NE šalji poruku, NE bilježi kao poslano.
        const poruka = `TTLock push nije uspio — SMS NIJE poslan. ${
          pushGreska || `${neaktivnih} brava nije aktivirano.`
        }`.trim();

        console.error(`[whatsapp-checkin] rez ${r.id}: ${poruka}`);

        await prisma.whatsappPoruka.create({
          data: {
            rezervacijaId: r.id,
            kanal: "SMS",
            tip: "CHECKIN",
            primatelj: e164,
            templateSid: null,
            varijable: {},
            tekstPregled:
              "Poruka NIJE poslana — TTLock šifra nije aktivirana na bravi.",
            status: "GRESKA",
            greska: poruka,
          },
        });

        greske++;
        detalji.push({ rezervacijaId: r.id, ishod: "PUSH_GRESKA" });
        continue;
      }

      // ── (d) Sastavi SMS tekst (po jeziku gosta) i pošalji (Infobip) ──
      // Ista šifra otvara glavni ulaz i apartman (TTLock push to već gura na
      // obje brave). Tekst je ASCII (GSM-7); eCheckin red se izostavlja ako
      // rezervacija nema spremljen link.
      const smsTekst = sastaviCheckinSms({
        // Jezik preko resolvera (drzava korigira zaglavljeni "hr" default).
        jezik: rezerviraniJezik(r.gost),
        ime: r.gost?.ime || "gost",
        objekt: r.jedinica.objekt.naziv, // pun naziv: "Apartments Eva" / "Luxury Apartments Marty" / "House Art"
        datumUlaska: formatDatumKratko(r.datumOd),
        datumIzlaska: formatDatumKratko(r.datumDo),
        sifra,
        // Broj apartmana samo za Eva/Marty; House Art → null (red se izostavlja).
        brojApartmana: brojApartmanaIzNaziva(r.jedinica.naziv),
        kontakt,
        eCheckinLink: r.eCheckinLink,
        appUrl,
        slug: nazivToSlug(r.jedinica.objekt.naziv),
        rezervacijaId: r.id,
      });

      const infobip = await posaljiSmsInfobip({ to: e164, text: smsTekst });

      await prisma.whatsappPoruka.create({
        data: {
          rezervacijaId: r.id,
          kanal: "SMS",
          tip: "CHECKIN",
          primatelj: e164,
          templateSid: null,
          varijable: {},
          tekstPregled: smsTekst,
          twilioSid: infobip.messageId, // polje zadržava ime; sadrži Infobip messageId
          status: "POSLANO",
        },
      });

      poslano++;
      detalji.push({ rezervacijaId: r.id, ishod: "POSLANO" });
    } catch (err: any) {
      // Infobip ili neočekivana greška — jedna pala poruka NE ruši batch.
      const poruka = err?.message || "Nepoznata greška kod slanja.";
      console.error(`[whatsapp-checkin] rez ${r.id}: ${poruka}`);

      try {
        await prisma.whatsappPoruka.create({
          data: {
            rezervacijaId: r.id,
            kanal: "SMS",
            tip: "CHECKIN",
            primatelj: normalizirajE164(r.gost?.telefon) || "(nepoznato)",
            templateSid: null,
            varijable: {},
            tekstPregled: "Poruka NIJE poslana — greška kod slanja SMS-a.",
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
    danaPrije,
    ciljDatum: ciljOd,
    pronadeno: rezervacije.length,
    poslano,
    preskoceno,
    greske,
    detalji,
  });
}
