const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

function nightsBetween(datumOd, datumDo) {
  return Math.round((datumDo.getTime() - datumOd.getTime()) / 86400000);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("hr-HR");
}

async function main() {
  const jedinice = await prisma.jedinica.findMany({
    where: {
      aktivna: true,
    },
    include: {
      objekt: true,
    },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  if (jedinice.length === 0) {
    throw new Error("Nema aktivnih jedinica.");
  }

  const danas = new Date();
  danas.setHours(12, 0, 0, 0);

  const testRezervacije = [
    { jedinicaIndex: 0, od: 0, noci: 2, ime: "Test", prezime: "Danas", osobe: 2, iznos: 240 },
    { jedinicaIndex: 1, od: 1, noci: 3, ime: "Test", prezime: "Sutra", osobe: 3, iznos: 390 },
    { jedinicaIndex: 2, od: 1, noci: 2, ime: "Test", prezime: "More", osobe: 2, iznos: 260 },
    { jedinicaIndex: 3, od: 2, noci: 3, ime: "Test", prezime: "Bura", osobe: 4, iznos: 510 },
    { jedinicaIndex: 4, od: 3, noci: 2, ime: "Test", prezime: "Lavanda", osobe: 5, iznos: 420 },
    { jedinicaIndex: 5, od: 3, noci: 4, ime: "Test", prezime: "Krk", osobe: 4, iznos: 680 },
    { jedinicaIndex: 6, od: 4, noci: 2, ime: "Test", prezime: "Maslina", osobe: 2, iznos: 300 },
    { jedinicaIndex: 7, od: 5, noci: 2, ime: "Test", prezime: "Val", osobe: 6, iznos: 520 },
    { jedinicaIndex: 8, od: 5, noci: 3, ime: "Test", prezime: "Sunce", osobe: 4, iznos: 570 },
    { jedinicaIndex: 0, od: 6, noci: 2, ime: "Test", prezime: "Kvarner", osobe: 2, iznos: 280 },
    { jedinicaIndex: 1, od: 6, noci: 1, ime: "Test", prezime: "Brzi", osobe: 2, iznos: 130 },
  ];

  console.log("");
  console.log("Kreiram više test rezervacija za sljedećih 7 dana...");
  console.log("-----------------------------------------------------");

  for (const item of testRezervacije) {
    const jedinica = jedinice[item.jedinicaIndex % jedinice.length];

    const datumOd = addDays(danas, item.od);
    const datumDo = addDays(datumOd, item.noci);
    const brojNocenja = nightsBetween(datumOd, datumDo);

    const gost = await prisma.gost.create({
      data: {
        ime: item.ime,
        prezime: item.prezime,
        email: "goran.ligo@gmail.com",
        telefon: "000000000",
        napomena: "Test gost za probu tjednog rasporeda čišćenja.",
      },
    });

    const rezervacija = await prisma.rezervacija.create({
      data: {
        jedinicaId: jedinica.id,
        gostId: gost.id,
        izvor: "DIREKTNO",
        status: "POTVRDENO",
        datumOd,
        datumDo,
        brojNocenja,
        brojOsoba: item.osobe,
        iznosUkupno: item.iznos,
        iznosPotvrde: Math.round(item.iznos * 0.3),
        iznosPlaceno: Math.round(item.iznos * 0.3),
        placenoKarticom: true,
        valuta: "EUR",
        napomena: "TEST rezervacija za probu tjednog rasporeda čišćenja.",
      },
    });

    console.log(
      `${jedinica.objekt.naziv} / ${jedinica.naziv} | ${formatDate(
        datumOd
      )} - ${formatDate(datumDo)} | ${item.ime} ${item.prezime} | ID ${
        rezervacija.id
      }`
    );
  }

  console.log("-----------------------------------------------------");
  console.log("✅ Gotovo. Test rezervacije za sljedeći tjedan su kreirane.");
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