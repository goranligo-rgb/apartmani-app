// Apartments Eva — objekt-specifičan sadržaj vodiča (HR iz finalnog PDF-a 2026;
// EN/DE prijevodi za pregled). Zajednički dijelovi su u lib/vodic/zajednicko.ts.

import type { ObjektSadrzaj } from "../index";

export const eva: ObjektSadrzaj = {
  wifi: { mreza: "MALINSKA27", lozinka: "nikola27" },
  najblizePlaze: ["rupa", "portic"],

  tekst: {
    hr: {
      heroUvod:
        "Apartments Eva prvi je objekt grupe Malinska Stay — obiteljskog brenda naše vlasnice Kristine. Apartmani se nalaze u neposrednoj blizini centra Malinske, odmah iznad gradske tržnice, ali u mirnom dijelu naselja. Dvorište nudi zaštićeni parking za najmanje 3 automobila, a svaki apartman ima vlastitu relax zonu u dvorištu.",
      kucniRed: [
        "Prijava je prema dogovoru s domaćinima, odjava do 10:00 sati ujutro.",
        "Prilikom odjave molimo apartman ostaviti urednim, a eventualna oštećenja prijaviti domaćinima.",
        "U apartmanu mogu boraviti samo prijavljeni gosti.",
        "Kućanske aparate koristite prema pravilima korištenja.",
        "Noćni mir traje od 22:00 do 8:00 — molimo da u tom vremenu ne uznemiravate susjede.",
        "Molimo racionalno korištenje električne energije; ne ostavljajte uključene uređaje kad niste u apartmanu.",
        "Gosti sami brinu o vlastitim stvarima i vrijednostima u apartmanu.",
        "Ako dođe do loma ili kvara predmeta ili uređaja, molimo da u najkraćem roku obavijestite domaćine kako bi se kvar otklonio.",
        "Prilikom odjave molimo da sef ostavite otvoren.",
        "Za boravak dulji od 7 dana, na Vaš zahtjev mijenjamo posteljinu i ručnike.",
      ],
    },
    en: {
      heroUvod:
        "Apartments Eva is the first property of the Malinska Stay group — the family brand of our owner Kristina. The apartments are located right next to the centre of Malinska, just above the town market, yet in a quiet part of the neighbourhood. The yard offers protected parking for at least 3 cars, and each apartment has its own relax zone in the yard.",
      kucniRed: [
        "Check-in is by arrangement with the hosts; check-out is by 10:00 in the morning.",
        "On check-out, please leave the apartment tidy and report any damage to the hosts.",
        "Only registered guests may stay in the apartment.",
        "Use the household appliances according to their instructions.",
        "Quiet hours are from 22:00 to 8:00 — please do not disturb the neighbours during that time.",
        "Please use electricity responsibly; do not leave appliances on when you are not in the apartment.",
        "Guests look after their own belongings and valuables in the apartment.",
        "If an item or appliance breaks or malfunctions, please notify the hosts as soon as possible so it can be fixed.",
        "On check-out, please leave the safe open.",
        "For stays longer than 7 days, we change the bed linen and towels on request.",
      ],
    },
    de: {
      heroUvod:
        "Apartments Eva ist das erste Objekt der Gruppe Malinska Stay — der Familienmarke unserer Eigentümerin Kristina. Die Apartments befinden sich in unmittelbarer Nähe des Zentrums von Malinska, direkt oberhalb des Marktes, jedoch in einem ruhigen Teil des Ortes. Der Hof bietet geschützte Parkplätze für mindestens 3 Autos, und jedes Apartment hat seine eigene Relax-Zone im Hof.",
      kucniRed: [
        "Der Check-in erfolgt nach Absprache mit den Gastgebern, der Check-out bis 10:00 Uhr morgens.",
        "Bitte hinterlassen Sie das Apartment beim Check-out ordentlich und melden Sie etwaige Schäden den Gastgebern.",
        "Im Apartment dürfen sich nur angemeldete Gäste aufhalten.",
        "Verwenden Sie die Haushaltsgeräte gemäß den Nutzungshinweisen.",
        "Die Nachtruhe gilt von 22:00 bis 8:00 Uhr — bitte stören Sie in dieser Zeit die Nachbarn nicht.",
        "Bitte gehen Sie sparsam mit Strom um; lassen Sie keine Geräte eingeschaltet, wenn Sie nicht im Apartment sind.",
        "Die Gäste kümmern sich selbst um ihre eigenen Sachen und Wertgegenstände im Apartment.",
        "Falls ein Gegenstand oder Gerät beschädigt wird oder ausfällt, benachrichtigen Sie bitte die Gastgeber so schnell wie möglich, damit der Schaden behoben werden kann.",
        "Bitte lassen Sie den Safe beim Check-out geöffnet.",
        "Bei Aufenthalten von mehr als 7 Tagen wechseln wir auf Ihren Wunsch Bettwäsche und Handtücher.",
      ],
    },
  },
};
