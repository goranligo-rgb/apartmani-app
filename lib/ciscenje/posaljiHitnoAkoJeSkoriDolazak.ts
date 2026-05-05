import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDays(a: Date, b: Date) {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86400000);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function posaljiHitnoAkoJeSkoriDolazak(rezervacijaId: string) {
  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id: rezervacijaId },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
  });

  if (!rezervacija) return;

  const danas = startOfDay(new Date());
  const dolazakZa = diffDays(rezervacija.datumOd, danas);

  // 🔥 GLAVNI UVJET
  if (dolazakZa < 0 || dolazakZa > 7) {
    return;
  }

  const agencija = await prisma.ciscenjeAgencija.findFirst();
  if (!agencija?.email) return;

  // ❗ zaštita da ne šalje duplo
  const vecPoslano = await prisma.ciscenjeNarudzba.findFirst({
    where: {
      datumOd: rezervacija.datumOd,
      napomena: {
        contains: rezervacija.id,
      },
    },
  });

  if (vecPoslano) {
    return;
  }

  const ccList = agencija.ccEmails
    ? agencija.ccEmails.split(",").map((e) => e.trim()).filter(Boolean)
    : [];

  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2 style="color:red;">⚠ HITNO - nova rezervacija unutar 7 dana</h2>

      <p>Nova rezervacija zahtijeva brzo čišćenje.</p>

      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
        <tr><td><b>Dolazak</b></td><td>${formatDate(rezervacija.datumOd)}</td></tr>
        <tr><td><b>Odlazak</b></td><td>${formatDate(rezervacija.datumDo)}</td></tr>
        <tr><td><b>Objekt</b></td><td>${rezervacija.jedinica.objekt.naziv}</td></tr>
        <tr><td><b>Jedinica</b></td><td>${rezervacija.jedinica.naziv}</td></tr>
        <tr><td><b>Gost</b></td><td>${rezervacija.gost?.ime || ""} ${rezervacija.gost?.prezime || ""}</td></tr>
        <tr><td><b>Broj osoba</b></td><td>${rezervacija.brojOsoba}</td></tr>
      </table>

      <p style="margin-top:20px;">
        Molimo hitno pripremiti apartman.
      </p>
    </div>
  `;

  await resend.emails.send({
    from: "Malinska Stay <rezervacije@malinska-stay.hr>",
    to: agencija.email,
    cc: ccList,
    subject: "⚠ HITNO: rezervacija unutar 7 dana",
    html,
    replyTo: "goran@malinska-stay.hr",
  });

  // spremi kao evidenciju da ne ide duplo
  await prisma.ciscenjeNarudzba.create({
    data: {
      agencijaId: agencija.id,
      datumOd: rezervacija.datumOd,
      datumDo: rezervacija.datumDo,
      emailPrimatelja: agencija.email,
      ccEmailsSnapshot: agencija.ccEmails,
      napomena: `HITNO-${rezervacija.id}`,
    },
  });
}