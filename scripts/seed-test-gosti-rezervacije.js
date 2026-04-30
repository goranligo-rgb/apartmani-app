const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

const testGosti = [
  ["Marko", "Horvat", "marko.horvat@test.com", "+385 91 111 1111", "Zagreb"],
  ["Ana", "Kovač", "ana.kovac@test.com", "+385 91 222 2222", "Varaždin"],
  ["Ivan", "Novak", "ivan.novak@test.com", "+385 91 333 3333", "Rijeka"],
  ["Petra", "Babić", "petra.babic@test.com", "+385 91 444 4444", "Osijek"],
  ["Luka", "Marić", "luka.maric@test.com", "+385 91 555 5555", "Split"],
  ["Sara", "Jurić", "sara.juric@test.com", "+385 91 666 6666", "Ljubljana"],
];

async function main() {
  const jedinice = await prisma.jedinica.findMany({
    include: { objekt: true },
    orderBy: [{ objekt: { naziv: "asc" } }, { sortOrder: "asc" }, { naziv: "asc" }],
  });

  if (jedinice.length === 0) {
    throw new Error("Nema jedinica. Prvo pokreni seed za objekte i jedinice.");
  }

  console.log(`Pronađeno jedinica: ${jedinice.length}`);

  const gosti = [];

  for (const [ime, prezime, email, telefon, grad] of testGosti) {
    const gost = await prisma.gost.upsert({
      where: { email },
      update: {
        ime,
        prezime,
        telefon,
        grad,
        drzava: "Hrvatska",
        adresa: `Test adresa ${Math.floor(Math.random() * 100) + 1}`,
        oznake: email.includes("ana") ? "VIP, povratni gost" : "",
        napomena: email.includes("ana")
          ? "Test gost s oznakom VIP. Koristi se za provjeru dashboarda gosta."
          : "Test gost za provjeru rezervacija.",
      },
      create: {
        ime,
        prezime,
        email,
        telefon,
        grad,
        drzava: "Hrvatska",
        adresa: `Test adresa ${Math.floor(Math.random() * 100) + 1}`,
        oznake: email.includes("ana") ? "VIP, povratni gost" : "",
        napomena: email.includes("ana")
          ? "Test gost s oznakom VIP. Koristi se za provjeru dashboarda gosta."
          : "Test gost za provjeru rezervacija.",
      },
    });

    gosti.push(gost);
  }

  const danas = new Date();
  danas.setHours(12, 0, 0, 0);

  for (let i = 0; i < 10; i++) {
    const gost = gosti[i % gosti.length];
    const jedinica = jedinice[i % jedinice.length];

    const datumOd = addDays(danas, i * 2);
    const brojNoci = i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 2;
    const datumDo = addDays(datumOd, brojNoci);

    const cijenaNoc = 120 + (i % 4) * 25;
    const iznosUkupno = brojNoci * cijenaNoc;

    const postoji = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId: jedinica.id,
        datumOd,
        datumDo,
      },
    });

    if (postoji) continue;

    await prisma.rezervacija.create({
      data: {
        jedinicaId: jedinica.id,
        gostId: gost.id,

        gostIme: gost.ime || "",
        gostPrezime: gost.prezime || "",
        gostEmail: gost.email || "",
        gostTelefon: gost.telefon || "",

        datumOd,
        datumDo,
        status: i % 4 === 0 ? "UPIT" : "POTVRĐENO",

        brojOdraslih: i % 2 === 0 ? 2 : 4,
        brojDjece: i % 3 === 0 ? 1 : 0,

        iznosUkupno,
        napomena:
          i % 4 === 0
            ? "Test upit za provjeru boje i statusa."
            : "Test potvrđena rezervacija.",
      },
    });

    console.log(
      `✅ ${gost.ime} ${gost.prezime} - ${jedinica.objekt.naziv} / ${jedinica.naziv} - ${datumOd.toLocaleDateString("hr-HR")} do ${datumDo.toLocaleDateString("hr-HR")}`
    );
  }

  console.log("✅ Test gosti i rezervacije uneseni.");
}

main()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });