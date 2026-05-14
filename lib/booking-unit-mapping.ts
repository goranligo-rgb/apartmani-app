// Mapping iz Booking "Vrsta jedinice" stringa u našu Jedinicu (po nazivu).
//
// Booking šalje single-property export per Extranet — ne postoji kolona
// "Ime objekta" u Excelu. Admin u UI-ju eksplicitno bira objekt prije uploada,
// pa svaki red unutar jednog uploada pripada istom objektu.
//
// Eva i Marty oba koriste oznake "Ap 1", "Ap 2", "Ap 3" — bez ove kontekstualne
// odluke (odabir objekta u UI-ju), nije moguće disambigvirati.
//
// Booking export može imati:
//   - jedan apartman:    "Ap 4, 1 kat"
//   - razmak prije zareza: "Ap 4 , 1 kat"
//   - multi-unit:        "Ap 4, 1 kat, Ap 3, 1 kat s terasom"
//   - cijelu kuću:       "Cijela kuća"

export type ObjektKey = "EVA" | "MARTY" | "HOUSE_ART";

// Mapping ObjektKey → Objekt.naziv u bazi (za lookup i prikaz u dropdownu).
export const OBJEKT_KEY_TO_NAZIV: Record<ObjektKey, string> = {
  EVA: "Apartments Eva",
  MARTY: "Luxury Apartments Marty",
  HOUSE_ART: "House Art",
};

// Apartman broj → naziv jedinice u bazi (Jedinica.naziv), grupirano po objektu.
const UNIT_MAP_PO_OBJEKTU: Record<ObjektKey, Record<string, string>> = {
  EVA: {
    "1": "Eva 1",
    "2": "Eva 2",
    "3": "Eva 3",
  },
  MARTY: {
    "1": "Marty 1",
    "2": "Marty 2",
    "3": "Marty 3",
    "4": "Marty 4",
    "5": "Marty 5",
  },
  // House Art ima samo jednu jedinicu, mapira se preko "Cijela kuća"
  HOUSE_ART: {},
};

// "Cijela kuća" → Jedinica.naziv samo za House Art objekt.
const CIJELA_KUCA_NAZIV: Record<ObjektKey, string | null> = {
  EVA: null,
  MARTY: null,
  HOUSE_ART: "House Art",
};

// Normalizira whitespace oko zareza:
//   "Ap 4 ,   1 kat"  →  "Ap 4, 1 kat"
//   "Cijela  kuća"    →  "Cijela kuća"
export function normalizeUnitString(s: string): string {
  return s
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

// Razdvoji multi-unit string u listu pojedinačnih jedinica.
// Lookahead na "Ap N" ili "Cijela kuća" — split BEFORE svakog početka jedinice.
// Trailing zarezi/razmaci se uklanjaju nakon splita.
export function splitMultiUnit(raw: string): string[] {
  const normalized = normalizeUnitString(raw);
  if (!normalized) return [];

  const parts = normalized.split(/(?=Ap\s*\d|Cijela kuća)/gi);

  return parts
    .map((p) => p.replace(/[,\s]+$/, "").trim())
    .filter((p) => p.length > 0);
}

// Mapiraj jedan token (npr. "Ap 4, 1 kat") na naziv jedinice u bazi (npr. "Marty 4"),
// u kontekstu odabranog objekta. Vraća null ako ne prepoznajemo ili ako token ne
// pripada tom objektu (npr. "Cijela kuća" s odabranim MARTY → null).
export function mapUnitString(raw: string, objekt: ObjektKey): string | null {
  const normalized = normalizeUnitString(raw);
  if (!normalized) return null;

  // "Cijela kuća" valjano SAMO za House Art
  if (/^cijela\s+ku/i.test(normalized)) {
    return CIJELA_KUCA_NAZIV[objekt];
  }

  // "Ap N" — match po broju u kontekstu odabranog objekta
  const m = normalized.match(/^Ap\s*(\d+)/i);
  if (m) {
    return UNIT_MAP_PO_OBJEKTU[objekt][m[1]] ?? null;
  }

  return null;
}
