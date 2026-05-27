import type { MailTekstovi } from "../index";

// Engleski prijevodi mailova gostu. Struktura 1:1 s hr.ts (isti kljucevi i
// potpisi funkcija), samo prevedene rijeci. Pozdrav: "Dear {ime}".
export const en: MailTekstovi = {
  // 1. ZAPRIMI_REZERVACIJU
  zaprimiRezervaciju: {
    subject: "Reservation received - Malinska Stay",
    title: "Reservation received",
    subtitle: "Thank you for your reservation. Your request has been successfully received.",
    pozdrav: (ime, prezime) =>
      `Dear <strong>${ime} ${prezime}</strong>,`,
    uvodPara: (iznos) =>
      `Your card has been successfully authorised for the amount of <strong>${iznos}</strong>. The funds have not been charged yet — they are only reserved until the reservation is finally confirmed.`,
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelBrojNocenja: "Number of nights:",
    labelBrojOsoba: "Number of guests:",
    vaznoNaslov: "Important:",
    vaznoText:
      "The reservation is still awaiting final confirmation by the host. Once processed, we will send you the final reservation confirmation.",
    racunNapomena: "The invoice is sent only after the actual payment is charged.",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 2. POTVRDA_NAPLATE
  potvrdaNaplate: {
    subject: (placeno) =>
      placeno
        ? "Reservation and payment confirmed"
        : "Your reservation is confirmed",
    title: (placeno) =>
      placeno
        ? "Reservation and payment confirmed"
        : "Reservation confirmed",
    subtitle: (placeno) =>
      placeno
        ? "Your reservation is confirmed and fully paid."
        : "Your reservation is confirmed with the deposit paid.",
    pozdrav: (ime) => `Dear <strong>${ime}</strong>,`,
    uvodPara: (placeno) =>
      placeno
        ? "Your payment has been successfully received and your reservation is confirmed."
        : "Your reservation has been successfully confirmed. The remaining amount will need to be settled according to the agreed terms before arrival.",
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelUplaceno: "Paid:",
    labelPreostalo: "Remaining to pay:",
    potvrdjenoNaslov: "Confirmed:",
    potvrdjenoText: (placeno) =>
      placeno
        ? "The reservation is fully paid. Please find the invoice attached."
        : "The reservation is confirmed. Please find attached the invoice for the payment received. The remaining amount must be paid before arrival — we will send you a reminder with a payment link a few days in advance.",
    veselimoSe: "We look forward to welcoming you to Malinska.",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 3. USPJEH_PLACANJE
  uspjehPlacanje: {
    subject: (placeno) =>
      placeno
        ? "Reservation and payment confirmed - Malinska Stay"
        : "Reservation confirmed - Malinska Stay",
    title: (placeno) =>
      placeno
        ? "Reservation and payment confirmed"
        : "Reservation confirmed",
    subtitle: (placeno) =>
      placeno
        ? "Your payment has been successfully received and your reservation is confirmed."
        : "The deposit has been received and your reservation is confirmed.",
    pozdrav: (ime, prezime) =>
      `Dear <strong>${ime} ${prezime}</strong>,`,
    uvodPara: (placeno) =>
      placeno
        ? "Your payment has been successfully received and the reservation is fully paid."
        : "Your deposit has been successfully received and the reservation is confirmed.",
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelBrojNocenja: "Number of nights:",
    labelBrojOsoba: "Number of guests:",
    labelZaprimljenaUplata: "Payment received:",
    labelPreostalo: "Remaining to pay:",
    potvrdjenoNaslov: "Confirmed:",
    potvrdjenoText: (placeno) =>
      placeno
        ? "The reservation is confirmed and fully paid."
        : "The reservation is confirmed. The remaining amount must be paid according to the agreed terms.",
    racunOtvoriText: "You can open your invoice here:",
    racunOtvoriLink: "Open invoice",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 4. RACUN_PONOVNO_POSLAN
  racunPonovnoPoslan: {
    subject: (brojRacuna) => `Invoice ${brojRacuna} resent`,
    pozdrav: "Dear guest,",
    privitak: "Please find your invoice attached again.",
    zavrsetak: "Kind regards,<br/>Malinska Stay",
  },

  // 5. PODSJETNIK_OSTATAK
  podsjetnikOstatak: {
    subject: "Please pay the remaining balance of your reservation",
    title: "Reminder to pay the remaining balance",
    subtitle: "Your arrival is approaching.",
    pozdrav: (ime) => `Dear <strong>${ime}</strong>,`,
    uvodPara:
      "We kindly remind you that the remaining amount for your reservation needs to be settled before arrival.",
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelPreostalo: "Remaining to pay:",
    button: "Pay the remaining balance",
    vecZanemarite:
      "If you have already made the payment, please disregard this message.",
    veselimoSe: "We look forward to welcoming you to Malinska.",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 6. POZIV_ZA_PLACANJE
  pozivZaPlacanje: {
    subject: (cijeli) =>
      cijeli ? "Invitation to pay for your reservation" : "Invitation to pay the deposit",
    title: (cijeli) =>
      cijeli ? "Invitation to pay for your reservation" : "Invitation to pay the deposit",
    subtitle: (cijeli) =>
      cijeli
        ? "To confirm your reservation, the full amount must be paid."
        : "To confirm your reservation, a deposit must be paid.",
    pozdrav: (imePrezime) => `Dear <strong>${imePrezime}</strong>,`,
    infoText: (cijeli, danaDoDolaska) =>
      cijeli
        ? `Your reservation has been recorded. As your arrival is in ${danaDoDolaska} days, the full amount must be paid to confirm the reservation.`
        : "Your reservation has been recorded. To confirm the reservation, a deposit must be paid.",
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelUkupanIznos: "Total reservation amount:",
    labelIznosZaUplatu: "Amount to pay:",
    labelOstatak: "Remaining:",
    labelRokPlacanja: "Payment deadline:",
    automatskaPotvrda:
      "After successful payment, you will receive an automatic reservation confirmation and invoice.",
    button: (cijeli) =>
      cijeli ? "Pay for reservation by card" : "Pay deposit by card",
    akoGumbNeRadi: "If the button does not work, copy this link into your browser:",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 7. REZERVACIJA_ZAPRIMLJENA_BANKA
  rezervacijaZaprimljenaBanka: {
    subject: "Reservation received — awaiting payment",
    title: "Reservation received",
    subtitle: "We are awaiting payment to confirm the reservation.",
    pozdrav: (imePrezime) => `Dear <strong>${imePrezime}</strong>,`,
    infoText:
      "Your reservation has been recorded. To confirm the reservation, payment must be made within the stated deadline. Once the payment is visible on our account, we will send you the reservation confirmation and invoice. If the payment is not received within the deadline, the reservation may be automatically cancelled.",
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelUkupanIznos: "Total reservation amount:",
    labelIznosZaUplatu: "Amount to pay:",
    labelOstatak: "Remaining:",
    labelRokPlacanja: "Payment deadline:",
    automatskaPotvrda:
      "After successful payment, you will receive an automatic reservation confirmation and invoice.",
    button: "Awaiting bank transfer",
    akoGumbNeRadi: "If the button does not work, copy this link into your browser:",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 8. REZERVACIJA_ODBIJENA
  rezervacijaOdbijena: {
    subject: "Reservation not confirmed",
    title: "Reservation not confirmed",
    subtitle:
      "We are sorry, but we are currently unable to confirm your reservation.",
    pozdrav: (ime, prezime) =>
      `Dear <strong>${ime} ${prezime}</strong>,`,
    uvodPara:
      "Thank you for your reservation request. Unfortunately, after checking availability, we are unable to confirm this reservation.",
    detaljiNaslov: "Request details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    autorizacijaPonistena:
      "If your card was authorised, the authorisation is cancelled and no amount will be charged.",
    ispricavamoSe:
      "We apologise for the inconvenience. Please feel free to contact us for another date or a different accommodation unit.",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 9. ZAHTJEV_ZA_UPLATU
  zahtjevZaUplatu: {
    subject: (tip) =>
      tip === "AKONTACIJA"
        ? "Request for deposit payment"
        : tip === "RAZLIKA"
          ? "Request for balance difference payment"
          : "Request for remaining payment",
    subtitle: "Your reservation is awaiting payment.",
    pozdrav: (ime, prezime) =>
      `Dear <strong>${ime} ${prezime}</strong>,`,
    uvodPara:
      "Your reservation has been recorded. Please make the payment so that we can confirm the reservation.",
    detaljiNaslov: "Reservation details",
    labelObjekt: "Property:",
    labelJedinica: "Accommodation unit:",
    labelDolazak: "Check-in:",
    labelOdlazak: "Check-out:",
    labelIznosZaUplatu: "Amount to pay:",
    labelRokUplate: "Payment deadline:",
    napomena:
      "Once the payment is visible on our account, we will send you the reservation confirmation and invoice.",
    zavrsetak: "Kind regards,<br/><strong>Malinska Stay</strong>",
  },

  // 10. TTLOCK_SIFRA
  ttlockSifra: {
    subject: (nazivObjekta) => `Your entry code - ${nazivObjekta}`,
    naslov: (nazivObjekta, jedinicaNaziv) =>
      jedinicaNaziv
        ? `Welcome to ${nazivObjekta}, ${jedinicaNaziv}`
        : `Welcome to ${nazivObjekta}`,
    pozdrav: (ime) => `Dear ${ime},`,
    sifraJe: "Your entry code is:",
    sifraVrijedi: (vrijediOd, vrijediDo) =>
      `The code is valid from <strong>${vrijediOd}</strong> to <strong>${vrijediDo}</strong>.`,
    vrijediZa: "The code is valid for:",
    zavrsetak: "Kind regards,<br/>Malinska Stay",
  },
};
