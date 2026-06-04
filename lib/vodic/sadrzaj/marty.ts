// Luxury Apartments Marty — objekt-specifičan sadržaj vodiča. HR tekstovi
// preuzeti iz finalnog marty_vodic.html; EN/DE prijevodi. Kućni red je isti
// kao Eva pa ga referenciramo (ostaje sinkroniziran).

import type { ObjektSadrzaj } from "../index";
import { eva } from "./eva";

export const marty: ObjektSadrzaj = {
  wifi: { mreza: "MARTY", lozinka: "rijecka45b" },
  najblizePlaze: ["rova"],
  // Rova & Vrtača prva (najbliže), pa ostatak.
  plazeRedoslijed: ["rova", "rupa", "portic", "maestral", "ribarsko", "haludovo"],
  pergolaSlika: "/vodic/dekor/pergola_skica.png",

  tekst: {
    hr: {
      heroUvod:
        "Luxury Apartments Marty najnoviji je objekt grupe Malinska Stay — obiteljskog brenda naše vlasnice Kristine. Apartmani se nalaze u zasebnoj zgradi s ukupno 5 stanova različitih veličina, sa zajedničkim bazenom, pergola relax zonom i privatnim parkingom. Namješteni su u skladu sa suvremenim potrebama putnika, bilo obitelji, grupa ili samaca.",
      kucniRed: eva.tekst.hr.kucniRed,
      rovaOpis: "Mirne šljunčane uvale u neposrednoj blizini apartmana.",
      pergola: [
        "Pergola relax zona **zajednički je prostor svih gostiju**, namijenjen druženju i opuštanju. Molimo da je koristite u dogovoru s ostalim gostima — uz malo međusobne pažnje, mjesta ima za sve. Kod dnevnog korištenja pokupite svoje stvari sa stola i stolica i oslobodite prostor drugima.",
        "**Roštilj se koristi dogovorno** s ostalim gostima. Roštilj i relax zona čiste se svako jutro, a smeće molimo da svatko pokupi za sobom. Zadržavanje u relax zoni moguće je **do 22 sata**, a **krov pergole** nakon korištenja ostavite **zatvoren**.",
        "Za sve dogovore i pitanja tu je Vaša domaćica **Kristina** — slobodno se javite, rado će pomoći.",
      ],
    },
    en: {
      heroUvod:
        "Luxury Apartments Marty is the newest property of the Malinska Stay group — the family brand of our owner Kristina. The apartments are located in a separate building with a total of 5 apartments of various sizes, with a shared pool, a pergola relax zone and private parking. They are furnished to meet the modern needs of travellers, whether families, groups or solo guests.",
      kucniRed: eva.tekst.en.kucniRed,
      rovaOpis: "Quiet pebble coves right next to the apartments.",
      pergola: [
        "The pergola relax zone is a **shared space for all guests**, intended for socialising and relaxing. Please use it in coordination with other guests — with a little mutual consideration, there is room for everyone. When using it during the day, clear your belongings from the table and chairs and free up the space for others.",
        "**The barbecue is used by arrangement** with other guests. The barbecue and relax zone are cleaned every morning, and we ask everyone to pick up their own rubbish. Staying in the relax zone is possible **until 22:00**, and please leave the **pergola roof closed** after use.",
        "For any arrangements and questions, your host **Kristina** is here — feel free to get in touch, she will gladly help.",
      ],
    },
    de: {
      heroUvod:
        "Luxury Apartments Marty ist das neueste Objekt der Gruppe Malinska Stay — der Familienmarke unserer Eigentümerin Kristina. Die Apartments befinden sich in einem separaten Gebäude mit insgesamt 5 Wohnungen unterschiedlicher Größe, mit einem gemeinsamen Pool, einer Pergola-Relax-Zone und privaten Parkplätzen. Sie sind nach den modernen Bedürfnissen der Reisenden eingerichtet, ob Familien, Gruppen oder Alleinreisende.",
      kucniRed: eva.tekst.de.kucniRed,
      rovaOpis: "Ruhige Kieselbuchten in unmittelbarer Nähe der Apartments.",
      pergola: [
        "Die Pergola-Relax-Zone ist ein **gemeinsamer Bereich für alle Gäste**, gedacht zum Beisammensein und Entspannen. Bitte nutzen Sie sie in Absprache mit den anderen Gästen — mit ein wenig gegenseitiger Rücksicht ist Platz für alle. Räumen Sie bei Tagesnutzung Ihre Sachen von Tisch und Stühlen und geben Sie den Platz für andere frei.",
        "**Der Grill wird in Absprache** mit den anderen Gästen genutzt. Grill und Relax-Zone werden jeden Morgen gereinigt, und wir bitten alle, ihren Müll selbst mitzunehmen. Der Aufenthalt in der Relax-Zone ist **bis 22 Uhr** möglich, und lassen Sie das **Pergola-Dach** nach der Nutzung bitte **geschlossen**.",
        "Für alle Absprachen und Fragen ist Ihre Gastgeberin **Kristina** da — melden Sie sich gerne, sie hilft Ihnen gern.",
      ],
    },
  },
};
