// Višejezični check-in SMS (HR/EN/DE), bira se po Gost.jezik. Isti mehanizam
// odabira jezika kao mailovi (odaberiJezikMaila → hr/en/de, fallback en).
//
// SVE ASCII (bez dijakritike, DE bez umlauta) zbog GSM-7 / duljine SMS-a.
// Šifra se ispisuje kao *{sifra}# jer se TAKO unosi na TTLock bravu.

import { odaberiJezikMaila, type MailJezik } from "@/lib/mailovi";
import { welcomeUrl } from "@/lib/vodic/mail";
import type { ObjektSlug } from "@/lib/objekti";

type SmsTekst = {
  uvod: (p: {
    ime: string;
    objekt: string;
    datumUlaska: string;
    datumIzlaska: string;
    sifra: string;
  }) => string;
  eCheckinUvod: string; // rečenica iznad linka (link ide u sljedeći red)
  welcomeUvod: string; // rečenica iznad welcome linka (link ide u sljedeći red)
  kontakt: (kontakt: string) => string;
};

const TEKSTOVI: Record<MailJezik, SmsTekst> = {
  hr: {
    uvod: ({ ime, objekt, datumUlaska, datumIzlaska, sifra }) =>
      `Pozdrav ${ime}! Hvala sto ste odabrali ${objekt}. ` +
      `Prijava ${datumUlaska} od 16h, odjava ${datumIzlaska} do 10h. ` +
      `Sifru za glavni ulaz i apartman unesite kao *${sifra}#.`,
    eCheckinUvod: "Molimo popunite prijavu prije dolaska na linku:",
    welcomeUvod: "Sve informacije o boravku (vodic):",
    kontakt: (kontakt) => `Kontakt u slucaju problema: ${kontakt}`,
  },
  en: {
    uvod: ({ ime, objekt, datumUlaska, datumIzlaska, sifra }) =>
      `Hello ${ime}! Thank you for choosing ${objekt}. ` +
      `Check-in ${datumUlaska} from 16h, check-out ${datumIzlaska} until 10h. ` +
      `Enter the code for the main entrance and apartment as *${sifra}#.`,
    eCheckinUvod:
      "Please complete your registration before arrival at this link:",
    welcomeUvod: "All info about your stay (guide):",
    kontakt: (kontakt) => `Contact in case of problems: ${kontakt}`,
  },
  de: {
    uvod: ({ ime, objekt, datumUlaska, datumIzlaska, sifra }) =>
      `Hallo ${ime}! Danke, dass Sie sich fuer ${objekt} entschieden haben. ` +
      `Check-in ${datumUlaska} ab 16 Uhr, Check-out ${datumIzlaska} bis 10 Uhr. ` +
      `Geben Sie den Code fuer Haupteingang und Apartment als *${sifra}# ein.`,
    eCheckinUvod:
      "Bitte fuellen Sie die Anmeldung vor der Ankunft unter diesem Link aus:",
    welcomeUvod: "Alle Infos zu Ihrem Aufenthalt (Anleitung):",
    kontakt: (kontakt) => `Kontakt bei Problemen: ${kontakt}`,
  },
};

/**
 * Sastavi check-in SMS na jeziku gosta. eCheckin red (rečenica + link) se
 * izostavlja u sva 3 jezika ako link nije zadan. Welcome red (rečenica +
 * personalizirani link na /welcome/{slug}?t={rezervacijaId}) se izostavlja ako
 * slug ili appUrl nedostaju.
 */
export function sastaviCheckinSms(params: {
  jezik: string | null | undefined;
  ime: string;
  objekt: string;
  datumUlaska: string; // DD.MM.
  datumIzlaska: string; // DD.MM.
  sifra: string;
  kontakt: string;
  eCheckinLink?: string | null;
  appUrl?: string | null; // baza za welcome link; prazno → welcome red se izostavlja
  slug?: ObjektSlug | null; // objekt za welcome link; prazno → welcome red se izostavlja
  rezervacijaId?: string | null; // → ?t= (personalizacija); opcionalno
}): string {
  const jezik = odaberiJezikMaila(params.jezik);
  const t = TEKSTOVI[jezik];
  const link = (params.eCheckinLink || "").trim();
  const appUrl = (params.appUrl || "").trim();

  const redovi: string[] = [
    t.uvod({
      ime: params.ime,
      objekt: params.objekt,
      datumUlaska: params.datumUlaska,
      datumIzlaska: params.datumIzlaska,
      sifra: params.sifra,
    }),
  ];

  if (link) {
    redovi.push(t.eCheckinUvod);
    redovi.push(link);
  }

  if (appUrl && params.slug) {
    redovi.push(t.welcomeUvod);
    redovi.push(welcomeUrl(appUrl, jezik, params.slug, params.rezervacijaId));
  }

  redovi.push(t.kontakt(params.kontakt));

  return redovi.join("\n");
}
