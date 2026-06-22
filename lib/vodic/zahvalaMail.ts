// Mail zahvale (dan prije odlaska) — isti "mailWrapper" pattern kao
// lib/vodic/welcomeMail.ts (table-free, inline stilovi, Gmail-safe). Mail NE
// sadrži kod bona — samo gumb na personaliziranu /zahvala stranicu gdje se bon
// prikazuje (i izdaje). Tekstovi su LOKALNI (HR/EN/DE), kao zahvala stranica.

import type { MailJezik } from "@/lib/mailovi";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Kopirano iz welcomeMail.ts — isti provjereni wrapper (tamno zaglavlje +
// krem tijelo), da se zahvala mail vizualno poklapa s welcome mailom.
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
          <h2 style="margin:0;">${esc(title)}</h2>
          <p style="margin:8px 0 0; color:#eadfce;">${esc(subtitle)}</p>
        </div>
        <div style="padding:24px; color:#2e2923; line-height:1.55;">
          ${children}
        </div>
      </div>
    </div>
  `;
}

type ZahvalaTekst = {
  subject: (nazivObjekta: string) => string;
  mailNaslov: string; // naslov u tamnom zaglavlju
  pozdrav: (ime: string) => string;
  zahvala: (nazivObjekta: string) => string; // "Hvala što ste boravili u {naziv}..."
  bonUvod: string; // rečenica iznad gumba
  gumb: string; // tekst gumba na /zahvala stranicu
  potpisPozdrav: string;
  potpisIme: string;
};

const TEKST: Record<MailJezik, ZahvalaTekst> = {
  hr: {
    subject: (n) => `Hvala na boravku — ${n}`,
    mailNaslov: "Hvala Vam!",
    pozdrav: (ime) => `Poštovani ${ime},`,
    zahvala: (n) =>
      `hvala što ste boravili u ${n}. Bilo nam je zadovoljstvo ugostiti Vas.`,
    bonUvod:
      "Kao znak zahvale pripremili smo Vam mali poklon-bon za sljedeći boravak:",
    gumb: "Pogledajte svoj poklon-bon",
    potpisPozdrav: "Srdačan pozdrav,",
    potpisIme: "Vaš domaćin",
  },
  en: {
    subject: (n) => `Thank you for your stay — ${n}`,
    mailNaslov: "Thank you!",
    pozdrav: (ime) => `Dear ${ime},`,
    zahvala: (n) =>
      `Thank you for staying at ${n}. It was our pleasure to host you.`,
    bonUvod:
      "As a token of our gratitude, we have prepared a small voucher for your next stay:",
    gumb: "View your voucher",
    potpisPozdrav: "Warm regards,",
    potpisIme: "Your host",
  },
  de: {
    subject: (n) => `Vielen Dank für Ihren Aufenthalt — ${n}`,
    mailNaslov: "Vielen Dank!",
    pozdrav: (ime) => `Sehr geehrte/r ${ime},`,
    zahvala: (n) =>
      `vielen Dank für Ihren Aufenthalt im ${n}. Es war uns eine Freude, Sie zu beherbergen.`,
    bonUvod:
      "Als Dankeschön haben wir einen kleinen Gutschein für Ihren nächsten Aufenthalt vorbereitet:",
    gumb: "Ihren Gutschein ansehen",
    potpisPozdrav: "Herzliche Grüße,",
    potpisIme: "Ihr Gastgeber",
  },
};

// Subject sklapa pozivatelj (cron) — isti pattern kao welcome
// (dohvatiPrijevode(jezik).dobrodoslica.subject), ovdje iz lokalnog TEKST-a.
export function zahvalaSubject(jezik: MailJezik, nazivObjekta: string): string {
  return TEKST[jezik].subject(nazivObjekta);
}

export type ZahvalaMailParams = {
  jezik: MailJezik;
  ime: string;
  nazivObjekta: string;
  zahvalaUrl: string; // zahvalaUrl(appUrl, jezik, slug, t) — link na /zahvala stranicu
  boja: string; // OBJEKT_BOJA — gumb
};

// Vrati gotov HTML maila zahvale. BEZ koda bona — gost ga vidi na stranici.
export function renderZahvalaMail(p: ZahvalaMailParams): string {
  const t = TEKST[p.jezik];
  const boja = p.boja;

  const children = `
      <p>${esc(t.pozdrav(p.ime))}</p>

      <p>${esc(t.zahvala(p.nazivObjekta))}</p>

      <p style="margin:24px 0 14px;">${esc(t.bonUvod)}</p>

      <p style="margin:0 0 8px;">
        <a href="${esc(p.zahvalaUrl)}" style="display:inline-block; background:${boja}; color:white; padding:12px 18px; text-decoration:none; font-weight:bold;">
          ${esc(t.gumb)}
        </a>
      </p>

      <p style="margin-top:28px;">
        ${esc(t.potpisPozdrav)}<br/>
        ${esc(t.potpisIme)}
      </p>
  `;

  return mailWrapper({
    title: t.mailNaslov,
    subtitle: p.nazivObjekta,
    children,
  });
}
