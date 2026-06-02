// Zajednička logika za "dodatnu posteljinu i ručnike" u materijalima
// prema agenciji za čišćenje (mail + PDF). DB Zadatak.opis NE koristi ovo
// — on namjerno zadržava stari format koji čita admin tablica.

/**
 * Hrvatska gramatika uz broj: "za 1 osobu", "za 2 osobe", "za 5 osoba".
 */
export function osobaRijec(n: number): string {
  const abs = Math.abs(Math.trunc(Number(n) || 0));
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) return "osobu";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "osobe";
  return "osoba";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Broj osoba (X) za koje treba pripremiti dodatnu posteljinu i ručnike
 * pri završnom čišćenju (odlazak gosta A → sljedeći gost B u istoj jedinici).
 *
 * - razmak <= 4 dana: X = max(0, B.brojOsoba - osnovniKapacitet)
 * - razmak >= 5 dana ILI nema sljedećeg gosta: X = dodatniKapacitet
 */
export function izracunajDodatnuOsoba(params: {
  sljedecaRezervacija: { datumOd: Date; brojOsoba: number } | null;
  datumDo: Date;
  osnovniKapacitet: number;
  dodatniKapacitet: number;
}): number {
  const { sljedecaRezervacija, datumDo, osnovniKapacitet, dodatniKapacitet } =
    params;

  if (!sljedecaRezervacija) return Math.max(0, dodatniKapacitet || 0);

  const MS_DAN = 24 * 60 * 60 * 1000;
  const razmakDana = Math.round(
    (startOfDay(sljedecaRezervacija.datumOd).getTime() -
      startOfDay(datumDo).getTime()) /
      MS_DAN
  );

  if (razmakDana <= 4) {
    return Math.max(0, (sljedecaRezervacija.brojOsoba || 0) - (osnovniKapacitet || 0));
  }

  return Math.max(0, dodatniKapacitet || 0);
}

/**
 * Rečenica za dodatnu posteljinu; prazno ako X <= 0.
 */
export function dodatnaPosteljinaRecenica(x: number): string {
  if (!x || x <= 0) return "";
  return `Dodatni ručnici i posteljina za ${x} ${osobaRijec(x)}.`;
}

/**
 * Tekst za stupac "Sljedeći ulazak" (mail). Granica je IDENTIČNA onoj iz
 * izracunajDodatnuOsoba (razmak <= 4 → datum; >= 5 → bez datuma).
 *
 * - razmak 0       → "BRZI ULAZAK isti dan" (jeBrziUlazak = true)
 * - razmak 1       → "Dan poslije (DD.MM.YYYY)"
 * - razmak 2..4    → "DD.MM.YYYY"
 * - razmak >= 5    → "—"
 * - nema sljedeće  → "—"
 *
 * formatDate se injektira da lokale ostanu u pozivatelju.
 */
export function sljedeciUlazakTekst(params: {
  sljedecaRezervacija: { datumOd: Date } | null;
  datumDo: Date;
  formatDate: (d: Date) => string;
}): { tekst: string; jeBrziUlazak: boolean } {
  if (!params.sljedecaRezervacija) {
    return { tekst: "—", jeBrziUlazak: false };
  }

  const MS_DAN = 24 * 60 * 60 * 1000;
  const razmak = Math.round(
    (startOfDay(params.sljedecaRezervacija.datumOd).getTime() -
      startOfDay(params.datumDo).getTime()) /
      MS_DAN
  );

  if (razmak === 0) {
    return { tekst: "BRZI ULAZAK isti dan", jeBrziUlazak: true };
  }
  if (razmak === 1) {
    return {
      tekst: `Dan poslije (${params.formatDate(params.sljedecaRezervacija.datumOd)})`,
      jeBrziUlazak: false,
    };
  }
  if (razmak >= 2 && razmak <= 4) {
    return {
      tekst: params.formatDate(params.sljedecaRezervacija.datumOd),
      jeBrziUlazak: false,
    };
  }

  // razmak >= 5
  return { tekst: "—", jeBrziUlazak: false };
}
