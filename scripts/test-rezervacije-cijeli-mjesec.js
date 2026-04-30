const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const gostiData = [
  ["Marko", "Horvat", "marko.horvat@test.com", "+385 91 111 1111", "Zagreb", "VIP, povratni gost"],
  ["Ana", "Kovač", "ana.kovac@test.com", "+385 91 222 2222", "Varaždin", "povratni gost"],
  ["Ivan", "Novak", "ivan.novak@test.com", "+385 91 333 3333", "Rijeka", ""],
  ["Petra", "Babić", "petra.babic@test.com", "+385 91 444 4444", "Osijek", "obitelj"],
  ["Thomas", "Müller", "thomas.muller@test.com", "+49 151 777 777", "München", "strani gost"],
];

async function main() {
  const jedinice = await prisma.jedinica.findMany({
    include: { objekt: true },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  if (!jedinice.length) {
    throw new Error("Nema jedinica. Prvo pokreni osnovni seed.");
  }

  console.log(`✅ Pronađeno jedinica: ${jedinice.length}`);

  const gosti = [];

  for (const [ime, prezime, email, telefon, grad, oznake] of gostiData) {
    const gost = await prisma.gost.upsert({
      where: { email },
      update: {
        ime,
        prezime,
        telefon,
        grad,
        drzava: "Hrvatska",
        adresa: "Test adresa",
        oznake,
        napomena: oznake
          ? `Test gost. Oznake: ${oznake}.`
          : "Test gost za provjeru rezervacija.",
      },
      create: {
        ime,
        prezime,
        email,
        telefon,
        grad,
        drzava: "Hrvatska",
        adresa: "Test adresa",
        oznake,
        napomena: oznake
          ? `Test gost. Oznake: ${oznake}.`
          : "Test gost za provjeru rezervacija.",
      },
    });

    gosti.push(gost);
  }

  console.log(`✅ Gosti spremni: ${gosti.length}`);

  const danas = new Date();
  danas.setHours(12, 0, 0, 0);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < 30; i++) {
    const jedinica = jedinice[i % jedinice.length];
    const gost = gosti[i % gosti.length];

    const datumOd = addDays(danas, i);
    const brojNocenja = i % 5 === 0 ? 4 : i % 3 === 0 ? 3 : 2;
    const datumDo = addDays(datumOd, brojNocenja);

    const brojOdraslih = i % 2 === 0 ? 2 : 4;
    const brojDjece = i % 4 === 0 ? 1 : 0;
    const brojOsoba = brojOdraslih + brojDjece;

    const cijenaNocenja = 120 + (i % 4) * 20;
    const iznosUkupno = brojNocenja * cijenaNocenja;

    const status =
      i % 9 === 0 ? "UPIT" : i % 13 === 0 ? "OTKAZANO" : "POTVRDENO";

    const postoji = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId: jedinica.id,
        datumOd,
        datumDo,
      },
    });

    if (postoji) {
      skipped++;
      continue;
    }

    await prisma.rezervacija.create({
      data: {
        jedinicaId: jedinica.id,
        gostId: gost.id,

        datumOd,
        datumDo,

        brojNocenja,           
        brojOsoba,

        status,
        iznosUkupno,

        napomena:
          status === "UPIT"
            ? "Test upit za provjeru boje i statusa."
            : status === "OTKAZANO"
            ? "Test otkazana rezervacija."
            : "Test potvrdena rezervacija.",
      },
    });

    created++;

    console.log(
      `✅ ${formatDate(datumOd)} → ${formatDate(datumDo)} | ${
        jedinica.objekt?.naziv || "Objekt"
      } / ${jedinica.naziv} | ${gost.ime} ${gost.prezime} | ${status}`
    );
  }

  console.log("");
  console.log("✅ Gotovo.");
  console.log(`✅ Kreirano rezervacija: ${created}`);
  console.log(`ℹ️ Preskočeno jer već postoji: ${skipped}`);
}

main()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });