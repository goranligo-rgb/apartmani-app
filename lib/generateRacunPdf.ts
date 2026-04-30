import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

function formatDate(value: any) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("hr-HR");
}

function formatDateTime(value: any) {
  const d = value ? new Date(value) : new Date();

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(value: any) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function safeFileName(value: string) {
  return String(value || "racun")
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

function text(value: any) {
  return String(value ?? "")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/ž/g, "z")
    .replace(/š/g, "s")
    .replace(/đ/g, "d")
    .replace(/Č/g, "C")
    .replace(/Ć/g, "C")
    .replace(/Ž/g, "Z")
    .replace(/Š/g, "S")
    .replace(/Đ/g, "D");
}

function drawLine(page: any, y: number) {
  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 1,
    color: rgb(0.82, 0.76, 0.66),
  });
}

function drawLabel(
  page: any,
  label: string,
  value: string,
  x: number,
  y: number,
  font: any,
  bold: any
) {
  page.drawText(text(label), {
    x,
    y,
    size: 8,
    font: bold,
    color: rgb(0.58, 0.45, 0.24),
  });

  page.drawText(text(value || "-"), {
    x,
    y: y - 15,
    size: 11,
    font,
    color: rgb(0.16, 0.15, 0.13),
  });
}

function wrapText(value: string, maxChars = 95) {
  const words = text(value).split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);

  return lines;
}

async function drawLogo(pdfDoc: PDFDocument, page: any, racun: any) {
  const objektNaziv = String(
    racun.objekt?.naziv ||
      racun.rezervacija?.jedinica?.objekt?.naziv ||
      racun.nazivIzdavatelja ||
      ""
  ).toLowerCase();

  let logoPath = "";

  if (objektNaziv.includes("marty")) {
    logoPath = path.join(process.cwd(), "public", "logos", "marty_logo.png");
  } else if (objektNaziv.includes("eva")) {
    logoPath = path.join(process.cwd(), "public", "logos", "eva_logo.png");
  } else if (objektNaziv.includes("art")) {
    logoPath = path.join(
      process.cwd(),
      "public",
      "logos",
      "house_art_logo.png"
    );
  }

  if (!logoPath || !fs.existsSync(logoPath)) return;

  const bytes = fs.readFileSync(logoPath);
  const image = await pdfDoc.embedPng(bytes);

  const maxWidth = 120;
  const maxHeight = 80;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);

  page.drawImage(image, {
    x: 50,
    y: 742,
    width: image.width * scale,
    height: image.height * scale,
  });
}

export async function generateRacunPdf(racun: any) {
  const dir = path.join(process.cwd(), "public", "racuni");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const brojRacuna = racun.brojRacuna || `RAC-${Date.now()}`;
  const fileName = `${safeFileName(brojRacuna)}.pdf`;
  const filePath = path.join(dir, fileName);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawLogo(pdfDoc, page, racun);

  const rezervacija = racun.rezervacija || {};
  const gost = racun.gost || rezervacija.gost || {};
  const jedinica = racun.jedinica || rezervacija.jedinica || {};
  const objekt = racun.objekt || jedinica.objekt || {};

  const datumOd = rezervacija.datumOd;
  const datumDo = rezervacija.datumDo;
  const brojNocenja = rezervacija.brojNocenja || "";
  const brojOsoba = rezervacija.brojOsoba || "";

  const gostImePrezime = [gost.ime, gost.prezime].filter(Boolean).join(" ");
  const gostDrzava = gost.drzava || gost.drzavaNaziv || "";

  const nazivJedinice = jedinica.naziv || "";
  const nazivObjekta = objekt.naziv || "";

  const nazivIzdavatelja =
    racun.nazivIzdavatelja ||
    objekt.nazivZaRacun ||
    objekt.naziv ||
    "Izdavatelj";

  const oibIzdavatelja =
    racun.oibIzdavatelja || objekt.oibZaRacun || "";

  const adresaIzdavatelja =
    racun.adresaIzdavatelja || objekt.adresaZaRacun || "";

  const mjestoIzdavatelja =
    racun.mjestoIzdavatelja ||
    objekt.mjestoZaRacun ||
    objekt.mjesto ||
    "Malinska";

  const ibanIzdavatelja =
    racun.ibanIzdavatelja || objekt.ibanZaRacun || "";

  const telefonIzdavatelja =
    racun.telefonIzdavatelja || objekt.telefonZaRacun || "";

  const emailIzdavatelja =
    racun.emailIzdavatelja || objekt.emailZaRacun || "";

  const napomenaNaRacunu =
    objekt.napomenaNaRacunu ||
    racun.napomenaNaRacunu ||
    "Privatni iznajmljivac nije u sustavu PDV-a. PDV nije obracunat.";

  const iznos = Number(racun.iznos || 0);
  const ukupnoRezervacija = Number(rezervacija.iznosUkupno || iznos);
  const ukupnoPlaceno = Number(rezervacija.iznosPlaceno || iznos);
  const preostaloZaPlatiti = Math.max(ukupnoRezervacija - ukupnoPlaceno, 0);

  const jedinicnaCijena =
    brojNocenja && Number(brojNocenja) > 0
      ? iznos / Number(brojNocenja)
      : iznos;

  const datumRacuna = racun.createdAt || new Date();

  // HEADER
  page.drawText("RACUN", {
    x: 410,
    y: 785,
    size: 28,
    font: bold,
    color: rgb(0.12, 0.22, 0.34),
  });

  page.drawText(`Broj: ${text(brojRacuna)}`, {
    x: 410,
    y: 758,
    size: 11,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(`Datum: ${formatDate(datumRacuna)}`, {
    x: 410,
    y: 740,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText(`Vrijeme: ${formatDateTime(datumRacuna)}`, {
    x: 410,
    y: 724,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText(`Mjesto: ${text(mjestoIzdavatelja || "Malinska")}`, {
    x: 410,
    y: 708,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  drawLine(page, 700);

  // IZDAVATELJ
  page.drawText("IZDAVATELJ", {
    x: 50,
    y: 675,
    size: 9,
    font: bold,
    color: rgb(0.58, 0.45, 0.24),
  });

  page.drawText(text(nazivIzdavatelja), {
    x: 50,
    y: 655,
    size: 12,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(text(adresaIzdavatelja || "-"), {
    x: 50,
    y: 638,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText(text(mjestoIzdavatelja || "-"), {
    x: 50,
    y: 623,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText(text(`OIB: ${oibIzdavatelja || "-"}`), {
    x: 50,
    y: 608,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  if (telefonIzdavatelja) {
    page.drawText(text(`Tel: ${telefonIzdavatelja}`), {
      x: 50,
      y: 593,
      size: 10,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });
  }

  if (emailIzdavatelja) {
    page.drawText(text(`Email: ${emailIzdavatelja}`), {
      x: 50,
      y: 578,
      size: 10,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });
  }

  if (ibanIzdavatelja) {
    page.drawText(text(`IBAN: ${ibanIzdavatelja}`), {
      x: 50,
      y: 563,
      size: 10,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });
  }

  // GOST
  page.drawText("GOST", {
    x: 330,
    y: 675,
    size: 9,
    font: bold,
    color: rgb(0.58, 0.45, 0.24),
  });

  page.drawText(text(gostImePrezime || "-"), {
    x: 330,
    y: 655,
    size: 12,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  if (gostDrzava) {
    page.drawText(text(gostDrzava), {
      x: 330,
      y: 638,
      size: 10,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });
  }

  if (gost.email) {
    page.drawText(text(gost.email), {
      x: 330,
      y: gostDrzava ? 623 : 638,
      size: 10,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });
  }

  if (gost.telefon) {
    page.drawText(text(`Tel: ${gost.telefon}`), {
      x: 330,
      y: gostDrzava ? 608 : 623,
      size: 10,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });
  }

  // BORAVAK BOX
  page.drawRectangle({
    x: 50,
    y: 488,
    width: 495,
    height: 70,
    color: rgb(0.96, 0.93, 0.87),
    borderColor: rgb(0.82, 0.76, 0.66),
    borderWidth: 1,
  });

  drawLabel(page, "BORAVAK OD", formatDate(datumOd), 68, 532, font, bold);
  drawLabel(page, "BORAVAK DO", formatDate(datumDo), 185, 532, font, bold);
  drawLabel(page, "NOCENJA", String(brojNocenja || "-"), 302, 532, font, bold);
  drawLabel(page, "OSOBA", String(brojOsoba || "-"), 410, 532, font, bold);

  // REZERVACIJA
  page.drawText("REZERVACIJA", {
    x: 50,
    y: 460,
    size: 10,
    font: bold,
    color: rgb(0.58, 0.45, 0.24),
  });

  page.drawText(text(`${nazivObjekta} - ${nazivJedinice}`), {
    x: 50,
    y: 442,
    size: 13,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  // TABLICA
  let y = 400;

  page.drawRectangle({
    x: 50,
    y: y - 8,
    width: 495,
    height: 28,
    color: rgb(0.12, 0.22, 0.34),
  });

  page.drawText("Vrsta usluge", {
    x: 62,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Kolicina", {
    x: 305,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Jed. cijena", {
    x: 370,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Ukupno", {
    x: 475,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  y -= 36;

  page.drawText(text(`1. Nocenje u apartmanu ${nazivJedinice}`), {
    x: 62,
    y,
    size: 10,
    font,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(String(brojNocenja || 1), {
    x: 325,
    y,
    size: 10,
    font,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(money(jedinicnaCijena), {
    x: 370,
    y,
    size: 10,
    font,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(money(iznos), {
    x: 465,
    y,
    size: 10,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  drawLine(page, y - 18);

  // TOTAL
  y -= 55;

  page.drawText("IZNOS RACUNA:", {
    x: 330,
    y,
    size: 11,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(money(iznos), {
    x: 455,
    y,
    size: 11,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  y -= 22;

  page.drawText("UKUPNO REZERVACIJA:", {
    x: 330,
    y,
    size: 10,
    font: bold,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText(money(ukupnoRezervacija), {
    x: 455,
    y,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  y -= 20;

  page.drawText("PLACENO:", {
    x: 330,
    y,
    size: 10,
    font: bold,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText(money(ukupnoPlaceno), {
    x: 455,
    y,
    size: 10,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  y -= 32;

  page.drawRectangle({
    x: 320,
    y: y - 8,
    width: 225,
    height: 30,
    color: rgb(0.96, 0.93, 0.87),
    borderColor: rgb(0.82, 0.76, 0.66),
    borderWidth: 1,
  });

  page.drawText("ZA PLATITI:", {
    x: 335,
    y,
    size: 12,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  page.drawText(money(preostaloZaPlatiti), {
    x: 455,
    y,
    size: 12,
    font: bold,
    color: rgb(0.16, 0.15, 0.13),
  });

  // FOOTER
  drawLine(page, 140);

  const napomenaLines = wrapText(napomenaNaRacunu, 95);
  let footerY = 118;

  for (const line of napomenaLines.slice(0, 3)) {
    page.drawText(line, {
      x: 50,
      y: footerY,
      size: 9,
      font,
      color: rgb(0.38, 0.35, 0.3),
    });

    footerY -= 13;
  }

  page.drawText("Racun je izraden racunalno i vazeci je bez potpisa i pecata.", {
    x: 50,
    y: footerY - 6,
    size: 8,
    font,
    color: rgb(0.38, 0.35, 0.3),
  });

  page.drawText("Hvala na povjerenju.", {
    x: 50,
    y: 62,
    size: 10,
    font: bold,
    color: rgb(0.58, 0.45, 0.24),
  });

  const pdfBytes = await pdfDoc.save();

  fs.writeFileSync(filePath, pdfBytes);

  return `/racuni/${fileName}`;
}