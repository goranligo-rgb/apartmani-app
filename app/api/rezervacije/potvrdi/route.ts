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

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatDate(value?: Date | string | null) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function mailFrom() {
  return process.env.MAIL_FROM || "Apartmani <onboarding@resend.dev>";
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function getPlacanjeIdFromRequest(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const rawBody = await req.text();

    if (!rawBody.trim()) {
      return {
        placanjeId: "",
        wantsJson: true,
      };
    }

    try {
      const body = JSON.parse(rawBody);

      return {
        placanjeId: String(body.placanjeId || ""),
        wantsJson: true,
      };
    } catch {
      return {
        placanjeId: "",
        wantsJson: true,
      };
    }
  }

  const formData = await req.formData();

  return {
    placanjeId: String(formData.get("placanjeId") || ""),
    wantsJson: false,
  };
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
  let placanjeId = "";
  let wantsJson = false;

  try {
    const parsed = await getPlacanjeIdFromRequest(req);
    placanjeId = parsed.placanjeId;
    wantsJson = parsed.wantsJson;

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
      if (wantsJson) {
        return NextResponse.json({
          success: true,
          message: "Plaćanje je već ranije potvrđeno.",
          rezervacijaId: placanje.rezervacijaId,
        });
      }

      return NextResponse.redirect(
        `${getAppUrl()}/placanje/uspjeh?placanjeId=${placanje.id}`
      );
    }

    const objekt = placanje.rezervacija.jedinica.objekt;
    const rezervacija = placanje.rezervacija;

    const ukupnoRezervacije = Number(
      rezervacija.dogovoreniIznos ||
      rezervacija.iznosUkupno ||
      rezervacija.iznosOsnovni ||
      0
    );

    const trenutnoPlaceno = Number(rezervacija.iznosPlaceno || 0);
    const novoUkupnoPlaceno = trenutnoPlaceno + Number(placanje.iznos || 0);
    const noviOstatak = Math.max(ukupnoRezervacije - novoUkupnoPlaceno, 0);

    let noviStatus: "POTVRDENO" | "CEKA_OSTATAK" | "PLACENO" = "POTVRDENO";

    if (ukupnoRezervacije > 0 && noviOstatak <= 0) {
      noviStatus = "PLACENO";
    } else if (
      placanje.tip === "OSTATAK" ||
      placanje.tip === "CIJELI_IZNOS"
    ) {
      noviStatus = noviOstatak <= 0 ? "PLACENO" : "CEKA_OSTATAK";
    } else {
      noviStatus = "POTVRDENO";
    }

    let brojRacuna = "";
    let pdfUrl: string | null = null;
    let racunId: string | null = null;

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
          provider: placanje.provider || "TEST_KARTICA",
          providerId: placanje.providerId || `test-${placanjeId}`,
        },
      });

      await tx.rezervacija.update({
        where: { id: placanje.rezervacijaId },
        data: {
          status: noviStatus,
          iznosPlaceno: novoUkupnoPlaceno,
          iznosOstatka: noviOstatak,
          placenoKarticom: true,
          rokUplateAkontacije: null,
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

      racunId = noviRacun.id;

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

      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId: placanje.rezervacijaId,
          tip: "KARTICNO_PLACANJE",
          opis: `Kartično plaćanje evidentirano: ${money(
            placanje.iznos
          )}. Račun: ${brojRacuna}`,
          noviPodaci: JSON.stringify({
            placanjeId: placanje.id,
            tipPlacanja: placanje.tip,
            iznos: placanje.iznos,
            noviStatus,
            novoUkupnoPlaceno,
            noviOstatak,
            brojRacuna,
            pdfUrl,
          }),
          korisnikIme: "Sustav",
        },
      });
    });

    if (pdfUrl && racunId) {
      const cleanPdfUrl =
        (pdfUrl as string).startsWith("/")
          ? (pdfUrl as string).slice(1)
          : (pdfUrl as string);
      const filePath = path.join(process.cwd(), "public", cleanPdfUrl);

      let attachments:
        | {
          filename: string;
          content: Buffer;
        }[]
        | undefined;

      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);

        attachments = [
          {
            filename: `${brojRacuna}.pdf`,
            content: fileBuffer,
          },
        ];
      }

      const email = placanje.rezervacija.gost?.email || "";
      const ccEmails = getCcEmails(objekt);

      const gostIme = placanje.rezervacija.gost?.ime || "Poštovani gost";
      const nazivJedinice = placanje.rezervacija.jedinica.naziv;
      const nazivObjekta = placanje.rezervacija.jedinica.objekt.naziv;

      const datumOd = formatDate(placanje.rezervacija.datumOd);
      const datumDo = formatDate(placanje.rezervacija.datumDo);

      let subject = "Plaćanje zaprimljeno";
      let naslov = "Hvala na uplati";
      let poruka =
        "Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena.";

      if (
        placanje.tip === "POTVRDA_REZERVACIJE" ||
        placanje.tip === "AKONTACIJA"
      ) {
        subject = "Vaša rezervacija je potvrđena";
        naslov = "Hvala na uplati";
        poruka =
          "Vaša uplata akontacije je zaprimljena i rezervacija je potvrđena.";
      }

      if (placanje.tip === "OSTATAK") {
        subject = "Uplata ostatka je zaprimljena";
        naslov = "Hvala na uplati";
        poruka = "Vaša uplata ostatka rezervacije je zaprimljena.";
      }

      if (placanje.tip === "CIJELI_IZNOS") {
        subject = "Rezervacija i plaćanje su potvrđeni";
        naslov = "Hvala na uplati";
        poruka =
          "Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena.";
      }

      let emailStatus: "POSLANO" | "GRESKA" = "GRESKA";
      let emailGreska: string | null = null;

      if (!email) {
        emailGreska = "Gost nema upisanu email adresu.";
      } else {
        try {
          await resend.emails.send({
            from: mailFrom(),
            to: email,
            cc: ccEmails,
            subject,
            html: mailWrapper({
              title: naslov,
              subtitle:
                noviOstatak > 0
                  ? "Rezervacija je potvrđena uz uplatu akontacije."
                  : "Rezervacija je potvrđena i plaćena u cijelosti.",
              children: `
                <p>Poštovani <strong>${gostIme}</strong>,</p>

                <p>${poruka}</p>

                <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
                  <h3 style="margin:0 0 14px;">Detalji rezervacije</h3>
                  <p><strong>Objekt:</strong> ${nazivObjekta}</p>
                  <p><strong>Smještajna jedinica:</strong> ${nazivJedinice}</p>
                  <p><strong>Dolazak:</strong> ${datumOd}</p>
                  <p><strong>Odlazak:</strong> ${datumDo}</p>
                  <p><strong>Zaprimljena uplata:</strong> ${money(placanje.iznos)}</p>
                  <p><strong>Broj računa:</strong> ${brojRacuna}</p>
                  ${noviOstatak > 0
                  ? `<p><strong>Preostali iznos za uplatu:</strong> ${money(noviOstatak)}</p>`
                  : `<p><strong>Status:</strong> Rezervacija je plaćena u cijelosti.</p>`
                }
                </div>

                <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
                  U privitku vam šaljemo račun.
                </div>

                <p style="margin-top:28px;">
                  Veselimo se vašem dolasku u Malinsku.
                </p>

                <p>
                  Lijep pozdrav,<br/>
                  <strong>Malinska Stay</strong>
                </p>
              `,
            }),
            attachments,
          });

          emailStatus = "POSLANO";

          await prisma.racun.update({
            where: { id: racunId },
            data: {
              poslanGostu: true,
            },
          });
        } catch (error: any) {
          emailGreska =
            error?.message ||
            JSON.stringify(error) ||
            "Greška kod slanja emaila.";
        }
      }

      await prisma.emailLog.create({
        data: {
          rezervacijaId: placanje.rezervacijaId,
          to: email || "bez-emaila",
          subject,
          tip:
            placanje.tip === "POTVRDA_REZERVACIJE" ||
              placanje.tip === "AKONTACIJA"
              ? "POTVRDA_REZERVACIJE"
              : "HVALA_NA_PLACANJU",
          status: emailStatus,
          greska: emailGreska,
        },
      });
    }

    if (wantsJson) {
      return NextResponse.json({
        success: true,
        brojRacuna,
        pdfUrl,
        statusRezervacije: noviStatus,
        rezervacijaId: placanje.rezervacijaId,
      });
    }

    return NextResponse.redirect(
      `${getAppUrl()}/placanje/uspjeh?placanjeId=${placanje.id}`
    );
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Greška servera kod potvrde plaćanja." },
      { status: 500 }
    );
  }
}