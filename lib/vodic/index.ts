// Vodič dobrodošlice po objektu — JEDAN izvor sadržaja za (a) welcome mail HTML
// i (b) welcome web stranicu. Sadržaj je strukturirani podaci (sekcije), pa ga
// renderiraju dva renderera (mail string + React) iz iste `Vodic` strukture.
//
// Jezik: HR/EN/DE, biran iz Gost.jezik / locale-a istim mehanizmom kao mailovi
// (vodicJezik → hr/en/de, sve ostalo fallback "en").
//
// Sadržaj se sastoji od:
//  - ZAJEDNICKO: dijelovi isti za sve objekte (kontakti, plaže, gastro, Krk,
//    transport, otpad, naslovi sekcija) — lib/vodic/zajednicko.ts
//  - SADRZAJ[slug]: objekt-specifično (hero uvod, WiFi, kućni red, najbliže
//    plaže) — lib/vodic/sadrzaj/*.ts
// `dohvatiVodic(slug, locale)` spaja oba u potpuno razriješen `Vodic` na ciljnom
// jeziku, pa renderer ne mora znati ništa o dijeljenju sadržaja.

import { type ObjektSlug, OBJEKTI_PODACI } from "@/lib/objekti";
import { ZAJEDNICKO, type ZajednickiSadrzaj } from "./zajednicko";
import { eva } from "./sadrzaj/eva";
import { marty } from "./sadrzaj/marty";
import { houseArt } from "./sadrzaj/house-art";

export type VodicJezik = "hr" | "en" | "de";

export type VodicLink = { tekst: string; url: string };

export type VodicKartica = {
  naziv: string;
  opis?: string;
  link?: VodicLink;
  badge?: string; // npr. "NAJBLIŽE VAMA"; prazno = bez badge-a
};

export type VodicHitni = { naziv: string; broj: string };

export type VodicOtpadVrsta = { naziv: string; boja: string }; // boja = hex za točkicu

// Sekcije su discriminated union po `tip` — renderer (PR2/PR4) granat će po tipu.
export type VodicSekcija =
  | {
      tip: "kontakti";
      broj: number;
      naslov: string;
      eyebrow: string;
      domacica: { labela: string; ime: string; telefon: string; kanali: string };
      hitni: VodicHitni[];
    }
  | {
      tip: "pravila";
      broj: number;
      naslov: string;
      eyebrow: string;
      stavke: string[];
    }
  | {
      tip: "kartice";
      broj: number;
      naslov: string;
      eyebrow: string;
      kartice: VodicKartica[];
      link?: VodicLink; // npr. "visitmalinska.com → sve plaže s kartom"
    }
  | {
      tip: "otpad";
      broj: number;
      naslov: string;
      eyebrow: string;
      uvod: string;
      vrste: VodicOtpadVrsta[];
      napomena: string;
      link: VodicLink;
    };

export type Vodic = {
  slug: ObjektSlug;
  punNaziv: string;
  jezik: VodicJezik;
  hero: { eyebrow: string; naslov: string; uvod: string };
  wifi: {
    naslov: string;
    mrezaLabela: string;
    lozinkaLabela: string;
    mreza: string;
    lozinka: string;
  };
  sekcije: VodicSekcija[];
  outro: { gornji: string; naslov: string; potpis: string };
};

// Per-jezik objekt-specifični tekst.
export type ObjektTekst = {
  heroUvod: string;
  kucniRed: string[];
};

// Cijeli objekt-specifičan zapis (jezično-neovisni dijelovi + tekst po jeziku).
export type ObjektSadrzaj = {
  wifi: { mreza: string; lozinka: string };
  najblizePlaze: string[]; // ključevi plaža (zajednicko.plaze[].kljuc) koji dobiju badge
  tekst: Record<VodicJezik, ObjektTekst>;
};

const SADRZAJ: Record<ObjektSlug, ObjektSadrzaj> = {
  eva,
  marty,
  "house-art": houseArt,
};

// Locale (8 mogućih) → jezik vodiča (hr/en/de). Sve izvan hr/de → "en",
// identično mailovima (odaberiJezikMaila).
export function vodicJezik(jezik: string | null | undefined): VodicJezik {
  if (jezik === "hr") return "hr";
  if (jezik === "de") return "de";
  return "en";
}

// Spoji zajednički + objekt-specifičan sadržaj u potpuno razriješen Vodic.
export function dohvatiVodic(
  slug: ObjektSlug,
  jezikInput: string | null | undefined
): Vodic {
  const jezik = vodicJezik(jezikInput);
  const z: ZajednickiSadrzaj = ZAJEDNICKO[jezik];
  const o = SADRZAJ[slug];
  const ot = o.tekst[jezik];
  const podaci = OBJEKTI_PODACI[slug];

  const plazeKartice: VodicKartica[] = z.plaze.map((p) => ({
    naziv: p.naziv,
    opis: p.opis,
    badge: o.najblizePlaze.includes(p.kljuc) ? z.badgeNajblize : undefined,
  }));

  const sekcije: VodicSekcija[] = [
    {
      tip: "kontakti",
      broj: 1,
      naslov: z.kontaktiNaslov,
      eyebrow: z.kontaktiEyebrow,
      domacica: {
        labela: z.domacicaLabela,
        ime: z.domacicaIme,
        telefon: z.domacicaTelefon,
        kanali: z.domacicaKanali,
      },
      hitni: z.hitni,
    },
    {
      tip: "pravila",
      broj: 2,
      naslov: z.kucniRedNaslov,
      eyebrow: z.kucniRedEyebrow,
      stavke: ot.kucniRed,
    },
    {
      tip: "kartice",
      broj: 3,
      naslov: z.plazeNaslov,
      eyebrow: z.plazeEyebrow,
      kartice: plazeKartice,
      link: z.plazeLink,
    },
    {
      tip: "kartice",
      broj: 4,
      naslov: z.gastroNaslov,
      eyebrow: z.gastroEyebrow,
      kartice: z.gastroKartice,
    },
    {
      tip: "kartice",
      broj: 5,
      naslov: z.krkNaslov,
      eyebrow: z.krkEyebrow,
      kartice: z.krkKartice,
    },
    {
      tip: "kartice",
      broj: 6,
      naslov: z.transportNaslov,
      eyebrow: z.transportEyebrow,
      kartice: z.transportKartice,
    },
    {
      tip: "otpad",
      broj: 7,
      naslov: z.komunalnoNaslov,
      eyebrow: z.komunalnoEyebrow,
      uvod: z.otpadUvod,
      vrste: z.otpadVrste,
      napomena: z.otpadNapomena,
      link: z.otpadLink,
    },
  ];

  return {
    slug,
    punNaziv: podaci.punNaziv,
    jezik,
    hero: {
      eyebrow: z.heroEyebrow,
      naslov: z.heroNaslov,
      uvod: ot.heroUvod,
    },
    wifi: {
      naslov: z.wifiNaslov,
      mrezaLabela: z.wifiMrezaLabela,
      lozinkaLabela: z.wifiLozinkaLabela,
      mreza: o.wifi.mreza,
      lozinka: o.wifi.lozinka,
    },
    sekcije,
    outro: {
      gornji: z.outroGornji,
      naslov: z.outroNaslov,
      potpis: z.outroPotpis(z.domacicaIme, z.domacicaTelefon),
    },
  };
}
