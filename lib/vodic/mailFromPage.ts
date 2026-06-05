// Welcome mail = DOSLOVNO renderirana welcome stranica, mehanički obrađena.
// Fetcha personalizirani URL /welcome/{slug}?t={rezervacijaId} (stranica sama
// renderira ime u eyebrowu, uvodni odlomak sa zahvalom, šifru, eCheckin i datume),
// pa: ugradi vanjski CSS + juice inline → cqw→px (680px) → apsolutni URL-ovi
// (src/href I url(...) u CSS-u, uključujući entitetom escapane navodnike) →
// strip script/link/Natrag. Ništa se ne injecta — mail je čista stranica.

import juice from "juice";
import type { ObjektSlug } from "@/lib/objekti";
import type { VodicJezik } from "./index";

const MAIL_WIDTH = 680; // px; 1cqw = MAIL_WIDTH/100

export type MailFromPageParams = {
  appUrl: string;
  slug: ObjektSlug;
  jezik: VodicJezik;
  t?: string | null; // rezervacijaId → ?t= (ime, šifra, datumi dolaze sa stranice)
  uvod?: string | null; // override uvodnog odlomka (admin editabilan uvod); prazno → stranica koristi svoj. Vrijedi samo uz t.
};

export async function welcomeMailFromPage(
  p: MailFromPageParams
): Promise<string> {
  const prefix = p.jezik === "hr" ? "" : `/${p.jezik}`;
  const tq = p.t ? `?t=${encodeURIComponent(p.t)}` : "";
  const uq = p.t && p.uvod ? `&uvod=${encodeURIComponent(p.uvod)}` : "";
  const pageUrl = `${p.appUrl}${prefix}/welcome/${p.slug}${tq}${uq}`;

  let html = await fetch(pageUrl, { cache: "no-store" }).then((r) => r.text());

  // 1) Ugradi vanjski CSS (svi <link rel=stylesheet>) kao <style>.
  const cssHrefs = [
    ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
  ].map((m) => m[1]);
  let css = "";
  for (const href of cssHrefs) {
    const url = href.startsWith("http") ? href : `${p.appUrl}${href}`;
    try {
      css += (await fetch(url, { cache: "no-store" }).then((r) => r.text())) + "\n";
    } catch {
      /* preskoči nedostupan css */
    }
  }
  html = html.replace("</head>", `<style>${css}</style></head>`);

  // 2) juice inline; zadrži <style> kao fallback za selektore koje juice ne
  //    može inline-ati (flex/grid/space-y/container).
  html = juice(html, { removeStyleTags: false, preserveImportant: true });

  // 3) cqw → px za fiksnu širinu, pa razriješi max(...px, ...px).
  html = html.replace(
    /([\d.]+)cqw/g,
    (_m, n) => `${((parseFloat(n) * MAIL_WIDTH) / 100).toFixed(2)}px`
  );
  html = html.replace(
    /max\(\s*([\d.]+)px\s*,\s*([\d.]+)px\s*\)/g,
    (_m, a, b) => `${Math.max(parseFloat(a), parseFloat(b)).toFixed(2)}px`
  );

  // 4) Apsolutni URL-ovi.
  //    a) src/href="/..." (literalni navodnici atributa)
  html = html.replace(
    /(src|href)="(\/[^"]*)"/g,
    (_m, attr, path) => `${attr}="${p.appUrl}${path}"`
  );
  //    b) url(...) u stilovima — navodnici mogu biti literalni ILI HTML-entiteti
  //       (&#x27; / &quot;) jer React escapa inline style atribute.
  html = html.replace(
    /url\(((?:&#x27;|&quot;|['"])?)(\/[^)'"&]*)/g,
    (_m, q, path) => `url(${q}${p.appUrl}${path}`
  );

  // 5) Strip: skripte, preostali stylesheet/preload linkovi, "Natrag" link.
  html = html.replace(/<script[\s\S]*?<\/script>/g, "");
  html = html.replace(/<link[^>]+rel="(stylesheet|preload)"[^>]*>/g, "");
  html = html.replace(/<a[^>]*>\s*←[^<]*<\/a>/g, "");

  return html;
}
