import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminSessionOk } from "@/lib/admin-auth";
import { parseBookingExcel, type ExcelRow } from "@/lib/booking-excel";
import {
  OBJEKT_KEY_TO_NAZIV,
  type ObjektKey,
} from "@/lib/booking-unit-mapping";

export const dynamic = "force-dynamic";

type JedinicaStatus = "OK" | "NEMA_BLOKADE" | "NEPOZNATA_JEDINICA";
type RowStatus =
  | "OK"
  | "DJELOMICNO"
  | "NEMA_BLOKADE"
  | "NEPOZNATA_JEDINICA"
  | "OTKAZANO"
  | "GRESKA";

function ymdKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidObjektKey(s: string): s is ObjektKey {
  return s === "EVA" || s === "MARTY" || s === "HOUSE_ART";
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
    console.error("[BOOKING IMPORT PREVIEW] Parse error:", err);
    return NextResponse.json(
      { error: "Ne mogu pročitati Excel datoteku. Provjeri format." },
      { status: 400 }
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

  const jedinicaByNaziv = new Map<string, { id: string; naziv: string }>();
  for (const j of objekt.jedinice) {
    jedinicaByNaziv.set(j.naziv, { id: j.id, naziv: j.naziv });
  }

  // Dohvati sve blokade za jedinice ovog objekta (1 query)
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

  // Lookup mapa: "jedinicaId|YYYY-MM-DD|YYYY-MM-DD" → blokadaId
  const blokadeByKey = new Map<string, string>();
  for (const b of blokade) {
    const key = `${b.jedinicaId}|${ymdKey(b.datumOd)}|${ymdKey(b.datumDo)}`;
    blokadeByKey.set(key, b.id);
  }

  const summary = {
    ok: 0,
    djelomicno: 0,
    nemaBlokade: 0,
    nepoznata: 0,
    otkazano: 0,
    greska: 0,
  };

  const outRows = rows.map((r) => {
    // Edge: neispravan datum
    if (!r.datumOd || !r.datumDo) {
      summary.greska++;
      return {
        rowIndex: r.rowIndex,
        bookingId: r.bookingId,
        imeGosta: r.imeGosta,
        nositelj: r.nositelj,
        datumOd: null,
        datumDo: null,
        brojNocenja: r.brojNocenja,
        brojOsoba: r.brojOsoba,
        iznosBruto: r.iznosBruto,
        valuta: r.valuta,
        drzava: r.drzava,
        telefon: r.telefon,
        vrstaJediniceRaw: r.vrstaJediniceRaw,
        jedinice: [],
        statusUkupno: "GRESKA" as RowStatus,
        greska: "Neispravan datum prijave ili odjave",
      };
    }

    // Edge: otkazano
    if (r.status === "cancelled_by_guest") {
      summary.otkazano++;
      return {
        rowIndex: r.rowIndex,
        bookingId: r.bookingId,
        imeGosta: r.imeGosta,
        nositelj: r.nositelj,
        datumOd: ymdKey(r.datumOd),
        datumDo: ymdKey(r.datumDo),
        brojNocenja: r.brojNocenja,
        brojOsoba: r.brojOsoba,
        iznosBruto: r.iznosBruto,
        valuta: r.valuta,
        drzava: r.drzava,
        telefon: r.telefon,
        vrstaJediniceRaw: r.vrstaJediniceRaw,
        jedinice: [],
        statusUkupno: "OTKAZANO" as RowStatus,
      };
    }

    // Procesiraj jedinice retka
    const odKey = ymdKey(r.datumOd);
    const doKey = ymdKey(r.datumDo);

    const jedinice = r.jedinice.map((tok) => {
      if (!tok.mapiranNaziv) {
        return {
          raw: tok.raw,
          mapiranNaziv: null,
          jedinicaId: null,
          blokadaId: null,
          status: "NEPOZNATA_JEDINICA" as JedinicaStatus,
        };
      }
      const j = jedinicaByNaziv.get(tok.mapiranNaziv);
      if (!j) {
        return {
          raw: tok.raw,
          mapiranNaziv: tok.mapiranNaziv,
          jedinicaId: null,
          blokadaId: null,
          status: "NEPOZNATA_JEDINICA" as JedinicaStatus,
        };
      }
      const lookupKey = `${j.id}|${odKey}|${doKey}`;
      const blokadaId = blokadeByKey.get(lookupKey) ?? null;
      return {
        raw: tok.raw,
        mapiranNaziv: tok.mapiranNaziv,
        jedinicaId: j.id,
        blokadaId,
        status: (blokadaId ? "OK" : "NEMA_BLOKADE") as JedinicaStatus,
      };
    });

    // Računaj statusUkupno
    let statusUkupno: RowStatus;
    if (jedinice.length === 0) {
      statusUkupno = "GRESKA";
      summary.greska++;
    } else {
      const okCount = jedinice.filter((j) => j.status === "OK").length;
      const nemaCount = jedinice.filter(
        (j) => j.status === "NEMA_BLOKADE"
      ).length;
      const nepoznataCount = jedinice.filter(
        (j) => j.status === "NEPOZNATA_JEDINICA"
      ).length;

      if (okCount === jedinice.length) {
        statusUkupno = "OK";
        summary.ok++;
      } else if (okCount > 0) {
        statusUkupno = "DJELOMICNO";
        summary.djelomicno++;
      } else if (nemaCount === jedinice.length) {
        statusUkupno = "NEMA_BLOKADE";
        summary.nemaBlokade++;
      } else if (nepoznataCount === jedinice.length) {
        statusUkupno = "NEPOZNATA_JEDINICA";
        summary.nepoznata++;
      } else {
        // mix nema_blokade + nepoznata
        statusUkupno = "NEMA_BLOKADE";
        summary.nemaBlokade++;
      }
    }

    return {
      rowIndex: r.rowIndex,
      bookingId: r.bookingId,
      imeGosta: r.imeGosta,
      nositelj: r.nositelj,
      datumOd: odKey,
      datumDo: doKey,
      brojNocenja: r.brojNocenja,
      brojOsoba: r.brojOsoba,
      iznosBruto: r.iznosBruto,
      valuta: r.valuta,
      drzava: r.drzava,
      telefon: r.telefon,
      vrstaJediniceRaw: r.vrstaJediniceRaw,
      jedinice,
      statusUkupno,
    };
  });

  return NextResponse.json({
    ok: true,
    objekt: {
      naziv: objekt.naziv,
      brojJedinica: objekt.jedinice.length,
    },
    summary,
    rows: outRows,
  });
}
