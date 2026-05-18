import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { generateRacunPdf } from "@/lib/generateRacunPdf";
import fs from "fs";
import path from "path";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

function sanitizePrefix(value?: string | null) {
  const clean = String(value || "RAC")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return clean || "RAC";
}

async function getNextBrojRacuna(tx: any, prefixRaw?: string | null) {
  const prefix = sanitizePrefix(prefixRaw);
  const godina = new Date().getFullYear();

  const postojeciRacuni = await tx.racun.findMany({
    where: {
      brojRacuna: {
        startsWith: `${prefix}-`,
      },
    },
    select: {
      brojRacuna: true,
    },
  });

  let najveciBroj = 0;

  for (const racun of postojeciRacuni) {
    const match = String(racun.brojRacuna).match(
      new RegExp(`^${prefix}-(\\d+)-${godina}$`)
    );

    if (match) {
      const broj = Number(match[1]);

      if (!Number.isNaN(broj) && broj > najveciBroj) {
        najveciBroj = broj;
      }
    }
  }

  return `${prefix}-${String(najveciBroj + 1).padStart(3, "0")}-${godina}`;
}

function getCcEmails(objekt: any) {
  const raw = String(objekt.ccEmailZaRacun || "").trim();

  const cc = raw
    ? raw
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)
    : [];

  const unique = cc.filter((email, index, arr) => arr.indexOf(email) === index);

  return unique.length > 0 ? unique : undefined;
}

async function getStripePaymentIntentId(placanje: any) {
  if (placanje.paymentIntentId) {
    return placanje.paymentIntentId;
  }

  if (!placanje.providerId) {
    return null;
  }

  const session = await stripe.checkout.sessions.retrieve(placanje.providerId);
  const pi = session.payment_intent;

  if (!pi) return null;

  return typeof pi === "string" ? pi : pi.id;
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { placanjeId } = body;

    if (!placanjeId) {
      return NextResponse.json(
        { error: "Nedostaje placanjeId" },
        { status: 400 }
      );
    }

    const placanje = await prisma.placanje.findUnique({
      where: { id: placanjeId },
      include: {
        rezervacija: {
          include: {
            gost: true,
            jedinica: {
              include: {
                objekt: true,
              },
            },
          },
        },
      },
    });

    if (!placanje) {
      return NextResponse.json(
        { error: "Plaćanje ne postoji" },
        { status: 404 }
      );
    }

    if (placanje.status === "PLACENO") {
      return NextResponse.json({
        success: true,
        message: "Plaćanje je već ranije potvrđeno.",
      });
    }

    let paymentIntentId: string | null = null;

    if (placanje.provider === "STRIPE") {
      paymentIntentId = await getStripePaymentIntentId(placanje);

      if (!paymentIntentId) {
        return NextResponse.json(
          {
            error:
              "Stripe autorizacija nije pronađena. Gost možda nije dovršio kartično plaćanje.",
          },
          { status: 400 }
        );
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      if (paymentIntent.status === "requires_capture") {
        await stripe.paymentIntents.capture(paymentIntentId);
      } else if (paymentIntent.status === "succeeded") {
        // već je naplaćeno, nastavljamo samo s evidencijom u sustavu
      } else {
        return NextResponse.json(
          {
            error: `Kartica nije spremna za naplatu. Stripe status: ${paymentIntent.status}`,
          },
          { status: 400 }
        );
      }
    }

    const ukupnoRezervacije = Number(
      placanje.rezervacija.dogovoreniIznos ||
      placanje.rezervacija.iznosUkupno ||
      placanje.rezervacija.iznosOsnovni ||
      0
    );

    const novoPlaceno =
      Number(placanje.rezervacija.iznosPlaceno || 0) +
      Number(placanje.iznos || 0);

    const noviOstatak = Math.max(ukupnoRezervacije - novoPlaceno, 0);

    const noviStatus =
      noviOstatak <= 0
        ? "PLACENO"
        : placanje.tip === "POTVRDA_REZERVACIJE"
          ? "POTVRDENO"
          : "CEKA_OSTATAK";

    const objekt = placanje.rezervacija.jedinica.objekt;

    let brojRacuna = "";
    let pdfUrl: string | null = null;

    await prisma.$transaction(async (tx) => {
      brojRacuna = await getNextBrojRacuna(
        tx,
        objekt.prefixRacuna || objekt.naziv
      );

      await tx.placanje.update({
        where: { id: placanjeId },
        data: {
          status: "PLACENO",
          placenoAt: new Date(),
          paymentIntentId: paymentIntentId || placanje.paymentIntentId,
        },
      });

      await tx.rezervacija.update({
        where: { id: placanje.rezervacijaId },
        data: {
          status: noviStatus as any,
          iznosPlaceno: novoPlaceno,
          iznosOstatka: noviOstatak,
          placenoKarticom: placanje.provider === "STRIPE" ? true : undefined,
        },
      });

      const noviRacun = await tx.racun.create({
        data: {
          rezervacijaId: placanje.rezervacijaId,
          placanjeId: placanje.id,
          objektId: objekt.id,

          brojRacuna,
          iznos: placanje.iznos,
          valuta: placanje.valuta,

          nazivIzdavatelja: objekt.nazivZaRacun || objekt.naziv,
          oibIzdavatelja: objekt.oibZaRacun,
          adresaIzdavatelja: objekt.adresaZaRacun,
          mjestoIzdavatelja: objekt.mjestoZaRacun || objekt.mjesto,
          ibanIzdavatelja: objekt.ibanZaRacun,
          emailIzdavatelja: objekt.emailZaRacun,
          telefonIzdavatelja: objekt.telefonZaRacun,
        },
      });

      pdfUrl = await generateRacunPdf({
        ...noviRacun,
        rezervacija: placanje.rezervacija,
        gost: placanje.rezervacija.gost,
        jedinica: placanje.rezervacija.jedinica,
        objekt: placanje.rezervacija.jedinica.objekt,
      });

      await tx.racun.update({
        where: { id: noviRacun.id },
        data: {
          pdfUrl,
        },
      });

      if (pdfUrl) {
        // PDF dohvaća se s Supabase Storage URL-a (ne s local file system-a).
        // Stari `fs.readFileSync(path.join(cwd, "public", pdfUrl))` pattern
        // nije radio na Vercel-u jer PDF-ovi nisu static asseti.
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`PDF račun nije dostupan: ${pdfResponse.status}`);
        }
        const arrayBuffer = await pdfResponse.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);

        const email = placanje.rezervacija.gost?.email || "goran.ligo@gmail.com";
        const ccEmails = getCcEmails(objekt);

        const gostIme = placanje.rezervacija.gost?.ime || "Poštovani gost";
        const nazivJedinice = placanje.rezervacija.jedinica.naziv;
        const nazivObjekta = placanje.rezervacija.jedinica.objekt.naziv;

        const datumOd = new Date(
          placanje.rezervacija.datumOd
        ).toLocaleDateString("hr-HR");

        const datumDo = new Date(
          placanje.rezervacija.datumDo
        ).toLocaleDateString("hr-HR");

        const attachment = [
          {
            filename: `${brojRacuna}.pdf`,
            content: fileBuffer,
          },
        ];

        await resend.emails.send({
          from: "Apartmani <rezervacije@malinska-stay.hr>",
          to: email,
          cc: ccEmails,
          bcc: [BCC_EMAIL],
          subject:
            noviStatus === "PLACENO"
              ? "Rezervacija i plaćanje potvrđeni"
              : "Vaša rezervacija je potvrđena",
          html: mailWrapper({
            title:
              noviStatus === "PLACENO"
                ? "Rezervacija i plaćanje potvrđeni"
                : "Rezervacija je potvrđena",
            subtitle:
              noviStatus === "PLACENO"
                ? "Vaša rezervacija je potvrđena i u potpunosti plaćena."
                : "Vaša rezervacija je potvrđena uz uplatu akontacije.",
            children: `
      <p>Poštovani <strong>${gostIme}</strong>,</p>

      <p>
        ${noviStatus === "PLACENO"
                ? "Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena."
                : "Vaša rezervacija je uspješno potvrđena. Preostali iznos bit će potrebno podmiriti prema dogovorenim uvjetima prije dolaska."
              }
      </p>

      <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
        <h3 style="margin:0 0 14px;">Detalji rezervacije</h3>
        <p><strong>Objekt:</strong> ${nazivObjekta}</p>
        <p><strong>Smještajna jedinica:</strong> ${nazivJedinice}</p>
        <p><strong>Dolazak:</strong> ${datumOd}</p>
        <p><strong>Odlazak:</strong> ${datumDo}</p>
        <p><strong>Uplaćeno:</strong> ${Number(placanje.iznos || 0).toFixed(2)} ${placanje.valuta || "EUR"
              }</p>
        ${noviOstatak > 0
                ? `<p><strong>Preostalo za uplatu:</strong> ${Number(
                  noviOstatak
                ).toFixed(2)} ${placanje.valuta || "EUR"}</p>`
                : ""
              }
      </div>

      ${noviStatus === "PLACENO"
                ? `
            <div style="padding:16px; background:#eaf7ef; border:1px solid #22c55e; color:#166534;">
              Rezervacija je u potpunosti plaćena. U privitku vam šaljemo račun.
            </div>
          `
                : `
            <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
              U privitku vam šaljemo račun za zaprimljenu uplatu. Podsjetnik za uplatu ostatka poslat ćemo prije dolaska.
            </div>
          `
              }

      <p style="margin-top:28px;">
        Veselimo se vašem dolasku u Malinsku.
      </p>

      <p>
        Lijep pozdrav,<br/>
        <strong>Malinska Stay</strong>
      </p>
    `,
          }),
          attachments: attachment,
        });

        await tx.emailLog.create({
          data: {
            rezervacijaId: placanje.rezervacijaId,
            to: placanje.rezervacija.gost?.email || "test@mail.com",
            subject: `Račun ${brojRacuna} poslan`,
            tip:
              placanje.tip === "POTVRDA_REZERVACIJE"
                ? "POTVRDA_REZERVACIJE"
                : "HVALA_NA_PLACANJU",
          },
        });

        await tx.rezervacijaPromjena.create({
          data: {
            rezervacijaId: placanje.rezervacijaId,
            tip: "POTVRDA_NAPLATE",
            opis:
              placanje.provider === "STRIPE"
                ? "Admin je potvrdio rezervaciju i naplatio Stripe autorizaciju."
                : "Admin je potvrdio plaćanje.",
            noviPodaci: JSON.stringify({
              placanjeId: placanje.id,
              iznos: placanje.iznos,
              valuta: placanje.valuta,
              provider: placanje.provider,
              paymentIntentId,
              statusRezervacije: noviStatus,
              brojRacuna,
            }),
            korisnikIme: "Admin",
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      brojRacuna,
      pdfUrl,
      statusRezervacije: noviStatus,
      captured: placanje.provider === "STRIPE",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Greška servera kod potvrde i naplate." },
      { status: 500 }
    );
  }
}