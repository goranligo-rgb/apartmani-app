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
        `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`
      );

      const datumDo = new Date(
        `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`
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

  await prisma.blokadaVanjskogKalendara.deleteMany({
    where: {
      vanjskiKalendarId: kal.id,
    },
  });

  for (const e of events) {
    await prisma.blokadaVanjskogKalendara.create({
      data: {
        vanjskiKalendarId: kal.id,
        jedinicaId: kal.jedinicaId,
        uid: e.uid,
        naslov: e.naslov,
        datumOd: e.datumOd,
        datumDo: e.datumDo,
      },
    });
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