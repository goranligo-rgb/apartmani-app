import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { stripe } from "@/lib/stripe";
import { dodajTtlockSifru } from "@/lib/ttlock";
import { potvrdiNaplatu } from "@/lib/potvrdaNaplate";
import {
  dohvatiPrijevode,
  odaberiJezikMaila,
  formatDateZaMail,
} from "@/lib/mailovi";
import { imaInfobipKonfiguraciju, posaljiSmsInfobip } from "@/lib/infobip";
import { sendMail } from "@/lib/mail";
import { nazivToSlug } from "@/lib/objekti";
import { vodicJezik, OBJEKT_BOJA } from "@/lib/vodic";
import { welcomeUrl } from "@/lib/vodic/mail";
import { renderWelcomeMail } from "@/lib/vodic/welcomeMail";
import { normalizirajE164 } from "@/lib/twilio";
import { sastaviCheckinSms } from "@/lib/smsCheckin";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  id: string;
}>;

type SearchParams = Promise<{
  errBrojOsoba?: string;
}>;

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

function getMailFrom() {
  return process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>";
}

// Bazni URL za payment linkove. Ista logika kao u nova/page.tsx i create-payment
// ruti: PostavkeNaplate.appUrl → NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
// Na produkciji je VERCEL_URL uvijek postavljen (a appUrl bi trebao biti
// https://malinska-stay.hr), pa localhost nikad ne ispadne u produkciji.
async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (postavke?.appUrl) return postavke.appUrl.replace(/\/$/, "");

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

const UI_COLORS = {
  slobodno: "rgba(134,239,172,0.46)",
  slobodnoBorder: "rgba(34,197,94,0.65)",

  zauzeto: "#ef1f1f",
  zauzetoBorder: "#b91c1c",

  odabrano: "#8f7df0",
  odabranoBorder: "#6f5ce0",

  gold: "#c79a57",
  goldSoft: "rgba(199, 154, 87, 0.18)",
  dark: "#2e2923",
};

const OZNAKE_GOSTA = [
  "VIP",
  "SUPER_GOST",
  "POVRATNI_GOST",
  "ZAHTJEVAN",
  "NEUREDAN",
  "KASNI_S_PLACANJEM",
  "PROBLEMATICAN",
];

function parseOznake(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function safeJson(value?: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatJsonDate(value?: string | Date | null) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatJsonMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";

  const n = Number(value);

  if (!Number.isFinite(n)) return String(value);

  return `${n.toFixed(2)} €`;
}

function parseAmount(value: FormDataEntryValue | null) {
  const raw = String(value || "0").replace(",", ".").trim();
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Iznos mora biti veći od 0.");
  }

  return n;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("Neispravan datum.");
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function generirajSifruIzTelefona(telefon?: string | null) {
  const brojevi = String(telefon || "").replace(/\D/g, "");
  if (brojevi.length >= 4) return brojevi.slice(-4);
  return String(Math.floor(1000 + Math.random() * 9000));
}

function setTime(date: Date, hour: number, minute: number) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Kratak datum DD.MM. (bez godine) — za SMS predložak.
function formatDanMjesec(d: Date) {
  const dan = String(d.getDate()).padStart(2, "0");
  const mjesec = String(d.getMonth() + 1).padStart(2, "0");
  return `${dan}.${mjesec}.`;
}

function parseTime(value?: string | null) {
  const [h, m] = String(value || "").split(":").map(Number);
  return {
    hour: Number.isFinite(h) ? h : 16,
    minute: Number.isFinite(m) ? m : 0,
  };
}

function formatTime(value?: Date | null) {
  if (!value) return "16:00";
  return value.toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function izracunajPlaceno(rezervacijaId: string) {
  const placanja = await prisma.placanje.findMany({
    where: {
      rezervacijaId,
      status: "PLACENO",
      tip: {
        not: "POVRAT",
      },
    },
  });

  const povrati = await prisma.placanje.findMany({
    where: {
      rezervacijaId,
      tip: "POVRAT",
    },
  });

  const ukupnoPlaceno = placanja.reduce(
    (sum, p) => sum + Number(p.iznos || 0),
    0
  );

  const ukupnoPovrat = povrati.reduce(
    (sum, p) => sum + Number(p.iznos || 0),
    0
  );

  return Math.max(ukupnoPlaceno - ukupnoPovrat, 0);
}

async function osvjeziStatusPlacanja(rezervacijaId: string) {
  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id: rezervacijaId },
  });

  if (!rezervacija) return;

  const ukupno = Number(
    rezervacija.dogovoreniIznos ||
    rezervacija.iznosUkupno ||
    rezervacija.iznosOsnovni ||
    0
  );

  const placeno = await izracunajPlaceno(rezervacijaId);
  const ostatak = Math.max(ukupno - placeno, 0);

  let noviStatus = rezervacija.status;

  if (rezervacija.status !== "OTKAZANO") {
    if (ukupno > 0 && placeno >= ukupno) {
      noviStatus = "PLACENO";
    } else if (placeno > 0) {
      noviStatus = "CEKA_OSTATAK";
    } else if (
      rezervacija.status === "CEKA_POTVRDU" ||
      rezervacija.status === "UPIT"
    ) {
      noviStatus = "CEKA_AKONTACIJU";
    }
  }

  await prisma.rezervacija.update({
    where: { id: rezervacijaId },
    data: {
      iznosPlaceno: placeno,
      iznosOstatka: ostatak,
      status: noviStatus,
    },
  });
}

export default async function RezervacijaDetaljPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
          ttlockBrave: {
            include: {
              brava: true,
            },
          },
        },
      },
      placanja: {
        orderBy: { createdAt: "desc" },
      },
      racuni: {
        orderBy: { createdAt: "desc" },
      },
      emailovi: {
        orderBy: { createdAt: "desc" },
      },
      whatsappPoruke: {
        orderBy: { poslanoAt: "desc" },
      },
      promjene: {
        orderBy: { createdAt: "desc" },
      },
      ttlockSifre: {
        include: {
          brava: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      zadaci: {
        orderBy: { datum: "asc" },
      },
    },
  });

  if (!rezervacija) notFound();

  const ukupno = Number(
    rezervacija.dogovoreniIznos ||
    rezervacija.iznosUkupno ||
    rezervacija.iznosOsnovni ||
    0
  );

  const placeno = Number(rezervacija.iznosPlaceno || 0);
  const ostatak = Math.max(ukupno - placeno, 0);

  const popust =
    Number(rezervacija.popustIznos || 0) ||
    (Number(rezervacija.iznosOsnovni || 0) *
      Number(rezervacija.popustPostotak || 0)) /
    100;

  const predlozenoZaStorno =
    rezervacija.status !== "OTKAZANO" &&
    placeno <= 0 &&
    !!rezervacija.rokUplateAkontacije &&
    startOfDay(rezervacija.rokUplateAkontacije).getTime() <
    startOfDay(new Date()).getTime();

  const gostOznake = parseOznake(rezervacija.gost?.oznake);

  const gostUpozorenje =
    gostOznake.includes("NEUREDAN") ||
    gostOznake.includes("PROBLEMATICAN") ||
    gostOznake.includes("KASNI_S_PLACANJEM") ||
    gostOznake.includes("ZAHTJEVAN");

  const ttlockPrva = rezervacija.ttlockSifre?.[0];

  const ttlockSifra =
    ttlockPrva?.sifra || generirajSifruIzTelefona(rezervacija.gost?.telefon);

  const ttlockUlaz =
    ttlockPrva?.vrijediOd || setTime(rezervacija.datumOd, 16, 0);

  const ttlockIzlaz =
    ttlockPrva?.vrijediDo || setTime(rezervacija.datumDo, 10, 0);

  // ── SMS panel: preduvjeti + predispunjen predložak ─────────────────────
  const infobipOk = imaInfobipKonfiguraciju();
  const imaSifru = rezervacija.ttlockSifre.length > 0;

  const smsKontakt = process.env.KONTAKT_TEL || "+385 98 700 415";

  // Predložak koristi PRAVU šifru iz baze (ttlockSifre[0].sifra), ne page
  // fallback ttlockSifra (koji izvodi šifru iz telefona kad zapisa nema).
  // Fallback ostaje samo za prikaz dok šifra ne postoji — tad je gumb disabled.
  const smsSifra = ttlockPrva?.sifra || ttlockSifra;

  // Predispunjeno na jeziku gosta (i dalje editabilno u textarea). eCheckin
  // red se izostavlja ako rezervacija nema spremljen link. Welcome link (isto
  // kao cron): proslijedimo appUrl + slug + rezervacijaId.
  const smsAppUrl = await getAppUrl();
  const smsPredlozak = sastaviCheckinSms({
    jezik: rezervacija.gost?.jezik,
    ime: rezervacija.gost?.ime || "goste",
    objekt: rezervacija.jedinica.objekt.naziv,
    datumUlaska: formatDanMjesec(rezervacija.datumOd),
    datumIzlaska: formatDanMjesec(rezervacija.datumDo),
    sifra: smsSifra,
    kontakt: smsKontakt,
    eCheckinLink: rezervacija.eCheckinLink,
    appUrl: smsAppUrl,
    slug: nazivToSlug(rezervacija.jedinica.objekt.naziv),
    rezervacijaId: rezervacija.id,
  });

  // ── Welcome mail panel: default jezik = jezik gosta, editabilan uvod ──────
  const welcomeJezikDefault = odaberiJezikMaila(rezervacija.gost?.jezik);
  const welcomeUvodDefault =
    dohvatiPrijevode(welcomeJezikDefault).dobrodoslica.najava;
  const imaEmail = Boolean(rezervacija.gost?.email);
  const imaWelcomeSlug = nazivToSlug(rezervacija.jedinica.objekt.naziv) !== null;

  // ── Spojeni log komunikacije (EMAIL + SMS/WHATSAPP), sortirano po vremenu ─
  type LogStavka = {
    id: string;
    kanal: "EMAIL" | "SMS" | "WHATSAPP";
    naslov: string;
    podnaslov: string;
    status: string;
    greska?: string | null;
    vrijeme: Date;
  };

  const logKomunikacije: LogStavka[] = [
    ...rezervacija.emailovi.map((e) => ({
      id: `email-${e.id}`,
      kanal: "EMAIL" as const,
      naslov: e.subject,
      podnaslov: `${e.to} · ${e.tip}`,
      status: e.status,
      greska: e.greska,
      vrijeme: e.createdAt,
    })),
    ...rezervacija.whatsappPoruke.map((p) => ({
      id: `wa-${p.id}`,
      kanal: (p.kanal === "WHATSAPP" ? "WHATSAPP" : "SMS") as
        | "SMS"
        | "WHATSAPP",
      naslov: p.tekstPregled,
      podnaslov: p.primatelj,
      status: p.status,
      greska: p.greska,
      vrijeme: p.poslanoAt,
    })),
  ].sort((a, b) => b.vrijeme.getTime() - a.vrijeme.getTime());

  async function odbijRezervaciju(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: { include: { objekt: true } },
        placanja: true,
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    if (r.status === "OTKAZANO") {
      redirect(`/admin/rezervacije/${rezervacijaId}?odbijeno=1`);
    }

    if (r.status !== "CEKA_POTVRDU") {
      throw new Error("Rezervacija više ne čeka potvrdu.");
    }

    const stripePlacanje = r.placanja.find(
      (p) => p.provider === "STRIPE" && p.status !== "PLACENO"
    );

    if (stripePlacanje?.providerId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          stripePlacanje.providerId
        );

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        if (paymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

          if (
            pi.status === "requires_capture" ||
            pi.status === "requires_payment_method" ||
            pi.status === "requires_confirmation" ||
            pi.status === "requires_action" ||
            pi.status === "processing"
          ) {
            await stripe.paymentIntents.cancel(paymentIntentId);
          }
        }

        await prisma.placanje.update({
          where: { id: stripePlacanje.id },
          data: {
            status: "OTKAZANO",
            napomena:
              "Stripe autorizacija je poništena jer je rezervacija odbijena.",
          },
        });
      } catch (error: any) {
        await prisma.placanje.update({
          where: { id: stripePlacanje.id },
          data: {
            status: "OTKAZANO",
            napomena: `Rezervacija je odbijena. Stripe provjera/cancel greška: ${error?.message || "Nepoznata greška"
              }`,
          },
        });
      }
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: { status: "OTKAZANO" },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "OTKAZIVANJE_REZERVACIJE",
        opis: "Admin je odbio web rezervaciju.",
        stariPodaci: JSON.stringify({
          status: r.status,
        }),
        noviPodaci: JSON.stringify({
          status: "OTKAZANO",
          stripePlacanjeId: stripePlacanje?.id || null,
        }),
        korisnikIme: "Admin",
      },
    });

    if (r.gost?.email) {
      const jezik = odaberiJezikMaila(r.gost.jezik);
      const t = dohvatiPrijevode(jezik).rezervacijaOdbijena;

      await resend.emails.send({
        from: getMailFrom(),
        to: r.gost.email,
        bcc: [BCC_EMAIL],
        subject: t.subject,
        html: `
  <div style="font-family: Arial, sans-serif; background:#f4efe6; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:white; border:1px solid #eadfce;">
      <div style="background:#7f1d1d; color:white; padding:22px;">
        <h2 style="margin:0;">${t.title}</h2>
        <p style="margin:8px 0 0; color:#fee2e2;">
          ${t.subtitle}
        </p>
      </div>

      <div style="padding:24px; color:#2e2923; line-height:1.55;">
        <p>${t.pozdrav(r.gost.ime || "goste", r.gost.prezime || "")}</p>

        <p>
          ${t.uvodPara}
        </p>

        <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
          <h3 style="margin:0 0 14px;">${t.detaljiNaslov}</h3>
          <p><strong>${t.labelObjekt}</strong> ${r.jedinica.objekt.naziv}</p>
          <p><strong>${t.labelJedinica}</strong> ${r.jedinica.naziv}</p>
          <p><strong>${t.labelDolazak}</strong> ${formatDateZaMail(r.datumOd, jezik)}</p>
          <p><strong>${t.labelOdlazak}</strong> ${formatDateZaMail(r.datumDo, jezik)}</p>
        </div>

        <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
          ${t.autorizacijaPonistena}
        </div>

        <p style="margin-top:22px;">
          ${t.ispricavamoSe}
        </p>

        <p style="margin-top:28px;">
          ${t.zavrsetak}
        </p>
      </div>
    </div>
  </div>
`,
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId,
          to: r.gost.email,
          subject: t.subject,
          tip: "OTKAZIVANJE_REZERVACIJE",
          status: "POSLANO",
        },
      });
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin");
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    redirect(`/admin/rezervacije/${rezervacijaId}?odbijeno=1&updated=${Date.now()}`);
  }

  async function evidentirajUplatu(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const iznos = parseAmount(formData.get("iznos"));
    const tip = String(formData.get("tip") || "AKONTACIJA") as
      | "AKONTACIJA"
      | "OSTATAK"
      | "RAZLIKA"
      | "CIJELI_IZNOS";

    const nacinPlacanja = String(
      formData.get("nacinPlacanja") || "TEKUCI_RACUN"
    );

    const napomena = String(formData.get("napomena") || "").trim();

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const placanje = await prisma.placanje.create({
      data: {
        rezervacijaId,
        tip,
        status: "CEKA_PLACANJE",
        iznos,
        valuta: "EUR",
        nacinPlacanja,
        napomena,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "UPLATA",
        opis: `Evidentirana uplata: ${iznos.toFixed(2)} €`,
        razlog: napomena || null,
        noviPodaci: JSON.stringify({
          iznos,
          tip,
          nacinPlacanja,
          napomena,
          placanjeId: placanje.id,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    // Potvrda/naplata se zove direktno (in-process), bez HTTP fetch-a na
    // /api/admin rutu — server akcija ne nosi admin cookie pa bi fetch dobio 401.
    const potvrda = await potvrdiNaplatu(placanje.id);

    if (!potvrda.ok) {
      throw new Error(`Greška kod potvrde uplate: ${potvrda.error}`);
    }
  }

  async function kreirajZahtjevZaUplatu(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const iznos = parseAmount(formData.get("iznos"));
    const tip = String(formData.get("tip") || "AKONTACIJA") as
      | "AKONTACIJA"
      | "OSTATAK"
      | "RAZLIKA";

    const rokRaw = String(formData.get("rokUplate") || "");
    const napomena = String(formData.get("napomena") || "").trim();

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const rokUplateAkontacije = rokRaw ? parseDateOnly(rokRaw) : null;

    const placanje = await prisma.placanje.create({
      data: {
        rezervacijaId,
        tip,
        status: "ZAHTJEV_POSLAN",
        iznos,
        valuta: "EUR",
        nacinPlacanja: "TEKUCI_RACUN",
        napomena,
      },
    });

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        status: tip === "AKONTACIJA" ? "CEKA_AKONTACIJU" : "CEKA_OSTATAK",
        rokUplateAkontacije,
      },
    });

    // Link na kartično plaćanje. Ista ruta kao poziv-za-plaćanje: na klik
    // create-payment otvori (ili reuse) važeću Stripe sesiju; istekli link
    // se sam regenerira. nacinPlacanja ostaje TEKUCI_RACUN dok gost ne klikne.
    const baseUrl = await getAppUrl();
    const paymentLink = `${baseUrl}/api/rezervacije/create-payment?placanjeId=${placanje.id}`;

    const jezik = odaberiJezikMaila(r.gost?.jezik);
    const t = dohvatiPrijevode(jezik).zahtjevZaUplatu;

    const subject = t.subject(tip);

    const tipEmaila =
      tip === "AKONTACIJA"
        ? "ZAHTJEV_AKONTACIJA"
        : tip === "RAZLIKA"
          ? "ZAHTJEV_RAZLIKA"
          : "ZAHTJEV_OSTATAK";

    let mailStatus: "POSLANO" | "GRESKA" = "GRESKA";
    let mailGreska: string | null = null;

    if (!r.gost?.email) {
      mailGreska = "Gost nema upisanu email adresu. Mail nije stvarno poslan.";
    } else {
      try {
        await resend.emails.send({
          from: getMailFrom(),
          to: r.gost.email,
          bcc: [BCC_EMAIL],
          subject,
          html: `
          <div style="font-family:Arial,sans-serif;background:#f4efe6;padding:24px;">
            <div style="max-width:640px;margin:0 auto;background:white;border:1px solid #eadfce;">
              <div style="background:#2e2923;color:white;padding:22px;">
                <h2 style="margin:0;">${subject}</h2>
                <p style="margin:8px 0 0;color:#eadfce;">
                  ${t.subtitle}
                </p>
              </div>

              <div style="padding:24px;color:#2e2923;line-height:1.55;">
                <p>
                  ${t.pozdrav(r.gost.ime || "goste", r.gost.prezime || "")}
                </p>

                <p>
                  ${t.uvodPara}
                </p>

                <div style="margin:22px 0;padding:18px;background:#fcfaf6;border:1px solid #eadfce;">
                  <h3 style="margin:0 0 14px;">${t.detaljiNaslov}</h3>
                  <p><strong>${t.labelObjekt}</strong> ${r.jedinica.objekt.naziv}</p>
                  <p><strong>${t.labelJedinica}</strong> ${r.jedinica.naziv}</p>
                  <p><strong>${t.labelDolazak}</strong> ${formatDateZaMail(r.datumOd, jezik)}</p>
                  <p><strong>${t.labelOdlazak}</strong> ${formatDateZaMail(r.datumDo, jezik)}</p>
                  <p><strong>${t.labelIznosZaUplatu}</strong> ${money(iznos)}</p>
                  ${rokUplateAkontacije
              ? `<p><strong>${t.labelRokUplate}</strong> ${formatDateZaMail(
                rokUplateAkontacije, jezik
              )}</p>`
              : ""
            }
                </div>

                <div style="padding:16px;background:#fff6e2;border:1px solid #c79a57;color:#7a5a22;">
                  ${t.napomena}
                </div>

                <p style="margin:26px 0;">
                  <a href="${paymentLink}"
                     style="background:#c79a57;color:#ffffff;padding:15px 24px;text-decoration:none;font-weight:bold;display:inline-block;">
                    ${t.button(tip)}
                  </a>
                </p>

                <p style="font-size:13px;color:#6f665a;">
                  ${t.akoGumbNeRadi}<br/>
                  <a href="${paymentLink}" style="color:#7a5a22;">${paymentLink}</a>
                </p>

                <p style="margin-top:28px;">
                  ${t.zavrsetak}
                </p>
              </div>
            </div>
          </div>
        `,
        });

        mailStatus = "POSLANO";
      } catch (error: any) {
        mailGreska =
          error?.message ||
          JSON.stringify(error) ||
          "Greška kod slanja emaila.";
      }
    }

    await prisma.emailLog.create({
      data: {
        rezervacijaId,
        to: r.gost?.email || "bez-emaila",
        subject,
        tip: tipEmaila,
        status: mailStatus,
        greska: mailGreska,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "ZAHTJEV_ZA_UPLATU",
        opis: `Kreiran zahtjev za uplatu: ${iznos.toFixed(2)} €`,
        razlog: napomena || null,
        noviPodaci: JSON.stringify({
          iznos,
          tip,
          rokUplate: rokRaw || null,
          napomena,
          mailStatus,
          mailGreska,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije/naplata");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function spremiECheckinLink(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    if (!rezervacijaId) return;

    const link = String(formData.get("eCheckinLink") || "").trim();

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: { eCheckinLink: link || null },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function posaljiSmsGostu(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const tekst = String(formData.get("tekst") || "").trim();

    if (!rezervacijaId) throw new Error("Nedostaje ID rezervacije.");
    if (!tekst) throw new Error("Tekst SMS-a je prazan.");

    if (!imaInfobipKonfiguraciju()) {
      throw new Error("Infobip nije konfiguriran — SMS se ne može poslati.");
    }

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        ttlockSifre: { select: { id: true } },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    // Ručno slanje NE provjerava TTLock push status (admin zna što radi), ALI
    // šifra mora postojati — inače nema što poslati. Fallback iz telefona se
    // koristi samo za prikaz, ne za stvarno slanje.
    if (r.ttlockSifre.length === 0) {
      throw new Error(
        "Za ovu rezervaciju još nije generirana šifra. Prvo spremi šifru u TTLock pristupu."
      );
    }

    // Normaliziraj u E.164 (doda + ako fali, sredi format). Infobip interno
    // skida + za svoj format, ali u bazu spremamo e164 — isti format kao cron.
    const e164 = normalizirajE164(r.gost?.telefon);
    if (!e164) throw new Error("Neispravan broj telefona.");

    let status: "POSLANO" | "GRESKA" = "GRESKA";
    let greska: string | null = null;
    let messageId: string | null = null;

    try {
      const infobip = await posaljiSmsInfobip({ to: e164, text: tekst });
      messageId = infobip.messageId;
      status = "POSLANO";
    } catch (error: any) {
      greska = error?.message || "Greška kod slanja SMS-a.";
    }

    await prisma.whatsappPoruka.create({
      data: {
        rezervacijaId,
        kanal: "SMS",
        primatelj: e164,
        templateSid: null,
        varijable: {},
        tekstPregled: tekst,
        twilioSid: messageId,
        status,
        greska,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "SMS_POSLAN",
        opis:
          status === "POSLANO"
            ? "Ručno poslan SMS gostu."
            : "Ručni SMS gostu nije poslan (greška).",
        razlog: greska,
        noviPodaci: JSON.stringify({ status, messageId, greska }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function posaljiWelcomeMail(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const jezikRaw = String(formData.get("jezik") || "");
    const uvodPara = String(formData.get("uvodPara") || "").trim();

    if (!rezervacijaId) throw new Error("Nedostaje ID rezervacije.");

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: { include: { objekt: true } },
        // Šifra se SAMO ČITA s rezervacije (TTLock se ne dira); red se izostavi
        // ako šifre nema.
        ttlockSifre: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");
    if (!r.gost?.email) throw new Error("Gost nema upisanu email adresu.");

    const slug = nazivToSlug(r.jedinica.objekt.naziv);
    if (!slug) throw new Error("Za ovaj objekt ne postoji welcome vodič.");

    const jezik = vodicJezik(jezikRaw || r.gost?.jezik);
    const t = dohvatiPrijevode(jezik).dobrodoslica;
    const appUrl = await getAppUrl();

    // Jednostavni welcome mail (mailWrapper pattern). Editabilan uvod iz textarea
    // ide direktno u tekst maila (zamjenjuje "najava" redak); prazno → standardni.
    const html = renderWelcomeMail({
      jezik,
      ime: r.gost.ime || "goste",
      nazivObjekta: r.jedinica.objekt.naziv,
      sifra: r.ttlockSifre[0]?.sifra || null,
      eCheckinLink: r.eCheckinLink,
      datumOd: r.datumOd,
      datumDo: r.datumDo,
      vodicUrl: welcomeUrl(appUrl, jezik, slug, rezervacijaId),
      boja: OBJEKT_BOJA[slug],
      uvodOverride: uvodPara || null,
    });

    const subject = t.subject(r.jedinica.objekt.naziv);

    let mailStatus: "POSLANO" | "GRESKA" = "GRESKA";
    let mailGreska: string | null = null;
    try {
      const res = await sendMail({ to: r.gost.email, subject, html });
      if (res.ok) mailStatus = "POSLANO";
      else mailGreska = res.error || "Greška kod slanja maila.";
    } catch (error: any) {
      mailGreska = error?.message || "Greška kod slanja maila.";
    }

    await prisma.emailLog.create({
      data: {
        rezervacijaId,
        to: r.gost.email,
        subject,
        tip: "DOBRODOSLICA",
        status: mailStatus,
        greska: mailGreska,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "WELCOME_MAIL",
        opis:
          mailStatus === "POSLANO"
            ? "Poslan welcome mail (vodič)."
            : "Welcome mail nije poslan (greška).",
        razlog: mailGreska,
        noviPodaci: JSON.stringify({ jezik, mailStatus, mailGreska }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function generirajRacun(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const iznos = parseAmount(formData.get("iznos"));

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const objekt = r.jedinica.objekt;
    const godina = new Date().getFullYear();
    const prefix = objekt.prefixRacuna || "RAC";

    const brojPostojecih = await prisma.racun.count({
      where: {
        objektId: objekt.id,
        brojRacuna: {
          startsWith: `${prefix}-${godina}-`,
        },
      },
    });

    const brojRacuna = `${prefix}-${godina}-${String(
      brojPostojecih + 1
    ).padStart(4, "0")}`;

    await prisma.racun.create({
      data: {
        rezervacijaId,
        objektId: objekt.id,
        brojRacuna,
        iznos,
        valuta: "EUR",

        nazivIzdavatelja: objekt.nazivZaRacun || objekt.naziv,
        oibIzdavatelja: objekt.oibZaRacun || null,
        adresaIzdavatelja: objekt.adresaZaRacun || null,
        mjestoIzdavatelja: objekt.mjestoZaRacun || objekt.mjesto || null,
        ibanIzdavatelja: objekt.ibanZaRacun || null,
        emailIzdavatelja: objekt.emailZaRacun || null,
        telefonIzdavatelja: objekt.telefonZaRacun || null,

        pdfUrl: null,
        poslanGostu: false,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "RACUN",
        opis: `Generiran račun ${brojRacuna} na iznos ${iznos.toFixed(2)} €`,
        noviPodaci: JSON.stringify({
          brojRacuna,
          iznos,
          izdavatelj: {
            naziv: objekt.nazivZaRacun || objekt.naziv,
            oib: objekt.oibZaRacun || null,
            adresa: objekt.adresaZaRacun || null,
            mjesto: objekt.mjestoZaRacun || objekt.mjesto || null,
            iban: objekt.ibanZaRacun || null,
            email: objekt.emailZaRacun || null,
            telefon: objekt.telefonZaRacun || null,
          },
          gost: {
            ime: r.gost?.ime || null,
            prezime: r.gost?.prezime || null,
            email: r.gost?.email || null,
            telefon: r.gost?.telefon || null,
            adresa: r.gost?.adresa || null,
            grad: r.gost?.grad || null,
            drzava: r.gost?.drzava || null,
          },
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function potvrdiStorno(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const razlog = String(formData.get("razlog") || "").trim();
    const potvrda = String(formData.get("potvrda") || "")
      .trim()
      .toUpperCase();

    if (potvrda !== "STORNO") {
      throw new Error("Za potvrdu storna morate upisati STORNO.");
    }

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
    });

    if (!r) {
      throw new Error("Rezervacija nije pronađena.");
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        status: "OTKAZANO",
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "STORNO_REZERVACIJE",
        opis: "Admin je ručno potvrdio storno rezervacije.",
        razlog:
          razlog ||
          "Rok akontacije je istekao, a uplata nije evidentirana.",
        stariPodaci: JSON.stringify({
          status: r.status,
          datumOd: r.datumOd,
          datumDo: r.datumDo,
          brojNocenja: r.brojNocenja,
          iznosUkupno: r.iznosUkupno,
          dogovoreniIznos: r.dogovoreniIznos,
          iznosPlaceno: r.iznosPlaceno,
          rokUplateAkontacije: r.rokUplateAkontacije,
        }),
        noviPodaci: JSON.stringify({
          status: "OTKAZANO",
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function spremiGosta(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const gostId = String(formData.get("gostId") || "");

    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const emailRaw = String(formData.get("email") || "").trim();
    const email = emailRaw === "" ? null : emailRaw;
    const telefon = String(formData.get("telefon") || "").trim();
    const adresa = String(formData.get("adresa") || "").trim();
    const grad = String(formData.get("grad") || "").trim();
    const drzava = String(formData.get("drzava") || "").trim();
    const napomena = String(formData.get("napomenaGosta") || "").trim();
    const oznake = formData.getAll("oznake").map(String).join(",");

    if (!gostId) {
      throw new Error("Gost nije pronađen.");
    }

    await prisma.$transaction(async (tx) => {
      let prebacenoSGosta:
        | { id: string; ime: string; prezime: string | null }
        | null = null;

      if (email) {
        const postojeci = await tx.gost.findUnique({
          where: { email },
          select: { id: true, ime: true, prezime: true },
        });

        if (postojeci && postojeci.id !== gostId) {
          prebacenoSGosta = postojeci;

          await tx.gost.update({
            where: { id: postojeci.id },
            data: { email: null },
          });
        }
      }

      await tx.gost.update({
        where: { id: gostId },
        data: {
          ime,
          prezime,
          email,
          telefon,
          adresa,
          grad,
          drzava,
          napomena,
          oznake,
        },
      });

      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId,
          tip: "GOST_NAPOMENA",
          opis: prebacenoSGosta
            ? `Ažurirani podaci gosta. Email prebačen s gosta ${prebacenoSGosta.ime}${prebacenoSGosta.prezime ? ` ${prebacenoSGosta.prezime}` : ""} (ID: ${prebacenoSGosta.id}).`
            : "Ažurirani podaci gosta.",
          noviPodaci: JSON.stringify({
            ime,
            prezime,
            email,
            telefon,
            adresa,
            grad,
            drzava,
            oznake,
            napomena,
            ...(prebacenoSGosta
              ? {
                  emailPrebacenSGosta: {
                    id: prebacenoSGosta.id,
                    ime: prebacenoSGosta.ime,
                    prezime: prebacenoSGosta.prezime,
                  },
                }
              : {}),
          }),
          korisnikIme: "Admin",
        },
      });
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/gosti");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function spremiBrojOsoba(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const brojOsoba = Number.parseInt(
      String(formData.get("brojOsoba") || "").trim(),
      10
    );

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: { jedinica: true },
    });

    if (!r) {
      throw new Error("Rezervacija nije pronađena.");
    }

    const maxKapacitet =
      (r.jedinica.osnovniKapacitet || 0) + (r.jedinica.dodatniKapacitet || 0);

    // Backend validacija: 1 .. ukupni kapacitet jedinice.
    if (!Number.isFinite(brojOsoba) || brojOsoba < 1 || brojOsoba > maxKapacitet) {
      redirect(`/admin/rezervacije/${rezervacijaId}?errBrojOsoba=1`);
    }

    if (brojOsoba === r.brojOsoba) {
      redirect(`/admin/rezervacije/${rezervacijaId}`);
    }

    const staroBrojOsoba = r.brojOsoba;

    await prisma.$transaction(async (tx) => {
      await tx.rezervacija.update({
        where: { id: rezervacijaId },
        data: { brojOsoba },
      });

      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId,
          tip: "BROJ_OSOBA",
          opis: `Broj osoba promijenjen s ${staroBrojOsoba} na ${brojOsoba}.`,
          stariPodaci: JSON.stringify({ brojOsoba: staroBrojOsoba }),
          noviPodaci: JSON.stringify({ brojOsoba }),
          korisnikIme: "Admin",
        },
      });
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function spremiTtlockPristup(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const sifraRaw = String(formData.get("sifra") || "").replace(/\D/g, "").slice(0, 4);
    const ulazVrijeme = String(formData.get("ulazVrijeme") || "16:00");
    const izlazVrijeme = String(formData.get("izlazVrijeme") || "10:00");

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: {
          include: {
            ttlockBrave: true,
          },
        },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");
    if (r.jedinica.ttlockBrave.length === 0) {
      throw new Error("Jedinica nema povezane TTLock brave.");
    }

    const sifra = sifraRaw || generirajSifruIzTelefona(r.gost?.telefon);

    const ulaz = parseTime(ulazVrijeme);
    const izlaz = parseTime(izlazVrijeme);

    const vrijediOd = setTime(r.datumOd, ulaz.hour, ulaz.minute);
    const vrijediDo = setTime(r.datumDo, izlaz.hour, izlaz.minute);

    for (const veza of r.jedinica.ttlockBrave) {
      await prisma.rezervacijaTtlockSifra.upsert({
        where: {
          rezervacijaId_bravaId: {
            rezervacijaId: r.id,
            bravaId: veza.bravaId,
          },
        },
        update: {
          sifra,
          vrijediOd,
          vrijediDo,
          status: "CEKA",
          greska: null,
        },
        create: {
          rezervacijaId: r.id,
          bravaId: veza.bravaId,
          sifra,
          vrijediOd,
          vrijediDo,
          status: "CEKA",
        },
      });
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function posaljiTtlockNaBrave(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");

    const sifre = await prisma.rezervacijaTtlockSifra.findMany({
      where: { rezervacijaId },
      include: {
        brava: true,
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

    for (const s of sifre) {
      try {
        const response = await dodajTtlockSifru({
          lockId: s.brava.lockId,
          sifra: s.sifra,
          naziv: `${s.rezervacija.jedinica.naziv} ${s.rezervacija.gost?.ime || "Gost"}`,
          vrijediOd: s.vrijediOd,
          vrijediDo: s.vrijediDo,
        });

        await prisma.rezervacijaTtlockSifra.update({
          where: { id: s.id },
          data: {
            status: "POSLANO",
            ttlockKeyboardPwdId: response.keyboardPwdId
              ? String(response.keyboardPwdId)
              : null,
            greska: null,
          },
        });
      } catch (error: any) {
        await prisma.rezervacijaTtlockSifra.update({
          where: { id: s.id },
          data: {
            status: "GRESKA",
            greska: error?.message || "Greška kod slanja na TTLock.",
          },
        });
      }
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function obrisiAdminRezervaciju(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const potvrda = String(formData.get("potvrdaBrisanja") || "")
      .trim()
      .toUpperCase();

    if (potvrda !== "OBRIŠI") {
      throw new Error("Za brisanje morate upisati OBRIŠI.");
    }

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      select: {
        id: true,
        izvor: true,
        status: true,
      },
    });

    if (!r) {
      throw new Error("Rezervacija nije pronađena.");
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        statusPrijeBrisanja: r.status,
        status: "OTKAZANO",
        obrisanoAt: new Date(),
        obrisaoKorisnik: "Admin",
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "BRISANJE_REZERVACIJE",
        opis: "Rezervacija je označena kao obrisana.",
        stariPodaci: JSON.stringify({
          status: r.status,
        }),
        noviPodaci: JSON.stringify({
          status: "OTKAZANO",
          oznacenoKaoObrisano: true,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");
    revalidatePath("/admin/gosti");

    redirect("/admin/rezervacije");
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background: "#f4efe6",
      }}
    >
      <style>{`
        .cm { background: #fff; border: 1px solid #d4c4a8; padding: 12px 14px; }
        .hm { font-size: 14px; font-weight: 500; border-bottom: 1px solid #e8dcc4; padding-bottom: 8px; margin-bottom: 10px; color: #2f261d; }
        .lm { color: #8b7355; font-size: 10px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; }
        .vm { color: #2f261d; font-size: 13px; }
        .bg { background: #c4a96b; color: #fff; border: 1px solid #c4a96b; padding: 8px 14px; font-weight: 600; cursor: pointer; font-size: 13px; display: inline-block; text-decoration: none; }
        .bg:hover { filter: brightness(0.95); }
        .bo { background: transparent; color: #c4a96b; border: 1px solid #c4a96b; padding: 6px 12px; font-weight: 600; cursor: pointer; font-size: 12px; display: inline-block; }
        .bo:hover { background: #f0e4c8; }
        .gr { background: #d6e9c6; color: #2f5d1a; padding: 4px 10px; font-size: 11px; font-weight: 600; border: 1px solid #b4d391; display: inline-block; letter-spacing: 0.5px; }
        .go { background: #f0e4c8; color: #6b5524; padding: 4px 10px; font-size: 11px; font-weight: 600; border: 1px solid #d4c4a8; display: inline-block; letter-spacing: 0.5px; }
        .gy { background: #e8dcc4; color: #5c4e3a; padding: 4px 10px; font-size: 11px; font-weight: 600; border: 1px solid #d4c4a8; display: inline-block; letter-spacing: 0.5px; }
        .rd { background: #fee2e2; color: #991b1b; padding: 4px 10px; font-size: 11px; font-weight: 600; border: 1px solid #fca5a5; display: inline-block; letter-spacing: 0.5px; }
        .in { width: 100%; padding: 5px 7px; border: 1px solid #c4a96b; background: #fff; font-size: 13px; color: #2f261d; outline: none; box-sizing: border-box; font-family: inherit; }
        .in:focus { border-color: #8b7355; }
        .row { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
        .row2 { display: grid; gap: 10px; grid-template-columns: 1.4fr 1fr; }
        .metrics { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); }
        .hero-grid { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
        .hero-badges { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
        .alert-warn { margin-top: 12px; border: 1px solid #ead7b6; background: #fff9ef; padding: 10px 12px; font-size: 12px; color: #7a5a22; }
        .alert-info { margin-top: 10px; border: 1px solid #bfdbfe; background: #eff6ff; padding: 10px 12px; font-size: 12px; color: #1e40af; }
        .alert-ok { margin-top: 10px; border: 1px solid #bbf7d0; background: #f0fdf4; padding: 10px 12px; font-size: 12px; color: #166534; }
        .alert-amber { margin-top: 10px; border: 1px solid #fde68a; background: #fffbeb; padding: 10px 12px; font-size: 12px; color: #92400e; }
        @media (max-width: 900px) {
          .row, .row2 { grid-template-columns: 1fr; }
          .metrics { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
      <div className="mx-auto max-w-7xl text-[#2f261d]">
        <div className="cm" style={{ marginBottom: 12, padding: "16px 18px" }}>
          <div className="hero-grid">
            <div>
              <Link
                href="/admin/rezervacije"
                style={{
                  color: "#8b6914",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                ← Sve rezervacije
              </Link>

              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  marginTop: 10,
                  color: "#2f261d",
                }}
              >
                Admin detalj rezervacije
              </h1>

              <p style={{ marginTop: 6, fontSize: 13, color: "#6f665a" }}>
                {rezervacija.jedinica.objekt.naziv} /{" "}
                {rezervacija.jedinica.naziv}
              </p>

              <p
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color: "#9b7a4c",
                  letterSpacing: 0.5,
                }}
              >
                ID: {rezervacija.id}
              </p>
            </div>

            <div className="hero-badges">
              <span
                className={
                  rezervacija.status === "OTKAZANO"
                    ? "rd"
                    : rezervacija.status === "PLACENO" ||
                        rezervacija.status === "POTVRDENO" ||
                        rezervacija.status === "CEKA_OSTATAK"
                      ? "gr"
                      : "go"
                }
              >
                {rezervacija.status}
              </span>
              <span className="go">{rezervacija.izvor}</span>
            </div>
          </div>

          {(rezervacija.izvor === "BOOKING" || rezervacija.izvor === "WEB") && (
            <div className="alert-warn">
              <strong>UPOZORENJE:</strong> ova rezervacija je kreirana putem{" "}
              {rezervacija.izvor}. Kod promjene termina, cijene, otkazivanja ili
              povrata treba dodatno provjeriti uplatu i vanjski sustav.
            </div>
          )}

          {rezervacija.status === "CEKA_AKONTACIJU" && (
            <div className="alert-amber">
              <strong>⏳ Čeka uplatu akontacije.</strong> Gostu je poslan link
              za plaćanje. Rezervacija još nije potvrđena.
            </div>
          )}

          {rezervacija.status === "CEKA_POTVRDU" && (
            <div className="alert-info">
              <strong>🔎 Uplata zaprimljena — čeka provjeru.</strong> Potrebno
              je provjeriti uplatu i ručno potvrditi rezervaciju.
            </div>
          )}

          {["POTVRDENO", "PLACENO", "CEKA_OSTATAK"].includes(
            rezervacija.status
          ) && (
            <div className="alert-ok">
              <strong>✅ Rezervacija potvrđena.</strong>
            </div>
          )}
        </div>

        <section className="metrics" style={{ marginBottom: 12 }}>
          <Stat title="Ukupno" value={money(ukupno)} color="#2f261d" />
          <Stat title="Plaćeno" value={money(placeno)} color="#2f5d1a" />
          <Stat title="Ostatak" value={money(ostatak)} color="#9b6b12" />
          <Stat title="Popust" value={money(popust)} color="#2f261d" />
        </section>

        {/* Row 2: GOST + TERMIN */}
        <section className="row2" style={{ marginBottom: 12 }}>
          <Card title="Gost">
            {gostUpozorenje && (
              <div
                style={{
                  marginBottom: 10,
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#991b1b",
                }}
              >
                ⚠ Pažnja — gost ima oznaku: {gostOznake.join(", ")}
              </div>
            )}

            {rezervacija.napomena?.trim() && (
              <div
                style={{
                  marginBottom: 10,
                  borderLeft: "3px solid #dc2626",
                  background: "#fef2f2",
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "#991b1b",
                }}
              >
                <div className="lm" style={{ color: "#7f1d1d", marginBottom: 4 }}>
                  ⚠ Napomena gosta uz rezervaciju
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{rezervacija.napomena}</div>
              </div>
            )}

            <Detail
              label="Ime"
              value={`${rezervacija.gost?.ime || "Gost"} ${rezervacija.gost?.prezime || ""}`}
            />
            <Detail label="Email" value={rezervacija.gost?.email || "-"} />
            <Detail label="Telefon" value={rezervacija.gost?.telefon || "-"} />
            <Detail label="Adresa" value={rezervacija.gost?.adresa || "-"} />
            <Detail label="Grad / mjesto" value={rezervacija.gost?.grad || "-"} />
            <Detail label="Država" value={rezervacija.gost?.drzava || "-"} />

            {gostOznake.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="lm" style={{ marginBottom: 4 }}>Oznake gosta</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {gostOznake.map((oznaka) => (
                    <span
                      key={oznaka}
                      className={
                        oznaka === "NEUREDAN" ||
                        oznaka === "PROBLEMATICAN" ||
                        oznaka === "KASNI_S_PLACANJEM"
                          ? "rd"
                          : "go"
                      }
                    >
                      {oznaka}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Detail
              label="Interna napomena o gostu"
              value={rezervacija.gost?.napomena || "-"}
            />

            {rezervacija.gost && (
              <details style={{ marginTop: 10 }}>
                <summary
                  className="bo"
                  style={{
                    listStyle: "none",
                    textAlign: "center",
                    display: "block",
                  }}
                >
                  Uredi podatke o gostu
                </summary>

                <form
                  action={spremiGosta}
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: "#fcfaf6",
                    border: "1px solid #e8dcc4",
                  }}
                >
                  <input type="hidden" name="rezervacijaId" value={rezervacija.id} />
                  <input type="hidden" name="gostId" value={rezervacija.gost.id} />

                  <div className="row" style={{ marginBottom: 8 }}>
                    <Field label="Ime">
                      <input className="in" name="ime" defaultValue={rezervacija.gost.ime || ""} />
                    </Field>
                    <Field label="Prezime">
                      <input className="in" name="prezime" defaultValue={rezervacija.gost.prezime || ""} />
                    </Field>
                    <Field label="Email">
                      <input className="in" name="email" type="email" defaultValue={rezervacija.gost.email || ""} />
                    </Field>
                    <Field label="Telefon">
                      <input className="in" name="telefon" defaultValue={rezervacija.gost.telefon || ""} />
                    </Field>
                    <Field label="Adresa">
                      <input className="in" name="adresa" defaultValue={rezervacija.gost.adresa || ""} />
                    </Field>
                    <Field label="Grad / mjesto">
                      <input className="in" name="grad" defaultValue={rezervacija.gost.grad || ""} />
                    </Field>
                    <Field label="Država">
                      <input className="in" name="drzava" defaultValue={rezervacija.gost.drzava || ""} />
                    </Field>
                  </div>

                  <div className="lm" style={{ marginBottom: 4 }}>Oznake gosta</div>
                  <div className="row" style={{ marginBottom: 8 }}>
                    {OZNAKE_GOSTA.map((oznaka) => (
                      <label
                        key={oznaka}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          border: "1px solid #e8dcc4",
                          background: "#fff",
                          padding: "5px 8px",
                          fontSize: 12,
                          color: "#2f261d",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="oznake"
                          value={oznaka}
                          defaultChecked={gostOznake.includes(oznaka)}
                        />
                        {oznaka}
                      </label>
                    ))}
                  </div>

                  <Field label="Interna napomena o gostu">
                    <textarea
                      name="napomenaGosta"
                      rows={3}
                      defaultValue={rezervacija.gost.napomena || ""}
                      className="in"
                      placeholder="Npr. super gost, uredan, kasni s uplatom..."
                    />
                  </Field>

                  <button className="bg" style={{ marginTop: 8, width: "100%" }}>
                    Spremi podatke o gostu
                  </button>
                </form>
              </details>
            )}

            <Link
              href={`/admin/rezervacije/${rezervacija.id}/promjena-termina`}
              className="bo"
              style={{
                marginTop: 10,
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Gost traži promjenu termina
            </Link>
          </Card>

          <Card title="Termin">
            <Detail label="Dolazak" value={formatDate(rezervacija.datumOd)} />
            <Detail label="Odlazak" value={formatDate(rezervacija.datumDo)} />
            <Detail label="Noćenja" value={`${rezervacija.brojNocenja}`} />
            <form action={spremiBrojOsoba} style={{ marginBottom: 8 }}>
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />
              <div className="lm">Broj osoba</div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  marginTop: 2,
                }}
              >
                <input
                  className="in"
                  type="number"
                  name="brojOsoba"
                  min={1}
                  max={
                    (rezervacija.jedinica.osnovniKapacitet || 0) +
                    (rezervacija.jedinica.dodatniKapacitet || 0)
                  }
                  defaultValue={rezervacija.brojOsoba}
                  required
                  style={{ width: 90 }}
                />
                <button className="bo" style={{ padding: "4px 12px" }}>
                  Spremi
                </button>
              </div>
              <div className="lm" style={{ marginTop: 4, opacity: 0.7 }}>
                Kapacitet: {rezervacija.jedinica.osnovniKapacitet || 0}+
                {rezervacija.jedinica.dodatniKapacitet || 0}
              </div>
              {sp?.errBrojOsoba ? (
                <div style={{ marginTop: 4, color: "#b42318", fontSize: 12 }}>
                  Broj osoba mora biti između 1 i{" "}
                  {(rezervacija.jedinica.osnovniKapacitet || 0) +
                    (rezervacija.jedinica.dodatniKapacitet || 0)}
                  .
                </div>
              ) : null}
            </form>
            <Detail
              label="Datum rezerviranja"
              value={formatDateTime(rezervacija.createdAt)}
            />

            <div style={{ marginTop: 10 }}>
              <div className="lm" style={{ marginBottom: 4 }}>Dana do dolaska</div>
              {(() => {
                const today = startOfDay(new Date());
                const arrival = startOfDay(new Date(rezervacija.datumOd));
                const days = Math.round(
                  (arrival.getTime() - today.getTime()) / 86400000
                );
                const label =
                  days < 0
                    ? `${Math.abs(days)} dana proteklo`
                    : days === 0
                      ? "Danas"
                      : `${days} dana`;
                return (
                  <span className="go" style={{ fontSize: 14, padding: "6px 12px" }}>
                    {label}
                  </span>
                );
              })()}
            </div>
          </Card>
        </section>

        {/* Row 3: TTLOCK + CIJENA I STATUS */}
        <section className="row" style={{ marginBottom: 12 }}>
          <Card title="TTLock pristup">
            {rezervacija.jedinica.ttlockBrave.length === 0 ? (
              <div
                style={{
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#991b1b",
                }}
              >
                Ova jedinica još nema povezane TTLock brave.
              </div>
            ) : (
              <>
                <form action={spremiTtlockPristup}>
                  <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

                  <Field label="Šifra gosta">
                    <input
                      name="sifra"
                      maxLength={4}
                      defaultValue={ttlockSifra}
                      style={{
                        width: "100%",
                        background: "#2f261d",
                        color: "#c4a96b",
                        border: "1px solid #2f261d",
                        padding: 12,
                        fontSize: 26,
                        fontWeight: 700,
                        textAlign: "center",
                        letterSpacing: "0.25em",
                        outline: "none",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    />
                  </Field>

                  <div className="row" style={{ marginBottom: 8 }}>
                    <Field label={`Ulaz ${formatDate(rezervacija.datumOd)}`}>
                      <input
                        className="in"
                        name="ulazVrijeme"
                        type="time"
                        defaultValue={formatTime(ttlockUlaz)}
                      />
                    </Field>

                    <Field label={`Izlaz ${formatDate(rezervacija.datumDo)}`}>
                      <input
                        className="in"
                        name="izlazVrijeme"
                        type="time"
                        defaultValue={formatTime(ttlockIzlaz)}
                      />
                    </Field>
                  </div>

                  <button className="bg" style={{ width: "100%" }}>
                    Spremi šifru i vrijeme
                  </button>
                </form>

                <div
                  style={{
                    marginTop: 10,
                    border: "1px solid #e8dcc4",
                    background: "#fcfaf6",
                    padding: 8,
                  }}
                >
                  <div className="lm" style={{ marginBottom: 4 }}>Brave</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {rezervacija.jedinica.ttlockBrave.map((veza) => (
                      <span key={veza.id} className="gy">
                        {veza.brava.naziv}
                      </span>
                    ))}
                  </div>
                </div>

                {rezervacija.ttlockSifre.length > 0 && (
                  <>
                    <form action={posaljiTtlockNaBrave} style={{ marginTop: 10 }}>
                      <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

                      <button
                        style={{
                          width: "100%",
                          background: "#15803d",
                          color: "#fff",
                          border: "1px solid #15803d",
                          padding: "8px 14px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Pošalji šifru na TTLock brave
                      </button>
                    </form>

                    {rezervacija.ttlockSifre.some((x) => x.status === "POSLANO") && (
                      <div className="alert-ok">
                        ✅ Šifra je uspješno poslana na TTLock brave.
                      </div>
                    )}

                    {rezervacija.ttlockSifre.some((x) => x.status === "GRESKA") && (
                      <div
                        style={{
                          marginTop: 10,
                          border: "1px solid #fca5a5",
                          background: "#fef2f2",
                          padding: "8px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#991b1b",
                        }}
                      >
                        ❌ Došlo je do greške kod slanja TTLock šifre.
                      </div>
                    )}
                  </>
                )}

                {rezervacija.ttlockSifre.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {rezervacija.ttlockSifre.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          border: "1px solid #e8dcc4",
                          background: "#fff",
                          padding: 8,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#2f261d" }}>{s.brava.naziv}</div>
                        <div style={{ marginTop: 2, color: "#6f665a" }}>
                          {formatDateTime(s.vrijediOd)} - {formatDateTime(s.vrijediDo)}
                        </div>
                        <div style={{ marginTop: 2, fontWeight: 600, color: "#9b6b12" }}>
                          Status: {s.status}
                        </div>
                        {s.greska && (
                          <div
                            style={{
                              marginTop: 4,
                              background: "#fef2f2",
                              padding: 6,
                              color: "#991b1b",
                            }}
                          >
                            {s.greska}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="Cijena i status">
            <Detail label="Status" value={rezervacija.status} />
            <Detail label="Izvor" value={rezervacija.izvor} />
            <Detail label="Osnovni iznos" value={money(rezervacija.iznosOsnovni)} />
            <Detail
              label="Dogovoreni iznos"
              value={money(rezervacija.dogovoreniIznos || rezervacija.iznosUkupno)}
            />
            <Detail
              label="Rok uplate"
              value={formatDate(rezervacija.rokUplateAkontacije)}
            />
          </Card>
        </section>

        <section className="row" style={{ marginBottom: 12 }}>
          <Card title="eCheckin link">
            <form action={spremiECheckinLink}>
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <Field label="Link na prijavu gosta (eCheckin)">
                <input
                  className="in"
                  name="eCheckinLink"
                  type="url"
                  defaultValue={rezervacija.eCheckinLink || ""}
                  placeholder="https://..."
                />
              </Field>

              <div style={{ fontSize: 11, color: "#6f665a", marginBottom: 8 }}>
                Spremljeni link automatski se uvrsti u predložak SMS-a.
              </div>

              <button className="bg" style={{ width: "100%" }}>
                Spremi eCheckin link
              </button>
            </form>
          </Card>

          <Card title="Pošalji SMS gostu">
            <form action={posaljiSmsGostu}>
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <Field label="Tekst SMS-a (editabilno)">
                <textarea
                  className="in"
                  name="tekst"
                  rows={7}
                  defaultValue={smsPredlozak}
                  style={{ fontFamily: "inherit", lineHeight: 1.5 }}
                />
              </Field>

              {!infobipOk && (
                <div
                  style={{
                    marginBottom: 8,
                    border: "1px solid #fca5a5",
                    background: "#fef2f2",
                    padding: "6px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#991b1b",
                  }}
                >
                  Infobip nije konfiguriran — slanje onemogućeno.
                </div>
              )}

              {infobipOk && !imaSifru && (
                <div
                  style={{
                    marginBottom: 8,
                    border: "1px solid #ead7b6",
                    background: "#fff9ef",
                    padding: "6px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#7a5a22",
                  }}
                >
                  Nema generirane šifre — prvo je spremi u TTLock pristupu.
                </div>
              )}

              <button
                className="bg"
                style={{
                  width: "100%",
                  opacity: infobipOk && imaSifru ? 1 : 0.5,
                  cursor: infobipOk && imaSifru ? "pointer" : "not-allowed",
                }}
                disabled={!infobipOk || !imaSifru}
              >
                Pošalji SMS
              </button>
            </form>
          </Card>
        </section>

        <section className="row" style={{ marginBottom: 12 }}>
          <Card title="Pošalji welcome mail">
            <form action={posaljiWelcomeMail}>
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <Field label="Jezik">
                <select
                  className="in"
                  name="jezik"
                  defaultValue={welcomeJezikDefault}
                >
                  <option value="hr">Hrvatski</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
              </Field>

              <Field label="Uvodni tekst (editabilno)">
                <textarea
                  className="in"
                  name="uvodPara"
                  rows={4}
                  defaultValue={welcomeUvodDefault}
                  style={{ fontFamily: "inherit", lineHeight: 1.5 }}
                />
              </Field>

              <div style={{ fontSize: 11, color: "#6f665a", marginBottom: 8 }}>
                Mail nosi cijeli vodič dobrodošlice + šifru (ako postoji) i
                eCheckin link. Šifra se čita s rezervacije, ne generira se.
              </div>

              {!imaEmail && (
                <div
                  style={{
                    marginBottom: 8,
                    border: "1px solid #fca5a5",
                    background: "#fef2f2",
                    padding: "6px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#991b1b",
                  }}
                >
                  Gost nema email adresu — slanje onemogućeno.
                </div>
              )}

              {imaEmail && !imaWelcomeSlug && (
                <div
                  style={{
                    marginBottom: 8,
                    border: "1px solid #ead7b6",
                    background: "#fff9ef",
                    padding: "6px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#7a5a22",
                  }}
                >
                  Za ovaj objekt ne postoji welcome vodič.
                </div>
              )}

              <button
                className="bg"
                style={{
                  width: "100%",
                  opacity: imaEmail && imaWelcomeSlug ? 1 : 0.5,
                  cursor: imaEmail && imaWelcomeSlug ? "pointer" : "not-allowed",
                }}
                disabled={!imaEmail || !imaWelcomeSlug}
              >
                Pošalji welcome mail
              </button>
            </form>
          </Card>
        </section>

        {predlozenoZaStorno && (
          <section className="mb-6 border-2 border-red-400 bg-red-50 p-5 text-red-800 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
            <div className="text-sm font-black uppercase tracking-[0.16em]">
              ⚠ Predloženo za storno
            </div>

            <h2 className="mt-1 text-2xl font-black">
              Rok akontacije je istekao
            </h2>

            <p className="mt-2 text-sm">
              Uplata nije evidentirana. Prije storna obavezno provjeriti
              telefonski s gostom. Ako je dogovoreno da se rezervacija otkaže,
              potvrdi storno dolje.
            </p>

            <form action={potvrdiStorno} className="mt-5 space-y-3">
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-[0.14em]">
                  Razlog storna
                </div>

                <textarea
                  name="razlog"
                  rows={3}
                  className="w-full border border-red-300 bg-white px-3 py-2 text-red-900 outline-none"
                  placeholder="Npr. gost nije uplatio akontaciju u roku, provjereno telefonski..."
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-[0.14em]">
                  Za potvrdu upiši: STORNO
                </div>

                <input
                  name="potvrda"
                  required
                  placeholder="STORNO"
                  className="w-full border border-red-300 bg-white px-3 py-2 font-black text-red-900 outline-none"
                />
              </label>

              <button className="cursor-pointer border border-red-700 bg-red-700 px-5 py-3 text-sm font-black text-white hover:brightness-95">
                Potvrdi storno rezervacije
              </button>
            </form>
          </section>
        )}

        <section className="row" style={{ marginBottom: 12 }}>
          <Card title="Evidentiraj uplatu">
            <form action={evidentirajUplatu}>
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <div className="row" style={{ marginBottom: 8 }}>
                <Field label="Iznos">
                  <input
                    className="in"
                    name="iznos"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={ostatak > 0 ? ostatak.toFixed(2) : ""}
                    required
                  />
                </Field>

                <Field label="Tip uplate">
                  <select
                    className="in"
                    name="tip"
                    defaultValue={placeno > 0 ? "OSTATAK" : "AKONTACIJA"}
                  >
                    <option value="AKONTACIJA">Akontacija</option>
                    <option value="OSTATAK">Ostatak</option>
                    <option value="RAZLIKA">Razlika</option>
                    <option value="CIJELI_IZNOS">Cijeli iznos</option>
                  </select>
                </Field>
              </div>

              <div className="row" style={{ marginBottom: 8 }}>
                <Field label="Način plaćanja">
                  <select className="in" name="nacinPlacanja" defaultValue="TEKUCI_RACUN">
                    <option value="TEKUCI_RACUN">Tekući račun</option>
                    <option value="KARTICA">Kartica</option>
                    <option value="GOTOVINA">Gotovina</option>
                    <option value="BOOKING">Booking naplata</option>
                    <option value="OSTALO">Ostalo</option>
                  </select>
                </Field>

                <Field label="Napomena">
                  <textarea
                    className="in"
                    name="napomena"
                    rows={1}
                    placeholder="Dogovor s gostom..."
                  />
                </Field>
              </div>

              <button
                style={{
                  width: "100%",
                  background: "#dcfce7",
                  color: "#166534",
                  border: "1px solid #22c55e",
                  padding: "8px 14px",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Evidentiraj uplatu
              </button>
            </form>
          </Card>

          <Card title="Zahtjev za uplatu">
            <form action={kreirajZahtjevZaUplatu}>
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <div className="row" style={{ marginBottom: 8 }}>
                <Field label="Iznos za uplatu">
                  <input
                    className="in"
                    name="iznos"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={
                      placeno > 0
                        ? ostatak.toFixed(2)
                        : Number(rezervacija.iznosPotvrde || 0).toFixed(2)
                    }
                    required
                  />
                </Field>

                <Field label="Vrsta zahtjeva">
                  <select
                    className="in"
                    name="tip"
                    defaultValue={placeno > 0 ? "OSTATAK" : "AKONTACIJA"}
                  >
                    <option value="AKONTACIJA">Akontacija</option>
                    <option value="OSTATAK">Ostatak</option>
                    <option value="RAZLIKA">Razlika</option>
                  </select>
                </Field>
              </div>

              <div className="row" style={{ marginBottom: 8 }}>
                <Field label="Rok uplate">
                  <input className="in" name="rokUplate" type="date" />
                </Field>

                <Field label="Napomena za zahtjev">
                  <textarea
                    className="in"
                    name="napomena"
                    rows={1}
                    placeholder="Molimo uplatu akontacije..."
                  />
                </Field>
              </div>

              <button className="bg" style={{ width: "100%", marginTop: 4 }}>
                Kreiraj zahtjev za uplatu
              </button>
            </form>
          </Card>
        </section>

        <section className="row" style={{ marginBottom: 12 }}>
          <Card title="Plaćanja">
            {rezervacija.placanja.length === 0 ? (
              <Empty text="Nema evidentiranih plaćanja." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rezervacija.placanja.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      borderLeft: "3px solid #2f5d1a",
                      border: "1px solid #e8dcc4",
                      borderLeftWidth: 3,
                      borderLeftColor: "#2f5d1a",
                      background: "#fcfaf6",
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 6 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#2f261d" }}>
                          {p.tip} · {p.status}
                        </div>
                        <div style={{ fontSize: 11, color: "#6f665a" }}>
                          {formatDateTime(p.createdAt)}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", fontWeight: 600, color: "#2f5d1a", fontSize: 14 }}>
                        {money(p.iznos)}
                      </div>
                    </div>

                    <div style={{ marginTop: 4, fontSize: 11, color: "#6f665a" }}>
                      Način: {p.nacinPlacanja || p.provider || "-"}
                    </div>

                    {p.napomena && (
                      <div
                        style={{
                          marginTop: 4,
                          border: "1px solid #ead7b6",
                          background: "#fff9ef",
                          padding: 6,
                          fontSize: 11,
                          color: "#6f665a",
                        }}
                      >
                        {p.napomena}
                      </div>
                    )}

                    {p.provider === "STRIPE" &&
                      p.status !== "PLACENO" &&
                      rezervacija.status === "CEKA_POTVRDU" && (
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <form action="/api/admin/placanja/potvrdi-link" method="POST">
                            <input type="hidden" name="placanjeId" value={p.id} />
                            <button
                              type="submit"
                              style={{
                                background: "#15803d",
                                color: "#fff",
                                border: "1px solid #15803d",
                                padding: "5px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              ✅ Provjeri uplatu i potvrdi
                            </button>
                          </form>

                          <form action={odbijRezervaciju}>
                            <input type="hidden" name="rezervacijaId" value={rezervacija.id} />
                            <button
                              style={{
                                background: "#b91c1c",
                                color: "#fff",
                                border: "1px solid #b91c1c",
                                padding: "5px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              ❌ Odbij rezervaciju
                            </button>
                          </form>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Računi">
            <form
              action={generirajRacun}
              style={{
                marginBottom: 8,
                border: "1px solid #e8dcc4",
                background: "#fcfaf6",
                padding: 8,
                display: "grid",
                gap: 6,
                gridTemplateColumns: "1fr auto",
              }}
            >
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />
              <input
                className="in"
                name="iznos"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={ukupno.toFixed(2)}
                required
              />
              <button className="bg">Generiraj račun</button>
            </form>

            {rezervacija.racuni.length === 0 ? (
              <Empty text="Nema generiranih računa." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rezervacija.racuni.map((racun) => (
                  <div
                    key={racun.id}
                    style={{
                      border: "1px solid #e8dcc4",
                      borderLeftWidth: 3,
                      borderLeftColor: "#c4a96b",
                      background: "#fcfaf6",
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 6 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#2f261d" }}>
                          {racun.brojRacuna}
                        </div>
                        <div style={{ fontSize: 11, color: "#6f665a" }}>
                          {formatDateTime(racun.createdAt)}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600, color: "#2f261d", fontSize: 14 }}>
                          {money(racun.iznos)}
                        </div>
                        <div style={{ fontSize: 11, color: "#6f665a" }}>
                          {racun.poslanGostu ? "Poslan gostu" : "Nije poslan"}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {racun.pdfUrl ? (
                        <Link
                          href={racun.pdfUrl}
                          target="_blank"
                          className="bo"
                          style={{ textDecoration: "none" }}
                        >
                          Otvori PDF
                        </Link>
                      ) : (
                        <span className="gy">PDF još nije generiran</span>
                      )}

                      <form
                        action={async () => {
                          "use server";

                          const response = await fetch(
                            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/admin/racuni/posalji`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                racunId: racun.id,
                              }),
                            }
                          );

                          if (!response.ok) {
                            const errorBody = await response.text().catch(() => "");
                            throw new Error(
                              `Slanje računa nije uspjelo: ${response.status} ${errorBody.slice(0, 200)}`,
                            );
                          }

                          revalidatePath(`/admin/rezervacije/${rezervacija.id}`);
                          redirect(`/admin/rezervacije/${rezervacija.id}`);
                        }}
                      >
                        <button className="bo">Ponovno pošalji račun</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Row 6: LOG KOMUNIKACIJE + POVIJEST */}
        <section className="row" style={{ marginBottom: 12 }}>
          <Card title="Log komunikacije">
            {logKomunikacije.length === 0 ? (
              <Empty text="Nema zabilježene komunikacije." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {logKomunikacije.map((s) => {
                  const kanalBoja =
                    s.kanal === "EMAIL"
                      ? { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" }
                      : s.kanal === "WHATSAPP"
                        ? { bg: "#ecfdf5", border: "#6ee7b7", text: "#047857" }
                        : { bg: "#fef9c3", border: "#fde047", text: "#854d0e" };

                  return (
                    <div
                      key={s.id}
                      style={{
                        border: "1px solid #e8dcc4",
                        background: "#fcfaf6",
                        padding: "8px 10px",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 6 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                border: `1px solid ${kanalBoja.border}`,
                                background: kanalBoja.bg,
                                color: kanalBoja.text,
                                padding: "1px 6px",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                              }}
                            >
                              {s.kanal}
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color: "#2f261d",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {s.naslov}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#6f665a", marginTop: 2 }}>
                            {s.podnaslov}
                          </div>
                        </div>
                        <span className={s.status === "POSLANO" ? "gr" : "rd"}>{s.status}</span>
                      </div>

                      {s.greska && (
                        <div style={{ marginTop: 4, background: "#fef2f2", padding: 6, fontSize: 11, color: "#991b1b" }}>
                          {s.greska}
                        </div>
                      )}

                      <div style={{ marginTop: 4, fontSize: 10, color: "#9b7a4c" }}>
                        {formatDateTime(s.vrijeme)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Povijest promjena">
            {rezervacija.promjene.length === 0 ? (
              <Empty text="Nema promjena." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rezervacija.promjene.map((p) => {
                  const stari = safeJson(p.stariPodaci);
                  const novi = safeJson(p.noviPodaci);

                  return (
                    <details
                      key={p.id}
                      style={{
                        border: "1px solid #e8dcc4",
                        background: "#fcfaf6",
                        padding: "8px 10px",
                        fontSize: 12,
                      }}
                    >
                      <summary style={{ cursor: "pointer", listStyle: "none" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 6 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#2f261d" }}>{p.tip}</div>
                            <div style={{ fontSize: 11, color: "#6f665a" }}>{p.opis || "-"}</div>
                            <div style={{ marginTop: 2, fontSize: 11, color: "#9b6b12" }}>
                              Tko: {p.korisnikIme || "Nepoznato"}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 11, color: "#6f665a" }}>
                            {formatDateTime(p.createdAt)}
                          </div>
                        </div>
                      </summary>

                      <div style={{ marginTop: 8, borderTop: "1px solid #e8dcc4", paddingTop: 8 }}>
                        {p.razlog && (
                          <div
                            style={{
                              marginBottom: 8,
                              border: "1px solid #ead7b6",
                              background: "#fff9ef",
                              padding: 6,
                              fontSize: 12,
                              color: "#7a5a22",
                            }}
                          >
                            <div className="lm">Razlog promjene</div>
                            <div style={{ marginTop: 2 }}>{p.razlog}</div>
                          </div>
                        )}

                        <div className="row">
                          <div style={{ border: "1px solid #fecaca", background: "#fef2f2", padding: 8 }}>
                            <div className="lm" style={{ color: "#991b1b", marginBottom: 4 }}>
                              Prije promjene
                            </div>

                            {stari ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <ChangeRow label="Dolazak" value={formatJsonDate(stari.datumOd)} />
                                <ChangeRow label="Odlazak" value={formatJsonDate(stari.datumDo)} />
                                <ChangeRow label="Noćenja" value={stari.brojNocenja ?? "-"} />
                                <ChangeRow
                                  label="Ukupno"
                                  value={formatJsonMoney(stari.ukupno || stari.iznosUkupno)}
                                />
                              </div>
                            ) : (
                              <p style={{ fontSize: 11, color: "#6f665a" }}>
                                Nema detaljnih starih podataka.
                              </p>
                            )}
                          </div>

                          <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", padding: 8 }}>
                            <div className="lm" style={{ color: "#166534", marginBottom: 4 }}>
                              Nakon promjene
                            </div>

                            {novi ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <ChangeRow label="Dolazak" value={formatJsonDate(novi.datumOd)} />
                                <ChangeRow label="Odlazak" value={formatJsonDate(novi.datumDo)} />
                                <ChangeRow label="Noćenja" value={novi.brojNocenja ?? "-"} />
                                <ChangeRow
                                  label="Osnovna cijena"
                                  value={formatJsonMoney(novi.iznosOsnovni)}
                                />
                                <ChangeRow
                                  label="Ukupno"
                                  value={formatJsonMoney(novi.ukupno || novi.iznosUkupno)}
                                />
                                <ChangeRow
                                  label="Plaćeno"
                                  value={formatJsonMoney(novi.placeno || novi.iznosPlaceno)}
                                />
                                <ChangeRow
                                  label="Ostatak"
                                  value={formatJsonMoney(novi.ostatak || novi.iznosOstatka)}
                                />
                                <ChangeRow label="Razlika" value={formatJsonMoney(novi.razlika)} />
                              </div>
                            ) : (
                              <p style={{ fontSize: 11, color: "#6f665a" }}>
                                Nema detaljnih novih podataka.
                              </p>
                            )}
                          </div>
                        </div>

                        <div style={{ marginTop: 6, fontSize: 10, color: "#9b7a4c" }}>
                          ID promjene: {p.id}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        {/* Footer: Opasne akcije */}
        {rezervacija.status !== "OTKAZANO" && (
          <section
            className="cm"
            style={{
              marginBottom: 20,
              padding: "10px 14px",
              borderLeft: "3px solid #b91c1c",
              borderLeftWidth: 3,
              borderLeftColor: "#b91c1c",
            }}
          >
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span className="lm" style={{ color: "#991b1b" }}>Opasne akcije</span>
                <span
                  style={{
                    background: "transparent",
                    color: "#b91c1c",
                    border: "1px solid #fca5a5",
                    padding: "6px 12px",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  Obriši / arhiviraj rezervaciju…
                </span>
              </summary>

              <div
                style={{
                  marginTop: 10,
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  padding: 12,
                  color: "#991b1b",
                }}
              >
                <div className="lm" style={{ color: "#991b1b" }}>
                  BRISANJE / ARHIVIRANJE REZERVACIJE
                </div>

                <p style={{ marginTop: 4, fontSize: 12 }}>
                  Ova rezervacija će biti označena kao obrisana, termin će se
                  osloboditi, a zapis ostaje u povijesti promjena.
                </p>

                <form action={obrisiAdminRezervaciju} style={{ marginTop: 8 }}>
                  <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

                  <label style={{ display: "block", marginBottom: 8 }}>
                    <div className="lm" style={{ color: "#991b1b", marginBottom: 4 }}>
                      Za potvrdu upiši: OBRIŠI
                    </div>
                    <input
                      name="potvrdaBrisanja"
                      required
                      placeholder="OBRIŠI"
                      style={{
                        width: "100%",
                        border: "1px solid #fca5a5",
                        background: "#fff",
                        padding: "5px 7px",
                        fontWeight: 600,
                        color: "#991b1b",
                        outline: "none",
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  <button
                    style={{
                      background: "#b91c1c",
                      color: "#fff",
                      border: "1px solid #b91c1c",
                      padding: "8px 14px",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Obriši rezervaciju
                  </button>
                </form>
              </div>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="cm" style={{ padding: "8px 10px" }}>
      <div className="lm">{title}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color }}>
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cm">
      <h2 className="hm">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="lm">{label}</div>
      <div className="vm" style={{ fontWeight: 500, marginTop: 2 }}>
        {value || "-"}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div className="lm" style={{ marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[#6f665a]">{text}</p>;
}

function ChangeRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#e2d8c8] pb-1">
      <span className="text-[#6f665a]">{label}</span>
      <span className="text-right font-black text-[#2e2923]">
        {value === null || value === undefined || value === "" ? "-" : value}
      </span>
    </div>
  );
}