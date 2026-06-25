import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { KategorijaTroska, IzvorTroska } from "@prisma/client";
import {
  osobaRijec,
  izracunajDodatnuOsoba,
  dodatnaPosteljinaRecenica,
  sljedeciUlazakTekst,
  jeSkoriUlazak,
} from "@/lib/ciscenje/dodatnaPosteljina";
// Predikat dana čišćenja (koji KONKRETAN datum se čisti) — jedini izvor istine.
// Render/petlja/opis ispod ostaju identični; mijenja se samo kako se odlučuje
// "je li ovaj datum dan za bazen / stubište".
import {
  martyBazenZaDan,
  evaStubisteZaDan,
  martyStubisteZaDan,
} from "@/lib/ciscenje/daniCiscenja";
// Vrijeme "Čišćenje od" (samo ZAVRSNO; ostalo → "-") + efektivni datum čišćenja
// (dan odlaska + odgoda). F3a: efektivni datum (NO-OP dok je odgoda 0).
import {
  ciscenjeOdZaTip,
  efektivniDatumCiscenja,
  pocetakDanaUtc,
  ulazakIstiDan,
} from "@/lib/ciscenje/ciscenjeVrijeme";

const resend = new Resend(process.env.RESEND_API_KEY!);

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Kratki numerički datum "DD.MM.YYYY." za stupac "Sljedeći ulazak" u mailu.
function formatDatumKratko(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}.`;
}

function guestName(gost: any) {
  return `${gost?.ime || ""} ${gost?.prezime || ""}`.trim() || "-";
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function findNextReservation(
  jedinicaId: string,
  currentReservationId: string,
  datumDo: Date
) {
  return prisma.rezervacija.findFirst({
    where: {
      id: {
        not: currentReservationId,
      },
      jedinicaId,
      status: {
        not: "OTKAZANO",
      },
      // Sljedeći ULAZ po DANU, ne po instantu: granica = početak-dana odlaska
      // (UTC ponoć). Tako booking-ulaz spremljen na 00:00 (isti dan kao admin-
      // odlazak na 12:00) ne padne kroz filter. `orderBy datumOd asc` i dalje
      // hvata NAJRANIJI ulaz (npr. ulaz isti dan, ne kasniji 7 dana poslije).
      datumOd: {
        gte: pocetakDanaUtc(datumDo),
      },
    },
    include: {
      gost: true,
    },
    orderBy: {
      datumOd: "asc",
    },
  });
}

async function findOrCreateZadatak(data: {
  jedinicaId: string;
  rezervacijaId?: string | null;
  datum: Date;
  tip:
    | "ZAVRSNO_CISCENJE"
    | "MEDJUCISCENJE"
    | "PROMJENA_POSTELJINE"
    | "MEDJUCISCENJE_I_POSTELJINA"
    | "DODATNO_CISCENJE";
  naslov: string;
  opis: string;
  prioritet?: boolean;
}) {
  const postoji = await prisma.zadatak.findFirst({
    where: {
      jedinicaId: data.jedinicaId,
      rezervacijaId: data.rezervacijaId || null,
      datum: data.datum,
      tip: data.tip,
      // `naslov` u ključu razdvaja dva DODATNO_CISCENJE zadatka na ISTOJ Marty
      // jedinici i istom datumu (Bazen Marty vs Stubište Marty) — inače bi drugi
      // reuse-ao prvog (isti jedinicaId+datum+tip+rezervacijaId=null) i pregazio
      // mu trošak. Svi naslovi su deterministični po tipu/jedinici → idempotencija
      // ostalih tipova (završno, međučišćenje, bazen, Eva) ostaje očuvana.
      naslov: data.naslov,
    },
  });

  if (postoji) return postoji;

  return prisma.zadatak.create({
    data: {
      jedinicaId: data.jedinicaId,
      rezervacijaId: data.rezervacijaId || null,
      datum: data.datum,
      tip: data.tip,
      status: "CEKA",
      naslov: data.naslov,
      opis: data.opis,
      prioritet: data.prioritet || false,
    },
  });
}

async function upsertTrosak(params: {
  zadatakId: string;
  kategorija: KategorijaTroska;
  jedinicaId: string | null;
  objektId: string | null;
  datum: Date;
  iznos: number;
}) {
  // Idempotentno po zadatakId; NE dira stornirane (ručno korigirane) AUTO troškove.
  // Try/catch po svakom upisu — greška u trošku NE smije srušiti slanje maila.
  try {
    const postoji = await prisma.trosak.findUnique({
      where: { zadatakId: params.zadatakId },
    });

    if (postoji?.storniran) return;

    if (postoji) {
      await prisma.trosak.update({
        where: { zadatakId: params.zadatakId },
        data: {
          kategorija: params.kategorija,
          jedinicaId: params.jedinicaId,
          objektId: params.objektId,
          datum: params.datum,
          iznos: params.iznos,
        },
      });
    } else {
      await prisma.trosak.create({
        data: {
          zadatakId: params.zadatakId,
          izvor: IzvorTroska.AUTO,
          kategorija: params.kategorija,
          jedinicaId: params.jedinicaId,
          objektId: params.objektId,
          datum: params.datum,
          iznos: params.iznos,
        },
      });
    }
  } catch (err) {
    console.error(
      `[troskovi] zadatak ${params.zadatakId} (${params.kategorija}):`,
      err
    );
  }
}

export async function generirajINaPosalji(opcije?: {
  // "Pošalji puni plan" (rubni slučaj / izlaz u slučaju greške): svjesno
  // preskače kursor i šalje CIJELI prozor [danas, doDatuma] kao i prije.
  ignorirajKursor?: boolean;
}) {
  const agencija = await prisma.ciscenjeAgencija.findFirst();
  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  if (!agencija?.email) {
    return {
      error: "Molimo prije slanja upišite email agencije za čišćenje.",
    };
  }

  if (!postavke) throw new Error("Nisu spremljene postavke čišćenja");

  const danas = startOfDay(new Date());
  const doDatuma = addDays(danas, postavke.brojDanaUnaprijed || 7);

  // ── "Samo nadopuna naprijed" — kreni od mjesta gdje je zadnji put stao ──
  // Kursor "dokle je agenciji poslan tjedni plan" = najdalji POKRIVENI datum
  // (max datumDo) po VEĆ POSLANIM tjednim narudžbama. `napomena: null` isključuje
  // izvanredne nadopune (one nose "NADOPUNA-..." marker i NE pomiču granicu).
  // Pravilo: što je poslano — poslano je; ne diramo unatrag, šaljemo samo naprijed.
  // `ignorirajKursor` (gumb "Pošalji puni plan") ovo svjesno preskače.
  let zadnjiPoslani: Date | null = null;
  let pocetniDatum = danas;

  if (!opcije?.ignorirajKursor) {
    const zadnji = await prisma.ciscenjeNarudzba.aggregate({
      where: { poslanoEmail: true, napomena: null },
      _max: { datumDo: true },
    });
    zadnjiPoslani = zadnji._max.datumDo;

    if (zadnjiPoslani) {
      // Prvi NEpokriveni dan = zadnji poslani + 1. `max` s `danas` da nikad ne
      // krenemo u prošlost (npr. dugi razmak između slanja).
      const sljedeci = addDays(startOfDay(zadnjiPoslani), 1);
      pocetniDatum = sljedeci > danas ? sljedeci : danas;
    }
  }

  // Faza 2A — troškovi. Flag gata SAMO kreiranje Trosak zapisa (NE generiranje
  // zadataka / mail). Cjenik se učita jednom kao mapa po jedinicaId; jedinica bez
  // cjenika → iznos 0 (snapshot dok korisnik ne upiše cijene).
  const troskoviEnabled = process.env.TROSKOVI_ENABLED === "true";
  // PRIVREMENI DIJAGNOSTIČKI LOG — potvrda točne vrijednosti flaga na Vercelu
  // (JSON.stringify otkriva navodnike/razmake/undefined). Ukloniti nakon dijagnoze.
  console.log("[troskovi] TROSKOVI_ENABLED =", JSON.stringify(process.env.TROSKOVI_ENABLED));
  const cjenikRows = await prisma.cjenikCiscenjaJedinice.findMany();
  const cjenikMap = new Map(cjenikRows.map((c) => [c.jedinicaId, c]));

  const rezervacijeZaOdlazak = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      datumDo: {
        // Donji rub = pocetniDatum (kursor "naprijed-only"), ne više fiksni danas.
        gte: pocetniDatum,
        lte: doDatuma,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumDo: "asc" }],
  });

  const stavkeApartmani = await Promise.all(
    rezervacijeZaOdlazak.map(async (r) => {
      const sljedecaRezervacija = await findNextReservation(
        r.jedinicaId,
        r.id,
        r.datumDo
      );

      const sljedeciUlazak = sljedecaRezervacija
        ? `${formatDate(sljedecaRezervacija.datumOd)}`
        : "Nema najavljenog ulaska";

      // DB Zadatak.opis ostaje stari format (admin tablica ga čita iz baze).
      const opis =
        `Završno čišćenje nakon odlaska gosta. ` +
        `Broj gostiju: ${r.brojOsoba || 0}. ` +
        `Sljedeći ulazak: ${sljedeciUlazak}.`;

      // Efektivni datum čišćenja = dan odlaska + odgoda (F3a; NO-OP dok je
      // odgoda 0). Isti datum koristi Zadatak, Trošak i redak u mailu da ostanu
      // poravnati.
      const datumCiscenja = efektivniDatumCiscenja(
        r.datumDo,
        r.odgodaCiscenjaDana
      );

      const zadatak = await findOrCreateZadatak({
        jedinicaId: r.jedinicaId,
        rezervacijaId: r.id,
        datum: datumCiscenja,
        tip: "ZAVRSNO_CISCENJE",
        naslov: `Završno čišćenje - ${r.jedinica.naziv}`,
        opis,
        prioritet: true,
      });

      if (troskoviEnabled) {
        await upsertTrosak({
          zadatakId: zadatak.id,
          kategorija: "CISCENJE",
          jedinicaId: r.jedinicaId,
          objektId: r.jedinica.objekt.id,
          datum: datumCiscenja,
          iznos: cjenikMap.get(r.jedinicaId)?.cijenaCiscenja ?? 0,
        });
      }

      // Mail (prema agenciji): X za stupac Napomena + tekst za stupac Sljedeći ulazak.
      const dodatnaOsoba = izracunajDodatnuOsoba({
        sljedecaRezervacija,
        datumDo: r.datumDo,
        osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
        dodatniKapacitet: r.jedinica.dodatniKapacitet || 0,
      });

      const ulazInfo = sljedeciUlazakTekst({
        sljedecaRezervacija,
        datumDo: r.datumDo,
        formatDate: formatDatumKratko,
      });

      // "Skori ulazak" izveden iz istog praga (<= 4 dana) kao logika posteljine.
      const imaSkoriUlazak = jeSkoriUlazak({
        sljedecaRezervacija,
        datumDo: r.datumDo,
      });

      // Opis u mailu je UVIJEK isti; dodatna posteljina ide samo u stupac Napomena.
      const opisMail = "Čišćenje nakon odlaska gosta.";

      // "Ulazak isti dan" (F3c): EFEKTIVNI datum čišćenja pada BAŠ na dan dolaska
      // sljedećeg gosta → čisti se ujutro prije ulaska. Bazirano na efektivnom
      // (pomaknutom) datumu, ne na danu odlaska; pri odgodi 0 jednako razmak===0.
      const jeUlazakIstiDan = ulazakIstiDan(
        datumCiscenja,
        sljedecaRezervacija?.datumOd ?? null
      );

      return {
        datum: datumCiscenja,
        tip: "ZAVRSNO_CISCENJE" as const,
        jedinicaId: r.jedinicaId,
        zadatakId: zadatak.id,
        // Per-slučaj vrijeme "Čišćenje od" (override); null = fiksni default 10:00.
        ciscenjeOdOverride: r.ciscenjeOdOverride,
        nazivJedinice: r.jedinica.naziv,
        nazivObjekta: r.jedinica.objekt.naziv,
        brojGostiju: r.brojOsoba || 0,
        // Broj gostiju koji ULAZE (sljedeća rezervacija) + puni kapacitet jedinice.
        brojGostijuUlaz: sljedecaRezervacija?.brojOsoba ?? null,
        imaSkoriUlazak,
        ukupniKapacitet: r.jedinica.ukupniKapacitet || 0,
        osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
        dodatnaOsoba,
        opis: opisMail,
        sljedeciUlazak: ulazInfo.tekst,
        jeBrziUlazak: ulazInfo.jeBrziUlazak,
        // F3c: highlight retka + upozorenje "Ulazak isti dan" (efektivni datum).
        ulazakIstiDan: jeUlazakIstiDan,
        cijena: 0,
      };
    })
  );

  const duzeRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      automatskaPosteljina: true,
      brojNocenja: {
        gt: 7,
      },
      datumOd: {
        lt: doDatuma,
      },
      datumDo: {
        // Naprijed-only: ignoriraj boravke koji su završili prije pocetniDatum
        // (njihovo međučišćenje je u već poslanom razdoblju).
        gt: pocetniDatum,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const stavkeMedjuciscenje: any[] = [];

  for (const r of duzeRezervacije) {
    const pocetak = startOfDay(r.datumOd);
    const kraj = startOfDay(r.datumDo);

    const polaBoravka = Math.floor(Number(r.brojNocenja || 0) / 2);
    const datumMedjuciscenja = addDays(pocetak, polaBoravka);

    if (datumMedjuciscenja <= pocetak || datumMedjuciscenja >= kraj) {
      continue;
    }

    if (datumMedjuciscenja < pocetniDatum || datumMedjuciscenja > doDatuma) {
      continue;
    }

    const opis =
      `Gost ostaje dulje od 7 noći. Potrebno je očistiti smještaj, ` +
      `promijeniti posteljinu i ostaviti nove ručnike. ` +
      `Broj gostiju: ${r.brojOsoba || 0}.`;

    const zadatak = await findOrCreateZadatak({
      jedinicaId: r.jedinicaId,
      rezervacijaId: r.id,
      datum: datumMedjuciscenja,
      tip: "MEDJUCISCENJE_I_POSTELJINA",
      naslov: `Međučisćenje i posteljina - ${r.jedinica.naziv}`,
      opis,
      prioritet: true,
    });

    if (troskoviEnabled) {
      await upsertTrosak({
        zadatakId: zadatak.id,
        kategorija: "POSTELJINA",
        jedinicaId: r.jedinicaId,
        objektId: r.jedinica.objekt.id,
        datum: datumMedjuciscenja,
        iznos: cjenikMap.get(r.jedinicaId)?.cijenaPosteljina ?? 0,
      });
    }

    stavkeMedjuciscenje.push({
      datum: new Date(datumMedjuciscenja),
      tip: "MEDJUCISCENJE_I_POSTELJINA" as const,
      jedinicaId: r.jedinicaId,
      zadatakId: zadatak.id,
      nazivJedinice: r.jedinica.naziv,
      nazivObjekta: r.jedinica.objekt.naziv,
      brojGostiju: r.brojOsoba || 0,
      osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
      opis: `Međučišćenje - kompletna zamjena posteljine i ručnika za ${
        r.brojOsoba || 0
      } ${osobaRijec(r.brojOsoba || 0)}.`,
      sljedeciUlazak: "Gost ostaje u smještaju",
      cijena: 0,
    });
  }

  const prvaJedinica = await prisma.jedinica.findFirst({
    where: {
      objekt: {
        naziv: {
          contains: "Marty",
        },
      },
    },
    include: {
      objekt: true,
    },
  });

  const stavkeBazen: any[] = [];

  if (prvaJedinica) {
    let d = pocetniDatum; // naprijed-only: kreni od kursora, ne od danas

    while (d <= doDatuma) {
      if (martyBazenZaDan(postavke, d)) {
        const opis = "Čišćenje oko bazena i roštilja.";

        const zadatak = await findOrCreateZadatak({
          jedinicaId: prvaJedinica.id,
          rezervacijaId: null,
          datum: startOfDay(d),
          tip: "DODATNO_CISCENJE",
          naslov: "Marty bazen / okoliš",
          opis,
          prioritet: false,
        });

        if (troskoviEnabled) {
          await upsertTrosak({
            zadatakId: zadatak.id,
            kategorija: "BAZEN",
            jedinicaId: prvaJedinica.id,
            objektId: prvaJedinica.objekt.id,
            datum: startOfDay(d),
            iznos: postavke.bazenCijena ?? 0,
          });
        }

        stavkeBazen.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE" as const,
          jedinicaId: prvaJedinica.id,
          zadatakId: zadatak.id,
          nazivJedinice: "Marty bazen / okoliš",
          nazivObjekta: prvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis,
          sljedeciUlazak: "-",
          cijena: 0,
        });
      }

      d = addDays(d, 1);
    }
  }

  // Stubište Eva — paralela s Marty bazenom (settings dani; default sve OFF →
  // ništa dok korisnik ne označi dane u /admin/ciscenje). Vezano na prvu Eva jedinicu.
  const prvaEvaJedinica = await prisma.jedinica.findFirst({
    where: {
      objekt: {
        naziv: {
          contains: "Eva",
        },
      },
    },
    include: {
      objekt: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  });

  const stavkeStubiste: any[] = [];

  if (prvaEvaJedinica) {
    let d = pocetniDatum; // naprijed-only: kreni od kursora, ne od danas

    while (d <= doDatuma) {
      if (evaStubisteZaDan(postavke, d)) {
        const opis = "Čišćenje stubišta zajedničkih prostorija";

        const zadatak = await findOrCreateZadatak({
          jedinicaId: prvaEvaJedinica.id,
          rezervacijaId: null,
          datum: startOfDay(d),
          tip: "DODATNO_CISCENJE",
          naslov: "Stubište Eva",
          opis,
          prioritet: false,
        });

        if (troskoviEnabled) {
          await upsertTrosak({
            zadatakId: zadatak.id,
            kategorija: "STUBISTE",
            jedinicaId: prvaEvaJedinica.id,
            objektId: prvaEvaJedinica.objekt.id,
            datum: startOfDay(d),
            iznos: postavke.stubisteCijena ?? 0,
          });
        }

        stavkeStubiste.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE" as const,
          jedinicaId: prvaEvaJedinica.id,
          zadatakId: zadatak.id,
          nazivJedinice: "Stubište Eva",
          nazivObjekta: prvaEvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis,
          sljedeciUlazak: "-",
          cijena: 0,
        });
      }

      d = addDays(d, 1);
    }
  }

  // Stubište Marty — isto kao Eva, ali vezano na prvu Marty jedinicu
  // (`prvaJedinica`, dohvaćena gore za bazen). Oblik retka identičan Evi →
  // samo dodaje nove retke, render/stupci nepromijenjeni.
  const stavkeStubisteMarty: any[] = [];

  if (prvaJedinica) {
    let d = pocetniDatum; // naprijed-only: kreni od kursora, ne od danas

    while (d <= doDatuma) {
      if (martyStubisteZaDan(postavke, d)) {
        const opis = "Čišćenje stubišta zajedničkih prostorija";

        const zadatak = await findOrCreateZadatak({
          jedinicaId: prvaJedinica.id,
          rezervacijaId: null,
          datum: startOfDay(d),
          tip: "DODATNO_CISCENJE",
          naslov: "Stubište Marty",
          opis,
          prioritet: false,
        });

        if (troskoviEnabled) {
          await upsertTrosak({
            zadatakId: zadatak.id,
            kategorija: "STUBISTE",
            jedinicaId: prvaJedinica.id,
            objektId: prvaJedinica.objekt.id,
            datum: startOfDay(d),
            iznos: postavke.stubisteCijena ?? 0,
          });
        }

        stavkeStubisteMarty.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE" as const,
          jedinicaId: prvaJedinica.id,
          zadatakId: zadatak.id,
          nazivJedinice: "Stubište Marty",
          nazivObjekta: prvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis,
          sljedeciUlazak: "-",
          cijena: 0,
        });
      }

      d = addDays(d, 1);
    }
  }

  const sveStavkeZaMail = [
    ...stavkeApartmani,
    ...stavkeMedjuciscenje,
    ...stavkeBazen,
    ...stavkeStubiste,
    ...stavkeStubisteMarty,
  ].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  if (sveStavkeZaMail.length === 0) {
    return {
      success: true,
      // `prazno` + `zadnjiPoslani` nose info za UX poruku "Sve poslano do DD.MM".
      // Kursor NE napreduje (ništa nije poslano, nema nove narudžbe).
      prazno: true,
      zadnjiPoslani,
      message: "Nema novih stavki za slanje",
    };
  }

  const sveStavkeZaBazu = sveStavkeZaMail.map((s) => ({
    datum: s.datum,
    tip: s.tip,
    jedinicaId: s.jedinicaId,
    zadatakId: s.zadatakId || null,
    nazivJedinice: s.nazivJedinice,
    nazivObjekta: s.nazivObjekta,
    opis:
      s.brojGostiju && s.brojGostiju > 0
        ? `${s.opis} | Broj gostiju: ${s.brojGostiju} | Sljedeći ulazak: ${s.sljedeciUlazak}`
        : `${s.opis} | Sljedeći ulazak: ${s.sljedeciUlazak}`,
    cijena: s.cijena,
  }));

  const narudzba = await prisma.ciscenjeNarudzba.create({
    data: {
      agencijaId: agencija.id,
      // datumOd = pocetniDatum (kursor) → header "Period" pošteno pokazuje
      // SAMO nadopunu-naprijed, a max(datumDo) ostaje izvor kursora idućeg puta.
      datumOd: pocetniDatum,
      datumDo: doDatuma,
      emailPrimatelja: agencija.email,
      ccEmailsSnapshot: agencija.ccEmails,
      subject: "Raspored čišćenja - Malinska Stay",
      tekstMaila: "Automatski generirani raspored čišćenja.",
      stavke: {
        create: sveStavkeZaBazu,
      },
    },
  });

  const ccList = agencija.ccEmails
    ? agencija.ccEmails
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  // Stupac "Gosti ulaze": za završno čišćenje SAMO broj — broj gostiju koji ULAZE
  // (ako ima skori ulazak) ili puni kapacitet jedinice. Ostali tipovi
  // (međučišćenje, bazen, stubište) nemaju ulaznog gosta → "-".
  function gostiUlazeText(s: any) {
    if (s.tip !== "ZAVRSNO_CISCENJE") return "-";

    if (s.imaSkoriUlazak && Number(s.brojGostijuUlaz || 0) > 0) {
      return String(s.brojGostijuUlaz);
    }

    if (Number(s.ukupniKapacitet || 0) > 0) {
      return String(s.ukupniKapacitet);
    }

    return "-";
  }

  function dodatnaPosteljinaText(s: any) {
    // Za završno čišćenje koristimo isti X kao u opisu (s.dodatnaOsoba);
    // za ostale tipove fallback na staru procjenu.
    const dodatnoOsoba =
      typeof s.dodatnaOsoba === "number"
        ? s.dodatnaOsoba
        : Math.max(0, Number(s.brojGostiju || 0) - Number(s.osnovniKapacitet || 0));

    if (dodatnoOsoba <= 0) return "—";

    return dodatnaPosteljinaRecenica(dodatnoOsoba);
  }

  const html = `
  <div style="font-family: Calibri, Segoe UI, Arial, sans-serif; color:#111; background:#f5f6f7; padding:24px;">
    <div style="background:white; border:1px solid #ddd; padding:20px;">
      <h2 style="margin:0; font-size:26px; font-weight:900; color:#111;">
        Plan čišćenja - Malinska Stay
      </h2>

      <p style="margin:8px 0 18px; color:#555; font-size:15px;">
        Period:
        <b>${formatDate(narudzba.datumOd)}</b>
        –
        <b>${formatDate(narudzba.datumDo)}</b>
      </p>

      <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width:100%; font-size:13px; background:white;">
        <tr style="background:#e9ecef;">
          <th align="left" style="border:1px solid #999;">Datum odlaska</th>
          <th align="left" style="border:1px solid #999; background:#e0f2fe;">Čišćenje od</th>
          <th align="left" style="border:1px solid #999;">Objekt</th>
          <th align="left" style="border:1px solid #999;">Jedinica</th>
          <th align="left" style="border:1px solid #999; background:#d1fae5;">Gosti ulaze</th>
          <th align="left" style="border:1px solid #999;">Opis</th>
          <th align="left" style="border:1px solid #999; background:#d1fae5;">Sljedeći ulazak</th>
          <th align="left" style="border:1px solid #999; background:#fff3cd;">Napomena</th>
        </tr>

        ${sveStavkeZaMail
          .map((s) => {
            // F3c: highlight + upozorenje vezani uz EFEKTIVNI datum čišćenja
            // (ulazak isti dan), ne više uz puki razmak===0 dan odlaska.
            const jeUlazakIstiDan = Boolean(s.ulazakIstiDan);

            const napomena = dodatnaPosteljinaText(s);

            return `
              <tr style="${jeUlazakIstiDan ? "background:#fff1f1;" : ""}">
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(
                  formatDate(s.datum)
                )}</td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#f0f9ff;">${escapeHtml(
                  ciscenjeOdZaTip(s.tip, s.ciscenjeOdOverride)
                )}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(
                  s.nazivObjekta || ""
                )}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(
                  s.nazivJedinice
                )}</td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#f0fdf4;">
                  ${escapeHtml(gostiUlazeText(s))}
                </td>
                <td style="border:1px solid #ccc; vertical-align:top;">
                  ${escapeHtml(s.opis || "")}
                  ${
                    jeUlazakIstiDan
                      ? `<div style="margin-top:6px; color:#b42318; font-weight:900; font-size:13px;">Ulazak isti dan - očistiti ujutro</div>`
                      : ""
                  }
                </td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#f0fdf4;">
                  ${escapeHtml(s.sljedeciUlazak || "-")}
                </td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#fffdf0;">
                  ${escapeHtml(napomena)}
                </td>
              </tr>
            `;
          })
          .join("")}
      </table>
      ${
        postavke.napomenaAgenciji && postavke.napomenaAgenciji.trim()
          ? `<div style="margin-top:20px; padding:14px 16px; background:#fff8e1; border:2px solid #ead28b;">
               <div style="margin:0 0 6px; background:transparent; font-weight:900; color:#7a4a0a; font-size:14px;">NAPOMENA</div>
               <div style="margin:0; background:transparent; font-size:14px; color:#111; line-height:1.5;">${escapeHtml(
                 postavke.napomenaAgenciji.trim()
               ).replaceAll("\n", "<br/>")}</div>
             </div>`
          : ""
      }

      <p style="margin-top:20px; font-size:14px;">
        Lijep pozdrav,<br/>
        <b>Malinska Stay</b>
      </p>
    </div>
  </div>
`;

  await resend.emails.send({
    from: "Malinska Stay <rezervacije@malinska-stay.hr>",
    to: agencija.email,
    cc: ccList,
    subject: narudzba.subject || "Raspored čišćenja",
    html,
    replyTo: "goran@malinska-stay.hr",
  });

  await prisma.ciscenjeNarudzba.update({
    where: {
      id: narudzba.id,
    },
    data: {
      poslanoEmail: true,
      poslanoAt: new Date(),
    },
  });

  // Jednokratna napomena agenciji — briše se TEK nakon stvarnog slanja maila.
  // (Rana grana "Nema stavki" i greška u resend.emails.send ne dođu dovde, pa
  // napomena ostaje za idući plan ako mail nije poslan.)
  if (postavke.napomenaAgenciji) {
    await prisma.ciscenjeMailPostavke.update({
      where: { id: postavke.id },
      data: { napomenaAgenciji: null },
    });
  }

  return {
    success: true,
    narudzbaId: narudzba.id,
  };
}