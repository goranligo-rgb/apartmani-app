import type { Locale } from "@/i18n/routing";

// Mail layer podržava 3 jezika: hr (domaći), de (njemački govorni gosti),
// en (univerzalni fallback za sve ostale).
//
// Routing.locales ima 8 jezika, ali za mailove svjesno reduciramo na 3 —
// prijevod 10 mailova × 8 jezika nije isplativ; en je zadovoljavajuć
// fallback za it/hu/pl/cs/sk goste.
export type MailJezik = "hr" | "en" | "de";

// Odabir jezika maila iz polja Gost.jezik. Nepoznata vrijednost (null,
// it/hu/pl/cs/sk, smeće) → "en".
export function odaberiJezikMaila(
  jezik: Locale | string | null | undefined
): MailJezik {
  if (jezik === "hr") return "hr";
  if (jezik === "de") return "de";
  if (jezik === "en") return "en";
  return "en";
}

const LOCALE_MAP: Record<MailJezik, string> = {
  hr: "hr-HR",
  en: "en-GB",
  de: "de-DE",
};

// Format datuma za mail (DD.MM.YYYY za hr/de, DD/MM/YYYY za en).
// Locale-aware kroz toLocaleDateString — bez ručnog stringbuilder-a.
export function formatDateZaMail(
  value: Date | string | null | undefined,
  jezik: MailJezik
): string {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString(LOCALE_MAP[jezik], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Format datuma + vremena za mail (locale-aware separator).
// Koristi se npr. za TTLock šifru "Šifra vrijedi od ... do ...".
// hr → "27.05.2026. 14:30" (varira po ICU), en → "27/05/2026, 14:30",
// de → "27.05.2026, 14:30". Za hr gosta output je byte-identičan
// trenutnoj lokalnoj formatDateTime() u ttlock fileu (oba koriste
// "hr-HR" + iste options).
export function formatDateTimeZaMail(
  value: Date | string | null | undefined,
  jezik: MailJezik
): string {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString(LOCALE_MAP[jezik], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Univerzalan format novca: "123.45 €". Ne lokaliziramo (zarez vs točka)
// kako bi račun u PDF-u i mail prikaz uvijek bili identični broj — jezik
// ne smije promijeniti iznos.
export function money(value?: number | null): string {
  return `${Number(value || 0).toFixed(2)} €`;
}
