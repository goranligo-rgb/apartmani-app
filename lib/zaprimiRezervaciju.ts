import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { mozdaPosaljiNadopunu } from "@/lib/ciscenje/mozdaPosaljiNadopunu";
import {
  BUNDLE,
  dohvatiPrijevode,
  odaberiJezikMaila,
  formatDateZaMail,
  money,
} from "@/lib/mailovi";

// ── Zaprimanje rezervacije nakon uspješne Stripe autorizacije kartice ──
//
// Ovu funkciju zovu DVA mjesta:
//   1. Stripe webhook  (checkout.session.completed)
//   2. success stranica (app/[locale]/rezervacije/uspjeh/page.tsx)
//
// Kad gost dođe na success stranicu otprilike istovremeno kad stigne webhook,
// oba bi htjela odraditi prijelaz UPIT -> CEKA_POTVRDU i poslati mailove.
// Da NE pošalju dupli mail gostu:
//
//   Sloj 1 (atomska brava): prijelaz se radi UVJETNIM updateMany-jem
//   (where status = "UPIT"). Baza serijalizira UPDATE na razini retka pa
//   točno JEDAN poziv dobije count === 1; samo taj šalje mailove. Drugi
//   dobije count === 0 i tiho izađe.
//
//   Sloj 2 (sekundarna obrana): prije slanja maila gostu provjeri emailLog —
//   pokriva rubni slučaj ručnog reseta statusa na UPIT nakon već poslanih
//   mailova (npr. /admin/reset-rezervacije).

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

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

function getMailFrom() {
  return process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>";
}

async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
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

async function getAdminEmails() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });

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

export type ZaprimiRezultat =
  | {
      ok: true;
      // true ako je OVAJ poziv napravio prijelaz i poslao mailove;
      // false ako je netko drugi (webhook ili stranica) već odradio posao.
      zaprimljeno: boolean;
      rezervacijaId: string;
    }
  | {
      ok: false;
      razlog: "placanje_nije_pronadjeno" | "krivi_tip";
    };

// Zaprimi rezervaciju: prijelaz UPIT -> CEKA_POTVRDU, zapiši paymentIntentId,
// pošalji mail gostu ("zaprimljeno") i domaćinu ("čeka potvrdu").
export async function zaprimiAutoriziranuRezervaciju(args: {
  placanjeId: string;
  paymentIntentId: string | null;
}): Promise<ZaprimiRezultat> {
  const { placanjeId, paymentIntentId } = args;

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

  if (!placanje || !placanje.rezervacija) {
    return { ok: false, razlog: "placanje_nije_pronadjeno" };
  }

  // Helper pokriva isključivo web tok potvrde rezervacije.
  if (placanje.tip !== "POTVRDA_REZERVACIJE") {
    return { ok: false, razlog: "krivi_tip" };
  }

  const r = placanje.rezervacija;

  // ── Sloj 1: atomska brava ──
  // Prijelaz UPIT -> CEKA_POTVRDU. Točno jedan istovremeni poziv "osvoji"
  // redak (count === 1); drugi dobije count === 0.
  const { count } = await prisma.rezervacija.updateMany({
    where: { id: r.id, status: "UPIT" },
    data: { status: "CEKA_POTVRDU" },
  });

  // Plaćanje osvježi neovisno o ishodu utrke (idempotentno) — da
  // paymentIntentId i autoriziranoAt budu zapisani bez obzira tko prvi stigne.
  await prisma.placanje.update({
    where: { id: placanje.id },
    data: {
      paymentIntentId: paymentIntentId || placanje.paymentIntentId,
      autoriziranoAt: placanje.autoriziranoAt ?? new Date(),
      status: "ZAHTJEV_POSLAN",
    },
  });

  if (count === 0) {
    // Netko drugi je već zaprimio rezervaciju i poslao mailove.
    return { ok: true, zaprimljeno: false, rezervacijaId: r.id };
  }

  // ── Sloj 2: sekundarna obrana ──
  // Ako mail gostu već postoji u logu (npr. status ručno resetiran na UPIT
  // nakon već poslanih mailova), ne šaljemo ništa opet.
  const gostEmail = r.gost?.email || "";
  const jezik = odaberiJezikMaila(r.gost?.jezik);
  const t = dohvatiPrijevode(jezik).zaprimiRezervaciju;

  if (gostEmail) {
    // Trojezicni dedup: emailLog moze sadrzavati subject u bilo kojem od 3
    // jezika (npr. gost.jezik promijenjen izmedju resetova, ili null u
    // historijskoj rezi gdje je log u HR). Provjera kroz `in` pokriva sve.
    const dedupSubjects = [
      BUNDLE.hr.zaprimiRezervaciju.subject,
      BUNDLE.en.zaprimiRezervaciju.subject,
      BUNDLE.de.zaprimiRezervaciju.subject,
    ];

    const vecPoslan = await prisma.emailLog.findFirst({
      where: {
        rezervacijaId: r.id,
        to: gostEmail,
        subject: { in: dedupSubjects },
      },
    });

    if (vecPoslan) {
      return { ok: true, zaprimljeno: false, rezervacijaId: r.id };
    }
  }

  // ── Mail domaćinu: "Nova rezervacija čeka potvrdu" ──
  try {
    const adminEmails = await getAdminEmails();
    const baseUrl = await getAppUrl();

    if (adminEmails.length > 0) {
      await resend.emails.send({
        from: getMailFrom(),
        to: adminEmails,
        bcc: [BCC_EMAIL],
        subject: `Nova rezervacija čeka potvrdu - ${r.jedinica.objekt.naziv} / ${r.jedinica.naziv}`,
        html: mailWrapper({
          title: "Nova rezervacija čeka potvrdu",
          subtitle: "Gost je autorizirao karticu. Potrebna je odluka domaćina.",
          children: `
              <p><strong>Gost:</strong> ${r.gost?.ime || ""} ${r.gost?.prezime || ""}</p>
              <p><strong>Email:</strong> ${r.gost?.email || "-"}</p>
              <p><strong>Telefon:</strong> ${r.gost?.telefon || "-"}</p>

              <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
                <h3 style="margin:0 0 14px;">Detalji rezervacije</h3>
                <p><strong>Objekt:</strong> ${r.jedinica.objekt.naziv}</p>
                <p><strong>Smještajna jedinica:</strong> ${r.jedinica.naziv}</p>
                <p><strong>Dolazak:</strong> ${formatDate(r.datumOd)}</p>
                <p><strong>Odlazak:</strong> ${formatDate(r.datumDo)}</p>
                <p><strong>Broj noćenja:</strong> ${r.brojNocenja}</p>
                <p><strong>Broj osoba:</strong> ${r.brojOsoba}</p>
                <p><strong>Ukupno:</strong> ${money(r.iznosUkupno)}</p>
                <p><strong>Autorizirano:</strong> ${money(placanje.iznos)}</p>
              </div>

              <p>
                <a href="${baseUrl}/admin/rezervacije/${r.id}" style="display:inline-block; background:#c79a57; color:white; padding:12px 18px; text-decoration:none; font-weight:bold;">
                  Otvori rezervaciju u adminu
                </a>
              </p>
            `,
        }),
      });
    }
  } catch (mailError) {
    console.error("[zaprimiRezervaciju] Greška kod slanja admin maila:", mailError);
  }

  // ── Mail gostu: "Rezervacija je zaprimljena" ──
  try {
    if (gostEmail) {
      await resend.emails.send({
        from: getMailFrom(),
        to: gostEmail,
        bcc: [BCC_EMAIL],
        subject: t.subject,
        html: mailWrapper({
          title: t.title,
          subtitle: t.subtitle,
          children: `
              <p>${t.pozdrav(r.gost?.ime || "goste", r.gost?.prezime || "")}</p>

              <p>${t.uvodPara(money(placanje.iznos))}</p>

              <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
                <h3 style="margin:0 0 14px;">${t.detaljiNaslov}</h3>
                <p><strong>${t.labelObjekt}</strong> ${r.jedinica.objekt.naziv}</p>
                <p><strong>${t.labelJedinica}</strong> ${r.jedinica.naziv}</p>
                <p><strong>${t.labelDolazak}</strong> ${formatDateZaMail(r.datumOd, jezik)}</p>
                <p><strong>${t.labelOdlazak}</strong> ${formatDateZaMail(r.datumDo, jezik)}</p>
                <p><strong>${t.labelBrojNocenja}</strong> ${r.brojNocenja}</p>
                <p><strong>${t.labelBrojOsoba}</strong> ${r.brojOsoba}</p>
              </div>

              <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
                <strong>${t.vaznoNaslov}</strong><br/>
                ${t.vaznoText}
              </div>

              <p style="margin-top:22px;">
                ${t.racunNapomena}
              </p>

              <p style="margin-top:28px;">
                ${t.zavrsetak}
              </p>
            `,
        }),
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId: r.id,
          to: gostEmail,
          subject: t.subject,
          tip: "POTVRDA_REZERVACIJE",
          status: "POSLANO",
        },
      });
    }
  } catch (mailError: any) {
    console.error("[zaprimiRezervaciju] Greška kod slanja maila gostu:", mailError);

    await prisma.emailLog.create({
      data: {
        rezervacijaId: r.id,
        to: gostEmail || "bez-emaila",
        subject: t.subject,
        tip: "POTVRDA_REZERVACIJE",
        status: "GRESKA",
        greska: mailError?.message || "Greška kod slanja maila gostu.",
      },
    });
  }

  // ── Nadopuna rasporeda čišćenja (PR2) ──
  // Samo unutar grane `count === 1` — sloj 1 atomske brave garantira da
  // se ovo izvrši točno jednom čak i kad webhook+success page stignu
  // istovremeno. Helper sam unutar sebe ima `napomena LIKE` spam check
  // kao back-up za eventualne ručne reset/retry scenarije.
  // Fire-and-forget: helper sve hvata i ne baca dalje.
  await mozdaPosaljiNadopunu({ rezervacijaIds: [r.id] });

  return { ok: true, zaprimljeno: true, rezervacijaId: r.id };
}
