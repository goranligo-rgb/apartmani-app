// JEDNOKRATNA MIGRACIJSKA SKRIPTA — 2026-05-18
//
// SVRHA: Obrisati postojećih 24 Eva BOOKING rezervacija + 24 orphan gostiju
//        nakon što je Booking otkazao single-"Apartments Eva" listing i prešao
//        na 3 odvojena: "Apartman 1", "Apartman 2", "Apartman 3".
//
// Sljedeći Excel uploadi koristit će novi unit mapping iz lib/booking-unit-mapping.ts
// (commit b1c7c56) koji prepoznaje "Apartman N" varijante → Eva N.
//
// OVO NIJE REGULARNA SKRIPTA. Ne pokretati ponovno. Ne kopirati za druge migracije
// bez prilagodbe — dedup i orphan logika su specifične za ovaj scenarij.
//
// Pokretanje:
//   npx tsx scripts/delete-eva-booking.ts            # DRY-RUN (default)
//   npx tsx scripts/delete-eva-booking.ts --execute  # STVARNO BRISANJE (traži "OBRIŠI" potvrdu)

import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const prisma = new PrismaClient();

function fmtDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

async function askConfirm(): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question('Upišite "OBRIŠI" za potvrdu (bilo što drugo prekida): ');
  rl.close();
  return answer.trim() === "OBRIŠI";
}

async function main() {
  const isExecute = process.argv.includes("--execute");

  // STEP A: Preview (uvijek)
  const rez = await prisma.rezervacija.findMany({
    where: {
      izvor: "BOOKING",
      jedinica: { objekt: { naziv: "Apartments Eva" } },
    },
    include: { gost: true, jedinica: true },
    orderBy: { datumOd: "asc" },
  });

  const rezIds = rez.map((r) => r.id);
  const blokadaIds = rez.map((r) => r.blokadaId).filter((b): b is string => !!b);
  const gostIds = [...new Set(rez.map((r) => r.gostId).filter((g): g is string => !!g))];

  // Orphan = gost čiji ukupan count rezervacija === broj rezervacija u brisanju
  const orphanGostIds: string[] = [];
  for (const gid of gostIds) {
    const ukupanCount = await prisma.rezervacija.count({ where: { gostId: gid } });
    const ubrisanju = rez.filter((r) => r.gostId === gid).length;
    if (ukupanCount === ubrisanju) orphanGostIds.push(gid);
  }

  const orphanGosti = await prisma.gost.findMany({
    where: { id: { in: orphanGostIds } },
    select: { id: true, ime: true, prezime: true },
  });
  const orphanGostMap = new Map(orphanGosti.map((g) => [g.id, g]));

  // PRINT
  console.log(`=== ${isExecute ? "EXECUTE" : "DRY-RUN"} ===`);
  console.log("");
  console.log(`Rezervacija za brisanje: ${rezIds.length}`);
  for (const r of rez) {
    const ime = r.gost ? `${r.gost.ime ?? ""} ${r.gost.prezime ?? ""}`.trim() : "(bez gosta)";
    const period = `${fmtDate(r.datumOd)}-${fmtDate(r.datumDo)}`;
    console.log(`  ${r.id.slice(0, 8)}... | ${r.jedinica.naziv} | ${ime} | ${period}`);
  }
  console.log("");
  console.log(`Orphan gosti za brisanje: ${orphanGostIds.length}`);
  for (const gid of orphanGostIds) {
    const g = orphanGostMap.get(gid);
    console.log(`  ${gid.slice(0, 8)}... | ${g?.ime ?? ""} ${g?.prezime ?? ""}`);
  }
  console.log("");
  console.log(`Blokade KOJE OSTAJU (${blokadaIds.length}) — iCal sync vlasnik, ne dira se:`);
  for (const bid of blokadaIds) {
    console.log(`  ${bid.slice(0, 8)}...`);
  }
  console.log("");
  console.log("Cascade (automatski preko Prisma schema): Placanja, Racuni, Emailovi, Promjene");
  console.log("");

  if (!isExecute) {
    console.log("DRY-RUN — ništa nije obrisano. Pokreni s --execute za stvarno brisanje.");
    await prisma.$disconnect();
    return;
  }

  // STEP B: Confirmation
  console.log("⚠️  STVARNO BRISANJE — ovo je IREVERZIBILNO.");
  const ok = await askConfirm();
  if (!ok) {
    console.log("Prekinuto. Ništa nije obrisano.");
    await prisma.$disconnect();
    return;
  }

  // STEP C: Atomično brisanje
  console.log("");
  console.log("Pokrećem transakciju...");

  const result = await prisma.$transaction(async (tx) => {
    // Race-safe re-validation
    const finalRez = await tx.rezervacija.findMany({
      where: {
        izvor: "BOOKING",
        jedinica: { objekt: { naziv: "Apartments Eva" } },
      },
      select: { id: true },
    });
    const finalIds = new Set(finalRez.map((r) => r.id));
    if (finalIds.size !== rezIds.length || rezIds.some((id) => !finalIds.has(id))) {
      throw new Error(
        `Re-validation FAIL: preview je imao ${rezIds.length} rezervacija, ` +
          `unutar transakcije ${finalIds.size}. Abort — pokreni dry-run ponovno.`,
      );
    }

    const delRez = await tx.rezervacija.deleteMany({ where: { id: { in: [...finalIds] } } });
    // Double-safety: rezervacije: { none: {} } — samo ako nema više rezervacija (cascade kompatibilno)
    const delGost = await tx.gost.deleteMany({
      where: { id: { in: orphanGostIds }, rezervacije: { none: {} } },
    });
    return { delRez: delRez.count, delGost: delGost.count };
  });

  console.log("");
  console.log(`Obrisano: ${result.delRez} rezervacija, ${result.delGost} gostiju.`);
  console.log(`${blokadaIds.length} blokada netaknuto (iCal sync vlasnik).`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("GREŠKA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
