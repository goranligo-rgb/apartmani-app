const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 👇 OVDJE STAVI IZVORNU JEDINICU (koju si već složio)
  const sourceName = "Marty 1";

  const source = await prisma.jedinica.findFirst({
    where: { naziv: sourceName },
    include: {
      oprema: true,
    },
  });

  if (!source) {
    console.log("❌ Nema izvora");
    return;
  }

  const all = await prisma.jedinica.findMany();

  for (const j of all) {
    if (j.id === source.id) continue;

    // obriši staro
    await prisma.jedinicaOprema.deleteMany({
      where: { jedinicaId: j.id },
    });

    // kopiraj
    await prisma.jedinicaOprema.createMany({
      data: source.oprema.map((o) => ({
        jedinicaId: j.id,
        opremaId: o.opremaId,
      })),
    });

    console.log(`✅ Kopirano na ${j.naziv}`);
  }

  console.log("🔥 GOTOVO");
}

main().finally(() => prisma.$disconnect());