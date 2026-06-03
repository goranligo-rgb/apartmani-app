import type { MailTekstovi } from "../index";

// Hrvatski tekstovi mailova gostu. KOPIJA 1:1 postojećih stringova iz koda —
// ako tu mijenjaš tekst, mijenjaš i produkciju.
//
// Sintaksa funkcijskih polja namjerno reproducira originalne template
// literale (npr. `${ime} ${prezime}` ostavlja trailing space kad je
// prezime prazan — to je postojeće ponašanje, ne bug).
export const hr: MailTekstovi = {
  // 1. ZAPRIMI_REZERVACIJU — lib/zaprimiRezervaciju.ts
  zaprimiRezervaciju: {
    subject: "Rezervacija je zaprimljena - Malinska Stay",
    title: "Rezervacija je zaprimljena",
    subtitle: "Hvala vam na rezervaciji. Vaš zahtjev je uspješno zaprimljen.",
    pozdrav: (ime, prezime) =>
      `Poštovani <strong>${ime} ${prezime}</strong>,`,
    uvodPara: (iznos) =>
      `Vaša kartica je uspješno autorizirana za iznos <strong>${iznos}</strong>. Novac još nije naplaćen, nego su sredstva samo rezervirana do konačne potvrde rezervacije.`,
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelBrojNocenja: "Broj noćenja:",
    labelBrojOsoba: "Broj osoba:",
    vaznoNaslov: "Važno:",
    vaznoText:
      "Rezervacija još čeka konačnu potvrdu domaćina. Nakon obrade poslat ćemo vam konačnu potvrdu rezervacije.",
    racunNapomena: "Račun se šalje tek nakon stvarne naplate.",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 2. POTVRDA_NAPLATE — lib/potvrdaNaplate.ts (admin klik "Potvrdi plaćanje")
  potvrdaNaplate: {
    subject: (placeno) =>
      placeno
        ? "Rezervacija i plaćanje potvrđeni"
        : "Vaša rezervacija je potvrđena",
    title: (placeno) =>
      placeno
        ? "Rezervacija i plaćanje potvrđeni"
        : "Rezervacija je potvrđena",
    subtitle: (placeno) =>
      placeno
        ? "Vaša rezervacija je potvrđena i u potpunosti plaćena."
        : "Vaša rezervacija je potvrđena uz uplatu akontacije.",
    pozdrav: (ime) => `Poštovani <strong>${ime}</strong>,`,
    uvodPara: (placeno) =>
      placeno
        ? "Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena."
        : "Vaša rezervacija je uspješno potvrđena. Preostali iznos bit će potrebno podmiriti prema dogovorenim uvjetima prije dolaska.",
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelUplaceno: "Uplaćeno:",
    labelPreostalo: "Preostalo za uplatu:",
    potvrdjenoNaslov: "Potvrđeno:",
    potvrdjenoText: (placeno) =>
      placeno
        ? "Rezervacija je u potpunosti plaćena. U privitku vam šaljemo račun."
        : "Rezervacija je potvrđena. U privitku vam šaljemo račun za zaprimljenu uplatu. Ostatak iznosa potrebno je uplatiti prije dolaska — podsjetnik s linkom za uplatu poslat ćemo Vam nekoliko dana ranije.",
    veselimoSe: "Veselimo se vašem dolasku u Malinsku.",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 3. USPJEH_PLACANJE — app/[locale]/rezervacije/uspjeh/page.tsx
  uspjehPlacanje: {
    subject: (placeno) =>
      placeno
        ? "Rezervacija i plaćanje potvrđeni - Malinska Stay"
        : "Rezervacija je potvrđena - Malinska Stay",
    title: (placeno) =>
      placeno
        ? "Rezervacija i plaćanje potvrđeni"
        : "Rezervacija je potvrđena",
    subtitle: (placeno) =>
      placeno
        ? "Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena."
        : "Akontacija je zaprimljena i rezervacija je potvrđena.",
    pozdrav: (ime, prezime) =>
      `Poštovani <strong>${ime} ${prezime}</strong>,`,
    uvodPara: (placeno) =>
      placeno
        ? "Vaše plaćanje je uspješno zaprimljeno i rezervacija je u potpunosti plaćena."
        : "Vaša akontacija je uspješno zaprimljena i rezervacija je potvrđena.",
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelBrojNocenja: "Broj noćenja:",
    labelBrojOsoba: "Broj osoba:",
    labelZaprimljenaUplata: "Zaprimljena uplata:",
    labelPreostalo: "Preostalo za platiti:",
    potvrdjenoNaslov: "Potvrđeno:",
    potvrdjenoText: (placeno) =>
      placeno
        ? "Rezervacija je potvrđena i u potpunosti plaćena."
        : "Rezervacija je potvrđena. Ostatak iznosa potrebno je platiti prema dogovorenim uvjetima.",
    racunOtvoriText: "Račun možete otvoriti ovdje:",
    racunOtvoriLink: "Otvori račun",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 4. RACUN_PONOVNO_POSLAN — app/api/admin/racuni/posalji/route.ts
  racunPonovnoPoslan: {
    subject: (brojRacuna) => `Račun ${brojRacuna} ponovno poslan`,
    pozdrav: "Poštovani,",
    privitak: "U privitku vam ponovno šaljemo račun.",
    zavrsetak: "Lijep pozdrav,<br/>Malinska Stay",
  },

  // 5. PODSJETNIK_OSTATAK — app/api/cron/ostatak/route.ts
  podsjetnikOstatak: {
    subject: "Molimo uplatu ostatka rezervacije",
    title: "Podsjetnik za uplatu ostatka",
    subtitle: "Vaš dolazak se približava.",
    pozdrav: (ime) => `Poštovani <strong>${ime}</strong>,`,
    uvodPara:
      "Ljubazno vas podsjećamo da je preostali iznos za vašu rezervaciju potrebno podmiriti prije dolaska.",
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelPreostalo: "Preostalo za uplatu:",
    button: "Plati ostatak rezervacije",
    vecZanemarite:
      "Ako ste uplatu već izvršili, ovu poruku možete zanemariti.",
    veselimoSe: "Veselimo se vašem dolasku u Malinsku.",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 6. POZIV_ZA_PLACANJE — app/admin/rezervacije/nova/page.tsx (POZIV_KARTICA)
  pozivZaPlacanje: {
    subject: (cijeli) =>
      cijeli ? "Poziv za plaćanje rezervacije" : "Poziv za plaćanje akontacije",
    title: (cijeli) =>
      cijeli ? "Poziv za plaćanje rezervacije" : "Poziv za plaćanje akontacije",
    subtitle: (cijeli) =>
      cijeli
        ? "Za potvrdu rezervacije potrebno je platiti puni iznos."
        : "Za potvrdu rezervacije potrebno je platiti akontaciju.",
    pozdrav: (imePrezime) => `Poštovani <strong>${imePrezime}</strong>,`,
    infoText: (cijeli, danaDoDolaska) =>
      cijeli
        ? `Vaša rezervacija je evidentirana. Budući da je dolazak za ${danaDoDolaska} dana, za potvrdu rezervacije potrebno je platiti puni iznos.`
        : "Vaša rezervacija je evidentirana. Za potvrdu rezervacije potrebno je platiti akontaciju.",
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelUkupanIznos: "Ukupan iznos rezervacije:",
    labelIznosZaUplatu: "Iznos za uplatu:",
    labelOstatak: "Ostatak:",
    labelRokPlacanja: "Rok plaćanja:",
    automatskaPotvrda:
      "Nakon uspješne uplate primit ćete automatsku potvrdu rezervacije i račun.",
    button: (cijeli) =>
      cijeli ? "Plati rezervaciju karticom" : "Plati akontaciju karticom",
    akoGumbNeRadi: "Ako gumb ne radi, kopirajte ovaj link u preglednik:",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 7. REZERVACIJA_ZAPRIMLJENA_BANKA — app/admin/rezervacije/nova/page.tsx (BANKA_CEKA)
  rezervacijaZaprimljenaBanka: {
    subject: "Rezervacija zaprimljena — čekamo uplatu",
    title: "Rezervacija je zaprimljena",
    subtitle: "Čekamo uplatu za potvrdu rezervacije.",
    pozdrav: (imePrezime) => `Poštovani <strong>${imePrezime}</strong>,`,
    infoText:
      "Vaša rezervacija je evidentirana. Za potvrdu rezervacije potrebno je izvršiti uplatu u navedenom roku. Nakon što uplata bude vidljiva na našem računu, poslat ćemo vam potvrdu rezervacije i račun. Ako uplata ne sjedne u roku, rezervacija se može automatski stornirati.",
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelUkupanIznos: "Ukupan iznos rezervacije:",
    labelIznosZaUplatu: "Iznos za uplatu:",
    labelOstatak: "Ostatak:",
    labelRokPlacanja: "Rok plaćanja:",
    automatskaPotvrda:
      "Nakon uspješne uplate primit ćete automatsku potvrdu rezervacije i račun.",
    button: "Čekamo uplatu preko banke",
    akoGumbNeRadi: "Ako gumb ne radi, kopirajte ovaj link u preglednik:",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 8. REZERVACIJA_ODBIJENA — app/admin/rezervacije/[id]/page.tsx (admin odbija)
  rezervacijaOdbijena: {
    subject: "Rezervacija nije potvrđena",
    title: "Rezervacija nije potvrđena",
    subtitle:
      "Žao nam je, vašu rezervaciju trenutno nismo u mogućnosti potvrditi.",
    pozdrav: (ime, prezime) =>
      `Poštovani <strong>${ime} ${prezime}</strong>,`,
    uvodPara:
      "Hvala vam na poslanom zahtjevu za rezervaciju. Nažalost, nakon provjere dostupnosti nismo u mogućnosti potvrditi ovu rezervaciju.",
    detaljiNaslov: "Detalji zahtjeva",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    autorizacijaPonistena:
      "Ako je kartica bila autorizirana, autorizacija se poništava i iznos se ne naplaćuje.",
    ispricavamoSe:
      "Ispričavamo se zbog neugodnosti. Slobodno nam se javite za drugi termin ili drugu smještajnu jedinicu.",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 9. ZAHTJEV_ZA_UPLATU — app/admin/rezervacije/[id]/page.tsx (kreirajZahtjevZaUplatu)
  zahtjevZaUplatu: {
    subject: (tip) =>
      tip === "AKONTACIJA"
        ? "Zahtjev za uplatu akontacije"
        : tip === "RAZLIKA"
          ? "Zahtjev za uplatu razlike"
          : "Zahtjev za uplatu ostatka",
    subtitle: "Rezervacija čeka uplatu.",
    pozdrav: (ime, prezime) =>
      `Poštovani <strong>${ime} ${prezime}</strong>,`,
    uvodPara:
      "Vaša rezervacija je evidentirana. Molimo uplatu kako bismo mogli potvrditi rezervaciju.",
    detaljiNaslov: "Detalji rezervacije",
    labelObjekt: "Objekt:",
    labelJedinica: "Smještajna jedinica:",
    labelDolazak: "Dolazak:",
    labelOdlazak: "Odlazak:",
    labelIznosZaUplatu: "Iznos za uplatu:",
    labelRokUplate: "Rok uplate:",
    napomena:
      "Nakon što uplata bude vidljiva na našem računu, poslat ćemo vam potvrdu rezervacije i račun.",
    button: (tip) =>
      tip === "AKONTACIJA"
        ? "Plati akontaciju karticom"
        : tip === "RAZLIKA"
          ? "Plati razliku karticom"
          : "Plati ostatak karticom",
    akoGumbNeRadi: "Ako gumb ne radi, kopirajte ovaj link u preglednik:",
    zavrsetak: "Lijep pozdrav,<br/><strong>Malinska Stay</strong>",
  },

  // 10. TTLOCK_SIFRA — app/admin/ttlock/rezervacije/page.tsx
  ttlockSifra: {
    subject: (nazivObjekta) => `Vaša ulazna šifra - ${nazivObjekta}`,
    naslov: (nazivObjekta, jedinicaNaziv) =>
      jedinicaNaziv
        ? `Dobrodošli u ${nazivObjekta}, ${jedinicaNaziv}`
        : `Dobrodošli u ${nazivObjekta}`,
    pozdrav: (ime) => `Poštovani ${ime},`,
    sifraJe: "Vaša ulazna šifra je:",
    sifraVrijedi: (vrijediOd, vrijediDo) =>
      `Šifra vrijedi od <strong>${vrijediOd}</strong> do <strong>${vrijediDo}</strong>.`,
    vrijediZa: "Šifra vrijedi za:",
    zavrsetak: "Lijep pozdrav,<br/>Malinska Stay",
  },
};
