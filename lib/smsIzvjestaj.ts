// Sastavljanje dnevnog izvještaja vlasnici (ASCII, bez dijakritike u fiksnim
// labelama — imena gostiju idu kako jesu, isto kao check-in SMS). Čista funkcija
// bez Prisme da je testabilna i da cron ostane tanak.

import type { VrstaJedinice } from "@prisma/client";

export type IzvjestajStavka = { jedinica: string; gost: string };
export type IzvjestajPaznja = { jedinica: string; gost: string; datum: string };

// Kratka oznaka jedinice: "Eva 2" / "Marty 4" kako jest; House Art (KUCA) → "Kuca".
export function kratkaJedinica(naziv: string, vrsta: VrstaJedinice): string {
  return vrsta === "KUCA" ? "Kuca" : naziv;
}

function spoji(stavke: IzvjestajStavka[]): string {
  return stavke.map((x) => `${x.jedinica} ${x.gost}`).join(", ");
}

/**
 * Sastavi dnevni izvještaj SMS. Redovi: "Ulaz: ...", "Izlaz: ...",
 * "PAZNJA: ... - upisi TTLock i eCheckin". Prazni redovi se izostavljaju.
 * Vraća null ako nema niti jednog događaja (tada se SMS NE šalje).
 */
export function sastaviIzvjestajSms(p: {
  ulasci: IzvjestajStavka[];
  izlasci: IzvjestajStavka[];
  paznja: IzvjestajPaznja[];
}): string | null {
  const redovi: string[] = [];

  if (p.ulasci.length) redovi.push(`Ulaz: ${spoji(p.ulasci)}`);
  if (p.izlasci.length) redovi.push(`Izlaz: ${spoji(p.izlasci)}`);
  if (p.paznja.length) {
    const lista = p.paznja
      .map((x) => `${x.jedinica} ${x.gost} ${x.datum}`)
      .join(", ");
    redovi.push(`PAZNJA: ${lista} - upisi TTLock i eCheckin`);
  }

  return redovi.length ? redovi.join("\n") : null;
}
