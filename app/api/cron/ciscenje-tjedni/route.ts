import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dohvatiZagrebDanISat, startOfTodayInZagreb } from "@/lib/dates";
import { generirajINaPosalji } from "@/lib/ciscenje/generirajINaPosalji";

// Cron koji jednom na sat (vidi vercel.json) provjeri treba li danas u ovaj
// sat poslati tjedni mail agenciji za čišćenje. Sva logika podudaranja
// (dan/sat) je u lokalnoj Europe/Zagreb zoni jer korisnik raspored definira
// kroz admin UI u lokalnom vremenu — Vercel cron sam ne zna ništa o TZ.
//
// Točke odluke (redom):
//   1. Auth: Bearer ${CRON_SECRET}. Vercel cron sam šalje taj header.
//   2. Postavke: ako nema reda ili `aktivno=false` → no-op.
//   3. Podudaranje: dayOfWeek treba match-ati jedan od `saljiPonedjeljak..Nedjelja`,
//      i sat treba match-ati `satSlanja` (minuta se ignorira — odluka PR0,
//      vidi memory/ciscenje-mailovi.md).
//   4. Idempotentnost: ako je danas (Europe/Zagreb dan) već poslan weekly mail
//      (CiscenjeNarudzba.poslanoAt >= startOfTodayInZagreb() AND napomena IS NULL),
//      preskoči. Napomena IS NULL filter čuva da PR2 nadopune ne blokiraju weekly.
//   5. Inače pozovi postojeći `generirajINaPosalji()`.
//
// Svi povratni JSON-ovi imaju `skipped` polje s razlogom da olakšaju debug
// kroz Vercel logove (Vercel sam ne logira tijelo odgovora ali često se
// upali ručno preko curl-a u devu).

const DAN_FIELD = [
  "saljiNedjelja", // 0 = Nedjelja (JS getDay konvencija)
  "saljiPonedjeljak",
  "saljiUtorak",
  "saljiSrijeda",
  "saljiCetvrtak",
  "saljiPetak",
  "saljiSubota",
] as const;

export async function GET(request: Request) {
  // 1) Auth — fail-closed: ako CRON_SECRET nije postavljen u envu,
  //    odbij sve (umjesto da accidentaly propustimo "Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET nije konfiguriran na serveru." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2) Postavke
    const postavke = await prisma.ciscenjeMailPostavke.findFirst();

    if (!postavke) {
      return NextResponse.json({
        success: true,
        skipped: "no-settings",
      });
    }

    if (!postavke.aktivno) {
      return NextResponse.json({
        success: true,
        skipped: "inactive",
      });
    }

    // 3) Podudaranje s lokalnim danom/satom
    const { dayOfWeek, hour } = dohvatiZagrebDanISat();

    if (hour !== postavke.satSlanja) {
      return NextResponse.json({
        success: true,
        skipped: "wrong-hour",
        zagrebHour: hour,
        satSlanja: postavke.satSlanja,
      });
    }

    const danjeAktivan = postavke[DAN_FIELD[dayOfWeek]] as boolean;
    if (!danjeAktivan) {
      return NextResponse.json({
        success: true,
        skipped: "day-not-enabled",
        zagrebDayOfWeek: dayOfWeek,
      });
    }

    // 4) Idempotentnost — već poslan weekly danas?
    const startDanas = startOfTodayInZagreb();
    const vecPoslan = await prisma.ciscenjeNarudzba.findFirst({
      where: {
        poslanoEmail: true,
        poslanoAt: {
          gte: startDanas,
        },
        napomena: null,
      },
      select: { id: true },
    });

    if (vecPoslan) {
      return NextResponse.json({
        success: true,
        skipped: "already-sent-today",
        narudzbaId: vecPoslan.id,
      });
    }

    // 5) Pošalji
    const rezultat = await generirajINaPosalji();

    if ("error" in rezultat) {
      // Helper signalizira poslovnu grešku (npr. nema email agencije).
      // Vraćamo 200 da Vercel cron ne retry-a (greška je u podacima, ne u serveru).
      return NextResponse.json(
        { success: false, businessError: rezultat.error },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      sent: true,
      narudzbaId: rezultat.narudzbaId,
      zagrebDayOfWeek: dayOfWeek,
      zagrebHour: hour,
    });
  } catch (err) {
    console.error("[cron/ciscenje-tjedni]", err);
    return NextResponse.json(
      { error: "Greška pri slanju tjednog maila čišćenja" },
      { status: 500 }
    );
  }
}
