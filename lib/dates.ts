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

/**
 * Vraća trenutni dan tjedna i sat u Europe/Zagreb zoni.
 *
 * Koristi se za cron-driven okidače gdje je raspored definiran u lokalnom
 * vremenu (npr. "pošalji mail agenciji petkom u 08:00"). Vercel cron se vrti
 * u UTC, pa kod treba sam odlučiti je li trenutak podudaranja u lokalnoj zoni
 * — što ovo dvije godišnje skoka DST-a (CET ↔ CEST) automatski preživljava
 * jer se oslanja na Intl API umjesto na fiksni offset.
 *
 * dayOfWeek prati JS konvenciju: 0 = Nedjelja, 1 = Ponedjeljak, ..., 6 = Subota.
 * Time podudaranje s `saljiPonedjeljak/Utorak/...` poljima u `CiscenjeMailPostavke`
 * postaje običan switch (vidi `martyBazenZaDan` u `generirajINaPosalji.ts`).
 *
 * Primjer:
 *   UTC 2026-05-23 06:00 (CEST, ljeto)  → { dayOfWeek: 6, hour: 8 }
 *   UTC 2026-01-15 07:00 (CET, zima)    → { dayOfWeek: 4, hour: 8 }
 */
export function dohvatiZagrebDanISat(): { dayOfWeek: number; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ZAGREB_TZ,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hourStr = parts.find((p) => p.type === "hour")?.value || "0";

  // Intl s en-US locale vraća "Sun", "Mon", ...
  const mapa: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // hour "24" se ponekad pojavi za ponoć u en-US (kvirk Intl-a) — normaliziraj.
  const hourRaw = Number(hourStr);
  const hour = hourRaw === 24 ? 0 : hourRaw;

  return {
    dayOfWeek: mapa[weekday] ?? 0,
    hour,
  };
}

/**
 * Vraća offset zone Europe/Zagreb u milisekundama za DANI instant
 * (zagrebLokalno − UTC). Ljeti (CEST) = +2h = 7_200_000, zimi (CET) = +1h.
 *
 * Računa se preko Intl-a (ne fiksno), pa DST skok (zadnja nedjelja u ožujku /
 * listopadu) preživljava automatski. Trik: formatiramo instant u Zagreb zoni,
 * pa te iste komponente pročitamo kao da su UTC — razlika je offset.
 */
function zagrebOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ZAGREB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const p = dtf.formatToParts(instant);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  // "24" za ponoć je en-US kvirk — normaliziraj na 0.
  const hour = get("hour") === 24 ? 0 : get("hour");

  const kaoUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );

  return kaoUtc - instant.getTime();
}

/**
 * Hrvatski ZIDNI sat na danom datumu → ispravan UTC instant (DST-aware).
 *
 * Datum (godina/mjesec/dan) čita se iz UTC komponenti `baseDate` — to je
 * konzistentno s konvencijom baze gdje su `datumOd`/`datumDo` spremljeni kao
 * UTC PODNE tog hrvatskog dana (UTC dan == hrvatski dan u podne). Sat i minuta
 * su hrvatski zidni (npr. check-in 16:00). Vraćeni Date je apsolutni instant
 * koji TTLock-u (i bilo kome) daje točno to lokalno vrijeme.
 *
 * Primjer:
 *   zagrebWallClockToInstant(2026-07-15, 16, 0) → 2026-07-15T14:00:00.000Z
 *     (ljeto, CEST UTC+2: 16:00 lokalno = 14:00 UTC)
 *   zagrebWallClockToInstant(2026-01-15, 16, 0) → 2026-01-15T15:00:00.000Z
 *     (zima, CET UTC+1: 16:00 lokalno = 15:00 UTC)
 */
export function zagrebWallClockToInstant(
  baseDate: Date,
  sat: number,
  minuta: number
): Date {
  const y = baseDate.getUTCFullYear();
  const m = baseDate.getUTCMonth();
  const d = baseDate.getUTCDate();

  // Prva procjena: tretiraj zidni sat kao da je UTC, pa oduzmi zagrebački
  // offset. Offset računamo na samoj procjeni; jednom ga rafiniramo da
  // pokrijemo rubni slučaj kad procjena padne na drugu stranu DST skoka.
  const guess = Date.UTC(y, m, d, sat, minuta, 0, 0);
  let instant = guess - zagrebOffsetMs(new Date(guess));
  instant = guess - zagrebOffsetMs(new Date(instant));

  return new Date(instant);
}

/**
 * Prikaz datuma/vremena UVIJEK u zoni Europe/Zagreb.
 *
 * Tanak wrapper oko `Intl.DateTimeFormat` koji nasilno postavlja
 * `timeZone: "Europe/Zagreb"`, pa server (UTC na Vercelu) ne može iscuriti
 * UTC zidni sat u prikaz. Sve ostale opcije (locale, dateStyle, hour, …) se
 * prosljeđuju. Default locale je "hr-HR".
 *
 * Primjer:
 *   formatZagreb(2026-07-15T08:00:00Z, { hour: "2-digit", minute: "2-digit" })
 *     → "10:00"  (a ne "08:00")
 */
export function formatZagreb(
  d: Date,
  opts: Intl.DateTimeFormatOptions & { locale?: string } = {}
): string {
  const { locale = "hr-HR", ...rest } = opts;
  return new Intl.DateTimeFormat(locale, {
    timeZone: ZAGREB_TZ,
    ...rest,
  }).format(d);
}

/**
 * Normaliziraj datum na 12:00 UTC istog UTC kalendarskog dana.
 *
 * Konvencija: rezervacije i blokade se interpretiraju kao "od 12:00 do 12:00"
 * (smjena gosta). Različiti izvori trenutno spremaju s različitim satnim
 * konvencijama (BOOKING Excel = midnight, iCal sync = noon, admin = noon) —
 * normalizacija eliminira tu razliku pri usporedbi bez SQL migracije.
 */
export function normalizeToNoon(d: Date): Date {
  const n = new Date(d);
  n.setUTCHours(12, 0, 0, 0);
  return n;
}

/**
 * Provjerava preklapanje dva datumska intervala uz pravilo da smjena
 * istog dana (a.datumDo == b.datumOd na razini dana) NIJE preklapanje.
 * Standard hotel turnover convention.
 *
 * Primjeri:
 *   A: 02.08 - 07.08, B: 27.07 - 02.08 → NIJE overlap (turnover OK)
 *   A: 02.08 - 07.08, B: 27.07 - 03.08 → JEST overlap (02.08 oba)
 *   A: 02.08 - 07.08, B: 07.08 - 14.08 → NIJE overlap (drugi turnover)
 */
export function isRezervacijaOverlap(
  a: { datumOd: Date; datumDo: Date },
  b: { datumOd: Date; datumDo: Date },
): boolean {
  const aStart = normalizeToNoon(a.datumOd).getTime();
  const aEnd = normalizeToNoon(a.datumDo).getTime();
  const bStart = normalizeToNoon(b.datumOd).getTime();
  const bEnd = normalizeToNoon(b.datumDo).getTime();
  return aStart < bEnd && aEnd > bStart;
}
