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
import { startOfTodayInZagreb } from "@/lib/dates";
import { drzavaUJezik } from "@/lib/jezik";
import { mozdaPosaljiNadopunu } from "@/lib/ciscenje/mozdaPosaljiNadopunu";

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
            uid: true,
            naslov: true,
            valuta: true,
            gostEmail: true,
          },
        })
      : [];

  type BlokadaInfo = {
    id: string;
    uid: string | null;
    naslov: string | null;
    valuta: string;
    gostEmail: string | null;
  };
  const blokadeByKey = new Map<string, BlokadaInfo>();
  for (const b of blokade) {
    const key = `${b.jedinicaId}|${ymdKey(b.datumOd)}|${ymdKey(b.datumDo)}`;
    blokadeByKey.set(key, {
      id: b.id,
      uid: b.uid,
      naslov: b.naslov,
      valuta: b.valuta,
      gostEmail: b.gostEmail,
    });
  }

  type BlokadaUpdate = {
    id: string;
    data: {
      gostIme: string | null;
      gostPrezime: string | null;
      gostTelefon: string | null;
      gostDrzava: string | null;
      brojOsoba: number | null;
      brojOdraslih: number | null;
      brojDjece: number | null;
      dobDjece: string | null;
      iznosBruto: number | null;
      iznosProvizije: number | null;
      iznosNeto: number | null;
      valuta: string;
      bookingId: string | null;
      excelImportiranoAt: Date;
    };
  };

  type ShadowOp = {
    blokadaId: string;
    icalUid: string;
    jedinicaId: string;
    datumOd: Date;
    datumDo: Date;
    gostIme: string | null;
    gostPrezime: string | null;
    gostEmail: string | null;
    gostTelefon: string | null;
    gostDrzava: string | null;
    brojOsoba: number | null;
    iznosBruto: number | null;
    bookingId: string | null;
    valuta: string;
    naslov: string | null;
  };

  const blokadaUpdates: BlokadaUpdate[] = [];
  const shadowOps: ShadowOp[] = [];
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

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

      const blokadaInfo = blokadeByKey.get(lookupKey);
      if (!blokadaInfo) {
        skipped++;
        continue;
      }

      blokadaUpdates.push({
        id: blokadaInfo.id,
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
      });

      // Shadow Rezervaciju kreiramo samo ako blokada ima iCal UID
      // (stabilan ključ kroz iCal sync). Bez UID-a (npr. ručno kreirane blokade)
      // ne možemo garantirati idempotentnost re-importa.
      if (blokadaInfo.uid) {
        shadowOps.push({
          blokadaId: blokadaInfo.id,
          icalUid: blokadaInfo.uid,
          jedinicaId,
          datumOd: r.datumOd,
          datumDo: r.datumDo,
          gostIme: gostIme || null,
          gostPrezime,
          gostEmail: blokadaInfo.gostEmail,
          gostTelefon: r.telefon,
          gostDrzava: r.drzava,
          brojOsoba: r.brojOsoba,
          iznosBruto: iznosBrutoPoJedinici,
          bookingId: r.bookingId || null,
          valuta: r.valuta || blokadaInfo.valuta || "EUR",
          naslov: blokadaInfo.naslov,
        });
      }

      updated++;
    }
  }

  // FULL REPLACE: prikupimo postojeće BOOKING rezervacije za ovaj objekt
  // od današnjeg datuma (Europe/Zagreb) pa nadalje. Brišemo ih PRIJE kreiranja
  // novih iz Excel-a, da Excel postane jedini izvor istine za buduće rezervacije.
  // Prošli datumi (datumOd < today) ostaju netaknuti i upsert-aju se po UID-u.
  const today = startOfTodayInZagreb();
  const obrisaneRez: Array<{
    id: string;
    datumOd: string;
    datumDo: string;
    gostIme: string;
    iznos: number | null;
  }> = [];
  let brojObrisano = 0;

  // ID-evi STVARNO novokreiranih Shadow Rezervacija (samo iz `tx.rezervacija.create`
  // grane niže, NE iz idempotentnog update-a postojećih po icalUid-u).
  // Koristi ih PR2 nadopuna helper poslije transakcije — kritično je da
  // Excel re-uvoz NE pošalje agenciji nadopunu za rezervacije koje su
  // već postojale u bazi.
  const noviRezervacijeIds: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        // 0. FULL REPLACE: find + delete postojeće BOOKING rezervacije za ovaj objekt
        //    s datumOd >= today (Europe/Zagreb). Cascade auto-briše Placanja/Racuni/
        //    Emailove/Promjene (sve su 0 za BOOKING flow). Ne dira Blokade ni Goste.
        const postojece = await tx.rezervacija.findMany({
          where: {
            izvor: "BOOKING",
            jedinica: { objektId: objekt.id },
            datumOd: { gte: today },
          },
          include: {
            gost: { select: { ime: true, prezime: true } },
          },
        });

        for (const r of postojece) {
          const gostIme = r.gost
            ? `${r.gost.ime ?? ""} ${r.gost.prezime ?? ""}`.trim() || "(bez imena)"
            : "(bez gosta)";
          obrisaneRez.push({
            id: r.id,
            datumOd: ymdKey(r.datumOd),
            datumDo: ymdKey(r.datumDo),
            gostIme,
            iznos: r.iznosUkupno,
          });
        }

        if (postojece.length > 0) {
          const res = await tx.rezervacija.deleteMany({
            where: { id: { in: postojece.map((r) => r.id) } },
          });
          brojObrisano = res.count;
        }

        // 1. UPDATE blokada (Excel obogaćivanje)
        for (const u of blokadaUpdates) {
          await tx.blokadaVanjskogKalendara.update({
            where: { id: u.id },
            data: u.data,
          });
        }

        // 2. Per blokada: find-or-create Shadow Rezervacija (idempotentno)
        //
        // KLJUČ: bookingIcalUid (stabilan kroz iCal sync), NE blokadaId.
        // iCal sync briše/kreira blokade s novim UUID-evima ali istim UID-em,
        // pa blokadaId nije pouzdan ključ za vezu Rezervacije.
        //
        // Idempotentnost: ako Shadow Rezervacija već postoji za UID,
        // SAMO update-amo iznose + bookingExternalId + osvježeni blokadaId.
        // Gost se NE dira (ni novi se ne kreira), čime izbjegavamo duplikat
        // Gost-ova pri re-importu istog Excel-a.
        //
        // NAPOMENA: Excel trenutno NE postavlja gostEmail na blokadu, pa će
        // email-upsert grana raditi samo ako je email došao iz drugog izvora.
        for (const op of shadowOps) {
          const existing = await tx.rezervacija.findUnique({
            where: { bookingIcalUid: op.icalUid },
            select: { id: true },
          });

          if (existing) {
            await tx.rezervacija.update({
              where: { bookingIcalUid: op.icalUid },
              data: {
                iznosUkupno: op.iznosBruto,
                iznosPlaceno: op.iznosBruto,
                dogovoreniIznos: op.iznosBruto,
                bookingExternalId: op.bookingId,
                blokadaId: op.blokadaId,
              },
            });
            continue;
          }

          let gostId: string | null = null;

          // Mapiraj državu u jezik (booking ISO kod → routing locale).
          // Booking je slabiji signal od weba; jezik NE prepisujemo na postojećem
          // gostu — koristimo "fill if null" obrazac niže.
          const bookingJezik = drzavaUJezik(op.gostDrzava);

          if (op.gostEmail) {
            const g = await tx.gost.upsert({
              where: { email: op.gostEmail },
              create: {
                ime: op.gostIme || "Booking gost",
                prezime: op.gostPrezime,
                email: op.gostEmail,
                telefon: op.gostTelefon,
                drzava: op.gostDrzava,
                jezik: bookingJezik,
              },
              update: {
                ime: op.gostIme || undefined,
                prezime: op.gostPrezime,
                telefon: op.gostTelefon,
                drzava: op.gostDrzava,
              },
            });
            gostId = g.id;

            // Postojeći gost bez jezika dobiva ga iz booking signala; ako već
            // ima jezik (npr. web ga je postavio), NE diramo.
            if (bookingJezik && g.jezik == null) {
              await tx.gost.update({
                where: { id: g.id },
                data: { jezik: bookingJezik },
              });
            }
          } else if (op.gostIme) {
            const g = await tx.gost.create({
              data: {
                ime: op.gostIme,
                prezime: op.gostPrezime,
                telefon: op.gostTelefon,
                drzava: op.gostDrzava,
                jezik: bookingJezik,
              },
            });
            gostId = g.id;
          }

          const noci = Math.max(
            Math.round(
              (op.datumDo.getTime() - op.datumOd.getTime()) / 86400000
            ),
            1
          );

          // STVARNO nova Shadow Rezervacija — capture id za PR2 nadopuna helper.
          // Grana iznad (existing → update + continue) NE zapisuje u noviRezervacijeIds.
          const novaRez = await tx.rezervacija.create({
            data: {
              jedinicaId: op.jedinicaId,
              gostId,
              izvor: "BOOKING",
              status: "PLACENO",
              datumOd: op.datumOd,
              datumDo: op.datumDo,
              brojNocenja: noci,
              brojOsoba: op.brojOsoba ?? 2,
              iznosUkupno: op.iznosBruto,
              iznosPlaceno: op.iznosBruto,
              dogovoreniIznos: op.iznosBruto,
              valuta: op.valuta,
              placenoKarticom: true,
              bookingExternalId: op.bookingId,
              blokadaId: op.blokadaId,
              bookingIcalUid: op.icalUid,
              napomena: op.naslov,
              automatskoCiscenje: true,
              automatskaPosteljina: true,
            },
            select: { id: true },
          });

          noviRezervacijeIds.push(novaRez.id);
        }

        // 3. Audit log — uključuje brojObrisano + listu obrisanih rezervacija
        //    iz FULL REPLACE koraka 0.
        await tx.bookingExcelImport.create({
          data: {
            objektKey,
            objektNaziv: objekt.naziv,
            imeFajla: file instanceof File ? file.name : null,
            brojRedakaUkupno: rows.length,
            brojObogaceno: updated,
            brojPreskoceno: skipped,
            brojGresaka: errors.length,
            brojObrisano,
            greske: errors.length > 0 ? JSON.stringify(errors) : null,
            obrisaneRezIds: obrisaneRez.length > 0 ? JSON.stringify(obrisaneRez) : null,
            korisnikIme: null,
          },
        });
      },
      { timeout: 30000, maxWait: 30000 }
    );
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

  // ── Nadopuna rasporeda čišćenja (PR2) — JEDNOM nakon transakcije ──
  //
  // Pozivamo helper ZBIRNO s array-em ID-eva (jedan mail s N redaka, ne N mail-ova).
  // `noviRezervacijeIds` sadrži SAMO Shadow Rezervacije iz `tx.rezervacija.create`
  // grane (stvarno novokreirane), NE i one iz idempotentnog update-a postojećih
  // po icalUid-u (grana `if (existing) { tx.rezervacija.update(...); continue; }`).
  //
  // Time se garantira da Excel re-uvoz iste tabele NE pošalje nadopunu agenciji
  // za rezervacije koje su već postojale u bazi prije ovog uvoza.
  //
  // Helper interno filtrira `automatskoCiscenje: true`, status ≠ OTKAZANO, i
  // preklapanje s prozorom posljednjeg weekly-ja, pa bezopasno zovemo i ako je
  // prazan ili sve rezervacije padaju izvan prozora.
  await mozdaPosaljiNadopunu({ rezervacijaIds: noviRezervacijeIds });

  return NextResponse.json({
    ok: true,
    summary: { updated, skipped, errors: errors.length, obrisano: brojObrisano },
    errors: errors.slice(0, 50),
  });
}
