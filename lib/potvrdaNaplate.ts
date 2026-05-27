import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { generateRacunPdf } from "@/lib/generateRacunPdf";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import {
  dohvatiPrijevode,
  odaberiJezikMaila,
  formatDateZaMail,
} from "@/lib/mailovi";

// Zajednička logika potvrde/naplate plaćanja — izlučena iz
// /api/admin/placanja/potvrdi-link route handlera.
//
// Razlog izlučivanja (PR 0): nakon dodavanja adminSessionOk() gatea na
// /api/admin rute, server akcije koje su tu rutu zvale HTTP fetch-om
// (evidentirajUplatu, admin "nova rezervacija") dobivale su 401 jer
// server-side fetch ne nosi preglednikov admin cookie. Sada te akcije
// zovu potvrdiNaplatu() direktno (in-process), bez auth gatea i fetch-a.

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

  const racuni = await tx.racun.findMany({
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

  for (const racun of racuni) {
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

export type PotvrdaNaplateResult =
  | {
      ok: true;
      // true ako je plaćanje već ranije bilo potvrđeno (s računom) — nema novog rada.
      vecPotvrdeno: boolean;
      rezervacijaId: string;
      brojRacuna: string;
      pdfUrl: string | null;
      statusRezervacije: string;
    }
  | {
      ok: false;
      error: string;
      // HTTP status koji route handler treba vratiti; server akcije ga ignoriraju.
      status: number;
    };

// Potvrdi plaćanje: ako je Stripe, naplati autorizaciju (capture); izradi
// račun + PDF, pošalji mail gostu, ažuriraj statuse rezervacije i plaćanja.
// Idempotentno: ako je plaćanje već PLACENO i ima račun, ne radi ništa novo.
export async function potvrdiNaplatu(
  placanjeId: string
): Promise<PotvrdaNaplateResult> {
  if (!placanjeId) {
    return { ok: false, error: "Nedostaje placanjeId", status: 400 };
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
    return { ok: false, error: "Plaćanje nije pronađeno.", status: 404 };
  }

  if (placanje.status === "PLACENO") {
    const postojiRacun = await prisma.racun.findFirst({
      where: {
        placanjeId: placanje.id,
      },
    });

    if (postojiRacun?.pdfUrl) {
      return {
        ok: true,
        vecPotvrdeno: true,
        rezervacijaId: placanje.rezervacijaId,
        brojRacuna: postojiRacun.brojRacuna,
        pdfUrl: postojiRacun.pdfUrl,
        statusRezervacije: placanje.rezervacija.status,
      };
    }

    // Plaćanje je označeno kao plaćeno, ali račun nedostaje.
    // Nastavljamo dalje da se račun može izraditi i poslati.
  }

  let paymentIntentId: string | null = null;

  if (placanje.provider === "STRIPE") {
    paymentIntentId = await getStripePaymentIntentId(placanje);

    if (!paymentIntentId) {
      return {
        ok: false,
        error:
          "Stripe autorizacija nije pronađena. Gost možda nije dovršio kartično plaćanje.",
        status: 400,
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (
      placanje.status !== "PLACENO" &&
      paymentIntent.status === "requires_capture"
    ) {
      await stripe.paymentIntents.capture(paymentIntentId);
    } else if (
      paymentIntent.status === "succeeded" ||
      placanje.status === "PLACENO"
    ) {
      // već naplaćeno, samo nastavljamo izradu računa i slanje maila
    } else {
      return {
        ok: false,
        error: `Kartica nije spremna za naplatu. Stripe status: ${paymentIntent.status}`,
        status: 400,
      };
    }
  }

  const ukupnoRezervacije = Number(
    placanje.rezervacija.dogovoreniIznos ||
      placanje.rezervacija.iznosUkupno ||
      placanje.rezervacija.iznosOsnovni ||
      0
  );

  const novoPlaceno =
    placanje.status === "PLACENO"
      ? Number(placanje.rezervacija.iznosPlaceno || 0)
      : Number(placanje.rezervacija.iznosPlaceno || 0) +
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
        napomena:
          "Stripe kartica je naplaćena. Rezervacija je potvrđena i račun je poslan gostu.",
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
      const pdfResponse = await fetch(pdfUrl);

      if (!pdfResponse.ok) {
        throw new Error(
          `PDF račun nije moguće dohvatiti: ${pdfResponse.status}`
        );
      }

      const arrayBuffer = await pdfResponse.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const email =
        placanje.rezervacija.gost?.email || "goran.ligo@gmail.com";
      const ccEmails = getCcEmails(objekt);

      const jezik = odaberiJezikMaila(placanje.rezervacija.gost?.jezik);
      const t = dohvatiPrijevode(jezik).potvrdaNaplate;
      const placeno = noviStatus === "PLACENO";

      const gostIme = placanje.rezervacija.gost?.ime || "Poštovani gost";
      const nazivJedinice = placanje.rezervacija.jedinica.naziv;
      const nazivObjekta = placanje.rezervacija.jedinica.objekt.naziv;

      const datumOd = formatDateZaMail(placanje.rezervacija.datumOd, jezik);
      const datumDo = formatDateZaMail(placanje.rezervacija.datumDo, jezik);

      const mailResult = await resend.emails.send({
        from: "Malinska Stay <rezervacije@malinska-stay.hr>",
        to: email,
        cc: ccEmails,
        bcc: [BCC_EMAIL],
        subject: t.subject(placeno),
        html: mailWrapper({
          title: t.title(placeno),
          subtitle: t.subtitle(placeno),
          children: `
      <p>${t.pozdrav(gostIme)}</p>

      <p>${t.uvodPara(placeno)}</p>

      <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
        <h3 style="margin:0 0 14px;">${t.detaljiNaslov}</h3>
        <p><strong>${t.labelObjekt}</strong> ${nazivObjekta}</p>
        <p><strong>${t.labelJedinica}</strong> ${nazivJedinice}</p>
        <p><strong>${t.labelDolazak}</strong> ${datumOd}</p>
        <p><strong>${t.labelOdlazak}</strong> ${datumDo}</p>
        <p><strong>${t.labelUplaceno}</strong> ${Number(placanje.iznos || 0).toFixed(2)} ${placanje.valuta || "EUR"}</p>
        ${
          noviOstatak > 0
            ? `<p><strong>${t.labelPreostalo}</strong> ${Number(noviOstatak).toFixed(2)} ${placanje.valuta || "EUR"}</p>`
            : ""
        }
      </div>

      ${
        placeno
          ? `
          <div style="padding:16px; background:#eaf7ef; border:1px solid #22c55e; color:#166534;">
            <strong>${t.potvrdjenoNaslov}</strong><br/>
            ${t.potvrdjenoText(true)}
          </div>
        `
          : `
          <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
            <strong>${t.potvrdjenoNaslov}</strong><br/>
            ${t.potvrdjenoText(false)}
          </div>
        `
      }

      <p style="margin-top:28px;">
        ${t.veselimoSe}
      </p>

      <p>
        ${t.zavrsetak}
      </p>
    `,
        }),
        attachments: [
          {
            filename: `${brojRacuna}.pdf`,
            content: fileBuffer,
          },
        ],
      });

      if (mailResult.error) {
        await tx.emailLog.create({
          data: {
            rezervacijaId: placanje.rezervacijaId,
            to: email,
            subject: `Račun ${brojRacuna} nije poslan`,
            tip:
              placanje.tip === "POTVRDA_REZERVACIJE"
                ? "POTVRDA_REZERVACIJE"
                : "HVALA_NA_PLACANJU",
            status: "GRESKA",
            greska:
              mailResult.error.message || "Resend greška kod slanja maila.",
          },
        });
      } else {
        await tx.emailLog.create({
          data: {
            rezervacijaId: placanje.rezervacijaId,
            to: email,
            subject: `Račun ${brojRacuna} poslan`,
            tip:
              placanje.tip === "POTVRDA_REZERVACIJE"
                ? "POTVRDA_REZERVACIJE"
                : "HVALA_NA_PLACANJU",
            status: "POSLANO",
          },
        });
      }

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
            pdfUrl,
          }),
          korisnikIme: "Admin",
        },
      });
    }
  });

  revalidatePath(`/admin/rezervacije/${placanje.rezervacijaId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/rezervacije");
  revalidatePath("/admin/rezervacije/naplata");
  revalidatePath("/admin/monitor");

  return {
    ok: true,
    vecPotvrdeno: false,
    rezervacijaId: placanje.rezervacijaId,
    brojRacuna,
    pdfUrl,
    statusRezervacije: noviStatus,
  };
}
