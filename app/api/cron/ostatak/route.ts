import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function getMailFrom() {
  return process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>";
}

async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst();

  if (postavke?.appUrl) return postavke.appUrl;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

export async function GET() {
  try {
    const postavke = await prisma.postavkeNaplate.findFirst();

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

      await resend.emails.send({
        from: getMailFrom(),
        to: r.gost.email,
        subject: "Molimo uplatu ostatka rezervacije",
        html: `
          <h2>Podsjetnik za uplatu ostatka</h2>

          <p>Poštovani ${r.gost.ime || "goste"},</p>

          <p>Vaš dolazak je za ${danaPrijeDolaska} dana.</p>

          <p>
            <strong>Objekt:</strong> ${r.jedinica.objekt.naziv}<br/>
            <strong>Smještajna jedinica:</strong> ${r.jedinica.naziv}<br/>
            <strong>Dolazak:</strong> ${new Date(r.datumOd).toLocaleDateString("hr-HR")}<br/>
            <strong>Odlazak:</strong> ${new Date(r.datumDo).toLocaleDateString("hr-HR")}
          </p>

          <p>
            Preostali iznos za uplatu:
            <strong>${ostatak.toFixed(2)} ${r.valuta || "EUR"}</strong>
          </p>

          <p>
            <a href="${paymentLink}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold;">
              Klikni i plati ostatak
            </a>
          </p>

          <p>Ako ste uplatu već izvršili, ovu poruku možete zanemariti.</p>

          <br/>
          <p>Lijep pozdrav,<br/>Malinska Stay</p>
        `,
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId: r.id,
          to: r.gost.email,
          subject: "Podsjetnik za uplatu ostatka",
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