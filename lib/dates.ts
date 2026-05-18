// Centralizirana TZ-aware date logika za Europe/Zagreb.
//
// Razlog: Vercel server radi u UTC. Postojeći patterni u codebase-u
// (`setHours(0, 0, 0, 0)`, `startOfDay()` u ciscenje libu) koriste server-local
// time, što na Vercel-u znači UTC midnight. To uzrokuje 1-day-off pomak u
// edge case-u kad je Croatian lokalno vrijeme između 00:00-02:00 (Croatian
// datum je dan kasnije od UTC datuma).
//
// Ovaj helper računa Croatian datum točno i vraća UTC midnight tog datuma,
// što je ispravna semantika za usporedbu s rezervacijskim datumOd
// (koji su spremljeni kao UTC NOON tog Croatian datuma — vidi iCal sync).

const ZAGREB_TZ = "Europe/Zagreb";

/**
 * Vraća UTC midnight Croatian-local "today".
 *
 * Primjer:
 *   Croatian 2026-05-18 23:00 (UTC 2026-05-18 21:00 CET / 22:00 CEST)
 *     → vraća new Date("2026-05-18T00:00:00.000Z")
 *
 *   Croatian 2026-05-19 01:00 (UTC 2026-05-18 23:00 CET / 22:00 CEST)
 *     → vraća new Date("2026-05-19T00:00:00.000Z")
 *
 * Konzistentno s konvencijom u bazi: datumOd je `new Date(y, m-1, d, 12, 0, 0)`
 * što se na UTC serveru sprema kao `YYYY-MM-DDT12:00:00.000Z`. Naša vrijednost
 * (UTC midnight Croatian datuma) je <= svih datumOd istog Croatian dana.
 */
export function startOfTodayInZagreb(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZAGREB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);

  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
