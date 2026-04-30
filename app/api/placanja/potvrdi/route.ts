import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRacunPdf } from "@/lib/generateRacunPdf";
import fs from "fs";
import path from "path";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  const sljedeciBroj = najveciBroj + 1;

  return `${prefix}-${String(sljedeciBroj).padStart(3, "0")}-${godina}`;
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

    const noviStatus =
      placanje.tip === "OSTATAK" || placanje.tip === "CIJELI_IZNOS"
        ? "PLACENO"
        : "POTVRDENO";

    const objekt = placanje.rezervacija.jedinica.objekt;

    let brojRacuna = "";
    let pdfUrl: string | null = null;

    await prisma.$transaction(async (tx) => {
      brojRacuna = await getNextBrojRacuna(
        tx,
        objekt.prefixRacuna || objekt.naziv
      );

      // 1. označi plaćanje
      await tx.placanje.update({
        where: { id: placanjeId },
        data: {
          status: "PLACENO",
          placenoAt: new Date(),
        },
      });

      // 2. ažuriraj rezervaciju
      await tx.rezervacija.update({
        where: { id: placanje.rezervacijaId },
        data: {
          status: noviStatus as any,
          iznosPlaceno: {
            increment: placanje.iznos,
          },
        },
      });

      // 3. kreiraj račun
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

      // 4. generiraj PDF račun s podacima rezervacije, gosta, jedinice i objekta
      pdfUrl = await generateRacunPdf({
        ...noviRacun,
        rezervacija: placanje.rezervacija,
        gost: placanje.rezervacija.gost,
        jedinica: placanje.rezervacija.jedinica,
        objekt: placanje.rezervacija.jedinica.objekt,
      });

      // 5. spremi PDF link u račun
      await tx.racun.update({
        where: { id: noviRacun.id },
        data: {
          pdfUrl,
        },
      });

      // 6. pošalji mail gostu + CC iz postavki računa
      if (pdfUrl) {
        const cleanPdfUrl = pdfUrl.startsWith("/") ? pdfUrl.slice(1) : pdfUrl;
        const filePath = path.join(process.cwd(), "public", cleanPdfUrl);
        const fileBuffer = fs.readFileSync(filePath);

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

        if (placanje.tip === "POTVRDA_REZERVACIJE") {
          await resend.emails.send({
            from: "Apartmani <info@malinska-stay.hr>",
            to: email,
            cc: ccEmails,
            subject: "Vaša rezervacija je potvrđena",
            html: `
              <h2>Hvala na rezervaciji</h2>

              <p>Poštovani ${gostIme},</p>

              <p>Vaša rezervacija je uspješno potvrđena.</p>

              <p>
                <strong>Objekt:</strong> ${nazivObjekta}<br/>
                <strong>Smještajna jedinica:</strong> ${nazivJedinice}<br/>
                <strong>Dolazak:</strong> ${datumOd}<br/>
                <strong>Odlazak:</strong> ${datumDo}
              </p>

              <p>U privitku vam šaljemo račun za potvrdu rezervacije.</p>

              <p>Veselimo se vašem dolasku!</p>

              <br/>
              <p>Lijep pozdrav,<br/>Malinska Stay</p>
            `,
            attachments: attachment,
          });
        }

        if (placanje.tip === "OSTATAK") {
          await resend.emails.send({
            from: "Apartmani <info@malinska-stay.hr>",
            to: email,
            cc: ccEmails,
            subject: "Plaćanje zaprimljeno",
            html: `
              <h2>Hvala na uplati</h2>

              <p>Poštovani ${gostIme},</p>

              <p>Vaša uplata ostatka rezervacije je zaprimljena.</p>

              <p>
                <strong>Objekt:</strong> ${nazivObjekta}<br/>
                <strong>Smještajna jedinica:</strong> ${nazivJedinice}<br/>
                <strong>Dolazak:</strong> ${datumOd}<br/>
                <strong>Odlazak:</strong> ${datumDo}
              </p>

              <p>Vaša rezervacija je sada u potpunosti plaćena.</p>
              <p>U privitku vam šaljemo račun.</p>

              <br/>
              <p>Lijep pozdrav,<br/>Malinska Stay</p>
            `,
            attachments: attachment,
          });
        }

        if (placanje.tip === "CIJELI_IZNOS") {
          await resend.emails.send({
            from: "Apartmani <info@malinska-stay.hr>",
            to: email,
            cc: ccEmails,
            subject: "Rezervacija i plaćanje potvrđeni",
            html: `
              <h2>Hvala na uplati</h2>

              <p>Poštovani ${gostIme},</p>

              <p>Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena.</p>

              <p>
                <strong>Objekt:</strong> ${nazivObjekta}<br/>
                <strong>Smještajna jedinica:</strong> ${nazivJedinice}<br/>
                <strong>Dolazak:</strong> ${datumOd}<br/>
                <strong>Odlazak:</strong> ${datumDo}
              </p>

              <p>U privitku vam šaljemo račun.</p>

              <br/>
              <p>Lijep pozdrav,<br/>Malinska Stay</p>
            `,
            attachments: attachment,
          });
        }
      }

      // 7. email log
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
    });

    return NextResponse.json({
      success: true,
      brojRacuna,
      pdfUrl,
      statusRezervacije: noviStatus,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Greška servera" },
      { status: 500 }
    );
  }
}