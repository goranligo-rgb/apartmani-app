const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const opremaJedinice = [
  // Kuhinja i blagovaonica
  { naziv: "Kuhinja", kategorija: "Kuhinja i blagovaonica", sortOrder: 10 },
  { naziv: "Dnevna soba s kuhinjom", kategorija: "Kuhinja i blagovaonica", sortOrder: 20 },
  { naziv: "Blagovaonski stol", kategorija: "Kuhinja i blagovaonica", sortOrder: 30 },
  { naziv: "Pećnica", kategorija: "Kuhinja i blagovaonica", sortOrder: 40 },
  { naziv: "Mikrovalna pećnica", kategorija: "Kuhinja i blagovaonica", sortOrder: 50 },
  { naziv: "Ploča za kuhanje", kategorija: "Kuhinja i blagovaonica", sortOrder: 60 },
  { naziv: "Hladnjak", kategorija: "Kuhinja i blagovaonica", sortOrder: 70 },
  { naziv: "Zamrzivač", kategorija: "Kuhinja i blagovaonica", sortOrder: 80 },
  { naziv: "Perilica posuđa", kategorija: "Kuhinja i blagovaonica", sortOrder: 90 },
  { naziv: "Aparat za kavu", kategorija: "Kuhinja i blagovaonica", sortOrder: 100 },
  { naziv: "Kuhalo za vodu", kategorija: "Kuhinja i blagovaonica", sortOrder: 110 },
  { naziv: "Toster", kategorija: "Kuhinja i blagovaonica", sortOrder: 120 },
  { naziv: "Posuđe i pribor za jelo", kategorija: "Kuhinja i blagovaonica", sortOrder: 130 },
  { naziv: "Lonci i tave", kategorija: "Kuhinja i blagovaonica", sortOrder: 140 },
  { naziv: "Čaše za vino", kategorija: "Kuhinja i blagovaonica", sortOrder: 150 },
  { naziv: "Kuhinjske krpe", kategorija: "Kuhinja i blagovaonica", sortOrder: 160 },

  // Dnevni boravak
  { naziv: "Televizor", kategorija: "Dnevni boravak", sortOrder: 200 },
  { naziv: "Satelitska TV", kategorija: "Dnevni boravak", sortOrder: 210 },
  { naziv: "Smart TV", kategorija: "Dnevni boravak", sortOrder: 220 },
  { naziv: "Sofa", kategorija: "Dnevni boravak", sortOrder: 230 },
  { naziv: "Spavanje u dnevnom boravku", kategorija: "Dnevni boravak", sortOrder: 240 },
  { naziv: "Stolić za kavu", kategorija: "Dnevni boravak", sortOrder: 250 },

  // Komfor
  { naziv: "Klima uređaj", kategorija: "Komfor", sortOrder: 300 },
  { naziv: "WiFi", kategorija: "Komfor", sortOrder: 310 },
  { naziv: "Grijanje", kategorija: "Komfor", sortOrder: 320 },
  { naziv: "Posteljina", kategorija: "Komfor", sortOrder: 330 },
  { naziv: "Ručnici", kategorija: "Komfor", sortOrder: 340 },
  { naziv: "Ormar", kategorija: "Komfor", sortOrder: 350 },
  { naziv: "Vješalice", kategorija: "Komfor", sortOrder: 360 },
  { naziv: "Glačalo", kategorija: "Komfor", sortOrder: 370 },
  { naziv: "Daska za glačanje", kategorija: "Komfor", sortOrder: 380 },

  // Kupaonica
  { naziv: "Tuš", kategorija: "Kupaonica", sortOrder: 400 },
  { naziv: "Kada", kategorija: "Kupaonica", sortOrder: 410 },
  { naziv: "Sušilo za kosu", kategorija: "Kupaonica", sortOrder: 420 },
  { naziv: "Perilica rublja", kategorija: "Kupaonica", sortOrder: 430 },
  { naziv: "Toaletni papir", kategorija: "Kupaonica", sortOrder: 440 },
  { naziv: "Ogledalo", kategorija: "Kupaonica", sortOrder: 450 },

  // Spavaće sobe
  { naziv: "Bračni krevet", kategorija: "Spavaće sobe", sortOrder: 460 },
  { naziv: "Odvojeni kreveti", kategorija: "Spavaće sobe", sortOrder: 470 },
  { naziv: "Noćni ormarići", kategorija: "Spavaće sobe", sortOrder: 480 },
  { naziv: "Zamjenska posteljina", kategorija: "Spavaće sobe", sortOrder: 490 },

  // Vanjski prostor
  { naziv: "Balkon", kategorija: "Vanjski prostor", sortOrder: 500 },
  { naziv: "Terasa", kategorija: "Vanjski prostor", sortOrder: 510 },
  { naziv: "Vrt", kategorija: "Vanjski prostor", sortOrder: 520 },
  { naziv: "Vrtna garnitura", kategorija: "Vanjski prostor", sortOrder: 530 },
  { naziv: "Ležaljke", kategorija: "Vanjski prostor", sortOrder: 540 },
  { naziv: "Suncobran", kategorija: "Vanjski prostor", sortOrder: 550 },
  { naziv: "Roštilj", kategorija: "Vanjski prostor", sortOrder: 560 },
  { naziv: "Pogled na more", kategorija: "Vanjski prostor", sortOrder: 570 },
  { naziv: "Pogled na vrt", kategorija: "Vanjski prostor", sortOrder: 580 },

  // Bazen i parking
  { naziv: "Bazen", kategorija: "Bazen i parking", sortOrder: 600 },
  { naziv: "Zajednički bazen", kategorija: "Bazen i parking", sortOrder: 610 },
  { naziv: "Privatni parking", kategorija: "Bazen i parking", sortOrder: 620 },
  { naziv: "Garaža", kategorija: "Bazen i parking", sortOrder: 630 },
  { naziv: "Parking u sklopu objekta", kategorija: "Bazen i parking", sortOrder: 640 },

  // Sigurnost i praktično
  { naziv: "Sef", kategorija: "Sigurnost i praktično", sortOrder: 700 },
  { naziv: "Samostalni ulaz", kategorija: "Sigurnost i praktično", sortOrder: 710 },
  { naziv: "Smart lock", kategorija: "Sigurnost i praktično", sortOrder: 720 },
  { naziv: "Dječji krevetić", kategorija: "Sigurnost i praktično", sortOrder: 730 },
  { naziv: "Hranilica za djecu", kategorija: "Sigurnost i praktično", sortOrder: 740 },
  { naziv: "Aparat za gašenje požara", kategorija: "Sigurnost i praktično", sortOrder: 750 },
  { naziv: "Prva pomoć", kategorija: "Sigurnost i praktično", sortOrder: 760 },
];

const objektiSeed = [
  {
    naziv: "House Art",
    mjesto: "Malinska",
    imaBazen: true,
    grupaBazena: "HOUSE_ART",
    jedinice: [
      {
        naziv: "House Art",
        vrsta: "KUCA",
        osnovniKapacitet: 10,
        dodatniKapacitet: 0,
        ukupniKapacitet: 10,
        brojSpavacihSoba: 5,
        brojKupaona: 3,
        imaSpavanjeUDnevnom: false,
        sharedPool: true,
        sortOrder: 10,
        napomena:
          "Master bedroom sa svojom kupaonom, na prvom katu još 2 sobe + 1 kupaona, na drugom katu 2 sobe + 1 kupaona.",
      },
    ],
  },
  {
    naziv: "Luxury Apartments Marty",
    mjesto: "Malinska",
    imaBazen: true,
    grupaBazena: "MARTY_ART",
    jedinice: [
      {
        naziv: "Marty 1",
        vrsta: "APARTMAN",
        osnovniKapacitet: 2,
        dodatniKapacitet: 1,
        ukupniKapacitet: 3,
        brojSpavacihSoba: 1,
        brojKupaona: 1,
        imaSpavanjeUDnevnom: true,
        sharedPool: true,
        sortOrder: 10,
      },
      {
        naziv: "Marty 2",
        vrsta: "APARTMAN",
        osnovniKapacitet: 4,
        dodatniKapacitet: 1,
        ukupniKapacitet: 5,
        brojSpavacihSoba: 2,
        brojKupaona: 2,
        imaSpavanjeUDnevnom: true,
        sharedPool: true,
        sortOrder: 20,
      },
      {
        naziv: "Marty 3",
        vrsta: "APARTMAN",
        osnovniKapacitet: 2,
        dodatniKapacitet: 1,
        ukupniKapacitet: 3,
        brojSpavacihSoba: 1,
        brojKupaona: 1,
        imaSpavanjeUDnevnom: true,
        sharedPool: true,
        sortOrder: 30,
      },
      {
        naziv: "Marty 4",
        vrsta: "APARTMAN",
        osnovniKapacitet: 4,
        dodatniKapacitet: 1,
        ukupniKapacitet: 5,
        brojSpavacihSoba: 2,
        brojKupaona: 2,
        imaSpavanjeUDnevnom: true,
        sharedPool: true,
        sortOrder: 40,
      },
      {
        naziv: "Marty 5",
        vrsta: "APARTMAN",
        osnovniKapacitet: 6,
        dodatniKapacitet: 0,
        ukupniKapacitet: 6,
        brojSpavacihSoba: 3,
        brojKupaona: 3,
        imaSpavanjeUDnevnom: false,
        sharedPool: true,
        sortOrder: 50,
        napomena: "Bez spavanja u dnevnoj sobi.",
      },
    ],
  },
  {
    naziv: "Apartments Eva",
    mjesto: "Malinska",
    imaBazen: false,
    grupaBazena: null,
    jedinice: [
      {
        naziv: "Eva 1",
        vrsta: "STAN",
        osnovniKapacitet: 4,
        dodatniKapacitet: 2,
        ukupniKapacitet: 6,
        brojSpavacihSoba: 2,
        brojKupaona: 2,
        imaSpavanjeUDnevnom: true,
        sharedPool: false,
        sortOrder: 10,
      },
      {
        naziv: "Eva 2",
        vrsta: "STAN",
        osnovniKapacitet: 4,
        dodatniKapacitet: 2,
        ukupniKapacitet: 6,
        brojSpavacihSoba: 2,
        brojKupaona: 1,
        imaSpavanjeUDnevnom: true,
        sharedPool: false,
        sortOrder: 20,
      },
      {
        naziv: "Eva 3",
        vrsta: "STAN",
        osnovniKapacitet: 4,
        dodatniKapacitet: 2,
        ukupniKapacitet: 6,
        brojSpavacihSoba: 2,
        brojKupaona: 1,
        imaSpavanjeUDnevnom: true,
        sharedPool: false,
        sortOrder: 30,
      },
    ],
  },
];

async function seedOprema() {
  for (const item of opremaJedinice) {
    await prisma.opremaJedinice.upsert({
      where: {
        naziv: item.naziv,
      },
      update: {
        kategorija: item.kategorija,
        sortOrder: item.sortOrder,
        aktivna: true,
      },
      create: {
        naziv: item.naziv,
        kategorija: item.kategorija,
        sortOrder: item.sortOrder,
        aktivna: true,
      },
    });
  }

  console.log("✅ Oprema jedinica unesena / ažurirana.");
}

async function upsertObjekt(data) {
  const existing = await prisma.objekt.findFirst({
    where: {
      naziv: data.naziv,
    },
  });

  if (existing) {
    return prisma.objekt.update({
      where: {
        id: existing.id,
      },
      data: {
        mjesto: data.mjesto,
        imaBazen: data.imaBazen,
        grupaBazena: data.grupaBazena,
      },
    });
  }

  return prisma.objekt.create({
    data: {
      naziv: data.naziv,
      mjesto: data.mjesto,
      imaBazen: data.imaBazen,
      grupaBazena: data.grupaBazena,
    },
  });
}

async function upsertJedinica(objektId, data) {
  const existing = await prisma.jedinica.findFirst({
    where: {
      objektId,
      naziv: data.naziv,
    },
  });

  const payload = {
    naziv: data.naziv,
    vrsta: data.vrsta,
    osnovniKapacitet: data.osnovniKapacitet,
    dodatniKapacitet: data.dodatniKapacitet,
    ukupniKapacitet: data.ukupniKapacitet,
    brojSpavacihSoba: data.brojSpavacihSoba,
    brojKupaona: data.brojKupaona,
    imaSpavanjeUDnevnom: data.imaSpavanjeUDnevnom,
    sharedPool: data.sharedPool,
    aktivna: true,
    sortOrder: data.sortOrder,
    napomena: data.napomena || null,
  };

  if (existing) {
    return prisma.jedinica.update({
      where: {
        id: existing.id,
      },
      data: payload,
    });
  }

  return prisma.jedinica.create({
    data: {
      ...payload,
      objektId,
    },
  });
}

async function seedObjektiIJedinice() {
  for (const objektData of objektiSeed) {
    const objekt = await upsertObjekt(objektData);

    for (const jedinicaData of objektData.jedinice) {
      await upsertJedinica(objekt.id, jedinicaData);
    }
  }

  console.log("✅ Objekti i jedinice uneseni / ažurirani bez brisanja rezervacija.");
}

async function main() {
  await seedOprema();
  await seedObjektiIJedinice();

  console.log("✅ Seed gotov. Ništa nije obrisano.");
}

main()
  .catch((e) => {
    console.error("❌ Greška u seedu:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });