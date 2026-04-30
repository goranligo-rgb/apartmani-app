import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value || "0").replace(",", ".").trim();
  const n = Number(raw);

  if (!Number.isFinite(n)) return 0;
  return n;
}

export async function POST(req: Request) {
  try {
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
    const iznosPotvrde = parseMoney(formData.get("iznosPotvrde"));
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

    if (iznosUkupno <= 0 || iznosPotvrde <= 0) {
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
          not: "OTKAZANO",
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

    const brojNocenja = countNights(datumOd, datumDo);
    const iznosOstatka = Math.max(iznosUkupno - iznosPotvrde, 0);

    const rokUplateOstatka = new Date(datumOd);
    rokUplateOstatka.setDate(rokUplateOstatka.getDate() - 7);

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
          status: "CEKA_AKONTACIJU",

          datumOd,
          datumDo,
          brojNocenja,
          brojOsoba,

          iznosOsnovni: iznosUkupno,
          iznosUkupno,
          dogovoreniIznos: iznosUkupno,
          iznosPotvrde,

          iznosPlaceno: 0,
          iznosOstatka: iznosUkupno,

          rokUplateAkontacije: null,
          rokUplateOstatka,

          danaVrijediAkontacija: 3,
          danaPrijeDolaskaOstatak: 7,
          danaPrijeDolaskaPlaceno: 3,

          automatskoOtkazivanje: true,
          placenoKarticom: false,
          valuta: "EUR",

          napomena: napomena || null,
        },
      });

      const placanje = await tx.placanje.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: "POTVRDA_REZERVACIJE",
          status: "ZAHTJEV_POSLAN",
          iznos: iznosPotvrde,
          valuta: "EUR",
          nacinPlacanja: "KARTICA",
          provider: "STRIPE",
          napomena: `Stripe autorizacija potvrde rezervacije. Ukupno: ${money(
            iznosUkupno
          )}, potvrda: ${money(iznosPotvrde)}, ostatak: ${money(
            iznosOstatka
          )}.`,
        },
      });

      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: "KREIRANJE_WEB_REZERVACIJE",
          opis:
            "Gost je pokrenuo web rezervaciju i otvorena je Stripe autorizacija kartice.",
          noviPodaci: JSON.stringify({
            objekt: jedinica.objekt.naziv,
            jedinica: jedinica.naziv,
            datumOd: datumOdRaw,
            datumDo: datumDoRaw,
            brojNocenja,
            brojOsoba,
            iznosUkupno,
            iznosPotvrde,
            iznosOstatka,
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

    const amount = Math.round(iznosPotvrde * 100);

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
              name: `Potvrda rezervacije - ${jedinica.objekt.naziv} / ${jedinica.naziv}`,
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

      success_url: `${getAppUrl()}/rezervacije/uspjeh?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/rezervacije/neuspjeh?rezervacijaId=${result.rezervacija.id}`,
    });

    await prisma.placanje.update({
      where: { id: result.placanje.id },
      data: {
        provider: "STRIPE",
        providerId: session.id,
        paymentUrl: session.url,
        napomena: `Stripe Checkout otvoren. Session ID: ${session.id}. Iznos autorizacije: ${money(
          iznosPotvrde
        )}. Novac se ne skida odmah, sredstva se samo rezerviraju.`,
      },
    });

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