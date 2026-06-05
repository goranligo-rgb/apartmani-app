// Welcome mail = welcome web stranica (/welcome/{slug}) prevedena u mail-safe
// HTML, vizualno što bliže: tekstura na glavnoj tablici (apsolutni URL + krem
// fallback), dekoracije objekta kao inline <img>, isti fontovi/boje/razmaci,
// jedan stupac svugdje, otpad i restorani vertikalno.
//
// Jedina razlika od stranice je vrh: ispod hero uvoda dolazi pristup
// (šifra/eCheckin/WiFi), pa "Poštovani {ime}," + uvodni odlomak; zatim sve
// sekcije i outro identično stranici.
//
// Šifra se NE generira — prima se kao parametar (čita s rezervacije).

import type { ObjektSlug } from "@/lib/objekti";
import type {
  IkonaKljuc,
  Vodic,
  VodicJezik,
  VodicKartica,
  VodicSekcija,
} from "./index";

export function welcomeUrl(
  appUrl: string,
  jezik: VodicJezik,
  slug: ObjektSlug,
  t?: string | null
): string {
  const base = (appUrl || "").replace(/\/$/, "");
  const prefix = jezik === "hr" ? "" : `/${jezik}`;
  const url = `${base}${prefix}/welcome/${slug}`;
  return t ? `${url}?t=${encodeURIComponent(t)}` : url;
}

const GOLD = "#B9A286";
const GOLD_LINK = "#B9883F";
const SEC_TITLE = "#8B7B63";
const LINE = "#C9B697";
const MUTED = "#7a7a7a";
const FAINT = "#9a9a9a";
const TEXT = "#2e2923";
const CREAM = "#FCFBFA";
const OUTER = "#e8e6e2";
const FONT = "'Poppins',Arial,Helvetica,sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mailBold(text: string, boja: string): string {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((dio, i) =>
      i % 2 === 1
        ? `<strong style="color:${boja};font-weight:600;">${esc(dio)}</strong>`
        : esc(dio)
    )
    .join("");
}

function ikonaSvg(k: IkonaKljuc): string {
  const f = "#A4937B";
  const base = `width="18" height="18" viewBox="0 0 24 24"`;
  if (k === "telefon")
    return `<svg ${base} fill="${f}"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>`;
  if (k === "pin")
    return `<svg ${base} fill="${f}"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>`;
  if (k === "vilica")
    return `<svg ${base} fill="${f}"><path d="M8.1 13.3L9.5 12 3.7 6.2c-1.2 1.2-1.2 3.1 0 4.2l4.4 2.9zm5.4-1.4c1.1.5 2.7.2 3.9-1 1.4-1.4 1.7-3.4.6-4.5-1.1-1.1-3.1-.8-4.5.6-1.2 1.2-1.5 2.8-1 3.9L2.9 20.4l1.4 1.4 7.6-7.5 7.6 7.5 1.4-1.4-7.5-7.6 .1-.9z"/></svg>`;
  if (k === "pergola")
    return `<svg ${base} fill="none" stroke="${f}" stroke-width="2"><path d="M3 10l9-6 9 6"/><line x1="5" y1="10" x2="5" y2="20"/><line x1="19" y1="10" x2="19" y2="20"/><line x1="5" y1="14" x2="19" y2="14"/></svg>`;
  return `<svg ${base} fill="none" stroke="${f}" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="10" x2="12" y2="17"/><circle cx="12" cy="7" r="0.5" fill="${f}"/></svg>`;
}

// Naslov sekcije: ikona + naslov (#8B7B63, 22px) + tanka linija; razmak 32px.
function secHeader(ikona: IkonaKljuc, naslov: string): string {
  return `<div style="margin:32px 0 0;">
    <span style="display:inline-block;vertical-align:middle;">${ikonaSvg(
      ikona
    )}</span>
    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;font-weight:400;color:${SEC_TITLE};letter-spacing:0.4px;">${esc(
    naslov
  )}</span>
  </div>
  <div style="height:1px;line-height:1px;font-size:1px;background:${LINE};margin:8px 0 16px;">&nbsp;</div>`;
}

function linkA(href: string, tekst: string): string {
  return `<a href="${esc(href)}" style="color:${GOLD_LINK};text-decoration:none;">${esc(
    tekst
  )}</a>`;
}

function linkBanner(href: string, tekst: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${GOLD};color:#ffffff;text-decoration:none;font-size:11px;font-weight:500;letter-spacing:1.2px;text-transform:uppercase;padding:8px 18px;border-radius:4px;">${esc(
    tekst
  )}</a>`;
}

function dekorImg(url: string): string {
  return `<div style="text-align:center;margin:8px 0;"><img src="${esc(
    url
  )}" width="100" style="width:100px;max-width:30%;opacity:0.9;" alt="" /></div>`;
}

// Jedna "stavka" (plaže/gastro/krk/transport): naziv + badge + opis/redovi + linkovi.
function stavkaHtml(k: VodicKartica, boja: string): string {
  const badge = k.badge
    ? ` <span style="display:inline-block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#fff;background:${GOLD};border-radius:3px;padding:1px 6px;font-weight:500;vertical-align:middle;">${esc(
        k.badge
      )}</span>`
    : "";
  const ime = `<div style="color:${SEC_TITLE};font-weight:500;font-size:15px;">${esc(
    k.naziv
  )}${badge}</div>`;
  const opis = k.opis
    ? `<div style="color:#8d8d8d;font-size:13px;margin-top:3px;">${mailBold(
        k.opis,
        boja
      )}</div>`
    : "";
  const redovi = k.opisRedovi
    ? `<div style="margin-top:4px;line-height:1.6;">${k.opisRedovi
        .map(
          (r) =>
            `<div style="color:#8d8d8d;font-size:13px;margin-bottom:5px;">${mailBold(
              r,
              boja
            )}</div>`
        )
        .join("")}</div>`
    : "";
  const linkovi = (k.linkovi ?? (k.link ? [k.link] : []))
    .map((l) => linkA(l.url, l.tekst))
    .join(" &nbsp;·&nbsp; ");
  const linkHtml = linkovi
    ? `<div style="font-size:12px;margin-top:4px;">${linkovi}</div>`
    : "";
  return `<div style="margin-bottom:14px;">${ime}${opis}${redovi}${linkHtml}</div>`;
}

function sekcijaHtml(s: VodicSekcija, boja: string): string {
  if (s.tip === "kontakti") {
    const redovi = [
      `<tr><td style="padding:2px 0;color:#A4937B;font-size:14px;width:240px;">${esc(
        s.domacica.labela
      )} ${esc(
        s.domacica.ime
      )}</td><td style="padding:2px 0;font-size:14px;"><a href="tel:${s.domacica.telefon.replace(
        /\s/g,
        ""
      )}" style="color:${boja};font-weight:600;text-decoration:none;">${esc(
        s.domacica.telefon
      )}</a> <span style="color:#b0b0b0;font-size:12px;">· ${esc(
        s.domacica.kanali
      )}</span></td></tr>`,
      ...s.hitni.map(
        (h) =>
          `<tr><td style="padding:2px 0;color:#A4937B;font-size:14px;">${esc(
            h.naziv
          )}</td><td style="padding:2px 0;color:#5d5d5d;font-size:14px;">${esc(
            h.broj
          )}</td></tr>`
      ),
    ].join("");
    return `${secHeader(
      s.ikona,
      s.naslov
    )}<table role="presentation" cellpadding="0" cellspacing="0" style="margin-left:18px;">${redovi}</table>`;
  }

  if (s.tip === "pravila") {
    const p = s.stavke
      .map(
        (x) =>
          `<p style="margin:0 0 9px;font-size:13px;line-height:1.7;color:${MUTED};">${mailBold(
            x,
            boja
          )}</p>`
      )
      .join("");
    return `${secHeader(s.ikona, s.naslov)}<div style="margin-left:18px;">${p}</div>`;
  }

  if (s.tip === "pergola") {
    const p = s.odlomci
      .map(
        (x) =>
          `<p style="margin:0 0 9px;font-size:13px;line-height:1.7;color:${MUTED};">${mailBold(
            x,
            boja
          )}</p>`
      )
      .join("");
    const slika = `<div style="text-align:center;margin-top:12px;"><img src="${esc(
      s.slika
    )}" width="340" style="width:340px;max-width:100%;border-radius:8px;" alt="" /></div>`;
    return `${secHeader(s.ikona, s.naslov)}<div style="margin-left:18px;">${p}${slika}</div>`;
  }

  if (s.tip === "otpad") {
    // Vrste vertikalno, jedna ispod druge, s točkicom u boji (kao stranica).
    const vrste = s.vrste
      .map(
        (v) =>
          `<div style="font-size:14px;color:${MUTED};margin-bottom:7px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${v.boja};vertical-align:middle;margin-right:9px;">&nbsp;</span>${esc(
            v.naziv
          )}</div>`
      )
      .join("");
    return `${secHeader(s.ikona, s.naslov)}
      <div style="margin-left:18px;">
        <p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:${MUTED};">${esc(
          s.uvod
        )}</p>
        ${vrste}
        <p style="margin:12px 0 6px;font-size:13px;line-height:1.7;color:${MUTED};">${esc(
          s.napomena
        )}</p>
        <div style="font-size:12px;">${linkA(s.link.url, s.link.tekst)}</div>
      </div>`;
  }

  // tip === "kartice"
  // Gastronomija (5): Restorani (+ banner ispod) → Naša preporuka.
  if (s.broj === 5) {
    const [prva, ...ostatak] = s.kartice;
    const bannerHtml = s.link
      ? `<div style="margin:4px 0 16px;">${linkBanner(
          s.link.url,
          s.link.tekst
        )}</div>`
      : "";
    return `${secHeader(s.ikona, s.naslov)}<div style="margin-left:18px;">${
      prva ? stavkaHtml(prva, boja) : ""
    }${bannerHtml}${ostatak.map((k) => stavkaHtml(k, boja)).join("")}</div>`;
  }

  // Sve ostalo (plaže, što posjetiti, transport) — JEDAN stupac + opcionalni banner.
  const kartice = s.kartice.map((k) => stavkaHtml(k, boja)).join("");
  const bannerHtml = s.link
    ? `<div style="margin-top:6px;">${linkBanner(s.link.url, s.link.tekst)}</div>`
    : "";
  return `${secHeader(s.ikona, s.naslov)}<div style="margin-left:18px;">${kartice}${bannerHtml}</div>`;
}

export type WelcomeMailParams = {
  vodic: Vodic;
  boja: string;
  logoUrl: string;
  teksturaUrl: string;
  dekorUrls: string[];
  pozdrav: string;
  uvodPara: string;
  sifra?: string | null;
  sifraUvod: string;
  sifraNapomena: string;
  eCheckinLink?: string | null;
  eCheckinUvod: string;
};

export function renderWelcomeMailHtml(p: WelcomeMailParams): string {
  const v = p.vodic;
  const boja = p.boja;
  const n = p.dekorUrls.length;

  const imaSifra = Boolean(p.sifra && p.sifra.trim());
  const imaECheckin = Boolean(p.eCheckinLink && p.eCheckinLink.trim());

  // Pristup — diskretno centrirano u herou, bez okvira (isti format kao WiFi).
  const sifraLinije = imaSifra
    ? `<div style="font-size:15px;color:${MUTED};">${esc(
        p.sifraUvod
      )}: <strong style="color:${boja};font-weight:600;">*${esc(
        p.sifra as string
      )}#</strong></div>
       <div style="font-size:11px;color:${FAINT};margin-top:2px;">${esc(
         p.sifraNapomena
       )}</div>`
    : "";

  const eCheckinLinija = imaECheckin
    ? `<div style="font-size:15px;color:${MUTED};margin-top:14px;">${esc(
        p.eCheckinUvod
      )} <strong style="font-weight:600;"><a href="${esc(
        p.eCheckinLink as string
      )}" style="color:${boja};text-decoration:none;">${esc(
        (p.eCheckinLink as string).replace(/^https?:\/\//, "")
      )}</a></strong></div>`
    : "";

  const wifiLinije = `<div style="font-size:15px;color:${MUTED};margin-top:14px;">WI-FI ${esc(
    v.wifi.mrezaLabela
  )}: <strong style="color:${boja};font-weight:600;">${esc(
    v.wifi.mreza
  )}</strong></div>
  <div style="font-size:15px;color:${MUTED};">${esc(
    v.wifi.lozinkaLabela
  )}: <strong style="color:${boja};font-weight:600;">${esc(
    v.wifi.lozinka
  )}</strong></div>`;

  // Sekcije + dekoracija između kućnog reda (broj 2) i plaža (broj 4).
  const sekcije = v.sekcije
    .map((s) => {
      let html = sekcijaHtml(s, boja);
      if (s.broj === 2 && n) html += dekorImg(p.dekorUrls[1 % n]);
      return html;
    })
    .join("");

  const dekorVrh = n ? dekorImg(p.dekorUrls[0]) : "";
  const dekorOutro = n ? dekorImg(p.dekorUrls[2 % n]) : "";

  return `<!DOCTYPE html>
<html lang="${v.jezik}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${OUTER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${OUTER};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background-color:${CREAM};background-image:url('${esc(
    p.teksturaUrl
  )}');background-repeat:repeat-y;background-position:top center;background-size:100% auto;font-family:${FONT};color:#6b6b6b;font-weight:300;">
        <tr><td style="padding:30px 44px 36px;font-size:14px;line-height:1.7;">

          ${dekorVrh}

          <!-- HERO + PRISTUP -->
          <div style="text-align:center;">
            <img src="${esc(p.logoUrl)}" width="200" style="width:200px;max-width:60%;" alt="${esc(
    v.punNaziv
  )}" />
            <div style="margin-top:14px;font-size:18px;letter-spacing:4px;text-transform:uppercase;color:${GOLD};font-weight:300;">${esc(
    v.hero.eyebrow
  )}</div>
            <div style="margin-top:6px;font-size:40px;font-weight:600;letter-spacing:1.5px;color:${boja};">${esc(
    v.hero.naslov
  )}</div>
            <p style="margin:16px auto 22px;max-width:480px;font-size:14px;line-height:1.7;color:${MUTED};">${esc(
    v.hero.uvod
  )}</p>
            ${sifraLinije}
            ${eCheckinLinija}
            ${wifiLinije}
          </div>

          <!-- POZDRAV -->
          <div style="padding:28px 0 4px;">
            <div style="color:${TEXT};font-size:15px;margin-bottom:8px;">${esc(
    p.pozdrav
  )}</div>
            <div style="color:${MUTED};font-size:14px;line-height:1.7;">${esc(
    p.uvodPara
  )}</div>
          </div>

          <!-- SEKCIJE VODIČA -->
          ${sekcije}

          ${dekorOutro}

          <!-- OUTRO -->
          <div style="text-align:center;padding:18px 0 6px;">
            <img src="${esc(p.logoUrl)}" width="150" style="width:150px;max-width:45%;" alt="" />
            <div style="margin-top:14px;font-size:22px;color:${GOLD};font-weight:300;">${esc(
    v.outro.gornji
  )}</div>
            <div style="margin-top:2px;font-size:34px;font-weight:600;color:${boja};">${esc(
    v.outro.naslov
  )}</div>
            <div style="margin-top:18px;font-size:13px;color:${FAINT};">${esc(
    v.outro.potpis
  )}</div>
          </div>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
