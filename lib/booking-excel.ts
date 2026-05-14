import * as XLSX from "xlsx";
import {
  splitMultiUnit,
  mapUnitString,
  type ObjektKey,
} from "./booking-unit-mapping";

// Jedan red iz Booking "Prijava s kontaktnim podacima" Excela.
export type ExcelRow = {
  rowIndex: number;
  bookingId: string;
  nositelj: string;
  imeGosta: string;
  datumOd: Date | null;
  datumDo: Date | null;
  rezerviranoAt: Date | null;
  status: string; // "ok" | "cancelled_by_guest" | ostalo
  brojOsoba: number | null;
  brojOdraslih: number | null;
  brojDjece: number | null;
  dobDjece: string | null;
  iznosBruto: number | null;
  valuta: string;
  provizijaPostotak: number | null;
  iznosProvizije: number | null;
  drzava: string | null;
  vrstaJediniceRaw: string;
  jedinice: Array<{ raw: string; mapiranNaziv: string | null }>;
  brojNocenja: number | null;
  datumOtkazivanja: Date | null;
  telefon: string | null;
};

// Parsa "2079 EUR" → { iznos: 2079, valuta: "EUR" }
function parseCijena(s: string): { iznos: number | null; valuta: string } {
  if (!s) return { iznos: null, valuta: "EUR" };
  const m = String(s).trim().match(/^([\d.,]+)\s*([A-Z]{3})?$/i);
  if (!m) return { iznos: null, valuta: "EUR" };
  // Booking obično koristi točku kao decimalni separator. Zarez tretiramo
  // kao tisuće separator (npr. "2,079.50" → 2079.50) tako da ga maknemo
  // samo ako stoji ispred točno 3 znamenke.
  const numStr = m[1].replace(/,(?=\d{3}\b)/g, "");
  const iznos = Number(numStr);
  return {
    iznos: isNaN(iznos) ? null : iznos,
    valuta: (m[2] || "EUR").toUpperCase(),
  };
}

// Parsa Date ili string u Date | null. Uz cellDates: true u XLSX.read,
// datumske ćelije obično već dolaze kao Date objekti, ali raw: false ih
// može vratiti kao formatirani string ("2026-06-22"). Obrađujemo oba.
function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function parseInt0(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function parseFloat0(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

export function parseBookingExcel(
  buffer: Buffer | ArrayBuffer,
  objektKey: ObjektKey,
): ExcelRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  // Prvi red je header — preskači. Filter samo redove s Booking ID-em u koloni 0.
  const dataRows = rows
    .slice(1)
    .filter((r) => r && String(r[0] || "").trim().length > 0);

  return dataRows.map((r, i): ExcelRow => {
    const cijena = parseCijena(String(r[12] || ""));
    const vrstaRaw = String(r[21] || "").trim();
    const jediniceTokens = splitMultiUnit(vrstaRaw);

    return {
      rowIndex: i + 2, // +2 = 1 (header) + 1 (Excel je 1-indexed za korisnika)
      bookingId: String(r[0] || "").trim(),
      nositelj: String(r[1] || "").trim(),
      imeGosta: String(r[2] || "").trim(),
      datumOd: parseDate(r[3]),
      datumDo: parseDate(r[4]),
      rezerviranoAt: parseDate(r[5]),
      status: String(r[6] || "").trim().toLowerCase(),
      brojOsoba: parseInt0(r[8]),
      brojOdraslih: parseInt0(r[9]),
      brojDjece: parseInt0(r[10]),
      dobDjece: r[11] ? String(r[11]).trim() : null,
      iznosBruto: cijena.iznos,
      valuta: cijena.valuta,
      provizijaPostotak: parseFloat0(r[13]),
      iznosProvizije: parseFloat0(r[14]),
      drzava: r[18] ? String(r[18]).trim() : null,
      vrstaJediniceRaw: vrstaRaw,
      jedinice: jediniceTokens.map((tok) => ({
        raw: tok,
        mapiranNaziv: mapUnitString(tok, objektKey),
      })),
      brojNocenja: parseInt0(r[22]),
      datumOtkazivanja: parseDate(r[23]),
      telefon: r[25] ? String(r[25]).trim() : null,
    };
  });
}
