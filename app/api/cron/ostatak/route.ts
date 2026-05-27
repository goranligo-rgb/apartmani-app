import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import {
  dohvatiPrijevode,
  odaberiJezikMaila,
  formatDateZaMail,
} from "@/lib/mailovi";

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

function getMailFrom() {
  return process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>";
}

async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (postavke?.appUrl) return postavke.appUrl;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

function mailWrapper({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f4efe6; padding:24px;">
      <div style="max-width:640px; margin:0 auto; background:white; border:1px solid #eadfce;">
        <div style="background:#2e2923; color:white; padding:22px;">
          <h2 style="margin:0;">${title}</h2>
          <p style="margin:8px 0 0; color:#eadfce;">${subtitle}</p>
        </div>

        <div style="padding:24px; color:#2e2923; line-height:1.55;">
          ${children}
        </div>
      </div>
    </div>
  `;
}

export async function GET() {
  try {
    const postavke = await prisma.postavkeNaplate.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (postavke && !postavke.automatskiSaljiPodsjetnikOstatka) {
      return NextResponse.json({
        success: true,
        message: "Automatsko slanje podsjetnika ostatka je isključeno.",
        pronadeno: 0,
        poslano: 0,
      });
    }

    const danaPrijeDolaska =
      postavke?.danaPrijeDolaskaSlanjeOstatka ?? 7;

    const danas = new Date();

    const datumDolaska = new Date();
    datumDolaska.setDate(danas.getDate() + danaPrijeDolaska);
    datumDolaska.setHours(0, 0, 0, 0);

    const danPoslije = new Date(datumDolaska);
    danPoslije.setDate(datumDolaska.getDate() + 1);

    const baseUrl = await getAppUrl();

    const rezervacije = await prisma.rezervacija.findMany({
      where: {
        status: "POTVRDENO",
        datumOd: {
          gte: datumDolaska,
          lt: danPoslije,
        },
      },
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
    });

    let poslano = 0;

    for (const r of rezervacije) {
      if (!r.gost?.email) continue;

      const vecPoslan = await prisma.emailLog.findFirst({
        where: {
          rezervacijaId: r.id,
          tip: "ZAHTJEV_OSTATAK",
        },
      });

      if (vecPoslan) continue;

      const ukupno = Number(r.iznosUkupno || 0);
      const placeno = Number(r.iznosPlaceno || 0);
      const ostatak = Math.max(ukupno - placeno, 0);

      if (ostatak <= 0) continue;

      let placanje = await prisma.placanje.findFirst({
        where: {
          rezervacijaId: r.id,
          tip: "OSTATAK",
          status: {
            in: ["CEKA_PLACANJE", "ZAHTJEV_POSLAN"],
          },
        },
      });

      if (!placanje) {
        placanje = await prisma.placanje.create({
          data: {
            rezervacijaId: r.id,
            tip: "OSTATAK",
            status: "CEKA_PLACANJE",
            iznos: ostatak,
            valuta: r.valuta || "EUR",
            nacinPlacanja: "KARTICA",
          },
        });
      }

      const paymentLink = `${baseUrl}/placanje/${placanje.id}`;
      const jezik = odaberiJezikMaila(r.gost.jezik);
      const t = dohvatiPrijevode(jezik).podsjetnikOstatak;

      await resend.emails.send({
        from: getMailFrom(),
        to: r.gost.email,
        bcc: [BCC_EMAIL],
        subject: t.subject,
        html: mailWrapper({
          title: t.title,
          subtitle: t.subtitle,
          children: `
    <p>${t.pozdrav(r.gost.ime || "goste")}</p>

    <p>
      ${t.uvodPara}
    </p>

    <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
      <h3 style="margin:0 0 14px;">${t.detaljiNaslov}</h3>
      <p><strong>${t.labelObjekt}</strong> ${r.jedinica.objekt.naziv}</p>
      <p><strong>${t.labelJedinica}</strong> ${r.jedinica.naziv}</p>
      <p><strong>${t.labelDolazak}</strong> ${formatDateZaMail(r.datumOd, jezik)}</p>
      <p><strong>${t.labelOdlazak}</strong> ${formatDateZaMail(r.datumDo, jezik)}</p>
      <p><strong>${t.labelPreostalo}</strong> ${ostatak.toFixed(2)} ${r.valuta || "EUR"}</p>
    </div>

    <p style="margin:24px 0;">
      <a href="${paymentLink}" style="display:inline-block;background:#2e2923;color:#fff;padding:13px 20px;text-decoration:none;font-weight:bold;">
        ${t.button}
      </a>
    </p>

    <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
      ${t.vecZanemarite}
    </div>

    <p style="margin-top:28px;">
      ${t.veselimoSe}
    </p>

    <p>
       ${t.zavrsetak}
            </p>
          `,
        }),
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId: r.id,
          to: r.gost.email,
          subject: t.subject,
          tip: "ZAHTJEV_OSTATAK",
        },
      });

      poslano++;
    }

    return NextResponse.json({
      success: true,
      danaPrijeDolaska,
      datumDolaska,
      pronadeno: rezervacije.length,
      poslano,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Greška" }, { status: 500 });
  }
}