import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

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

async function getAdminEmails() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { updatedAt: "desc" },
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

  if (gostEmail) {
    const vecPoslan = await prisma.emailLog.findFirst({
      where: {
        rezervacijaId: r.id,
        to: gostEmail,
        subject: { contains: "Rezervacija je zaprimljena" },
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
        subject: "Rezervacija je zaprimljena - Malinska Stay",
        html: mailWrapper({
          title: "Rezervacija je zaprimljena",
          subtitle: "Hvala vam na rezervaciji. Vaš zahtjev je uspješno zaprimljen.",
          children: `
              <p>Poštovani <strong>${r.gost?.ime || "goste"} ${r.gost?.prezime || ""}</strong>,</p>

              <p>
                Vaša kartica je uspješno autorizirana za iznos
                <strong>${money(placanje.iznos)}</strong>.
                Novac još nije naplaćen, nego su sredstva samo rezervirana do konačne potvrde rezervacije.
              </p>

              <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
                <h3 style="margin:0 0 14px;">Detalji rezervacije</h3>
                <p><strong>Objekt:</strong> ${r.jedinica.objekt.naziv}</p>
                <p><strong>Smještajna jedinica:</strong> ${r.jedinica.naziv}</p>
                <p><strong>Dolazak:</strong> ${formatDate(r.datumOd)}</p>
                <p><strong>Odlazak:</strong> ${formatDate(r.datumDo)}</p>
                <p><strong>Broj noćenja:</strong> ${r.brojNocenja}</p>
                <p><strong>Broj osoba:</strong> ${r.brojOsoba}</p>
              </div>

              <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
                <strong>Važno:</strong><br/>
                Rezervacija još čeka konačnu potvrdu domaćina. Nakon obrade poslat ćemo vam konačnu potvrdu rezervacije.
              </div>

              <p style="margin-top:22px;">
                Račun se šalje tek nakon stvarne naplate.
              </p>

              <p style="margin-top:28px;">
                Lijep pozdrav,<br/>
                <strong>Malinska Stay</strong>
              </p>
            `,
        }),
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId: r.id,
          to: gostEmail,
          subject: "Rezervacija je zaprimljena - Malinska Stay",
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
        subject: "Rezervacija je zaprimljena - Malinska Stay",
        tip: "POTVRDA_REZERVACIJE",
        status: "GRESKA",
        greska: mailError?.message || "Greška kod slanja maila gostu.",
      },
    });
  }

  return { ok: true, zaprimljeno: true, rezervacijaId: r.id };
}
