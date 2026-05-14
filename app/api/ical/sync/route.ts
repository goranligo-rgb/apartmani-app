import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // UID-i koji su trenutno u Booking feedu (samo non-null)
  const feedUids = new Set(
    events.map((e) => e.uid).filter((u): u is string => !!u)
  );

  // Postojeće blokade za ovaj kalendar
  const postojece = await prisma.blokadaVanjskogKalendara.findMany({
    where: { vanjskiKalendarId: kal.id },
    select: { id: true, uid: true },
  });

  const postojeceByUid = new Map<string, string>();
  for (const p of postojece) {
    if (p.uid) postojeceByUid.set(p.uid, p.id);
  }

  // Skupljamo SVE write operacije i izvršavamo ih u jednoj transakciji
  const writes: any[] = [];
  let skippedNoUid = 0;

  for (const e of events) {
    if (!e.uid) {
      // Bez UID-a ne možemo deduplicirati u sljedećim syncovima → preskačemo
      skippedNoUid++;
      continue;
    }

    if (postojeceByUid.has(e.uid)) {
      // UPDATE: čuvamo Excel polja (gostIme, iznos, bookingId, ...), mijenjamo samo iCal podatke
      writes.push(
        prisma.blokadaVanjskogKalendara.update({
          where: { id: postojeceByUid.get(e.uid)! },
          data: {
            naslov: e.naslov,
            datumOd: e.datumOd,
            datumDo: e.datumDo,
          },
        })
      );
    } else {
      // CREATE: nova rezervacija iz Booking-a
      writes.push(
        prisma.blokadaVanjskogKalendara.create({
          data: {
            vanjskiKalendarId: kal.id,
            jedinicaId: kal.jedinicaId,
            uid: e.uid,
            naslov: e.naslov,
            datumOd: e.datumOd,
            datumDo: e.datumDo,
          },
        })
      );
    }
  }

  // DELETE one koje su nestale iz feeda (otkazane).
  // SIGURNOSNI GUARD: ako je feed PRAZAN, NE brisi ništa.
  //   Prazan feed je vjerojatno greška Booking-a, ne stvarno otkazivanje svih rezervacija.
  // Postojeći zapisi BEZ uid-a ostaju netaknuti (filter `p.uid &&`).
  if (events.length > 0) {
    const obrisiIds = postojece
      .filter((p) => p.uid && !feedUids.has(p.uid))
      .map((p) => p.id);

    if (obrisiIds.length > 0) {
      writes.push(
        prisma.blokadaVanjskogKalendara.deleteMany({
          where: { id: { in: obrisiIds } },
        })
      );
    }
  } else {
    console.warn(
      `[ICAL SYNC] Prazan feed za kalendar ${kal.id} — preskačem DELETE iz sigurnosti.`
    );
  }

  // Atomično: ili sve UPDATE/CREATE/DELETE prođe, ili ništa
  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }

  if (skippedNoUid > 0) {
    console.warn(
      `[ICAL SYNC] Preskočeno ${skippedNoUid} eventova bez UID-a za kalendar ${kal.id}`
    );
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