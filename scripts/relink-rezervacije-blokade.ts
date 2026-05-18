// JEDNOKRATNA MIGRACIJSKA SKRIPTA — 2026-05-18
//
// SVRHA: Za svaku BOOKING Rezervaciju s `bookingIcalUid`, nađi aktualnu
//        BlokadaVanjskogKalendara s istim (uid, jedinicaId) i ažuriraj
//        Rezervacija.blokadaId. Popravlja dangling FK-ove nastale prije
//        prelaska iCal sync-a na idempotent upsert pattern.
//
// Ne dira ništa osim Rezervacija.blokadaId polja. Ne kreira ni briše redove.
//
// Pokretanje:
//   npx tsx scripts/relink-rezervacije-blokade.ts            # DRY-RUN (default)
//   npx tsx scripts/relink-rezervacije-blokade.ts --execute  # STVARNO AŽURIRANJE

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const isExecute = process.argv.includes("--execute");

  const rez = await prisma.rezervacija.findMany({
    where: {
      izvor: "BOOKING",
      bookingIcalUid: { not: null },
    },
    select: { id: true, bookingIcalUid: true, blokadaId: true, jedinicaId: true },
  });

  console.log(`=== ${isExecute ? "EXECUTE" : "DRY-RUN"} ===`);
  console.log(`Provjeram ${rez.length} BOOKING rezervacija s bookingIcalUid`);
  console.log("");

  let aligned = 0;
  const toUpdate: Array<{ rezId: string; oldBlokadaId: string | null; newBlokadaId: string }> = [];
  const missing: Array<{ rezId: string; uid: string }> = [];

  for (const r of rez) {
    const blokada = await prisma.blokadaVanjskogKalendara.findFirst({
      where: { uid: r.bookingIcalUid!, jedinicaId: r.jedinicaId },
      select: { id: true },
    });

    if (!blokada) {
      missing.push({ rezId: r.id, uid: r.bookingIcalUid! });
      continue;
    }

    if (blokada.id === r.blokadaId) {
      aligned++;
      continue;
    }

    toUpdate.push({ rezId: r.id, oldBlokadaId: r.blokadaId, newBlokadaId: blokada.id });
  }

  console.log(`Aligned (već ispravno): ${aligned}`);
  console.log(`Za update (dangling fixed): ${toUpdate.length}`);
  for (const u of toUpdate) {
    const oldShort = u.oldBlokadaId ? u.oldBlokadaId.slice(0, 8) + "..." : "(null)";
    console.log(`  rez ${u.rezId.slice(0, 8)}... | blokadaId: ${oldShort} → ${u.newBlokadaId.slice(0, 8)}...`);
  }
  console.log(`Missing (nema blokade s tim UID-em u DB-u): ${missing.length}`);
  for (const m of missing) {
    console.log(`  rez ${m.rezId.slice(0, 8)}... | uid: ${m.uid.slice(0, 40)}...`);
  }
  console.log("");

  if (!isExecute) {
    console.log("DRY-RUN — ništa nije promijenjeno. Pokreni s --execute za stvarno ažuriranje.");
    await prisma.$disconnect();
    return;
  }

  if (toUpdate.length === 0) {
    console.log("Nema rezervacija za update. Završeno.");
    await prisma.$disconnect();
    return;
  }

  console.log("Pokrećem transakciju...");
  // Veći timeout (60s) jer može biti preko 50 sequential update-ova preko
  // network-a do Supabase-a; default 5s je premalo (P2028 timeout error).
  const updated = await prisma.$transaction(
    async (tx) => {
      let count = 0;
      for (const u of toUpdate) {
        await tx.rezervacija.update({
          where: { id: u.rezId },
          data: { blokadaId: u.newBlokadaId },
        });
        count++;
      }
      return count;
    },
    { timeout: 60000 },
  );

  console.log(`Ažurirano: ${updated} rezervacija.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("GREŠKA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
