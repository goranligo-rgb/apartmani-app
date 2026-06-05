import type { Locale } from "@/i18n/routing";
import type { MailJezik } from "./jezici";
import { odaberiJezikMaila } from "./jezici";
import { hr } from "./tekstovi/hr";
import { en } from "./tekstovi/en";
import { de } from "./tekstovi/de";

// Eksplicitan interface — NE typeof hr. Razlog: ako se hr promijeni
// (npr. zaboravi se polje), TypeScript ne smije šutke "izvesti" novi
// oblik kao istinu; svaki jezik mora odgovarati istom kontraktu.
// Tip svake vrijednosti je `string` ili `(args) => string` — funkcije
// dopuštaju da prijevodi imaju drukčiji redoslijed riječi (npr. njem.
// glagol na kraju) iako se varijable umeću na istim mjestima.
export interface MailTekstovi {
  // 1. Gost autorizirao karticu — rezervacija čeka odluku domaćina.
  zaprimiRezervaciju: {
    subject: string;
    title: string;
    subtitle: string;
    pozdrav: (ime: string, prezime: string) => string;
    uvodPara: (iznos: string) => string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelBrojNocenja: string;
    labelBrojOsoba: string;
    vaznoNaslov: string;
    vaznoText: string;
    racunNapomena: string;
    zavrsetak: string;
  };

  // 2. Admin klikne "Potvrdi plaćanje" → mail s atačovanim PDF računom.
  //    Dvije varijante: rezervacija je u potpunosti plaćena vs ostaje ostatak.
  potvrdaNaplate: {
    subject: (placeno: boolean) => string;
    title: (placeno: boolean) => string;
    subtitle: (placeno: boolean) => string;
    pozdrav: (ime: string) => string;
    uvodPara: (placeno: boolean) => string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelUplaceno: string;
    labelPreostalo: string;
    potvrdjenoNaslov: string;
    potvrdjenoText: (placeno: boolean) => string;
    veselimoSe: string;
    zavrsetak: string;
  };

  // 3. Gost dođe na success stranicu nakon kartičnog plaćanja → mail
  //    s linkom na PDF račun (ne attachmentom). Dvije varijante kao gore.
  uspjehPlacanje: {
    subject: (placeno: boolean) => string;
    title: (placeno: boolean) => string;
    subtitle: (placeno: boolean) => string;
    pozdrav: (ime: string, prezime: string) => string;
    uvodPara: (placeno: boolean) => string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelBrojNocenja: string;
    labelBrojOsoba: string;
    labelZaprimljenaUplata: string;
    labelPreostalo: string;
    potvrdjenoNaslov: string;
    potvrdjenoText: (placeno: boolean) => string;
    racunOtvoriText: string;
    racunOtvoriLink: string;
    zavrsetak: string;
  };

  // 4. Admin ručno ponovno šalje već generirani račun (gumb u adminu).
  racunPonovnoPoslan: {
    subject: (brojRacuna: string) => string;
    pozdrav: string;
    privitak: string;
    zavrsetak: string;
  };

  // 5. Cron, X dana prije dolaska — podsjetnik za uplatu ostatka.
  podsjetnikOstatak: {
    subject: string;
    title: string;
    subtitle: string;
    pozdrav: (ime: string) => string;
    uvodPara: string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelPreostalo: string;
    button: string;
    vecZanemarite: string;
    veselimoSe: string;
    zavrsetak: string;
  };

  // 6. Admin "Nova rezervacija" + POZIV_KARTICA → mail s payment linkom.
  //    Dvije varijante: cijeli iznos (blizu dolaska) vs samo akontacija.
  pozivZaPlacanje: {
    subject: (cijeli: boolean) => string;
    title: (cijeli: boolean) => string;
    subtitle: (cijeli: boolean) => string;
    pozdrav: (imePrezime: string) => string;
    infoText: (cijeli: boolean, danaDoDolaska: number) => string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelUkupanIznos: string;
    labelIznosZaUplatu: string;
    labelOstatak: string;
    labelRokPlacanja: string;
    automatskaPotvrda: string;
    button: (cijeli: boolean) => string;
    akoGumbNeRadi: string;
    zavrsetak: string;
  };

  // 7. Admin "Nova rezervacija" + BANKA_CEKA → mail dok čekamo uplatu
  //    preko banke (nema payment linka, samo informativno).
  rezervacijaZaprimljenaBanka: {
    subject: string;
    title: string;
    subtitle: string;
    pozdrav: (imePrezime: string) => string;
    infoText: string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelUkupanIznos: string;
    labelIznosZaUplatu: string;
    labelOstatak: string;
    labelRokPlacanja: string;
    automatskaPotvrda: string;
    button: string;
    // Mail 7 u produkciji renderira "Ako gumb ne radi, kopirajte ovaj link..."
    // s paymentLink = "#" — čudno produkcijsko ponašanje koje očuvamo
    // identičnim. Cleanup mrtvog linka je out-of-scope za PR3.
    akoGumbNeRadi: string;
    zavrsetak: string;
  };

  // 8. Admin odbija web rezervaciju → "Rezervacija nije potvrđena".
  rezervacijaOdbijena: {
    subject: string;
    title: string;
    subtitle: string;
    pozdrav: (ime: string, prezime: string) => string;
    uvodPara: string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    autorizacijaPonistena: string;
    ispricavamoSe: string;
    zavrsetak: string;
  };

  // 9. Admin kreira zahtjev za uplatu na postojećoj rezervaciji
  //    (AKONTACIJA / RAZLIKA / OSTATAK — različit subject).
  zahtjevZaUplatu: {
    subject: (tip: "AKONTACIJA" | "RAZLIKA" | "OSTATAK") => string;
    subtitle: string;
    pozdrav: (ime: string, prezime: string) => string;
    uvodPara: string;
    detaljiNaslov: string;
    labelObjekt: string;
    labelJedinica: string;
    labelDolazak: string;
    labelOdlazak: string;
    labelIznosZaUplatu: string;
    labelRokUplate: string;
    napomena: string;
    // Gumb za kartično plaćanje (create-payment link) — tekst ovisi o tipu.
    button: (tip: "AKONTACIJA" | "RAZLIKA" | "OSTATAK") => string;
    akoGumbNeRadi: string;
    zavrsetak: string;
  };

  // 10. TTLock — admin pošalje gostu ulaznu šifru (kod za bravu).
  ttlockSifra: {
    subject: (nazivObjekta: string) => string;
    // naslov u tijelu maila — dinamički ovisno o tipu jedinice. Za KUCA
    // (House Art) ne ponavljamo naziv jedinice jer je isti kao objekt;
    // za APARTMAN/STAN dodajemo i naziv jedinice (npr. "Eva 1").
    naslov: (nazivObjekta: string, jedinicaNaziv?: string) => string;
    pozdrav: (ime: string) => string;
    sifraJe: string;
    sifraVrijedi: (vrijediOd: string, vrijediDo: string) => string;
    vrijediZa: string;
    zavrsetak: string;
  };

  // 11. Welcome mail prije dolaska — pozdrav + cijeli vodič dobrodošlice.
  dobrodoslica: {
    subject: (nazivObjekta: string) => string;
    pozdrav: (ime: string) => string;
    uvodPara: string; // uvodni odlomak (editabilan u adminu)
    sifraUvod: string; // naslov retka sa šifrom
    sifraNapomena: string; // objašnjenje formata *1234#
    eCheckinUvod: string; // rečenica iznad eCheckin linka
    webUvod: string; // tekst iznad gumba na web vodič
    webGumb: string; // tekst gumba na web vodič
  };
}

// BUNDLE: svi jezici. Tipiziran kao Record<MailJezik, MailTekstovi> pa
// TS mora po jednome polju verificirati da svaki jezik popunjava cijeli
// interface — nedostajuće polje u en.ts / de.ts neće zatvoriti build.
export const BUNDLE: Record<MailJezik, MailTekstovi> = { hr, en, de };

export function dohvatiPrijevode(
  jezik: Locale | string | null | undefined
): MailTekstovi {
  return BUNDLE[odaberiJezikMaila(jezik)];
}

export type { MailJezik } from "./jezici";
export {
  odaberiJezikMaila,
  formatDateZaMail,
  formatDateTimeZaMail,
  money,
} from "./jezici";
