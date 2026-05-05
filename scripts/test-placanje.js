const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const jedinica = await prisma.jedinica.findFirst({
    where: {
      aktivna: true,
      objekt: {
        naziv: "Apartments Eva",
      },
    },
    include: {
      objekt: true,
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        naziv: "asc",
      },
    ],
  });

  if (!jedinica) {
    throw new Error(
      "Nema aktivne jedinice za Apartments Eva. Provjeri postoje li Eva jedinice u bazi."
    );
  }

  const datumOd = addDays(new Date(), 30);
  const datumDo = addDays(datumOd, 3);

  const gost = await prisma.gost.create({
    data: {
      ime: "Test",
      prezime: "Eva",
      email: "goran.ligo@gmail.com",
      telefon: "000000000",
      napomena: "Test gost za probu računa Apartments Eva.",
    },
  });

  const rezervacija = await prisma.rezervacija.create({
    data: {
      jedinicaId: jedinica.id,
      gostId: gost.id,
      izvor: "DIREKTNO",
      status: "CEKA_POTVRDU",
      datumOd,
      datumDo,
      brojNocenja: 3,
      brojOsoba: Math.max(jedinica.osnovniKapacitet, 1),
      iznosUkupno: 450,
      iznosPotvrde: 150,
      iznosPlaceno: 0,
      placenoKarticom: false,
      valuta: "EUR",
      napomena: "Test rezervacija za probu automatskog računa Apartments Eva.",
    },
  });

  const placanje = await prisma.placanje.create({
    data: {
      rezervacijaId: rezervacija.id,
      tip: "POTVRDA_REZERVACIJE",
      status: "CEKA_PLACANJE",
      iznos: 150,
      valuta: "EUR",
      provider: "TEST",
      providerId: "TEST-EVA-" + Date.now(),
    },
  });

  console.log("");
  console.log("✅ Test rezervacija i plaćanje kreirani za Apartments Eva");
  console.log("----------------------------------------");
  console.log("OBJEKT =", jedinica.objekt.naziv);
  console.log("JEDINICA =", jedinica.naziv);
  console.log("REZERVACIJA_ID =", rezervacija.id);
  console.log("PLACANJE_ID =", placanje.id);
  console.log("----------------------------------------");
  console.log("");
}

main()
  .catch((error) => {
    console.error("❌ Greška:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });