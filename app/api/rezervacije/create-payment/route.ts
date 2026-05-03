import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("Neispravan datum.");
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function countNights(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

async function getPostavkeNaplate() {
  return prisma.postavkeNaplate.findFirst({
    orderBy: {
      updatedAt: "desc",
    },
  });
}

async function getAppUrl() {
  const postavke = await getPostavkeNaplate();

  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    postavke?.appUrl ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";

  const clean = raw.trim().replace(/\/$/, "");

  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }

  return `https://${clean}`;
}

async function getAdminEmails() {
  const postavke = await getPostavkeNaplate();

  if (postavke?.adminEmails) {
    return postavke.adminEmails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }

  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value || "0").replace(",", ".").trim();
  const n = Number(raw);

  if (!Number.isFinite(n)) return 0;
  return n;
}

function daysUntil(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export async function GET(req: Request) {
  try {
    const baseUrl = await getAppUrl();

    const { searchParams } = new URL(req.url);
    const placanjeId = searchParams.get("placanjeId");

    if (!placanjeId) {
      return NextResponse.json(
        { error: "Nedostaje placanjeId." },
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
        { error: "Plaćanje nije pronađeno." },
        { status: 404 }
      );
    }

    if (placanje.status === "PLACENO") {
      return NextResponse.redirect(
        `${baseUrl}/rezervacije/uspjeh?placanjeId=${placanje.id}`,
        303
      );
    }

    if (placanje.paymentUrl) {
      return NextResponse.redirect(placanje.paymentUrl, 303);
    }

    const r = placanje.rezervacija;
    const amount = Math.round(Number(placanje.iznos || 0) * 100);

    const postavke = await getPostavkeNaplate();

    const danaPrijeMoraBitiPlaceno =
      r.danaPrijeDolaskaPlaceno ??
      postavke?.danaPrijeDolaskaMoraBitiPlaceno ??
      3;

    const expiresAtDate = new Date(r.datumOd);
    expiresAtDate.setDate(
      expiresAtDate.getDate() - danaPrijeMoraBitiPlaceno
    );
    expiresAtDate.setHours(23, 59, 0, 0);

    const expiresAtUnix = Math.floor(expiresAtDate.getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    const safeExpiresAt =
      expiresAtUnix > nowUnix + 1800 ? expiresAtUnix : nowUnix + 1800;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: r.gost?.email || undefined,
      expires_at: safeExpiresAt,

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(placanje.valuta || "EUR").toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: `${placanje.tip} - ${r.jedinica.objekt.naziv} / ${r.jedinica.naziv}`,
              description: `${new Date(r.datumOd).toLocaleDateString(
                "hr-HR"
              )} - ${new Date(r.datumDo).toLocaleDateString("hr-HR")}`,
            },
          },
        },
      ],

      payment_intent_data: {
        capture_method: "manual",
        metadata: {
          rezervacijaId: r.id,
          placanjeId: placanje.id,
        },
      },

      metadata: {
        rezervacijaId: r.id,
        placanjeId: placanje.id,
      },

      success_url: `${baseUrl}/rezervacije/uspjeh?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/rezervacije/neuspjeh?rezervacijaId=${r.id}`,
    });

    await prisma.placanje.update({
      where: { id: placanje.id },
      data: {
        provider: "STRIPE",
        providerId: session.id,
        paymentUrl: session.url,
        nacinPlacanja: "KARTICA",
        status: "ZAHTJEV_POSLAN",
        expiresAt: new Date(safeExpiresAt * 1000),
      },
    });

    return NextResponse.redirect(session.url!, 303);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Greška kod otvaranja kartičnog plaćanja." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const baseUrl = await getAppUrl();
    const postavke = await getPostavkeNaplate();

    const PRAG_PUNE_NAPLATE_DANA =
      postavke?.danaPrijeDolaskaPunaNaplata ?? 30;

    const DANA_VRIJEDI_AKONTACIJA =
      postavke?.danaVrijediPozivAkontacije ?? 3;

    const DANA_PRIJE_SLATI_OSTATAK =
      postavke?.danaPrijeDolaskaSlanjeOstatka ?? 7;

    const DANA_PRIJE_MORA_BITI_PLACENO =
      postavke?.danaPrijeDolaskaMoraBitiPlaceno ?? 3;

    const formData = await req.formData();

    const jedinicaId = String(formData.get("jedinicaId") || "").trim();

    const datumOdRaw = String(formData.get("datumOd") || "").trim();
    const datumDoRaw = String(formData.get("datumDo") || "").trim();

    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const telefon = String(formData.get("telefon") || "").trim();

    const adresa = String(formData.get("adresa") || "").trim();
    const grad = String(formData.get("grad") || "").trim();
    const drzava = String(formData.get("drzava") || "").trim();

    const brojOsoba = Number(formData.get("brojOsoba") || 1);
    const iznosUkupno = parseMoney(formData.get("iznosUkupno"));
    const iznosPotvrdeForm = parseMoney(formData.get("iznosPotvrde"));
    const napomena = String(formData.get("napomena") || "").trim();

    if (
      !jedinicaId ||
      !datumOdRaw ||
      !datumDoRaw ||
      !ime ||
      !prezime ||
      !email ||
      !telefon ||
      !adresa ||
      !grad ||
      !drzava
    ) {
      return NextResponse.json(
        {
          error:
            "Nedostaju obavezni podaci gosta. Potrebno je upisati ime, prezime, email, telefon, adresu, grad i državu.",
        },
        { status: 400 }
      );
    }

    if (brojOsoba <= 0) {
      return NextResponse.json(
        { error: "Broj osoba mora biti veći od 0." },
        { status: 400 }
      );
    }

    if (iznosUkupno <= 0 || iznosPotvrdeForm <= 0) {
      return NextResponse.json(
        { error: "Iznos rezervacije i potvrde mora biti veći od 0." },
        { status: 400 }
      );
    }

    const datumOd = parseDateOnly(datumOdRaw);
    const datumDo = parseDateOnly(datumDoRaw);

    if (datumOd >= datumDo) {
      return NextResponse.json(
        { error: "Datum odlaska mora biti nakon datuma dolaska." },
        { status: 400 }
      );
    }

    const jedinica = await prisma.jedinica.findUnique({
      where: { id: jedinicaId },
      include: {
        objekt: true,
      },
    });

    if (!jedinica) {
      return NextResponse.json(
        { error: "Smještajna jedinica nije pronađena." },
        { status: 404 }
      );
    }

    const postojiPreklapanje = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId,
        status: {
          notIn: ["OTKAZANO", "OBRISANO"],
        },
        datumOd: {
          lt: datumDo,
        },
        datumDo: {
          gt: datumOd,
        },
      },
    });

    if (postojiPreklapanje) {
      return NextResponse.json(
        { error: "Termin je već zauzet." },
        { status: 409 }
      );
    }

    const postojiRucnaBlokada = await prisma.blokadaJedinice.findFirst({
      where: {
        jedinicaId,
        aktivna: true,
        datumOd: {
          lt: datumDo,
        },
        datumDo: {
          gt: datumOd,
        },
      },
    });

    if (postojiRucnaBlokada) {
      return NextResponse.json(
        { error: "Termin je blokiran i nije dostupan za rezervaciju." },
        { status: 409 }
      );
    }

    const postojiBookingBlokada =
      await prisma.blokadaVanjskogKalendara.findFirst({
        where: {
          jedinicaId,
          datumOd: {
            lt: datumDo,
          },
          datumDo: {
            gt: datumOd,
          },
        },
      });

    if (postojiBookingBlokada) {
      return NextResponse.json(
        { error: "Termin je zauzet preko vanjskog kalendara / Booking.com." },
        { status: 409 }
      );
    }

    const brojNocenja = countNights(datumOd, datumDo);
    const danaDoDolaska = daysUntil(datumOd);

    const naplataPunogIznosa = danaDoDolaska <= PRAG_PUNE_NAPLATE_DANA;

    const iznosZaNaplatu = naplataPunogIznosa
      ? iznosUkupno
      : iznosPotvrdeForm;

    const tipPlacanja = naplataPunogIznosa
      ? "CIJELI_IZNOS"
      : "POTVRDA_REZERVACIJE";

    const iznosPotvrdeZaRezervaciju = iznosZaNaplatu;
    const iznosOstatka = Math.max(iznosUkupno - iznosZaNaplatu, 0);

    const rokUplateOstatka = new Date(datumOd);
    rokUplateOstatka.setDate(
      rokUplateOstatka.getDate() - DANA_PRIJE_MORA_BITI_PLACENO
    );

    const result = await prisma.$transaction(async (tx) => {
      const gost = await tx.gost.upsert({
        where: {
          email,
        },
        update: {
          ime,
          prezime,
          telefon,
          adresa,
          grad,
          drzava,
        },
        create: {
          ime,
          prezime,
          email,
          telefon,
          adresa,
          grad,
          drzava,
        },
      });

      const rezervacija = await tx.rezervacija.create({
        data: {
          jedinicaId,
          gostId: gost.id,

          izvor: "WEB",
          status: "CEKA_POTVRDU",

          datumOd,
          datumDo,
          brojNocenja,
          brojOsoba,

          iznosOsnovni: iznosUkupno,
          iznosUkupno,
          dogovoreniIznos: iznosUkupno,
          iznosPotvrde: iznosPotvrdeZaRezervaciju,

          iznosPlaceno: 0,
          iznosOstatka,

          rokUplateAkontacije: null,
          rokUplateOstatka,

          danaVrijediAkontacija: DANA_VRIJEDI_AKONTACIJA,
          danaPrijeDolaskaOstatak: DANA_PRIJE_SLATI_OSTATAK,
          danaPrijeDolaskaPlaceno: DANA_PRIJE_MORA_BITI_PLACENO,

          automatskoOtkazivanje: true,
          placenoKarticom: false,
          valuta: "EUR",

          napomena: napomena || null,
        },
      });

      const placanje = await tx.placanje.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: tipPlacanja,
          status: "ZAHTJEV_POSLAN",
          iznos: iznosZaNaplatu,
          valuta: "EUR",
          nacinPlacanja: "KARTICA",
          provider: "STRIPE",
          napomena: naplataPunogIznosa
            ? `Stripe naplata cijelog iznosa jer je dolazak za ${danaDoDolaska} dana. Ukupno: ${money(
                iznosUkupno
              )}.`
            : `Stripe autorizacija potvrde rezervacije. Ukupno: ${money(
                iznosUkupno
              )}, potvrda: ${money(iznosZaNaplatu)}, ostatak: ${money(
                iznosOstatka
              )}.`,
        },
      });

      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: "KREIRANJE_WEB_REZERVACIJE",
          opis: naplataPunogIznosa
            ? `Gost je pokrenuo web rezervaciju. Dolazak je za ${danaDoDolaska} dana pa se naplaćuje 100% iznosa.`
            : "Gost je pokrenuo web rezervaciju i otvorena je Stripe autorizacija kartice.",
          noviPodaci: JSON.stringify({
            objekt: jedinica.objekt.naziv,
            jedinica: jedinica.naziv,
            datumOd: datumOdRaw,
            datumDo: datumDoRaw,
            brojNocenja,
            brojOsoba,
            iznosUkupno,
            iznosPotvrde: iznosPotvrdeZaRezervaciju,
            iznosZaNaplatu,
            iznosOstatka,
            naplataPunogIznosa,
            pragPuneNaplateDana: PRAG_PUNE_NAPLATE_DANA,
            danaDoDolaska,
            tipPlacanja,
            gost: {
              ime,
              prezime,
              email,
              telefon,
              adresa,
              grad,
              drzava,
            },
          }),
          korisnikIme: "Web gost",
        },
      });

      return {
        gost,
        rezervacija,
        placanje,
      };
    });

    const amount = Math.round(iznosZaNaplatu * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: {
              name: naplataPunogIznosa
                ? `Plaćanje rezervacije - ${jedinica.objekt.naziv} / ${jedinica.naziv}`
                : `Potvrda rezervacije - ${jedinica.objekt.naziv} / ${jedinica.naziv}`,
              description: `${datumOdRaw} - ${datumDoRaw}, ${brojNocenja} noćenja`,
            },
          },
        },
      ],

      payment_intent_data: {
        capture_method: "manual",
        metadata: {
          rezervacijaId: result.rezervacija.id,
          placanjeId: result.placanje.id,
        },
      },

      metadata: {
        rezervacijaId: result.rezervacija.id,
        placanjeId: result.placanje.id,
      },

      success_url: `${baseUrl}/rezervacije/uspjeh?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/rezervacije/neuspjeh?rezervacijaId=${result.rezervacija.id}`,
    });

    await prisma.placanje.update({
      where: { id: result.placanje.id },
      data: {
        provider: "STRIPE",
        providerId: session.id,
        paymentUrl: session.url,
        nacinPlacanja: "KARTICA",
        napomena: naplataPunogIznosa
          ? `Stripe Checkout otvoren. Session ID: ${session.id}. Naplata 100% iznosa jer je dolazak za ${danaDoDolaska} dana. Iznos: ${money(
              iznosZaNaplatu
            )}.`
          : `Stripe Checkout otvoren. Session ID: ${session.id}. Iznos autorizacije: ${money(
              iznosZaNaplatu
            )}. Novac se ne skida odmah, sredstva se samo rezerviraju.`,
      },
    });

    const adminEmails = await getAdminEmails();

    if (adminEmails.length > 0) {
      try {
        await resend.emails.send({
          from: process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>",
          to: adminEmails,
          subject: `Nova rezervacija čeka potvrdu - ${jedinica.objekt.naziv} / ${jedinica.naziv}`,
          html: `
            <h2>Nova rezervacija čeka potvrdu</h2>

            <p><strong>Gost:</strong> ${ime} ${prezime}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Telefon:</strong> ${telefon}</p>

            <p><strong>Objekt:</strong> ${jedinica.objekt.naziv}</p>
            <p><strong>Jedinica:</strong> ${jedinica.naziv}</p>

            <p><strong>Dolazak:</strong> ${datumOd.toLocaleDateString("hr-HR")}</p>
            <p><strong>Odlazak:</strong> ${datumDo.toLocaleDateString("hr-HR")}</p>
            <p><strong>Noćenja:</strong> ${brojNocenja}</p>
            <p><strong>Broj osoba:</strong> ${brojOsoba}</p>

            <p><strong>Ukupno:</strong> ${money(iznosUkupno)}</p>
            <p><strong>Za naplatu:</strong> ${money(iznosZaNaplatu)}</p>

            <p>
              <a href="${baseUrl}/admin/rezervacije/${result.rezervacija.id}">
                Otvori rezervaciju u adminu
              </a>
            </p>
          `,
        });
      } catch (mailError) {
        console.error("Greška kod slanja admin maila:", mailError);
      }
    }

    return NextResponse.redirect(session.url!, 303);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Greška kod kreiranja Stripe plaćanja rezervacije.",
      },
      { status: 500 }
    );
  }
}