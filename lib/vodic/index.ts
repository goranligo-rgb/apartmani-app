// Vodič dobrodošlice po objektu — JEDAN izvor sadržaja za (a) welcome web
// stranicu i (b) welcome mail HTML. Sadržaj je strukturirani podaci (sekcije),
// pa ga renderiraju dva renderera iz iste `Vodic` strukture.
//
// Jezik: HR/EN/DE (vodicJezik → hr/en/de, ostalo fallback "en").
//
// Sastav: ZAJEDNICKO (isto za sve objekte) + SADRZAJ[slug] (objekt-specifično:
// hero uvod, WiFi, kućni red, opcionalni override-i: redoslijed plaža, opis
// Rove, gastro preporuka, pergola sekcija). `dohvatiVodic` spaja u razriješen
// `Vodic`. Override-i su opcionalni → objekt bez njih koristi zajedničke
// vrijednosti (npr. Eva).

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
  opisRedovi?: string[]; // više redaka, svaki u svom retku (npr. preporuka restorana)
  link?: VodicLink;
  linkovi?: VodicLink[]; // više linkova u retku (npr. taxi)
  badge?: string; // npr. "NAJBLIŽE VAMA"; prazno = bez badge-a
};

export type VodicHitni = { naziv: string; broj: string };

export type VodicOtpadVrsta = { naziv: string; boja: string }; // boja = hex za točkicu

// Ikone uz naslove sekcija (renderer crta SVG po ovom ključu).
export type IkonaKljuc = "telefon" | "info" | "pin" | "vilica" | "pergola";

// Sekcije su discriminated union po `tip`.
export type VodicSekcija =
  | {
      tip: "kontakti";
      broj: number;
      ikona: IkonaKljuc;
      naslov: string;
      eyebrow: string;
      domacica: { labela: string; ime: string; telefon: string; kanali: string };
      hitni: VodicHitni[];
    }
  | {
      tip: "pravila";
      broj: number;
      ikona: IkonaKljuc;
      naslov: string;
      eyebrow: string;
      stavke: string[];
    }
  | {
      tip: "pergola";
      broj: number;
      ikona: IkonaKljuc;
      naslov: string;
      odlomci: string[];
      slika: string;
    }
  | {
      tip: "kartice";
      broj: number;
      ikona: IkonaKljuc;
      naslov: string;
      eyebrow: string;
      kartice: VodicKartica[];
      link?: VodicLink; // npr. zlatni banner "sve plaže s kartom"
    }
  | {
      tip: "otpad";
      broj: number;
      ikona: IkonaKljuc;
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

// Per-jezik objekt-specifični tekst. Override-i (rovaOpis, gastroPreporuka,
// pergola) su opcionalni — ako ih nema, koriste se zajedničke vrijednosti.
export type ObjektTekst = {
  heroUvod: string;
  kucniRed: string[];
  rovaOpis?: string; // override opisa plaže "Rova & Vrtača"
  pergola?: string[]; // odlomci sekcije "Relax zona pergole" (samo objekti s pergolom)
};

export type ObjektSadrzaj = {
  wifi: { mreza: string; lozinka: string };
  najblizePlaze: string[]; // ključevi plaža (zajednicko.plaze[].kljuc) koje dobiju badge
  plazeRedoslijed?: string[]; // ključevi plaža u željenom redoslijedu; bez ovog → redoslijed iz zajednicko
  pergolaSlika?: string; // putanja na skicu pergole; uz ObjektTekst.pergola aktivira sekciju
  tekst: Record<VodicJezik, ObjektTekst>;
};

const SADRZAJ: Record<ObjektSlug, ObjektSadrzaj> = {
  eva,
  marty,
  "house-art": houseArt,
};

export function vodicJezik(jezik: string | null | undefined): VodicJezik {
  if (jezik === "hr") return "hr";
  if (jezik === "de") return "de";
  return "en";
}

export function dohvatiVodic(
  slug: ObjektSlug,
  jezikInput: string | null | undefined
): Vodic {
  const jezik = vodicJezik(jezikInput);
  const z: ZajednickiSadrzaj = ZAJEDNICKO[jezik];
  const o = SADRZAJ[slug];
  const ot = o.tekst[jezik];
  const podaci = OBJEKTI_PODACI[slug];

  // Plaže: redoslijed iz objekta (ako zadan) inače zajednički; opis Rove se
  // može override-ati po objektu; badge prema najblizePlaze.
  const plazePoKljucu = new Map(z.plaze.map((p) => [p.kljuc, p]));
  const redoslijed = o.plazeRedoslijed ?? z.plaze.map((p) => p.kljuc);
  const plazeKartice: VodicKartica[] = redoslijed
    .map((kljuc) => plazePoKljucu.get(kljuc))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      naziv: p.naziv,
      opis: p.kljuc === "rova" && ot.rovaOpis ? ot.rovaOpis : p.opis,
      badge: o.najblizePlaze.includes(p.kljuc) ? z.badgeNajblize : undefined,
    }));

  const sekcije: VodicSekcija[] = [
    {
      tip: "kontakti",
      broj: 1,
      ikona: "telefon",
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
      ikona: "info",
      naslov: z.kucniRedNaslov,
      eyebrow: z.kucniRedEyebrow,
      stavke: ot.kucniRed,
    },
  ];

  // Pergola — samo objekti koji imaju i sliku i tekst (Marty).
  if (o.pergolaSlika && ot.pergola && ot.pergola.length > 0) {
    sekcije.push({
      tip: "pergola",
      broj: 3,
      ikona: "pergola",
      naslov: z.pergolaNaslov,
      odlomci: ot.pergola,
      slika: o.pergolaSlika,
    });
  }

  sekcije.push(
    {
      tip: "kartice",
      broj: 4,
      ikona: "pin",
      naslov: z.plazeNaslov,
      eyebrow: z.plazeEyebrow,
      kartice: plazeKartice,
      link: z.plazeLink,
    },
    {
      tip: "kartice",
      broj: 5,
      ikona: "vilica",
      naslov: z.gastroNaslov,
      eyebrow: z.gastroEyebrow,
      kartice: z.gastroKartice,
      link: z.gastroLink,
    },
    {
      tip: "kartice",
      broj: 6,
      ikona: "pin",
      naslov: z.krkNaslov,
      eyebrow: z.krkEyebrow,
      kartice: z.krkKartice,
    },
    {
      tip: "kartice",
      broj: 7,
      ikona: "info",
      naslov: z.transportNaslov,
      eyebrow: z.transportEyebrow,
      kartice: z.transportKartice,
    },
    {
      tip: "otpad",
      broj: 8,
      ikona: "info",
      naslov: z.komunalnoNaslov,
      eyebrow: z.komunalnoEyebrow,
      uvod: z.otpadUvod,
      vrste: z.otpadVrste,
      napomena: z.otpadNapomena,
      link: z.otpadLink,
    }
  );

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
