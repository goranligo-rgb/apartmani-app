// DEBUG SKRIPTA — read-only inspekcija iCal feed-ova.
//
// Dohvaća sirovi iCal feed iz VanjskiKalendar.icalUrl i ispisuje sve event-e
// (UID, DTSTART, DTEND, SUMMARY, STATUS) za vizualnu analizu. Ne dira bazu.
//
// Korisno za:
//   - Provjeru što Booking trenutno šalje u feed-u
//   - Identifikaciju STATUS:CANCELLED event-ova (parser ih trenutno ne razlikuje)
//   - Usporedbu feed UID-eva s bazom (BlokadaVanjskogKalendara.uid)
//
// Pokretanje:
//   npx tsx scripts/inspect-ical-feed.ts                 # svi aktivni kalendari
//   npx tsx scripts/inspect-ical-feed.ts <kalendarId>    # specifični kalendar

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getField(block: string, key: string): string | null {
  // iCal polje može imati parametre (npr. DTSTART;VALUE=DATE:20260101).
  // Hvatamo sve nakon ":" do kraja linije.
  const re = new RegExp(`^${key}(?:;[^:\\n]*)?:(.*)$`, "m");
  const m = block.match(re);
  return m?.[1]?.trim() ?? null;
}

async function inspectKalendar(kal: { id: string; icalUrl: string; jedinicaId: string }) {
  console.log("---");
  console.log(`Kalendar: ${kal.id.slice(0, 8)}... | jedinica: ${kal.jedinicaId.slice(0, 8)}...`);
  console.log(`URL: ${kal.icalUrl}`);

  let text: string;
  try {
    const res = await fetch(kal.icalUrl, { cache: "no-store" });
    if (!res.ok) {
      console.log(`  FETCH FAIL: ${res.status} ${res.statusText}`);
      return;
    }
    text = await res.text();
  } catch (e) {
    console.log(`  FETCH ERROR: ${e}`);
    return;
  }

  const blocks = text.split("BEGIN:VEVENT").slice(1); // header skip
  console.log(`  Events u feed-u: ${blocks.length}`);

  const dbBlokade = await prisma.blokadaVanjskogKalendara.findMany({
    where: { vanjskiKalendarId: kal.id },
    select: { uid: true },
  });
  const dbUids = new Set(dbBlokade.map((b) => b.uid).filter((u): u is string => !!u));
  console.log(`  Blokade u DB-u: ${dbBlokade.length} (${dbUids.size} s UID-em)`);
  console.log("");

  let cancelledCount = 0;
  let confirmedCount = 0;
  let noStatusCount = 0;
  const feedUids = new Set<string>();

  for (const block of blocks) {
    const uid = getField(block, "UID");
    const dtstart = getField(block, "DTSTART");
    const dtend = getField(block, "DTEND");
    const summary = getField(block, "SUMMARY");
    const status = getField(block, "STATUS");

    if (uid) feedUids.add(uid);
    if (status === "CANCELLED") cancelledCount++;
    else if (status === "CONFIRMED") confirmedCount++;
    else noStatusCount++;

    const inDb = uid && dbUids.has(uid);
    const statusMark = status === "CANCELLED" ? "X" : status === "CONFIRMED" ? "v" : "?";

    console.log(
      `  [${statusMark}] ${dtstart}->${dtend} | STATUS=${status ?? "(none)"} | ${summary?.slice(0, 30) ?? ""} | DB:${inDb ? "Y" : "N"} | uid=${uid?.slice(0, 30) ?? "(none)"}`,
    );
  }

  const inDbButNotInFeed: string[] = [];
  for (const b of dbBlokade) {
    if (b.uid && !feedUids.has(b.uid)) inDbButNotInFeed.push(b.uid);
  }

  console.log("");
  console.log(`  Status: CONFIRMED=${confirmedCount}, CANCELLED=${cancelledCount}, no-status=${noStatusCount}`);
  console.log(`  DB blokade KOJE NISU u feed-u (kandidati za brisanje pri sljedećem sync-u): ${inDbButNotInFeed.length}`);
  for (const uid of inDbButNotInFeed) {
    console.log(`    ${uid.slice(0, 50)}`);
  }
}

async function main() {
  const targetId = process.argv[2];
  const kalendari = await prisma.vanjskiKalendar.findMany({
    where: {
      aktivan: true,
      ...(targetId ? { id: targetId } : {}),
    },
    select: { id: true, icalUrl: true, jedinicaId: true },
  });

  console.log(`Inspectiram ${kalendari.length} aktivnih kalendara`);
  console.log("");

  for (const kal of kalendari) {
    await inspectKalendar(kal);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("GREŠKA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
