import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { generateRacunPdf } from "@/lib/generateRacunPdf";
import { Resend } from "resend";
import { zaprimiAutoriziranuRezervaciju } from "@/lib/zaprimiRezervaciju";
import {
  dohvatiPrijevode,
  odaberiJezikMaila,
  formatDateZaMail,
  money,
} from "@/lib/mailovi";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

type SearchParams = Promise<{
  placanjeId?: string;
  session_id?: string;
}>;

function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getMailFrom() {
  return process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>";
}

async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { updatedAt: "desc" },
  });

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
    const parts = racun.brojRacuna.split("-");
    const broj = Number(parts[1] || 0);

    if (Number.isFinite(broj) && broj > najveciBroj) {
      najveciBroj = broj;
    }
  }

  const sljedeci = String(najveciBroj + 1).padStart(3, "0");
  return `${prefix}-${sljedeci}-${godina}`;
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

async function obradiPlacanjeAkoTreba(placanjeId: string, sessionId?: string) {
  let placanje = await prisma.placanje.findUnique({
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

  if (!placanje) return null;

  if (placanje.status === "PLACENO") {
    const postojiRacun = await prisma.racun.findFirst({
      where: {
        placanjeId: placanje.id,
      },
    });

    if (postojiRacun?.pdfUrl) {
      return placanje;
    }

    // ako je plaćanje označeno kao plaćeno, ali račun nije napravljen,
    // nastavi obradu da se račun i mail mogu generirati
  }

  const r = placanje.rezervacija;
  const objekt = r.jedinica.objekt;
  const sada = new Date();

  let paymentIntentId = placanje.paymentIntentId || null;

  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (typeof session.payment_intent === "string") {
      paymentIntentId = session.payment_intent;

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (
        intent.status === "requires_capture" &&
        placanje.tip !== "POTVRDA_REZERVACIJE"
      ) {
        await stripe.paymentIntents.capture(paymentIntentId);
      }
    }
  }

  if (placanje.tip === "POTVRDA_REZERVACIJE") {
    const vecPoslanMailGostu = await prisma.emailLog.findFirst({
      where: {
        rezervacijaId: r.id,
        to: r.gost?.email || "",
        subject: {
          contains: "Rezervacija je zaprimljena",
        },
      },
    });

    if (r.status !== "UPIT" && vecPoslanMailGostu) {
      return placanje;
    }

    // Prijelaz UPIT -> CEKA_POTVRDU + mailovi (gostu "zaprimljeno", domaćinu
    // "čeka potvrdu") idu kroz zajednički helper — isti koji zove i Stripe
    // webhook. Helper koristi uvjetni updateMany kao atomsku bravu: kad
    // webhook i ova stranica stignu ~istovremeno, točno jedan odradi prijelaz
    // i pošalje mailove (bez duplog maila gostu — scenarij C iz plana).
    await zaprimiAutoriziranuRezervaciju({
      placanjeId: placanje.id,
      paymentIntentId,
    });

    return placanje;
  }

  const vecPostojiRacun = await prisma.racun.findFirst({
    where: {
      placanjeId: placanje.id,
    },
  });

  const novoPlaceno =
    Number(r.iznosPlaceno || 0) + Number(placanje.iznos || 0);

  const noviOstatak = Math.max(Number(r.iznosUkupno || 0) - novoPlaceno, 0);

  if (!placanje) {
    return;
  }

  const placanjeZaObradu = placanje;

  await prisma.$transaction(async (tx) => {
    await tx.placanje.update({
      where: { id: placanjeZaObradu.id },
      data: {
        status: "PLACENO",
        placenoAt: sada,
        paymentIntentId,
      },
    });

    await tx.rezervacija.update({
      where: { id: r.id },
      data: {
        iznosPlaceno: novoPlaceno,
        iznosOstatka: noviOstatak,
        placenoKarticom: true,
        status: noviOstatak <= 0 ? "PLACENO" : "POTVRDENO",
      },
    });

    await tx.rezervacijaPromjena.create({
      data: {
        rezervacijaId: r.id,
        tip:
          placanjeZaObradu.tip === "OSTATAK"
            ? "UPLATA_OSTATKA"
            : "UPLATA_REZERVACIJE",
        opis:
          placanjeZaObradu.tip === "OSTATAK"
            ? `Zaprimljena je uplata ostatka rezervacije u iznosu ${money(
              placanjeZaObradu.iznos
            )}.`
            : `Zaprimljena je uplata u iznosu ${money(placanjeZaObradu.iznos)}.`,
        korisnikIme: "Stripe",
      },
    });
  });

  let racun = vecPostojiRacun;

  if (!racun) {
    const brojRacuna = await prisma.$transaction(async (tx) => {
      return getNextBrojRacuna(
        tx,
        objekt.prefixRacuna || objekt.naziv || "RAC"
      );
    });

    racun = await prisma.racun.create({
      data: {
        rezervacijaId: r.id,
        placanjeId: placanjeZaObradu.id,
        objektId: objekt.id,
        brojRacuna,
        iznos: placanjeZaObradu.iznos,
        valuta: placanjeZaObradu.valuta || "EUR",

        nazivIzdavatelja: objekt.nazivZaRacun || objekt.naziv,
        oibIzdavatelja: objekt.oibZaRacun || null,
        adresaIzdavatelja: objekt.adresaZaRacun || null,
        mjestoIzdavatelja: objekt.mjestoZaRacun || objekt.mjesto || null,
        ibanIzdavatelja: objekt.ibanZaRacun || null,
        emailIzdavatelja: objekt.emailZaRacun || null,
        telefonIzdavatelja: objekt.telefonZaRacun || null,
      },
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
        objekt: true,
      },
    });

    const pdfUrl = await generateRacunPdf(racun);

    racun = await prisma.racun.update({
      where: { id: racun.id },
      data: {
        pdfUrl,
        poslanGostu: true,
      },
    });
  }

  placanje = await prisma.placanje.findUnique({
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
          racuni: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const gost = r.gost;
  const baseUrl = await getAppUrl();
  const pdfLink = racun?.pdfUrl
    ? String(racun.pdfUrl).startsWith("http")
      ? racun.pdfUrl
      : `${baseUrl}${racun.pdfUrl}`
    : "";

  if (gost?.email) {
    const jezik = odaberiJezikMaila(gost.jezik);
    const t = dohvatiPrijevode(jezik).uspjehPlacanje;
    const placeno = noviOstatak <= 0;

    const subject = t.subject(placeno);

    await resend.emails.send({
      from: getMailFrom(),
      to: gost.email,
      bcc: [BCC_EMAIL],
      subject,
      html: mailWrapper({
        title: t.title(placeno),
        subtitle: t.subtitle(placeno),
        children: `
    <p>${t.pozdrav(gost.ime || "goste", gost.prezime || "")}</p>

    <p>${t.uvodPara(placeno)}</p>

    <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
      <h3 style="margin:0 0 14px;">${t.detaljiNaslov}</h3>
      <p><strong>${t.labelObjekt}</strong> ${r.jedinica.objekt.naziv}</p>
      <p><strong>${t.labelJedinica}</strong> ${r.jedinica.naziv}</p>
      <p><strong>${t.labelDolazak}</strong> ${formatDateZaMail(r.datumOd, jezik)}</p>
      <p><strong>${t.labelOdlazak}</strong> ${formatDateZaMail(r.datumDo, jezik)}</p>
      <p><strong>${t.labelBrojNocenja}</strong> ${r.brojNocenja}</p>
      <p><strong>${t.labelBrojOsoba}</strong> ${r.brojOsoba}</p>
      <p><strong>${t.labelZaprimljenaUplata}</strong> ${money(placanje?.iznos)}</p>
      <p><strong>${t.labelPreostalo}</strong> ${money(noviOstatak)}</p>
    </div>

    <div style="padding:16px; background:#e8f7ee; border:1px solid #22c55e; color:#166534;">
      <strong>${t.potvrdjenoNaslov}</strong><br/>
      ${t.potvrdjenoText(placeno)}
    </div>

    ${pdfLink
            ? `
          <div style="margin-top:22px; padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
            ${t.racunOtvoriText}<br/>
            <a href="${pdfLink}" style="color:#7a5a22; font-weight:bold;">${t.racunOtvoriLink}</a>
          </div>
        `
            : ""
          }

    <p style="margin-top:28px;">
      ${t.zavrsetak}
    </p>
  `,
      }),
    });

    try {
      await prisma.emailLog.create({
        data: {
          rezervacijaId: r.id,
          to: gost.email,
          subject,
          tip: "RACUN",
          status: "POSLANO",
        },
      });
    } catch {
      // Ako tip email loga nije podržan, ne rušimo plaćanje.
    }
  }

  return placanje;
}

export default async function PlacanjeUspjehPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const placanjeId = params.placanjeId || "";
  const sessionId = params.session_id || "";

  let placanje = placanjeId
    ? await obradiPlacanjeAkoTreba(placanjeId, sessionId)
    : null;

  if (placanjeId) {
    placanje = await prisma.placanje.findUnique({
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
            racuni: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
  }

  if (!placanje) {
    return (
      <main className="min-h-screen bg-[#f4efe6] px-4 py-10">
        <div className="mx-auto max-w-xl bg-white p-8 shadow">
          <h1 className="text-3xl font-black text-[#2e2923]">
            Plaćanje je obrađeno
          </h1>

          <p className="mt-4 text-[#7b7165]">
            Hvala. Ako niste dobili potvrdu na email, slobodno nas kontaktirajte.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block bg-[#c79a57] px-6 py-3 font-black text-white"
          >
            Povratak na početnu
          </Link>
        </div>
      </main>
    );
  }

  const r = placanje.rezervacija;
  const gostIme = `${r.gost?.ime || "Gost"} ${r.gost?.prezime || ""}`.trim();

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-10">
      <div className="mx-auto max-w-2xl bg-white p-8 shadow">
        <div className="text-center">
          <div className="text-6xl">✅</div>

          <h1 className="mt-4 text-3xl font-black text-[#2e2923]">
            Rezervacija je zaprimljena
          </h1>

          <p className="mt-3 text-[#7b7165]">
            Poštovani {gostIme}, vaša kartica je uspješno autorizirana.
            Rezervacija čeka konačnu potvrdu domaćina.
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <Info label="Objekt" value={r.jedinica.objekt.naziv} />
          <Info label="Smještajna jedinica" value={r.jedinica.naziv} />
          <Info
            label="Termin"
            value={`${formatDate(r.datumOd)} – ${formatDate(r.datumDo)}`}
          />
          <Info label="Iznos" value={money(placanje.iznos)} />
          <Info
            label="Status rezervacije"
            value={
              placanje.tip === "POTVRDA_REZERVACIJE"
                ? "Rezervirana sredstva - čeka potvrdu"
                : r.status
            }
          />
        </div>

        <div className="mt-6 border border-[#e7dece] bg-[#f8f3ea] p-5 text-[#6f665a]">
          Detalje zaprimljene rezervacije poslali smo na email adresu unesenu u
          rezervaciji. Konačnu potvrdu poslat ćemo nakon obrade rezervacije.
          Račun se šalje tek nakon stvarne naplate.
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="font-bold text-[#9b6b12]">
            Povratak na početnu
          </Link>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e7dece] bg-[#fcfaf6] p-4">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8a8175]">
        {label}
      </div>
      <div className="mt-1 font-black text-[#2e2923]">{value || "-"}</div>
    </div>
  );
}