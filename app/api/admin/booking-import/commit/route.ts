import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminSessionOk } from "@/lib/admin-auth";
import {
  parseBookingExcel,
  splitNositelj,
  type ExcelRow,
} from "@/lib/booking-excel";
import {
  OBJEKT_KEY_TO_NAZIV,
  type ObjektKey,
} from "@/lib/booking-unit-mapping";

export const dynamic = "force-dynamic";

function ymdKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidObjektKey(s: string): s is ObjektKey {
  return s === "EVA" || s === "MARTY" || s === "HOUSE_ART";
}

// Sigurno dijeljenje broja na N. Ako je input null/0, vraća null.
function divideMaybe(value: number | null, n: number): number | null {
  if (value === null || n <= 0) return null;
  return value / n;
}

export async function POST(req: Request) {
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Neispravan multipart body." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const objektKeyRaw = String(formData.get("objektKey") || "").trim();

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Nedostaje 'file' polje." },
      { status: 400 }
    );
  }

  if (!isValidObjektKey(objektKeyRaw)) {
    return NextResponse.json(
      { error: "Neispravan 'objektKey'. Očekujem EVA, MARTY ili HOUSE_ART." },
      { status: 400 }
    );
  }

  const objektKey: ObjektKey = objektKeyRaw;

  // Parse Excel
  let rows: ExcelRow[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    rows = parseBookingExcel(buffer, objektKey);
  } catch (err) {
    console.error("[BOOKING IMPORT COMMIT] Parse error:", err);
    return NextResponse.json(
      { error: "Ne mogu pročitati Excel datoteku." },
      { status: 400 }
    );
  }

  // TEMP DEBUG — obrisati nakon dijagnostike
  console.log("[BOOKING IMPORT DEBUG] Excel rows count:", rows.length);
  console.log("[BOOKING IMPORT DEBUG] First 3 rows datumi:");
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const r = rows[i];
    console.log(
      "Row",
      i,
      "- datumOd:",
      r.datumOd?.toISOString(),
      "datumDo:",
      r.datumDo?.toISOString()
    );
  }

  // Dohvati objekt + jedinice iz baze
  const objekt = await prisma.objekt.findFirst({
    where: { naziv: OBJEKT_KEY_TO_NAZIV[objektKey] },
    include: { jedinice: true },
  });

  if (!objekt) {
    return NextResponse.json(
      {
        error: `Objekt "${OBJEKT_KEY_TO_NAZIV[objektKey]}" nije pronađen u bazi.`,
      },
      { status: 400 }
    );
  }

  const jedinicaByNaziv = new Map<string, string>();
  for (const j of objekt.jedinice) {
    jedinicaByNaziv.set(j.naziv, j.id);
  }

  const jedinicaIds = objekt.jedinice.map((j) => j.id);
  const blokade =
    jedinicaIds.length > 0
      ? await prisma.blokadaVanjskogKalendara.findMany({
          where: { jedinicaId: { in: jedinicaIds } },
          select: {
            id: true,
            jedinicaId: true,
            datumOd: true,
            datumDo: true,
          },
        })
      : [];

  const blokadeByKey = new Map<string, string>();
  for (const b of blokade) {
    const key = `${b.jedinicaId}|${ymdKey(b.datumOd)}|${ymdKey(b.datumDo)}`;
    blokadeByKey.set(key, b.id);
  }

  // TEMP DEBUG — obrisati nakon dijagnostike
  console.log("[BOOKING IMPORT DEBUG] Blokade lookup keys (prvih 5):");
  let cnt = 0;
  for (const [key, id] of blokadeByKey.entries()) {
    console.log("  ", key);
    if (++cnt >= 5) break;
  }

  const writes: any[] = [];
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;
  let debugCnt = 0;

  for (const r of rows) {
    // Edge: neispravan datum → preskoči
    if (!r.datumOd || !r.datumDo) {
      skipped++;
      errors.push(
        `Red ${r.rowIndex} (${r.bookingId}): neispravan datum, preskačem.`
      );
      continue;
    }

    const odKey = ymdKey(r.datumOd);
    const doKey = ymdKey(r.datumDo);

    // TEMP DEBUG — obrisati nakon dijagnostike
    if (debugCnt < 5) {
      console.log(
        "[BOOKING IMPORT DEBUG] Row",
        r.rowIndex,
        "lookup key segment - od:",
        odKey,
        "do:",
        doKey
      );
      debugCnt++;
    }

    // Edge: cancelled_by_guest → preskoči.
    // iCal sync je jedini zadužen za brisanje blokada (kad UID nestane iz Booking feeda).
    // Excel import samo obogaćuje postojeće blokade; ne briše ništa.
    if (r.status === "cancelled_by_guest") {
      skipped++;
      continue;
    }

    // Standardno: UPDATE za svaku OK jedinicu retka
    // Multi-unit grupna rezervacija — cijena se dijeli na N, ali ostali podaci
    // se ponavljaju na svakoj blokadi.
    const n = r.jedinice.length;
    const iznosBrutoPoJedinici = divideMaybe(r.iznosBruto, n);
    const iznosProvizijePoJedinici = divideMaybe(r.iznosProvizije, n);
    const iznosNetoPoJedinici =
      iznosBrutoPoJedinici !== null
        ? iznosBrutoPoJedinici - (iznosProvizijePoJedinici || 0)
        : null;

    const { ime: gostIme, prezime: gostPrezime } = splitNositelj(r.nositelj);

    for (const tok of r.jedinice) {
      if (!tok.mapiranNaziv) {
        skipped++;
        continue;
      }
      const jedinicaId = jedinicaByNaziv.get(tok.mapiranNaziv);
      if (!jedinicaId) {
        skipped++;
        continue;
      }
      const lookupKey = `${jedinicaId}|${odKey}|${doKey}`;
      const blokadaId = blokadeByKey.get(lookupKey);
      if (!blokadaId) {
        skipped++;
        continue;
      }

      writes.push(
        prisma.blokadaVanjskogKalendara.update({
          where: { id: blokadaId },
          data: {
            gostIme: gostIme || null,
            gostPrezime: gostPrezime,
            gostTelefon: r.telefon,
            gostDrzava: r.drzava,
            brojOsoba: r.brojOsoba,
            brojOdraslih: r.brojOdraslih,
            brojDjece: r.brojDjece,
            dobDjece: r.dobDjece,
            iznosBruto: iznosBrutoPoJedinici,
            iznosProvizije: iznosProvizijePoJedinici,
            iznosNeto: iznosNetoPoJedinici,
            valuta: r.valuta || "EUR",
            bookingId: r.bookingId || null,
            excelImportiranoAt: new Date(),
          },
        })
      );
      updated++;
    }
  }

  const auditOp = prisma.bookingExcelImport.create({
    data: {
      objektKey,
      objektNaziv: objekt.naziv,
      imeFajla: file instanceof File ? file.name : null,
      brojRedakaUkupno: rows.length,
      brojObogaceno: updated,
      brojPreskoceno: skipped,
      brojGresaka: errors.length,
      greske: errors.length > 0 ? JSON.stringify(errors) : null,
      korisnikIme: null,
    },
  });

  try {
    await prisma.$transaction([...writes, auditOp]);
  } catch (err) {
    console.error("[BOOKING IMPORT COMMIT] Transaction error:", err);
    return NextResponse.json(
      {
        error: "Greška pri zapisivanju u bazu. Ništa nije promijenjeno.",
        details: String(err),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    summary: { updated, skipped, errors: errors.length },
    errors: errors.slice(0, 50),
  });
}
