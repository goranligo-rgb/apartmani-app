import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    const danas = new Date();

    const za7Dana = new Date();
    za7Dana.setDate(danas.getDate() + 7);
    za7Dana.setHours(0, 0, 0, 0);

    const sutra = new Date(za7Dana);
    sutra.setDate(za7Dana.getDate() + 1);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const rezervacije = await prisma.rezervacija.findMany({
      where: {
        status: "POTVRDENO",
        datumOd: {
          gte: za7Dana,
          lt: sutra,
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

      const ukupno = r.iznosUkupno || 0;
      const placeno = r.iznosPlaceno || 0;
      const ostatak = Math.max(ukupno - placeno, 0);

      if (ostatak <= 0) continue;

      let placanje = await prisma.placanje.findFirst({
        where: {
          rezervacijaId: r.id,
          tip: "OSTATAK",
          status: "CEKA_PLACANJE",
        },
      });

      if (!placanje) {
        placanje = await prisma.placanje.create({
          data: {
            rezervacijaId: r.id,
            tip: "OSTATAK",
            iznos: ostatak,
            valuta: r.valuta || "EUR",
          },
        });
      }

      const paymentLink = `${baseUrl}/placanje/${placanje.id}`;

      await resend.emails.send({
        from: "Apartmani <info@malinska-stay.hr>",
        to: r.gost.email,
        subject: "Molimo uplatu ostatka rezervacije",
        html: `
          <h2>Podsjetnik za uplatu ostatka</h2>

          <p>Poštovani ${r.gost.ime || "goste"},</p>

          <p>Vaš dolazak je za 7 dana.</p>

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
      pronadeno: rezervacije.length,
      poslano,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Greška" }, { status: 500 });
  }
}