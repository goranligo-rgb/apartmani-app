import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfTodayInZagreb } from "@/lib/dates";

function parseICal(data: string) {
  const events = [];
  const blocks = data.split("BEGIN:VEVENT");

  for (const block of blocks) {
    const startMatch = block.match(/DTSTART(?:;VALUE=DATE)?:(\d+)/);
    const endMatch = block.match(/DTEND(?:;VALUE=DATE)?:(\d+)/);
    const uidMatch = block.match(/UID:(.*)/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);

    if (startMatch && endMatch) {
      const start = startMatch[1];
      const end = endMatch[1];

      const datumOd = new Date(
        Number(start.slice(0, 4)),
        Number(start.slice(4, 6)) - 1,
        Number(start.slice(6, 8)),
        12, 0, 0, 0
      );

      const datumDo = new Date(
        Number(end.slice(0, 4)),
        Number(end.slice(4, 6)) - 1,
        Number(end.slice(6, 8)),
        12, 0, 0, 0
      );

      events.push({
        uid: uidMatch?.[1]?.trim() || null,
        naslov: summaryMatch?.[1]?.trim() || "Booking zauzeće",
        datumOd,
        datumDo,
      });
    }
  }

  return events;
}

async function syncJedanKalendar(kal: any) {
  const res = await fetch(kal.icalUrl, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Ne mogu dohvatiti iCal: ${kal.icalUrl}`);
  }

  const text = await res.text();
  const events = parseICal(text);

  // Idempotent sync: upsert po (vanjskiKalendarId, uid) composite key umjesto
  // delete+create. Stari pattern je regenerirao UUID-eve na svakom sync-u i
  // rušio Rezervacija.blokadaId FK-ove. Sad postojeće blokade zadržavaju svoj
  // UUID, samo se ažuriraju datumi/naslov ako su se promijenili.

  const currentRows = await prisma.blokadaVanjskogKalendara.findMany({
    where: { vanjskiKalendarId: kal.id },
    select: { id: true, uid: true },
  });

  for (const e of events) {
    if (!e.uid) {
      // Bez UID-a ne možemo idempotent dedup. iCalendar spec zahtjeva UID;
      // ako ga nema, vjerojatno je malformed feed — logiramo i preskačemo.
      console.warn("iCal event bez UID-a, preskačem:", e.naslov);
      continue;
    }

    await prisma.blokadaVanjskogKalendara.upsert({
      where: {
        vanjskiKalendarId_uid: {
          vanjskiKalendarId: kal.id,
          uid: e.uid,
        },
      },
      update: {
        jedinicaId: kal.jedinicaId,
        naslov: e.naslov,
        datumOd: e.datumOd,
        datumDo: e.datumDo,
      },
      create: {
        vanjskiKalendarId: kal.id,
        jedinicaId: kal.jedinicaId,
        uid: e.uid,
        naslov: e.naslov,
        datumOd: e.datumOd,
        datumDo: e.datumDo,
      },
    });
  }

  // Delete-missing: blokade u DB čiji UID nije više u trenutnom feed-u
  // (npr. gost je otkazao ili promijenio rezervaciju i Booking je uklonio
  // event iz feed-a). NULL-uid blokade ostaju netaknute.
  const feedUids = new Set(events.map((e) => e.uid).filter((u): u is string => !!u));
  const toDelete = currentRows
    .filter((r) => r.uid && !feedUids.has(r.uid))
    .map((r) => r.id);

  if (toDelete.length > 0) {
    await prisma.blokadaVanjskogKalendara.deleteMany({
      where: { id: { in: toDelete } },
    });
    console.log(`iCal sync: obrisano ${toDelete.length} blokada koje su nestale iz feed-a (kalendar ${kal.id.slice(0, 8)})`);
  }

  // ── GHOST-CLEANUP: otkazane BUDUĆE BOOKING rezervacije ──
  //
  // Kad gost otkaže, Booking ukloni event iz feed-a (UID nestane) — isto kao
  // kad boravak završi. Zato je "nestanak" siguran signal otkaza SAMO za
  // BUDUĆNOST: prošle rezervacije (datumDo < danas, odn. datumOd < danas) su
  // NORMALNO završeni boravci i NIKAD ih ne diramo. Empirijski potvrđeno:
  // Booking feed drži samo datumDo >= danas, pa se prošlima UID uvijek "izgubi".
  //
  // Ghost = BUDUĆA (datumOd >= danas) BOOKING rezervacija za ovu jedinicu čiji
  // je UID nestao iz feed-a ILI joj je blokada obrisana. Brišemo poklon-bon
  // (Restrict FK) prije rezervacije; rezervacija (Cascade) očisti svoje logove.
  //
  // SIGURNOSNI GUARD: preskačemo ghost-cleanup ako feed nema nijedan event
  // (vjerojatno transientni prazan/loš odgovor) — inače bismo masovno obrisali
  // sve buduće rezervacije jedinice na jednom lošem fetchu.
  if (events.length > 0) {
    const danas = startOfTodayInZagreb();

    const buduceBooking = await prisma.rezervacija.findMany({
      where: {
        izvor: "BOOKING",
        jedinicaId: kal.jedinicaId,
        datumOd: { gte: danas },
      },
      select: { id: true, bookingIcalUid: true, blokadaId: true },
    });

    // Žive blokade ove jedinice NAKON delete-missing koraka.
    const ziveBlokadeIds = new Set(
      (
        await prisma.blokadaVanjskogKalendara.findMany({
          where: { jedinicaId: kal.jedinicaId },
          select: { id: true },
        })
      ).map((b) => b.id)
    );

    const ghostIds = buduceBooking
      .filter((r) => {
        const uidNestao = !!r.bookingIcalUid && !feedUids.has(r.bookingIcalUid);
        const blokadaNestala = !!r.blokadaId && !ziveBlokadeIds.has(r.blokadaId);
        return uidNestao || blokadaNestala;
      })
      .map((r) => r.id);

    if (ghostIds.length > 0) {
      // Atomično i redom: poklon-bon (Restrict) mora prije rezervacije.
      await prisma.$transaction([
        prisma.poklonBon.deleteMany({
          where: { rezervacijaId: { in: ghostIds } },
        }),
        prisma.rezervacija.deleteMany({
          where: { id: { in: ghostIds } },
        }),
      ]);
      console.log(
        `iCal sync: ghost-cleanup obrisao ${ghostIds.length} otkazanih budućih BOOKING rezervacija (kalendar ${kal.id.slice(0, 8)})`
      );
    }
  }

  await prisma.vanjskiKalendar.update({
    where: {
      id: kal.id,
    },
    data: {
      lastSyncAt: new Date(),
    },
  });

  return events.length;
}

async function runSync(kalendarId?: string) {
  const kalendari = await prisma.vanjskiKalendar.findMany({
    where: {
      aktivan: true,
      ...(kalendarId ? { id: kalendarId } : {}),
    },
  });

  let total = 0;

  for (const kal of kalendari) {
    try {
      const count = await syncJedanKalendar(kal);
      total += count;
    } catch (err) {
      console.error("ICAL SYNC ERROR:", err);
    }
  }

  return {
    ok: true,
    total,
    kalendari: kalendari.length,
  };
}

export async function GET() {
  const result = await runSync();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  let kalendarId = "";

  try {
    const body = await req.json();
    kalendarId = String(body?.kalendarId || "");
  } catch {
    kalendarId = "";
  }

  const result = await runSync(kalendarId || undefined);
  return NextResponse.json(result);
}