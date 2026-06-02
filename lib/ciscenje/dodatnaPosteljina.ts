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
