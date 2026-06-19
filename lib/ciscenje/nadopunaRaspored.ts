// ── Read-only raspored čišćenja za NADOPUNA mail ──
//
// Ovaj modul postoji da bi izvanredni (nadopuna) mail izgledao IDENTIČNO kao
// tjedni plan (`generirajINaPosalji.ts`), a da se tjedni NE dira ni za jedan
// znak. Tjedni je "svetinja" / bajt-identičan — pa ovdje namjerno dupliciramo
// izračun i render tablice.
//
// KLJUČNO — ovaj modul je 100% READ-ONLY. NIGDJE ne smije pozvati:
//   - findOrCreateZadatak / prisma.zadatak.create
//   - upsertTrosak / prisma.trosak.create|update
//   - prisma.ciscenjeNarudzba.create
//   - resend.emails.send
//   - prisma.ciscenjeMailPostavke.update (Kristinina napomena se NE dira)
// Samo `findMany`/`findFirst` čitanja + gradnja HTML stringa.
//
// Zajedničku "poslovnu" logiku (sljedeći ulazak, dodatna posteljina, skori
// ulazak) NE kopiramo — importamo je iz `dodatnaPosteljina.ts`, isto kao tjedni,
// pa je izgled garantirano isti. Dupliciramo samo trivijalne format/util
// helpere i sam HTML markup tablice.

import { prisma } from "@/lib/prisma";
import {
  osobaRijec,
  izracunajDodatnuOsoba,
  dodatnaPosteljinaRecenica,
  sljedeciUlazakTekst,
  jeSkoriUlazak,
} from "@/lib/ciscenje/dodatnaPosteljina";
// Isti predikat dana kao tjedni (jedini izvor istine) — render ostaje 1:1.
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

// ── Oblik jednog retka plana ──
// Identičan "valuti" koju tjedni gradi (stavkeApartmani/medjuciscenje/bazen/
// stubiste). Render zna čitati samo ova polja.
export type StavkaPlana = {
  datum: Date;
  tip: "ZAVRSNO_CISCENJE" | "MEDJUCISCENJE_I_POSTELJINA" | "DODATNO_CISCENJE";
  nazivJedinice: string;
  nazivObjekta: string;
  brojGostiju: number;
  // Broj gostiju koji ULAZE (sljedeća rezervacija). null kad nema ulaza.
  brojGostijuUlaz?: number | null;
  imaSkoriUlazak?: boolean;
  ukupniKapacitet?: number;
  osnovniKapacitet: number;
  dodatnaOsoba?: number;
  opis: string;
  sljedeciUlazak: string;
  jeBrziUlazak?: boolean;
  // F3c: efektivni datum čišćenja pada BAŠ na dan dolaska sljedećeg gosta
  // (ulazak isti dan → očistiti ujutro). Vodi highlight + upozorenje u renderu.
  ulazakIstiDan?: boolean;
  // Per-slučaj override vremena "Čišćenje od" ("HH:MM"). U F1 se ne postavlja
  // (uvijek globalni default); ožičava se u F2.
  ciscenjeOdOverride?: string | null;
};

// ── Format/util helperi (trivijalni — duplikat iz tjednog je bezopasan) ──

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// "ponedjeljak, 09.06.2026." — isti format kao stupac "Datum odlaska" u tjednom.
function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Kratki numerički datum "DD.MM.YYYY." za stupac "Sljedeći ulazak".
function formatDatumKratko(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}.`;
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// READ-ONLY pandan tjednom `findNextReservation` — sljedeća rezervacija u istoj
// jedinici nakon datumDo (za stupce "Gosti ulaze" / "Sljedeći ulazak").
async function findNextReservation(
  jedinicaId: string,
  currentReservationId: string,
  datumDo: Date
) {
  return prisma.rezervacija.findFirst({
    where: {
      id: { not: currentReservationId },
      jedinicaId,
      status: { not: "OTKAZANO" },
      // Sljedeći ULAZ po DANU, ne po instantu: granica = početak-dana odlaska
      // (UTC ponoć). Tako booking-ulaz spremljen na 00:00 (isti dan kao admin-
      // odlazak na 12:00) ne padne kroz filter. `orderBy datumOd asc` i dalje
      // hvata NAJRANIJI ulaz (npr. ulaz isti dan, ne kasniji 7 dana poslije).
      datumOd: { gte: pocetakDanaUtc(datumDo) },
    },
    include: { gost: true },
    orderBy: { datumOd: "asc" },
  });
}

// Gradi JEDAN ZAVRSNO_CISCENJE redak iz rezervacije (ista logika kao tjedni
// `stavkeApartmani.map`, ali BEZ findOrCreateZadatak/upsertTrosak). Koristi se
// i za gornji "NOVO" red i interno za donji raspored.
async function stavkaZaZavrsnoCiscenje(r: {
  id: string;
  jedinicaId: string;
  datumDo: Date;
  brojOsoba: number | null;
  // Per-slučaj vrijeme "Čišćenje od" (override); null = fiksni default 10:00.
  ciscenjeOdOverride?: string | null;
  // Pomak završnog čišćenja u danima (F3a); 0/undefined = bez pomaka.
  odgodaCiscenjaDana?: number | null;
  jedinica: {
    naziv: string;
    osnovniKapacitet: number | null;
    dodatniKapacitet: number | null;
    ukupniKapacitet: number | null;
    objekt: { naziv: string };
  };
}): Promise<StavkaPlana> {
  const sljedecaRezervacija = await findNextReservation(
    r.jedinicaId,
    r.id,
    r.datumDo
  );

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

  const imaSkoriUlazak = jeSkoriUlazak({
    sljedecaRezervacija,
    datumDo: r.datumDo,
  });

  // Efektivni (pomaknuti) datum čišćenja — isti račun kao tjedni; koristi se i
  // za redak i za "ulazak isti dan" upozorenje (F3c).
  const efektivni = efektivniDatumCiscenja(r.datumDo, r.odgodaCiscenjaDana);

  return {
    datum: efektivni,
    tip: "ZAVRSNO_CISCENJE",
    nazivJedinice: r.jedinica.naziv,
    nazivObjekta: r.jedinica.objekt.naziv,
    brojGostiju: r.brojOsoba || 0,
    brojGostijuUlaz: sljedecaRezervacija?.brojOsoba ?? null,
    imaSkoriUlazak,
    ukupniKapacitet: r.jedinica.ukupniKapacitet || 0,
    osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
    dodatnaOsoba,
    opis: "Čišćenje nakon odlaska gosta.",
    sljedeciUlazak: ulazInfo.tekst,
    jeBrziUlazak: ulazInfo.jeBrziUlazak,
    // F3c: ulazak isti dan računat na EFEKTIVNI datum (ne dan odlaska).
    ulazakIstiDan: ulazakIstiDan(efektivni, sljedecaRezervacija?.datumOd ?? null),
    ciscenjeOdOverride: r.ciscenjeOdOverride ?? null,
  };
}

/**
 * Gradi gornji "NOVO" red(ove) — jedna ZAVRSNO_CISCENJE stavka po novoj
 * rezervaciji, u istom obliku kao donji raspored (bez imena gosta).
 */
export async function stavkaZaNovuRezervaciju(r: {
  id: string;
  jedinicaId: string;
  datumDo: Date;
  brojOsoba: number | null;
  // Per-slučaj vrijeme "Čišćenje od" (override); null = fiksni default 10:00.
  ciscenjeOdOverride?: string | null;
  // Pomak završnog čišćenja u danima (F3a); 0/undefined = bez pomaka.
  odgodaCiscenjaDana?: number | null;
  jedinica: {
    naziv: string;
    osnovniKapacitet: number | null;
    dodatniKapacitet: number | null;
    ukupniKapacitet: number | null;
    objekt: { naziv: string };
  };
}): Promise<StavkaPlana> {
  return stavkaZaZavrsnoCiscenje(r);
}

/**
 * READ-ONLY izračun cijelog rasporeda za period [danas, doDatuma] — kopija
 * logike iz `generirajINaPosalji` (apartmani + međučišćenje + Marty bazen +
 * Eva stubište), ali BEZ ijedne nuspojave: ne kreira Zadatak/Trosak/Narudzba,
 * ne šalje mail, ne dira Kristininu napomenu. Vraća samo stavke za render.
 */
export async function izracunajRasporedZaPeriod(
  danas: Date,
  doDatuma: Date,
  postavke: any
): Promise<StavkaPlana[]> {
  // 1) Apartmani — završna čišćenja po odlasku gosta.
  const rezervacijeZaOdlazak = await prisma.rezervacija.findMany({
    where: {
      status: { not: "OTKAZANO" },
      automatskoCiscenje: true,
      datumDo: { gte: danas, lte: doDatuma },
    },
    include: {
      gost: true,
      jedinica: { include: { objekt: true } },
    },
    orderBy: [{ datumDo: "asc" }],
  });

  const stavkeApartmani = await Promise.all(
    rezervacijeZaOdlazak.map((r) => stavkaZaZavrsnoCiscenje(r))
  );

  // 2) Međučišćenje + posteljina — boravci dulji od 7 noći.
  const duzeRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: { not: "OTKAZANO" },
      automatskoCiscenje: true,
      automatskaPosteljina: true,
      brojNocenja: { gt: 7 },
      datumOd: { lt: doDatuma },
      datumDo: { gt: danas },
    },
    include: {
      gost: true,
      jedinica: { include: { objekt: true } },
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const stavkeMedjuciscenje: StavkaPlana[] = [];

  for (const r of duzeRezervacije) {
    const pocetak = startOfDay(r.datumOd);
    const kraj = startOfDay(r.datumDo);

    const polaBoravka = Math.floor(Number(r.brojNocenja || 0) / 2);
    const datumMedjuciscenja = addDays(pocetak, polaBoravka);

    if (datumMedjuciscenja <= pocetak || datumMedjuciscenja >= kraj) {
      continue;
    }

    if (datumMedjuciscenja < danas || datumMedjuciscenja > doDatuma) {
      continue;
    }

    stavkeMedjuciscenje.push({
      datum: new Date(datumMedjuciscenja),
      tip: "MEDJUCISCENJE_I_POSTELJINA",
      nazivJedinice: r.jedinica.naziv,
      nazivObjekta: r.jedinica.objekt.naziv,
      brojGostiju: r.brojOsoba || 0,
      osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
      opis: `Međučišćenje - kompletna zamjena posteljine i ručnika za ${
        r.brojOsoba || 0
      } ${osobaRijec(r.brojOsoba || 0)}.`,
      sljedeciUlazak: "Gost ostaje u smještaju",
    });
  }

  // 3) Marty bazen / okoliš — po danima iz postavki.
  const prvaJedinica = await prisma.jedinica.findFirst({
    where: { objekt: { naziv: { contains: "Marty" } } },
    include: { objekt: true },
  });

  const stavkeBazen: StavkaPlana[] = [];

  if (prvaJedinica) {
    let d = danas;

    while (d <= doDatuma) {
      if (martyBazenZaDan(postavke, d)) {
        stavkeBazen.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE",
          nazivJedinice: "Marty bazen / okoliš",
          nazivObjekta: prvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis: "Čišćenje oko bazena i roštilja.",
          sljedeciUlazak: "-",
        });
      }

      d = addDays(d, 1);
    }
  }

  // 4) Stubište Eva — paralela s Marty bazenom (settings dani).
  const prvaEvaJedinica = await prisma.jedinica.findFirst({
    where: { objekt: { naziv: { contains: "Eva" } } },
    include: { objekt: true },
    orderBy: { sortOrder: "asc" },
  });

  const stavkeStubiste: StavkaPlana[] = [];

  if (prvaEvaJedinica) {
    let d = danas;

    while (d <= doDatuma) {
      if (evaStubisteZaDan(postavke, d)) {
        stavkeStubiste.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE",
          nazivJedinice: "Stubište Eva",
          nazivObjekta: prvaEvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis: "Čišćenje stubišta zajedničkih prostorija",
          sljedeciUlazak: "-",
        });
      }

      d = addDays(d, 1);
    }
  }

  // 5) Stubište Marty — isto kao Eva, ali preko prve Marty jedinice
  // (`prvaJedinica`, dohvaćena gore za bazen). Oblik retka identičan Evi.
  const stavkeStubisteMarty: StavkaPlana[] = [];

  if (prvaJedinica) {
    let d = danas;

    while (d <= doDatuma) {
      if (martyStubisteZaDan(postavke, d)) {
        stavkeStubisteMarty.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE",
          nazivJedinice: "Stubište Marty",
          nazivObjekta: prvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis: "Čišćenje stubišta zajedničkih prostorija",
          sljedeciUlazak: "-",
        });
      }

      d = addDays(d, 1);
    }
  }

  return [
    ...stavkeApartmani,
    ...stavkeMedjuciscenje,
    ...stavkeBazen,
    ...stavkeStubiste,
    ...stavkeStubisteMarty,
  ].sort((a, b) => a.datum.getTime() - b.datum.getTime());
}

// ── Render ──
// Markup je 1:1 kopija tablice iz tjednog (`generirajINaPosalji` :638-687),
// ali BEZ Kristininog žutog "NAPOMENA" bloka ispod tablice (odluka: nadopuna
// taj blok ne prikazuje). Per-redak stupac "Napomena" (posteljina) ostaje.

// Stupac "Gosti ulaze": za završno čišćenje SAMO broj — gosti koji ULAZE
// (ako ima skori ulazak) ili puni kapacitet jedinice. Ostali tipovi → "-".
function gostiUlazeText(s: StavkaPlana) {
  if (s.tip !== "ZAVRSNO_CISCENJE") return "-";

  if (s.imaSkoriUlazak && Number(s.brojGostijuUlaz || 0) > 0) {
    return String(s.brojGostijuUlaz);
  }

  if (Number(s.ukupniKapacitet || 0) > 0) {
    return String(s.ukupniKapacitet);
  }

  return "-";
}

function dodatnaPosteljinaText(s: StavkaPlana) {
  // Za završno čišćenje koristimo isti X kao u opisu (s.dodatnaOsoba); za ostale
  // tipove fallback na staru procjenu (brojGostiju - osnovniKapacitet).
  const dodatnoOsoba =
    typeof s.dodatnaOsoba === "number"
      ? s.dodatnaOsoba
      : Math.max(0, Number(s.brojGostiju || 0) - Number(s.osnovniKapacitet || 0));

  if (dodatnoOsoba <= 0) return "—";

  return dodatnaPosteljinaRecenica(dodatnoOsoba);
}

/**
 * Renderira tablicu plana (header + redovi) kao HTML string — isti izgled kao
 * tjedni. Bez Kristininog žutog napomena bloka. Vraća samo `<table>…</table>`;
 * vanjski okvir maila gradi pozivatelj (nadopuna).
 */
export function renderTablicaPlana(stavke: StavkaPlana[]): string {
  return `
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

        ${stavke
          .map((s) => {
            // F3c: highlight + upozorenje vezani uz EFEKTIVNI datum (ulazak isti
            // dan), ne više uz puki razmak===0 dan odlaska. Identično tjednom.
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
`;
}
