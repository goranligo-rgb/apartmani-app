import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

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

function formatDate(value: any) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(value: any) {
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

function wrapText(value: string, maxChars = 78) {
  const words = text(value).split(/\s+/).filter(Boolean);
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

function drawLine(page: any, y: number) {
  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 1,
    color: rgb(0.86, 0.8, 0.7),
  });
}

function drawSmallLabel(page: any, label: string, x: number, y: number, bold: any) {
  page.drawText(text(label), {
    x,
    y,
    size: 8,
    font: bold,
    color: rgb(0.48, 0.34, 0.14),
  });
}

function drawValue(page: any, value: string, x: number, y: number, font: any) {
  page.drawText(text(value || "-"), {
    x,
    y,
    size: 10,
    font,
    color: rgb(0.18, 0.16, 0.13),
  });
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
    logoPath = path.join(process.cwd(), "public", "logos", "house_art_logo.png");
  }

  if (!logoPath || !fs.existsSync(logoPath)) return;

  const bytes = fs.readFileSync(logoPath);
  const image = await pdfDoc.embedPng(bytes);

  const maxWidth = 165;
  const maxHeight = 105;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);

  const logoWidth = image.width * scale;
  const logoHeight = image.height * scale;

  page.drawImage(image, {
    x: 50,
    y: 700,
    width: logoWidth,
    height: logoHeight,
  });
}

export async function generateRacunPdf(racun: any) {


  const brojRacuna = racun.brojRacuna || `RAC-${Date.now()}`;
  const fileName = `${safeFileName(brojRacuna)}.pdf`;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const rezervacija = racun.rezervacija || {};
  const gost = racun.gost || rezervacija.gost || {};
  const jedinica = racun.jedinica || rezervacija.jedinica || {};
  const objekt = racun.objekt || jedinica.objekt || {};

  const datumRacuna = racun.createdAt || new Date();

  const nazivIzdavatelja =
    racun.nazivIzdavatelja ||
    objekt.nazivZaRacun ||
    objekt.naziv ||
    "Izdavatelj";

  const adresaIzdavatelja =
    racun.adresaIzdavatelja || objekt.adresaZaRacun || "";

  const mjestoIzdavatelja =
    racun.mjestoIzdavatelja || objekt.mjestoZaRacun || objekt.mjesto || "";

  const oibIzdavatelja = racun.oibIzdavatelja || objekt.oibZaRacun || "";
  const ibanIzdavatelja = racun.ibanIzdavatelja || objekt.ibanZaRacun || "";
  const emailIzdavatelja = racun.emailIzdavatelja || objekt.emailZaRacun || "";
  const telefonIzdavatelja =
    racun.telefonIzdavatelja || objekt.telefonZaRacun || "";

  const napomenaNaRacunu =
    "Privatni iznajmljivac nije u sustavu PDV-a. PDV nije obracunat.";

  const gostImePrezime = [gost.ime, gost.prezime].filter(Boolean).join(" ");
  const gostAdresa = gost.adresa || "";
  const gostGrad = gost.grad || "";
  const gostDrzava = gost.drzava || gost.drzavaNaziv || "";
  const gostEmail = gost.email || "";
  const gostTelefon = gost.telefon || "";

  const nazivObjekta = objekt.naziv || "";
  const nazivJedinice = jedinica.naziv || "";

  const datumOd = rezervacija.datumOd;
  const datumDo = rezervacija.datumDo;
  const brojNocenja = Number(rezervacija.brojNocenja || 1);
  const brojOsoba = Number(rezervacija.brojOsoba || 1);

  const iznos = Number(racun.iznos || 0);
  const jedinicnaCijena = brojNocenja > 0 ? iznos / brojNocenja : iznos;

  const ukupnoRezervacija = Number(
    rezervacija.dogovoreniIznos || rezervacija.iznosUkupno || iznos
  );

  const placanja = rezervacija.placanja || [];

  const ukupnoPlacenoIzPlacanja = placanja.reduce((sum: number, p: any) => {
    if (p.status === "PLACENO" || p.status === "DJELOMICNO_PLACENO") {
      return sum + Number(p.iznos || 0);
    }

    return sum;
  }, 0);

  const placenoIzRezervacije = Number(rezervacija.iznosPlaceno || 0);

  const placeno = Math.max(
    ukupnoPlacenoIzPlacanja,
    placenoIzRezervacije,
    iznos
  );

  const zaPlatiti = Math.max(ukupnoRezervacija - placeno, 0);

  await drawLogo(pdfDoc, page, racun);

  // HEADER
  page.drawText("RACUN", {
    x: 410,
    y: 790,
    size: 30,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  page.drawText(`Broj: ${text(brojRacuna)}`, {
    x: 410,
    y: 760,
    size: 11,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  page.drawText(`Datum: ${formatDate(datumRacuna)}`, {
    x: 410,
    y: 742,
    size: 10,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  page.drawText(`Vrijeme: ${formatTime(datumRacuna)}`, {
    x: 410,
    y: 726,
    size: 10,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  page.drawText(`Mjesto: ${text(mjestoIzdavatelja || "Malinska")}`, {
    x: 410,
    y: 710,
    size: 10,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  drawLine(page, 695);

  // IZDAVATELJ / GOST
  drawSmallLabel(page, "IZDAVATELJ", 50, 670, bold);

  page.drawText(text(nazivIzdavatelja), {
    x: 50,
    y: 650,
    size: 12,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  let leftY = 633;

  const izdavateljLines = [
    adresaIzdavatelja,
    mjestoIzdavatelja,
    oibIzdavatelja ? `OIB: ${oibIzdavatelja}` : "",
    telefonIzdavatelja ? `Tel: ${telefonIzdavatelja}` : "",
    emailIzdavatelja ? `Email: ${emailIzdavatelja}` : "",
    ibanIzdavatelja ? `IBAN: ${ibanIzdavatelja}` : "",
  ].filter(Boolean);

  for (const line of izdavateljLines) {
    drawValue(page, line, 50, leftY, font);
    leftY -= 15;
  }

  drawSmallLabel(page, "GOST", 330, 670, bold);

  page.drawText(text(gostImePrezime || "-"), {
    x: 330,
    y: 650,
    size: 12,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  let rightY = 633;

  const gostLines = [
    gostAdresa,
    [gostGrad, gostDrzava].filter(Boolean).join(", "),
    gostEmail,
    gostTelefon ? `Tel: ${gostTelefon}` : "",
  ].filter(Boolean);

  for (const line of gostLines.length ? gostLines : ["-"]) {
    drawValue(page, line, 330, rightY, font);
    rightY -= 15;
  }

  // BORAVAK
  page.drawRectangle({
    x: 50,
    y: 492,
    width: 495,
    height: 68,
    color: rgb(0.97, 0.95, 0.9),
    borderColor: rgb(0.86, 0.8, 0.7),
    borderWidth: 1,
  });

  const boxY = 535;

  drawSmallLabel(page, "DOLAZAK", 70, boxY, bold);
  drawValue(page, formatDate(datumOd), 70, boxY - 16, font);

  drawSmallLabel(page, "ODLAZAK", 190, boxY, bold);
  drawValue(page, formatDate(datumDo), 190, boxY - 16, font);

  drawSmallLabel(page, "NOCENJA", 315, boxY, bold);
  drawValue(page, String(brojNocenja || "-"), 315, boxY - 16, font);

  drawSmallLabel(page, "OSOBA", 430, boxY, bold);
  drawValue(page, String(brojOsoba || "-"), 430, boxY - 16, font);

  // REZERVACIJA
  drawSmallLabel(page, "REZERVACIJA", 50, 465, bold);

  page.drawText(text(`${nazivObjekta} / ${nazivJedinice}`), {
    x: 50,
    y: 445,
    size: 13,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  // TABLICA
  let y = 400;

  page.drawRectangle({
    x: 50,
    y: y - 8,
    width: 495,
    height: 28,
    color: rgb(0.2, 0.17, 0.13),
  });

  page.drawText("Usluga", {
    x: 62,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Kol.", {
    x: 320,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Cijena", {
    x: 375,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Iznos", {
    x: 485,
    y,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  y -= 36;

  page.drawText(text(`Smjestaj - ${nazivJedinice || "jedinica"}`), {
    x: 62,
    y,
    size: 10,
    font,
    color: rgb(0.18, 0.16, 0.13),
  });

  page.drawText(String(brojNocenja || 1), {
    x: 325,
    y,
    size: 10,
    font,
    color: rgb(0.18, 0.16, 0.13),
  });

  page.drawText(money(jedinicnaCijena), {
    x: 365,
    y,
    size: 10,
    font,
    color: rgb(0.18, 0.16, 0.13),
  });

  page.drawText(money(iznos), {
    x: 465,
    y,
    size: 10,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  drawLine(page, y - 18);

  // UKUPNO
  y -= 55;

  page.drawText("Iznos racuna:", {
    x: 335,
    y,
    size: 10,
    font: bold,
    color: rgb(0.42, 0.38, 0.32),
  });

  page.drawText(money(iznos), {
    x: 455,
    y,
    size: 10,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  y -= 20;

  page.drawText("Ukupno rezervacija:", {
    x: 335,
    y,
    size: 10,
    font: bold,
    color: rgb(0.42, 0.38, 0.32),
  });

  page.drawText(money(ukupnoRezervacija), {
    x: 455,
    y,
    size: 10,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  y -= 20;

  page.drawText("Placeno:", {
    x: 335,
    y,
    size: 10,
    font: bold,
    color: rgb(0.42, 0.38, 0.32),
  });

  page.drawText(money(placeno), {
    x: 455,
    y,
    size: 10,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  y -= 36;

  page.drawRectangle({
    x: 320,
    y: y - 8,
    width: 225,
    height: 32,
    color: rgb(0.97, 0.95, 0.9),
    borderColor: rgb(0.86, 0.8, 0.7),
    borderWidth: 1,
  });

  page.drawText(zaPlatiti > 0 ? "OSTAJE ZA PLATITI:" : "PLACENO:", {
    x: 335,
    y,
    size: 11,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  page.drawText(money(zaPlatiti > 0 ? zaPlatiti : placeno), {
    x: 455,
    y,
    size: 12,
    font: bold,
    color: rgb(0.18, 0.16, 0.13),
  });

  // FOOTER
  drawLine(page, 142);

  let footerY = 120;
  const napomenaLines = wrapText(napomenaNaRacunu, 90).slice(0, 3);

  for (const line of napomenaLines) {
    page.drawText(line, {
      x: 50,
      y: footerY,
      size: 9,
      font,
      color: rgb(0.42, 0.38, 0.32),
    });

    footerY -= 13;
  }

  page.drawText("Racun je izraden racunalno i vazeci je bez potpisa i pecata.", {
    x: 50,
    y: footerY - 8,
    size: 8,
    font,
    color: rgb(0.42, 0.38, 0.32),
  });

  page.drawText("Hvala na povjerenju.", {
    x: 50,
    y: 62,
    size: 10,
    font: bold,
    color: rgb(0.48, 0.34, 0.14),
  });

  const pdfBytes = await pdfDoc.save();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(
    supabaseUrl,
    supabaseServiceKey
  );

  const { error } = await supabase.storage
    .from("racuni")
    .upload(storagePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("Greška kod spremanja PDF računa:", error);
    throw new Error("PDF račun nije spremljen.");
  }

  const { data } = supabase.storage
    .from("racuni")
    .getPublicUrl(storagePath);

  return data.publicUrl;
}