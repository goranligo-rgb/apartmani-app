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
        "**Prijava** gostiju je prema dogovoru s domaćinima, dok je **odjava do 10:00 sati** ujutro.",
        "Prilikom odjave molimo apartman ostaviti urednim, a eventualna oštećenja prijaviti domaćinima.",
        "Osobe koje nisu prijavljene kao gosti apartmana ne mogu boraviti u apartmanu.",
        "Sve kućanske aparate koristite prema pravilima korištenja.",
        "Vrijeme **noćnog odmora** započinje u **22:00** i traje do **8:00** — molimo da u tom vremenu ne uznemiravate susjede.",
        "Molimo racionalno korištenje električne energije; ne ostavljajte uključene uređaje kad niste u apartmanu.",
        "Gosti su dužni sami brinuti o vlastitim stvarima i vrijednostima u apartmanu.",
        "Ako dođe do loma ili kvara predmeta ili uređaja, molimo da u najkraćem roku obavijestite domaćine kako bi se kvar otklonio.",
        "Prilikom odjave molimo da **sef ostavite otvoren**.",
        "Ako je Vaš boravak dulji od 7 dana, na Vaš zahtjev mijenjamo posteljinu i ručnike.",
      ],
    },
    en: {
      heroUvod:
        "Apartments Eva is the first property of the Malinska Stay group — the family brand of our owner Kristina. The apartments are located right next to the centre of Malinska, just above the town market, yet in a quiet part of the neighbourhood. The yard offers protected parking for at least 3 cars, and each apartment has its own relax zone in the yard.",
      kucniRed: [
        "**Check-in** for guests is by arrangement with the hosts, while **check-out is by 10:00** in the morning.",
        "On check-out, please leave the apartment tidy and report any damage to the hosts.",
        "Persons not registered as guests of the apartment may not stay in the apartment.",
        "Use all household appliances according to their instructions.",
        "**Quiet hours** begin at **22:00** and last until **8:00** — please do not disturb the neighbours during that time.",
        "Please use electricity responsibly; do not leave appliances on when you are not in the apartment.",
        "Guests are responsible for looking after their own belongings and valuables in the apartment.",
        "If an item or appliance breaks or malfunctions, please notify the hosts as soon as possible so it can be fixed.",
        "On check-out, please **leave the safe open**.",
        "If your stay is longer than 7 days, we change the bed linen and towels on request.",
      ],
    },
    de: {
      heroUvod:
        "Apartments Eva ist das erste Objekt der Gruppe Malinska Stay — der Familienmarke unserer Eigentümerin Kristina. Die Apartments befinden sich in unmittelbarer Nähe des Zentrums von Malinska, direkt oberhalb des Marktes, jedoch in einem ruhigen Teil des Ortes. Der Hof bietet geschützte Parkplätze für mindestens 3 Autos, und jedes Apartment hat seine eigene Relax-Zone im Hof.",
      kucniRed: [
        "Die **Anmeldung** der Gäste erfolgt nach Absprache mit den Gastgebern, während der **Check-out bis 10:00 Uhr** morgens ist.",
        "Bitte hinterlassen Sie das Apartment beim Check-out ordentlich und melden Sie etwaige Schäden den Gastgebern.",
        "Personen, die nicht als Gäste des Apartments angemeldet sind, dürfen sich nicht im Apartment aufhalten.",
        "Verwenden Sie alle Haushaltsgeräte gemäß den Nutzungshinweisen.",
        "Die **Nachtruhe** beginnt um **22:00** und dauert bis **8:00** — bitte stören Sie in dieser Zeit die Nachbarn nicht.",
        "Bitte gehen Sie sparsam mit Strom um; lassen Sie keine Geräte eingeschaltet, wenn Sie nicht im Apartment sind.",
        "Die Gäste sind selbst für ihre eigenen Sachen und Wertgegenstände im Apartment verantwortlich.",
        "Falls ein Gegenstand oder Gerät beschädigt wird oder ausfällt, benachrichtigen Sie bitte die Gastgeber so schnell wie möglich, damit der Schaden behoben werden kann.",
        "Lassen Sie beim Check-out bitte den **Safe geöffnet**.",
        "Bei Aufenthalten von mehr als 7 Tagen wechseln wir auf Ihren Wunsch Bettwäsche und Handtücher.",
      ],
    },
  },
};
