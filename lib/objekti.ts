// Statički podaci o objektima koji nisu pohranjeni u bazi
// (npr. fizičke adrese za prikaz lokacije na detail stranicama).

export type ObjektSlug = "eva" | "marty" | "house-art";

export type ObjektPodaci = {
  slug: ObjektSlug;
  punNaziv: string;
  adresa: string;
};

export const OBJEKTI_PODACI: Record<ObjektSlug, ObjektPodaci> = {
  eva: {
    slug: "eva",
    punNaziv: "Apartments Eva",
    adresa: "Nikole Tesle 27, Malinska",
  },
  marty: {
    slug: "marty",
    punNaziv: "Luxury Apartments Marty",
    adresa: "Riječka 45b, Malinska",
  },
  "house-art": {
    slug: "house-art",
    punNaziv: "House Art",
    adresa: "Braće Turčić 25a, Malinska",
  },
};
