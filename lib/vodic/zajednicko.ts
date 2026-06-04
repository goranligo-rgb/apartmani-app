// Zajednički dio vodiča — isti za sve objekte (Malinska): naslovi sekcija,
// kontakti, plaže, gastronomija, Krk, transport, otpad, outro. Po jeziku.
//
// HR tekstovi su preuzeti 1:1 iz finalnog vodiča (Apartments Eva 2026).
// EN/DE su prijevodi (za pregled) — dijakritika/umlauti su OK (HTML, ne SMS).

import type { VodicJezik, VodicKartica, VodicLink, VodicHitni, VodicOtpadVrsta } from "./index";

export type ZajednickiSadrzaj = {
  heroEyebrow: string;
  heroNaslov: string;

  wifiNaslov: string;
  wifiMrezaLabela: string;
  wifiLozinkaLabela: string;

  badgeNajblize: string;

  // domaćica (ista za sve objekte grupe)
  domacicaIme: string;
  domacicaTelefon: string;

  kontaktiNaslov: string;
  kontaktiEyebrow: string;
  domacicaLabela: string;
  domacicaKanali: string;
  hitni: VodicHitni[];

  kucniRedNaslov: string;
  kucniRedEyebrow: string;

  plazeNaslov: string;
  plazeEyebrow: string;
  plaze: { kljuc: string; naziv: string; opis: string }[];
  plazeLink: VodicLink;

  gastroNaslov: string;
  gastroEyebrow: string;
  gastroKartice: VodicKartica[];

  krkNaslov: string;
  krkEyebrow: string;
  krkKartice: VodicKartica[];

  transportNaslov: string;
  transportEyebrow: string;
  transportKartice: VodicKartica[];

  komunalnoNaslov: string;
  komunalnoEyebrow: string;
  otpadUvod: string;
  otpadVrste: VodicOtpadVrsta[];
  otpadNapomena: string;
  otpadLink: VodicLink;

  outroGornji: string;
  outroNaslov: string;
  outroPotpis: (ime: string, telefon: string) => string;
};

// Boje točkica za vrste otpada (iz vodiča).
const OTPAD_BOJE = {
  bio: "#6b4a2b",
  plastika: "#e0b100",
  papir: "#1f4e79",
  mijesani: "#2f8a3b",
  staklo: "#2e2923",
};

const IME = "Kristina";
const TEL = "+385 98 700 415";

export const ZAJEDNICKO: Record<VodicJezik, ZajednickiSadrzaj> = {
  hr: {
    heroEyebrow: "DRAGI GOSTI,",
    heroNaslov: "DOBRODOŠLI!",

    wifiNaslov: "WI-FI PRISTUP",
    wifiMrezaLabela: "Mreža",
    wifiLozinkaLabela: "Lozinka",

    badgeNajblize: "NAJBLIŽE VAMA",

    domacicaIme: IME,
    domacicaTelefon: TEL,

    kontaktiNaslov: "Važni kontakti",
    kontaktiEyebrow: "UVIJEK SMO VAM NA RASPOLAGANJU",
    domacicaLabela: "VAŠA DOMAĆICA",
    domacicaKanali: "poziv · SMS · WhatsApp",
    hitni: [
      { naziv: "Hitna pomoć", broj: "112" },
      { naziv: "Hitna medicinska pomoć", broj: "194" },
      { naziv: "Vatrogasci", broj: "193" },
      { naziv: "Policija", broj: "192" },
    ],

    kucniRedNaslov: "Kućni red",
    kucniRedEyebrow: "ZA UGODAN BORAVAK SVIH GOSTIJU",

    plazeNaslov: "Plaže u Malinskoj",
    plazeEyebrow: "SVE NA PJEŠAČKOJ UDALJENOSTI ILI KRATKOJ VOŽNJI",
    plaze: [
      { kljuc: "rupa", naziv: "Rupa", opis: "Pješčano dno, idealna za obitelji s djecom, u samom centru." },
      { kljuc: "portic", naziv: "Portić", opis: "Mala šljunčana uvala, mirnija atmosfera." },
      { kljuc: "maestral", naziv: "Maestral", opis: "Uređena plaža uz šetnicu, blizina kafića." },
      { kljuc: "ribarsko", naziv: "Ribarsko selo", opis: "Slikovita uvala uz tradicijsko naselje." },
      { kljuc: "haludovo", naziv: "Haludovo", opis: "Prostrana plaža sjeverno od centra." },
      { kljuc: "rova", naziv: "Rova & Vrtača", opis: "Mirne uvale u smjeru Rove, 15-ak min šetnje obalom." },
    ],
    plazeLink: { tekst: "visitmalinska.com → sve plaže s kartom", url: "https://visitmalinska.com" },

    gastroNaslov: "Gastronomija",
    gastroEyebrow: "GDJE DOBRO JESTI",
    gastroKartice: [
      {
        naziv: "Restorani u Malinskoj",
        opis: "Od konoba s domaćom kuhinjom do restorana uz more — kompletna ponuda na jednom mjestu.",
        link: { tekst: "visitmalinska.com → gastronomija", url: "https://visitmalinska.com" },
      },
      {
        naziv: "Naša preporuka",
        opis: "Slobodno nas pitajte — rado ćemo Vam preporučiti restoran po Vašem ukusu i rezervirati stol.",
        link: { tekst: `${IME} · ${TEL}`, url: `tel:${TEL.replace(/\s/g, "")}` },
      },
    ],

    krkNaslov: "Što posjetiti na Krku",
    krkEyebrow: "IZLETI I ATRAKCIJE",
    krkKartice: [
      {
        naziv: "Špilja Biserujka",
        opis: "Najpoznatija krčka špilja, 15-ak minuta vožnje — idealan kratki izlet.",
        link: { tekst: "spilja-biserujka.com.hr", url: "https://spilja-biserujka.com.hr" },
      },
      {
        naziv: "Atrakcije na otoku",
        opis: "Grad Krk, Vrbnik, Košljun, plaže Stara Baška... — pregled svega što vrijedi vidjeti.",
        link: { tekst: "mare-vrbnik.com → što vidjeti na Krku", url: "https://mare-vrbnik.com" },
      },
    ],

    transportNaslov: "Transport",
    transportEyebrow: "KRETANJE BEZ VLASTITOG AUTA",
    transportKartice: [
      {
        naziv: "Taxi",
        opis: "Lokalni taxi prijevoz dostupan na poziv.",
        link: { tekst: "g.co/kgs/9t2NTT", url: "https://g.co/kgs/9t2NTT" },
      },
      {
        naziv: "Turistički vlak",
        opis: "Vozi kroz Malinsku u sezoni — zabavan način razgledavanja.",
        link: { tekst: "raspored: visitmalinska.com", url: "https://visitmalinska.com" },
      },
    ],

    komunalnoNaslov: "Komunalne usluge",
    komunalnoEyebrow: "ODVAJANJE OTPADA",
    otpadUvod:
      "Molimo odvajajte otpad. Odlažite ga u predviđene kante u ograđenom spremištu u dvorištu:",
    otpadVrste: [
      { naziv: "Biootpad", boja: OTPAD_BOJE.bio },
      { naziv: "Plastika, metal i najlon", boja: OTPAD_BOJE.plastika },
      { naziv: "Papir", boja: OTPAD_BOJE.papir },
      { naziv: "Miješani komunalni otpad", boja: OTPAD_BOJE.mijesani },
      { naziv: "Staklo", boja: OTPAD_BOJE.staklo },
    ],
    otpadNapomena:
      "Otok Krk među najnaprednijim je mjestima u Hrvatskoj po odvojenom prikupljanju otpada — hvala što čuvate otok!",
    otpadLink: { tekst: "ekootokkrk.hr → koji otpad u koju kantu", url: "https://ekootokkrk.hr" },

    outroGornji: "Želimo Vam",
    outroNaslov: "ugodan boravak!",
    outroPotpis: (ime, telefon) => `Vaša domaćica ${ime} · ${telefon} · malinska-stay.hr`,
  },

  en: {
    heroEyebrow: "DEAR GUESTS,",
    heroNaslov: "WELCOME!",

    wifiNaslov: "WI-FI ACCESS",
    wifiMrezaLabela: "Network",
    wifiLozinkaLabela: "Password",

    badgeNajblize: "CLOSEST TO YOU",

    domacicaIme: IME,
    domacicaTelefon: TEL,

    kontaktiNaslov: "Important contacts",
    kontaktiEyebrow: "WE ARE ALWAYS AT YOUR DISPOSAL",
    domacicaLabela: "YOUR HOST",
    domacicaKanali: "call · SMS · WhatsApp",
    hitni: [
      { naziv: "Emergency", broj: "112" },
      { naziv: "Medical emergency", broj: "194" },
      { naziv: "Fire brigade", broj: "193" },
      { naziv: "Police", broj: "192" },
    ],

    kucniRedNaslov: "House rules",
    kucniRedEyebrow: "FOR A PLEASANT STAY FOR ALL GUESTS",

    plazeNaslov: "Beaches in Malinska",
    plazeEyebrow: "ALL WITHIN WALKING DISTANCE OR A SHORT DRIVE",
    plaze: [
      { kljuc: "rupa", naziv: "Rupa", opis: "Sandy bottom, ideal for families with children, in the very centre." },
      { kljuc: "portic", naziv: "Portić", opis: "A small pebble cove with a quieter atmosphere." },
      { kljuc: "maestral", naziv: "Maestral", opis: "A well-kept beach along the promenade, cafés nearby." },
      { kljuc: "ribarsko", naziv: "Ribarsko selo", opis: "A picturesque cove by the traditional village." },
      { kljuc: "haludovo", naziv: "Haludovo", opis: "A spacious beach north of the centre." },
      { kljuc: "rova", naziv: "Rova & Vrtača", opis: "Quiet coves towards Rova, about a 15-minute walk along the coast." },
    ],
    plazeLink: { tekst: "visitmalinska.com → all beaches with map", url: "https://visitmalinska.com" },

    gastroNaslov: "Dining",
    gastroEyebrow: "WHERE TO EAT WELL",
    gastroKartice: [
      {
        naziv: "Restaurants in Malinska",
        opis: "From taverns with local cuisine to seaside restaurants — the full offer in one place.",
        link: { tekst: "visitmalinska.com → dining", url: "https://visitmalinska.com" },
      },
      {
        naziv: "Our recommendation",
        opis: "Just ask us — we will gladly recommend a restaurant to your taste and book a table.",
        link: { tekst: `${IME} · ${TEL}`, url: `tel:${TEL.replace(/\s/g, "")}` },
      },
    ],

    krkNaslov: "What to visit on Krk",
    krkEyebrow: "TRIPS AND ATTRACTIONS",
    krkKartice: [
      {
        naziv: "Biserujka Cave",
        opis: "The most famous cave on Krk, about a 15-minute drive — an ideal short trip.",
        link: { tekst: "spilja-biserujka.com.hr", url: "https://spilja-biserujka.com.hr" },
      },
      {
        naziv: "Island attractions",
        opis: "Krk town, Vrbnik, Košljun, the beaches of Stara Baška... — an overview of everything worth seeing.",
        link: { tekst: "mare-vrbnik.com → what to see on Krk", url: "https://mare-vrbnik.com" },
      },
    ],

    transportNaslov: "Transport",
    transportEyebrow: "GETTING AROUND WITHOUT YOUR OWN CAR",
    transportKartice: [
      {
        naziv: "Taxi",
        opis: "Local taxi service available on call.",
        link: { tekst: "g.co/kgs/9t2NTT", url: "https://g.co/kgs/9t2NTT" },
      },
      {
        naziv: "Tourist train",
        opis: "Runs through Malinska in season — a fun way to sightsee.",
        link: { tekst: "schedule: visitmalinska.com", url: "https://visitmalinska.com" },
      },
    ],

    komunalnoNaslov: "Municipal services",
    komunalnoEyebrow: "WASTE SEPARATION",
    otpadUvod:
      "Please separate your waste. Dispose of it in the designated bins in the enclosed storage in the yard:",
    otpadVrste: [
      { naziv: "Biowaste", boja: OTPAD_BOJE.bio },
      { naziv: "Plastic, metal and nylon", boja: OTPAD_BOJE.plastika },
      { naziv: "Paper", boja: OTPAD_BOJE.papir },
      { naziv: "Mixed municipal waste", boja: OTPAD_BOJE.mijesani },
      { naziv: "Glass", boja: OTPAD_BOJE.staklo },
    ],
    otpadNapomena:
      "The island of Krk is among the most advanced places in Croatia for separate waste collection — thank you for taking care of the island!",
    otpadLink: { tekst: "ekootokkrk.hr → which waste in which bin", url: "https://ekootokkrk.hr" },

    outroGornji: "We wish you",
    outroNaslov: "a pleasant stay!",
    outroPotpis: (ime, telefon) => `Your host ${ime} · ${telefon} · malinska-stay.hr`,
  },

  de: {
    heroEyebrow: "LIEBE GÄSTE,",
    heroNaslov: "WILLKOMMEN!",

    wifiNaslov: "WI-FI ZUGANG",
    wifiMrezaLabela: "Netzwerk",
    wifiLozinkaLabela: "Passwort",

    badgeNajblize: "AM NÄCHSTEN",

    domacicaIme: IME,
    domacicaTelefon: TEL,

    kontaktiNaslov: "Wichtige Kontakte",
    kontaktiEyebrow: "WIR SIND IMMER FÜR SIE DA",
    domacicaLabela: "IHRE GASTGEBERIN",
    domacicaKanali: "Anruf · SMS · WhatsApp",
    hitni: [
      { naziv: "Notruf", broj: "112" },
      { naziv: "Medizinischer Notruf", broj: "194" },
      { naziv: "Feuerwehr", broj: "193" },
      { naziv: "Polizei", broj: "192" },
    ],

    kucniRedNaslov: "Hausordnung",
    kucniRedEyebrow: "FÜR EINEN ANGENEHMEN AUFENTHALT ALLER GÄSTE",

    plazeNaslov: "Strände in Malinska",
    plazeEyebrow: "ALLE FUSSLÄUFIG ODER MIT KURZER FAHRT ERREICHBAR",
    plaze: [
      { kljuc: "rupa", naziv: "Rupa", opis: "Sandiger Grund, ideal für Familien mit Kindern, direkt im Zentrum." },
      { kljuc: "portic", naziv: "Portić", opis: "Kleine Kieselbucht mit ruhigerer Atmosphäre." },
      { kljuc: "maestral", naziv: "Maestral", opis: "Gepflegter Strand an der Promenade, Cafés in der Nähe." },
      { kljuc: "ribarsko", naziv: "Ribarsko selo", opis: "Malerische Bucht am traditionellen Dorf." },
      { kljuc: "haludovo", naziv: "Haludovo", opis: "Weitläufiger Strand nördlich des Zentrums." },
      { kljuc: "rova", naziv: "Rova & Vrtača", opis: "Ruhige Buchten Richtung Rova, etwa 15 Minuten Spaziergang entlang der Küste." },
    ],
    plazeLink: { tekst: "visitmalinska.com → alle Strände mit Karte", url: "https://visitmalinska.com" },

    gastroNaslov: "Gastronomie",
    gastroEyebrow: "WO MAN GUT ISST",
    gastroKartice: [
      {
        naziv: "Restaurants in Malinska",
        opis: "Von Tavernen mit lokaler Küche bis zu Restaurants am Meer — das komplette Angebot an einem Ort.",
        link: { tekst: "visitmalinska.com → Gastronomie", url: "https://visitmalinska.com" },
      },
      {
        naziv: "Unsere Empfehlung",
        opis: "Fragen Sie uns einfach — wir empfehlen Ihnen gerne ein Restaurant nach Ihrem Geschmack und reservieren einen Tisch.",
        link: { tekst: `${IME} · ${TEL}`, url: `tel:${TEL.replace(/\s/g, "")}` },
      },
    ],

    krkNaslov: "Was man auf Krk besuchen kann",
    krkEyebrow: "AUSFLÜGE UND SEHENSWÜRDIGKEITEN",
    krkKartice: [
      {
        naziv: "Höhle Biserujka",
        opis: "Die bekannteste Höhle auf Krk, etwa 15 Minuten Fahrt — ein idealer Kurzausflug.",
        link: { tekst: "spilja-biserujka.com.hr", url: "https://spilja-biserujka.com.hr" },
      },
      {
        naziv: "Sehenswürdigkeiten der Insel",
        opis: "Die Stadt Krk, Vrbnik, Košljun, die Strände von Stara Baška... — ein Überblick über alles Sehenswerte.",
        link: { tekst: "mare-vrbnik.com → was man auf Krk sehen kann", url: "https://mare-vrbnik.com" },
      },
    ],

    transportNaslov: "Transport",
    transportEyebrow: "UNTERWEGS OHNE EIGENES AUTO",
    transportKartice: [
      {
        naziv: "Taxi",
        opis: "Lokaler Taxidienst auf Anruf verfügbar.",
        link: { tekst: "g.co/kgs/9t2NTT", url: "https://g.co/kgs/9t2NTT" },
      },
      {
        naziv: "Touristenbahn",
        opis: "Fährt in der Saison durch Malinska — eine unterhaltsame Art der Besichtigung.",
        link: { tekst: "Fahrplan: visitmalinska.com", url: "https://visitmalinska.com" },
      },
    ],

    komunalnoNaslov: "Kommunale Dienste",
    komunalnoEyebrow: "ABFALLTRENNUNG",
    otpadUvod:
      "Bitte trennen Sie den Abfall. Entsorgen Sie ihn in den vorgesehenen Behältern im umzäunten Lager im Hof:",
    otpadVrste: [
      { naziv: "Bioabfall", boja: OTPAD_BOJE.bio },
      { naziv: "Plastik, Metall und Nylon", boja: OTPAD_BOJE.plastika },
      { naziv: "Papier", boja: OTPAD_BOJE.papir },
      { naziv: "Restmüll", boja: OTPAD_BOJE.mijesani },
      { naziv: "Glas", boja: OTPAD_BOJE.staklo },
    ],
    otpadNapomena:
      "Die Insel Krk gehört zu den fortschrittlichsten Orten Kroatiens bei der getrennten Abfallsammlung — danke, dass Sie die Insel schützen!",
    otpadLink: { tekst: "ekootokkrk.hr → welcher Abfall in welche Tonne", url: "https://ekootokkrk.hr" },

    outroGornji: "Wir wünschen Ihnen",
    outroNaslov: "einen angenehmen Aufenthalt!",
    outroPotpis: (ime, telefon) => `Ihre Gastgeberin ${ime} · ${telefon} · malinska-stay.hr`,
  },
};
