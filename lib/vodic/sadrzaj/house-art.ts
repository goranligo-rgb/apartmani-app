// House Art — objekt-specifičan sadržaj vodiča. HR tekstovi preuzeti iz finalnog
// house_art_vodic.html; EN/DE prijevodi. Kućni red je isti kao Eva pa ga
// referenciramo (ostaje sinkroniziran).

import type { ObjektSadrzaj } from "../index";
import { eva } from "./eva";

export const houseArt: ObjektSadrzaj = {
  wifi: { mreza: "HOUSEART", lozinka: "house25a" },
  najblizePlaze: ["rova"],
  // Rova & Vrtača prva (najbliže), pa ostatak.
  plazeRedoslijed: ["rova", "rupa", "portic", "maestral", "ribarsko", "haludovo"],

  tekst: {
    hr: {
      heroUvod:
        "House Art kuća je s privatnim bazenom grupe Malinska Stay — obiteljskog brenda naše vlasnice Kristine. Nalazi se u mirnoj četvrti u blizini plaže Rova, a dvorište i bazen pružaju potpunu privatnost zahvaljujući visokoj ogradi i zelenilu. Parking je osiguran za dva automobila unutar dvorišta. Kuća je namještena u skladu sa suvremenim potrebama putnika.",
      kucniRed: eva.tekst.hr.kucniRed,
      rovaOpis: "Mirne šljunčane uvale u neposrednoj blizini kuće.",
    },
    en: {
      heroUvod:
        "House Art is a house with a private pool in the Malinska Stay group — the family brand of our owner Kristina. It is located in a quiet neighbourhood near Rova beach, and the yard and pool offer complete privacy thanks to a high fence and greenery. Parking for two cars is provided within the yard. The house is furnished to meet the modern needs of travellers.",
      kucniRed: eva.tekst.en.kucniRed,
      rovaOpis: "Quiet pebble coves right next to the house.",
    },
    de: {
      heroUvod:
        "House Art ist ein Haus mit privatem Pool in der Gruppe Malinska Stay — der Familienmarke unserer Eigentümerin Kristina. Es liegt in einem ruhigen Viertel in der Nähe des Strandes Rova, und der Hof und der Pool bieten dank eines hohen Zauns und Grüns völlige Privatsphäre. Im Hof stehen Parkplätze für zwei Autos zur Verfügung. Das Haus ist nach den modernen Bedürfnissen der Reisenden eingerichtet.",
      kucniRed: eva.tekst.de.kucniRed,
      rovaOpis: "Ruhige Kieselbuchten in unmittelbarer Nähe des Hauses.",
    },
  },
};
