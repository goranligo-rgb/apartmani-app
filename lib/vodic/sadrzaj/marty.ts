// Luxury Apartments Marty — objekt-specifičan sadržaj vodiča. Kućni red je
// (zasad) isti kao Eva pa ga referenciramo iz eva.ts (ostaje sinkroniziran).

import type { ObjektSadrzaj } from "../index";
import { eva } from "./eva";

export const marty: ObjektSadrzaj = {
  wifi: { mreza: "MARTY", lozinka: "rijecka45b" },
  najblizePlaze: ["rova"], // kombinirana kartica "Rova & Vrtača" (kljuc "rova")

  tekst: {
    hr: {
      heroUvod:
        "Luxury Apartments Marty najnoviji je objekt grupe Malinska Stay. Apartmani se nalaze u zasebnoj zgradi s ukupno 5 stanova različitih veličina, sa zajedničkim bazenom, pergola relax zonom i privatnim parkingom. Namješteni su u skladu sa suvremenim potrebama putnika, bilo obitelji, grupa ili samaca.",
      kucniRed: eva.tekst.hr.kucniRed,
    },
    en: {
      heroUvod:
        "Luxury Apartments Marty is the newest property of the Malinska Stay group. The apartments are located in a separate building with a total of 5 apartments of various sizes, with a shared pool, a pergola relax zone and private parking. They are furnished to meet the modern needs of travellers, whether families, groups or solo guests.",
      kucniRed: eva.tekst.en.kucniRed,
    },
    de: {
      heroUvod:
        "Luxury Apartments Marty ist das neueste Objekt der Gruppe Malinska Stay. Die Apartments befinden sich in einem separaten Gebäude mit insgesamt 5 Wohnungen unterschiedlicher Größe, mit einem gemeinsamen Pool, einer Pergola-Relax-Zone und privaten Parkplätzen. Sie sind nach den modernen Bedürfnissen der Reisenden eingerichtet, ob Familien, Gruppen oder Alleinreisende.",
      kucniRed: eva.tekst.de.kucniRed,
    },
  },
};
