// Jednostavni welcome mail — isti provjereni "mailWrapper" pattern kao
// lib/potvrdaNaplate.ts / lib/zaprimiRezervaciju.ts (table-free, inline stilovi,
// renderira se pouzdano u Gmailu). Zamjena za mailFromPage pristup (fetch + juice
// + cqw) koji se lomio u Gmailu. Bez WiFi-ja; šifra/eCheckin red se izostavljaju
// ako nedostaju; OBJEKT_BOJA diskretno na gumbu i bold šifri.

import {
  dohvatiPrijevode,
  formatDateZaMail,
  type MailJezik,
} from "@/lib/mailovi";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

export type WelcomeMailParams = {
  jezik: MailJezik;
  ime: string;
  nazivObjekta: string;
  sifra?: string | null; // *{sifra}# — red se izostavlja ako nema
  eCheckinLink?: string | null; // red se izostavlja ako nema
  datumOd: Date;
  datumDo: Date;
  vodicUrl: string; // welcomeUrl(appUrl, jezik, slug, t)
  boja: string; // OBJEKT_BOJA — gumb + bold šifra
  uvodOverride?: string | null; // editabilan uvod iz admina; zamjenjuje "najava"
};

// Vrati gotov HTML welcome maila. Subject pozivatelj sklapa zasebno
// (dohvatiPrijevode(jezik).dobrodoslica.subject(naziv)).
export function renderWelcomeMail(p: WelcomeMailParams): string {
  const t = dohvatiPrijevode(p.jezik).dobrodoslica;
  const boja = p.boja;

  const najava = (p.uvodOverride && p.uvodOverride.trim()) || t.najava;
  const datumOd = formatDateZaMail(p.datumOd, p.jezik);
  const datumDo = formatDateZaMail(p.datumDo, p.jezik);

  const sifraRed = p.sifra
    ? `
        <p style="margin:0 0 4px;">
          <strong>${esc(t.sifraUvod)}:</strong>
          <span style="color:${boja}; font-weight:bold;">*${esc(p.sifra)}#</span>
        </p>
        <p style="margin:0 0 14px; font-size:13px; color:#7a7a7a;">${esc(
          t.sifraNapomena
        )}</p>`
    : "";

  // Svaki label+datum je nowrap (ne lomi se "Dolazak: 19.05."), ali se cijela
  // grupa može prelomiti na separatoru → bez horizontalnog scrolla na ~360px.
  const datumiRed = `
        <p style="margin:0;">
          <span style="white-space:nowrap;"><strong>${esc(
            t.labelDolazak
          )}:</strong> ${datumOd}</span>
          ·
          <span style="white-space:nowrap;"><strong>${esc(
            t.labelOdjava
          )}:</strong> ${datumDo}</span>
        </p>`;

  const eCheckinRed = p.eCheckinLink
    ? `
      <p style="margin:18px 0 0; word-break:break-word;">
        ${esc(t.eCheckinUvod)}<br/>
        <a href="${esc(p.eCheckinLink)}" style="color:${boja}; word-break:break-word;">${esc(
        p.eCheckinLink
      )}</a>
      </p>`
    : "";

  const children = `
      <p>${esc(t.pozdrav(p.ime))}</p>

      <p>${esc(najava)}</p>

      <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
        ${sifraRed}
        ${datumiRed}
      </div>

      ${eCheckinRed}

      <p style="margin:24px 0 14px;">${esc(t.webUvod)}</p>

      <p style="margin:0 0 8px;">
        <a href="${esc(p.vodicUrl)}" style="display:inline-block; background:${boja}; color:white; padding:12px 18px; text-decoration:none; font-weight:bold;">
          ${esc(t.webGumb(p.nazivObjekta))}
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
