import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { Resend } from "resend";
import { pronadiPreklapanja } from "@/lib/zauzeca";
import { routing } from "@/i18n/routing";

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
      createdAt: "asc",
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

    if (
      placanje.paymentUrl &&
      placanje.expiresAt &&
      new Date(placanje.expiresAt) > new Date()
    ) {
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

    const maxStripeExpiresAt = nowUnix + 23 * 60 * 60;

    const safeExpiresAt = Math.min(
      expiresAtUnix > nowUnix + 1800 ? expiresAtUnix : nowUnix + 1800,
      maxStripeExpiresAt
    );

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

      success_url: `${baseUrl}/rezervacije/uspjeh?placanjeId=${placanje.id}&session_id={CHECKOUT_SESSION_ID}`,
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
    let iznosUkupno = parseMoney(formData.get("iznosUkupno"));
    let iznosPotvrdeForm = parseMoney(formData.get("iznosPotvrde"));
    const napomena = String(formData.get("napomena") || "").trim();

    const localeRaw = String(formData.get("locale") || "").trim();
    const jezik = hasLocale(routing.locales, localeRaw) ? localeRaw : "hr";

    // `akcijaId` ulazi u tok iz `/rezervacije/posebne-prilike` kroz formu —
    // ako je prisutan, server uzima cijenu iz baze (Akcija) i prebrisuje
    // `iznosUkupno`/`iznosPotvrdeForm` iz form-data. Time zatvaramo rupu u
    // kojoj je gost mogao u URL-u prepisati cijenu posebne prilike i platiti
    // npr. 1 €. Validira se samo postojanje, status i točno poklapanje
    // jedinice + termina — bez tih uvjeta zahtjev je 400.
    const akcijaId = String(formData.get("akcijaId") || "").trim();

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

    // Za posebne prilike ranije dohvati Akciju i prepiši `iznosUkupno` iz
    // baze prije iznos validacije — gost koji bi u formi predao 0 ne smije
    // srušiti tok. Poklapanje jedinice + termina validira se kasnije, jer
    // tek tada imamo `parseDateOnly` datume. `iznosPotvrdeForm` se ovdje
    // privremeno poravnava s cijenom kako bi prošao `<= 0` check — pravu
    // vrijednost (akontacija ili full) izračunamo niže iz `postotakAkontacije`.
    let akcijaIzBaze: Awaited<ReturnType<typeof prisma.akcija.findUnique>> =
      null;

    if (akcijaId) {
      akcijaIzBaze = await prisma.akcija.findUnique({
        where: { id: akcijaId },
      });

      if (
        !akcijaIzBaze ||
        !akcijaIzBaze.aktivna ||
        !akcijaIzBaze.prikaziNaWebu
      ) {
        return NextResponse.json(
          {
            error:
              "Posebna prilika nije više dostupna. Osvježite stranicu i pokušajte ponovno.",
          },
          { status: 400 }
        );
      }

      const cijenaIzBaze = Number(akcijaIzBaze.cijenaUkupno || 0);

      if (!Number.isFinite(cijenaIzBaze) || cijenaIzBaze <= 0) {
        return NextResponse.json(
          {
            error:
              "Posebna prilika nema ispravno postavljenu cijenu. Javite se vlasniku.",
          },
          { status: 400 }
        );
      }

      iznosUkupno = cijenaIzBaze;
      iznosPotvrdeForm = cijenaIzBaze;
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

    const kapacitet =
      Number(jedinica.ukupniKapacitet || 0) ||
      Number(jedinica.osnovniKapacitet || 0) +
      Number(jedinica.dodatniKapacitet || 0);

    if (kapacitet > 0 && brojOsoba > kapacitet) {
      return NextResponse.json(
        {
          error: `${jedinica.naziv} prima maksimalno ${kapacitet} osoba. Odabrali ste ${brojOsoba}.`,
        },
        { status: 400 }
      );
    }

    // Posebna prilika: poklapanje jedinice i točnih datuma s Akcijom u bazi
    // mora biti striktno. Ako se gost u URL-u igrao s `datumOd/datumDo` ili
    // `jedinicaId`, ovdje vraćamo 400. `iznosPotvrdeForm` se ovdje računa
    // iz `jedinica.postotakAkontacije` (ili full ako je dolazak blizu praga
    // pune naplate) — ista logika kao na `/rezervacije/pregled`, ali server
    // je sad vlasnik istine.
    if (akcijaIzBaze) {
      const istaJedinica = akcijaIzBaze.jedinicaId === jedinicaId;
      const istiOd = akcijaIzBaze.datumOd.getTime() === datumOd.getTime();
      const istiDo = akcijaIzBaze.datumDo.getTime() === datumDo.getTime();

      if (!istaJedinica || !istiOd || !istiDo) {
        return NextResponse.json(
          {
            error:
              "Detalji rezervacije ne odgovaraju posebnoj prilici. Osvježite stranicu i pokušajte ponovno.",
          },
          { status: 400 }
        );
      }

      const danaDoDolaskaZaAkciju = daysUntil(datumOd);
      const naplataPunogIznosaZaAkciju =
        danaDoDolaskaZaAkciju <= PRAG_PUNE_NAPLATE_DANA;
      const postotak = Number(jedinica.postotakAkontacije ?? 30);

      iznosPotvrdeForm = naplataPunogIznosaZaAkciju
        ? iznosUkupno
        : Number(((iznosUkupno * postotak) / 100).toFixed(2));
    }

    // Jedinstvena provjera dostupnosti kroz `pronadiPreklapanja` (lib/zauzeca.ts).
    // Bitno: whitelist sad UKLJUČUJE UPIT — prije je `notIn: ["OTKAZANO", "UPIT"]`
    // ostavljao race window u kojem su dvije paralelne web rezervacije obje
    // mogle proći (svaka ne vidi UPIT druge → obje stignu do Stripe-a → obje
    // potencijalno uspiju jer atomska brava u `zaprimiAutoriziranuRezervaciju`
    // radi po pojedinoj rezervaciji). Stale UPIT-i čiste se kroz `expired`
    // webhook.
    const preklapanja = await pronadiPreklapanja({
      jedinicaId,
      datumOd,
      datumDo,
    });

    if (preklapanja.rezervacije.length > 0) {
      return NextResponse.json(
        { error: "Termin je već zauzet." },
        { status: 409 }
      );
    }

    if (preklapanja.blokadeRucne.length > 0) {
      return NextResponse.json(
        { error: "Termin je blokiran i nije dostupan za rezervaciju." },
        { status: 409 }
      );
    }

    if (preklapanja.blokadeVanjske.length > 0) {
      return NextResponse.json(
        { error: "Termin je zauzet preko vanjskog kalendara / Booking.com." },
        { status: 409 }
      );
    }

    const brojNocenja = countNights(datumOd, datumDo);
    const danaDoDolaska = daysUntil(datumOd);

    const naplataPunogIznosa = false;

    const iznosZaNaplatu = iznosPotvrdeForm;

    const tipPlacanja = "POTVRDA_REZERVACIJE";

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
          jezik,
        },
        create: {
          ime,
          prezime,
          email,
          telefon,
          adresa,
          grad,
          drzava,
          jezik,
        },
      });

      const rezervacija = await tx.rezervacija.create({
        data: {
          jedinicaId,
          gostId: gost.id,

          izvor: "WEB",
          status: "UPIT",

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

      // Za audit toka: ako je rezervacija nastala iz posebne prilike, dodajemo
      // suffix u `napomena` plaćanja i `posebnaPrilika` blok u `noviPodaci`
      // promjene (audit log). Veza prema `Akcija` modelu kroz FK nije dio PR3
      // (out of scope) — `akcijaId` se prati samo kroz JSON audit.
      const napomenaPosebnePrilike = akcijaIzBaze
        ? ` Posebna prilika: ${akcijaIzBaze.naziv || "Akcijska ponuda"} (${akcijaIzBaze.id}).`
        : "";

      const placanje = await tx.placanje.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: tipPlacanja,
          status: "ZAHTJEV_POSLAN",
          iznos: iznosZaNaplatu,
          valuta: "EUR",
          nacinPlacanja: "KARTICA",
          provider: "STRIPE",
          napomena:
            (naplataPunogIznosa
              ? `Stripe naplata cijelog iznosa jer je dolazak za ${danaDoDolaska} dana. Ukupno: ${money(
                iznosUkupno
              )}.`
              : `Stripe autorizacija potvrde rezervacije. Ukupno: ${money(
                iznosUkupno
              )}, potvrda: ${money(iznosZaNaplatu)}, ostatak: ${money(
                iznosOstatka
              )}.`) + napomenaPosebnePrilike,
        },
      });

      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: "KREIRANJE_WEB_REZERVACIJE",
          opis: akcijaIzBaze
            ? `Gost je pokrenuo web rezervaciju kroz posebnu priliku "${akcijaIzBaze.naziv || "Akcijska ponuda"}" i otvorena je Stripe autorizacija kartice.`
            : naplataPunogIznosa
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
            posebnaPrilika: akcijaIzBaze
              ? {
                akcijaId: akcijaIzBaze.id,
                naziv: akcijaIzBaze.naziv,
                cijenaIzBaze: Number(akcijaIzBaze.cijenaUkupno || 0),
              }
              : null,
            gost: {
              ime,
              prezime,
              email,
              telefon,
              adresa,
              grad,
              drzava,
              jezik,
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

      success_url: `${baseUrl}/rezervacije/uspjeh?placanjeId=${result.placanje.id}&session_id={CHECKOUT_SESSION_ID}`,
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