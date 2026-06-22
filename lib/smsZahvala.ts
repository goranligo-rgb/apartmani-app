// Višejezični SMS zahvale (HR/EN/DE, dan prije odlaska), analogno
// lib/smsCheckin.ts. Bira jezik kao mailovi (odaberiJezikMaila → hr/en/de,
// fallback en).
//
// SVE ASCII (bez dijakritike, DE bez umlauta) zbog GSM-7 / duljine SMS-a.
// SMS NE sadrži kod bona — samo link na /zahvala stranicu gdje se bon prikazuje.
// Link (zahvalaUrl) je čisti ASCII pa nema GSM-7 problema.

import { odaberiJezikMaila, type MailJezik } from "@/lib/mailovi";
import { zahvalaUrl } from "@/lib/vodic/mail";
import type { ObjektSlug } from "@/lib/objekti";

type SmsTekst = {
  uvod: (p: { ime: string; objekt: string }) => string;
  bonUvod: string; // rečenica iznad linka (link ide u sljedeći red)
};

const TEKSTOVI: Record<MailJezik, SmsTekst> = {
  hr: {
    uvod: ({ ime, objekt }) =>
      `Pozdrav ${ime}! Hvala na boravku u ${objekt}.`,
    bonUvod: "Pripremili smo Vam mali poklon-bon za sljedeci boravak:",
  },
  en: {
    uvod: ({ ime, objekt }) =>
      `Hello ${ime}! Thank you for your stay at ${objekt}.`,
    bonUvod: "We have prepared a small voucher for your next stay:",
  },
  de: {
    uvod: ({ ime, objekt }) =>
      `Hallo ${ime}! Danke fuer Ihren Aufenthalt im ${objekt}.`,
    bonUvod:
      "Wir haben einen kleinen Gutschein fuer Ihren naechsten Aufenthalt vorbereitet:",
  },
};

/**
 * Sastavi SMS zahvale na jeziku gosta. Link na /zahvala stranicu (rečenica +
 * personalizirani link /zahvala/{slug}?t={rezervacijaId}) se izostavlja ako
 * slug ili appUrl nedostaju. BEZ koda bona — bon je na stranici.
 */
export function sastaviZahvalaSms(params: {
  jezik: string | null | undefined;
  ime: string;
  objekt: string;
  appUrl?: string | null; // baza za link; prazno → link red se izostavlja
  slug?: ObjektSlug | null; // objekt za link; prazno → link red se izostavlja
  rezervacijaId?: string | null; // → ?t= (personalizacija); opcionalno
}): string {
  const jezik = odaberiJezikMaila(params.jezik);
  const t = TEKSTOVI[jezik];
  const appUrl = (params.appUrl || "").trim();

  const redovi: string[] = [
    t.uvod({ ime: params.ime, objekt: params.objekt }),
  ];

  if (appUrl && params.slug) {
    redovi.push(t.bonUvod);
    redovi.push(zahvalaUrl(appUrl, jezik, params.slug, params.rezervacijaId));
  }

  return redovi.join("\n");
}
