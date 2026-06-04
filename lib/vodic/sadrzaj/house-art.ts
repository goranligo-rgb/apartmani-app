// House Art — objekt-specifičan sadržaj vodiča. Kućni red je (zasad) isti kao
// Eva pa ga referenciramo iz eva.ts (ostaje sinkroniziran).

import type { ObjektSadrzaj } from "../index";
import { eva } from "./eva";

export const houseArt: ObjektSadrzaj = {
  wifi: { mreza: "HOUSEART", lozinka: "house25a" },
  najblizePlaze: ["rova"], // kombinirana kartica "Rova & Vrtača" (kljuc "rova")

  tekst: {
    hr: {
      heroUvod:
        "House Art kuća je s privatnim bazenom u grupi Malinska Stay. Nalazi se u mirnoj četvrti u blizini plaže Rova, a dvorište i bazen pružaju potpunu privatnost zahvaljujući visokoj ogradi i zelenilu. Parking je osiguran za dva automobila unutar dvorišta. Kuća je namještena u skladu sa suvremenim potrebama putnika.",
      kucniRed: eva.tekst.hr.kucniRed,
    },
    en: {
      heroUvod:
        "House Art is a house with a private pool in the Malinska Stay group. It is located in a quiet neighbourhood near Rova beach, and the yard and pool offer complete privacy thanks to a high fence and greenery. Parking for two cars is provided within the yard. The house is furnished to meet the modern needs of travellers.",
      kucniRed: eva.tekst.en.kucniRed,
    },
    de: {
      heroUvod:
        "House Art ist ein Haus mit privatem Pool in der Gruppe Malinska Stay. Es liegt in einem ruhigen Viertel in der Nähe des Strandes Rova, und der Hof und der Pool bieten dank eines hohen Zauns und Grüns völlige Privatsphäre. Im Hof stehen Parkplätze für zwei Autos zur Verfügung. Das Haus ist nach den modernen Bedürfnissen der Reisenden eingerichtet.",
      kucniRed: eva.tekst.de.kucniRed,
    },
  },
};
