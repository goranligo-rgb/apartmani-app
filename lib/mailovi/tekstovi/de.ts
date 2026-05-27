import type { MailTekstovi } from "../index";

// Njemacki prijevodi mailova gostu. Struktura 1:1 s hr.ts (isti kljucevi i
// potpisi funkcija), samo prevedene rijeci. Pozdrav: "Hallo {ime}", Sie forma.
export const de: MailTekstovi = {
  // 1. ZAPRIMI_REZERVACIJU
  zaprimiRezervaciju: {
    subject: "Reservierung eingegangen - Malinska Stay",
    title: "Reservierung eingegangen",
    subtitle: "Vielen Dank für Ihre Reservierung. Ihre Anfrage ist erfolgreich bei uns eingegangen.",
    pozdrav: (ime, prezime) =>
      `Hallo <strong>${ime} ${prezime}</strong>,`,
    uvodPara: (iznos) =>
      `Ihre Karte wurde erfolgreich für den Betrag von <strong>${iznos}</strong> autorisiert. Der Betrag wurde noch nicht abgebucht, sondern lediglich bis zur endgültigen Bestätigung der Reservierung reserviert.`,
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelBrojNocenja: "Anzahl der Nächte:",
    labelBrojOsoba: "Anzahl der Gäste:",
    vaznoNaslov: "Wichtig:",
    vaznoText:
      "Die Reservierung wartet noch auf die endgültige Bestätigung durch den Gastgeber. Nach der Bearbeitung senden wir Ihnen die endgültige Reservierungsbestätigung.",
    racunNapomena: "Die Rechnung wird erst nach der tatsächlichen Abbuchung versendet.",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 2. POTVRDA_NAPLATE
  potvrdaNaplate: {
    subject: (placeno) =>
      placeno
        ? "Reservierung und Zahlung bestätigt"
        : "Ihre Reservierung ist bestätigt",
    title: (placeno) =>
      placeno
        ? "Reservierung und Zahlung bestätigt"
        : "Reservierung bestätigt",
    subtitle: (placeno) =>
      placeno
        ? "Ihre Reservierung ist bestätigt und vollständig bezahlt."
        : "Ihre Reservierung ist mit geleisteter Anzahlung bestätigt.",
    pozdrav: (ime) => `Hallo <strong>${ime}</strong>,`,
    uvodPara: (placeno) =>
      placeno
        ? "Ihre Zahlung ist erfolgreich eingegangen und Ihre Reservierung ist bestätigt."
        : "Ihre Reservierung wurde erfolgreich bestätigt. Der Restbetrag ist gemäß den vereinbarten Bedingungen vor der Anreise zu begleichen.",
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelUplaceno: "Bezahlt:",
    labelPreostalo: "Noch zu zahlen:",
    potvrdjenoNaslov: "Bestätigt:",
    potvrdjenoText: (placeno) =>
      placeno
        ? "Die Reservierung ist vollständig bezahlt. Die Rechnung finden Sie im Anhang."
        : "Die Reservierung ist bestätigt. Im Anhang finden Sie die Rechnung für die eingegangene Zahlung. Der Restbetrag ist vor der Anreise zu begleichen — einige Tage vorher senden wir Ihnen eine Erinnerung mit einem Zahlungslink.",
    veselimoSe: "Wir freuen uns auf Ihren Besuch in Malinska.",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 3. USPJEH_PLACANJE
  uspjehPlacanje: {
    subject: (placeno) =>
      placeno
        ? "Reservierung und Zahlung bestätigt - Malinska Stay"
        : "Reservierung bestätigt - Malinska Stay",
    title: (placeno) =>
      placeno
        ? "Reservierung und Zahlung bestätigt"
        : "Reservierung bestätigt",
    subtitle: (placeno) =>
      placeno
        ? "Ihre Zahlung ist erfolgreich eingegangen und Ihre Reservierung ist bestätigt."
        : "Die Anzahlung ist eingegangen und Ihre Reservierung ist bestätigt.",
    pozdrav: (ime, prezime) =>
      `Hallo <strong>${ime} ${prezime}</strong>,`,
    uvodPara: (placeno) =>
      placeno
        ? "Ihre Zahlung ist erfolgreich eingegangen und die Reservierung ist vollständig bezahlt."
        : "Ihre Anzahlung ist erfolgreich eingegangen und die Reservierung ist bestätigt.",
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelBrojNocenja: "Anzahl der Nächte:",
    labelBrojOsoba: "Anzahl der Gäste:",
    labelZaprimljenaUplata: "Eingegangene Zahlung:",
    labelPreostalo: "Noch zu zahlen:",
    potvrdjenoNaslov: "Bestätigt:",
    potvrdjenoText: (placeno) =>
      placeno
        ? "Die Reservierung ist bestätigt und vollständig bezahlt."
        : "Die Reservierung ist bestätigt. Der Restbetrag ist gemäß den vereinbarten Bedingungen zu zahlen.",
    racunOtvoriText: "Ihre Rechnung können Sie hier öffnen:",
    racunOtvoriLink: "Rechnung öffnen",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 4. RACUN_PONOVNO_POSLAN
  racunPonovnoPoslan: {
    subject: (brojRacuna) => `Rechnung ${brojRacuna} erneut gesendet`,
    pozdrav: "Hallo,",
    privitak: "Im Anhang senden wir Ihnen erneut Ihre Rechnung.",
    zavrsetak: "Mit freundlichen Grüßen,<br/>Malinska Stay",
  },

  // 5. PODSJETNIK_OSTATAK
  podsjetnikOstatak: {
    subject: "Bitte begleichen Sie den Restbetrag Ihrer Reservierung",
    title: "Erinnerung zur Zahlung des Restbetrags",
    subtitle: "Ihre Anreise rückt näher.",
    pozdrav: (ime) => `Hallo <strong>${ime}</strong>,`,
    uvodPara:
      "Wir möchten Sie freundlich daran erinnern, dass der Restbetrag für Ihre Reservierung vor der Anreise zu begleichen ist.",
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelPreostalo: "Noch zu zahlen:",
    button: "Restbetrag bezahlen",
    vecZanemarite:
      "Falls Sie die Zahlung bereits getätigt haben, können Sie diese Nachricht ignorieren.",
    veselimoSe: "Wir freuen uns auf Ihren Besuch in Malinska.",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 6. POZIV_ZA_PLACANJE
  pozivZaPlacanje: {
    subject: (cijeli) =>
      cijeli ? "Aufforderung zur Zahlung der Reservierung" : "Aufforderung zur Zahlung der Anzahlung",
    title: (cijeli) =>
      cijeli ? "Aufforderung zur Zahlung der Reservierung" : "Aufforderung zur Zahlung der Anzahlung",
    subtitle: (cijeli) =>
      cijeli
        ? "Zur Bestätigung der Reservierung ist der volle Betrag zu zahlen."
        : "Zur Bestätigung der Reservierung ist eine Anzahlung zu leisten.",
    pozdrav: (imePrezime) => `Hallo <strong>${imePrezime}</strong>,`,
    infoText: (cijeli, danaDoDolaska) =>
      cijeli
        ? `Ihre Reservierung wurde erfasst. Da Ihre Anreise in ${danaDoDolaska} Tagen erfolgt, ist zur Bestätigung der Reservierung der volle Betrag zu zahlen.`
        : "Ihre Reservierung wurde erfasst. Zur Bestätigung der Reservierung ist eine Anzahlung zu leisten.",
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelUkupanIznos: "Gesamtbetrag der Reservierung:",
    labelIznosZaUplatu: "Zu zahlender Betrag:",
    labelOstatak: "Restbetrag:",
    labelRokPlacanja: "Zahlungsfrist:",
    automatskaPotvrda:
      "Nach erfolgreicher Zahlung erhalten Sie automatisch die Reservierungsbestätigung und die Rechnung.",
    button: (cijeli) =>
      cijeli ? "Reservierung mit Karte bezahlen" : "Anzahlung mit Karte bezahlen",
    akoGumbNeRadi: "Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 7. REZERVACIJA_ZAPRIMLJENA_BANKA
  rezervacijaZaprimljenaBanka: {
    subject: "Reservierung eingegangen — Zahlung ausstehend",
    title: "Reservierung eingegangen",
    subtitle: "Wir warten auf Ihre Zahlung zur Bestätigung der Reservierung.",
    pozdrav: (imePrezime) => `Hallo <strong>${imePrezime}</strong>,`,
    infoText:
      "Ihre Reservierung wurde erfasst. Zur Bestätigung der Reservierung ist die Zahlung innerhalb der angegebenen Frist zu leisten. Sobald die Zahlung auf unserem Konto sichtbar ist, senden wir Ihnen die Reservierungsbestätigung und die Rechnung. Geht die Zahlung nicht fristgerecht ein, kann die Reservierung automatisch storniert werden.",
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelUkupanIznos: "Gesamtbetrag der Reservierung:",
    labelIznosZaUplatu: "Zu zahlender Betrag:",
    labelOstatak: "Restbetrag:",
    labelRokPlacanja: "Zahlungsfrist:",
    automatskaPotvrda:
      "Nach erfolgreicher Zahlung erhalten Sie automatisch die Reservierungsbestätigung und die Rechnung.",
    button: "Wir warten auf Ihre Banküberweisung",
    akoGumbNeRadi: "Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 8. REZERVACIJA_ODBIJENA
  rezervacijaOdbijena: {
    subject: "Reservierung nicht bestätigt",
    title: "Reservierung nicht bestätigt",
    subtitle:
      "Es tut uns leid, wir können Ihre Reservierung derzeit leider nicht bestätigen.",
    pozdrav: (ime, prezime) =>
      `Hallo <strong>${ime} ${prezime}</strong>,`,
    uvodPara:
      "Vielen Dank für Ihre Reservierungsanfrage. Leider können wir diese Reservierung nach Prüfung der Verfügbarkeit nicht bestätigen.",
    detaljiNaslov: "Details der Anfrage",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    autorizacijaPonistena:
      "Falls Ihre Karte autorisiert wurde, wird die Autorisierung aufgehoben und es wird kein Betrag abgebucht.",
    ispricavamoSe:
      "Wir entschuldigen uns für die Unannehmlichkeiten. Kontaktieren Sie uns gerne für einen anderen Termin oder eine andere Unterkunft.",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 9. ZAHTJEV_ZA_UPLATU
  zahtjevZaUplatu: {
    subject: (tip) =>
      tip === "AKONTACIJA"
        ? "Aufforderung zur Zahlung der Anzahlung"
        : tip === "RAZLIKA"
          ? "Aufforderung zur Zahlung der Differenz"
          : "Aufforderung zur Zahlung des Restbetrags",
    subtitle: "Ihre Reservierung wartet auf Zahlung.",
    pozdrav: (ime, prezime) =>
      `Hallo <strong>${ime} ${prezime}</strong>,`,
    uvodPara:
      "Ihre Reservierung wurde erfasst. Bitte leisten Sie die Zahlung, damit wir die Reservierung bestätigen können.",
    detaljiNaslov: "Reservierungsdetails",
    labelObjekt: "Objekt:",
    labelJedinica: "Unterkunft:",
    labelDolazak: "Anreise:",
    labelOdlazak: "Abreise:",
    labelIznosZaUplatu: "Zu zahlender Betrag:",
    labelRokUplate: "Zahlungsfrist:",
    napomena:
      "Sobald die Zahlung auf unserem Konto sichtbar ist, senden wir Ihnen die Reservierungsbestätigung und die Rechnung.",
    zavrsetak: "Mit freundlichen Grüßen,<br/><strong>Malinska Stay</strong>",
  },

  // 10. TTLOCK_SIFRA
  ttlockSifra: {
    subject: (nazivObjekta) => `Ihr Zugangscode - ${nazivObjekta}`,
    naslov: (nazivObjekta, jedinicaNaziv) =>
      jedinicaNaziv
        ? `Willkommen bei ${nazivObjekta}, ${jedinicaNaziv}`
        : `Willkommen bei ${nazivObjekta}`,
    pozdrav: (ime) => `Hallo ${ime},`,
    sifraJe: "Ihr Zugangscode lautet:",
    sifraVrijedi: (vrijediOd, vrijediDo) =>
      `Der Code ist gültig von <strong>${vrijediOd}</strong> bis <strong>${vrijediDo}</strong>.`,
    vrijediZa: "Der Code ist gültig für:",
    zavrsetak: "Mit freundlichen Grüßen,<br/>Malinska Stay",
  },
};
