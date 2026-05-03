const { PrismaClient } = require("@prisma/client");
const { Resend } = require("resend");

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function main() {
  const agencija = await prisma.ciscenjeAgencija.findFirst({
    where: {
      aktivna: true,
    },
  });

  if (!agencija?.email) {
    throw new Error("Nema upisanog emaila agencije za čišćenje.");
  }

  const danas = startOfDay(new Date());
  const doDatuma = endOfDay(addDays(danas, 7));

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      OR: [
        {
          datumDo: {
            gte: danas,
            lte: doDatuma,
          },
        },
        {
          datumOd: {
            gte: danas,
            lte: doDatuma,
          },
        },
      ],
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [
      {
        datumDo: "asc",
      },
      {
        datumOd: "asc",
      },
    ],
  });

  const odlasci = rezervacije.filter((r) => {
    const d = new Date(r.datumDo);
    return d >= danas && d <= doDatuma;
  });

  const dolasci = rezervacije.filter((r) => {
    const d = new Date(r.datumOd);
    return d >= danas && d <= doDatuma;
  });

  const odlasciHtml =
    odlasci.length > 0
      ? odlasci
          .map(
            (r) => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${formatDate(r.datumDo)}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${r.jedinica.objekt.naziv}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${r.jedinica.naziv}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${r.gost?.ime || ""} ${r.gost?.prezime || ""}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">Završno čišćenje</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="5" style="padding:8px;">Nema odlazaka u sljedećih 7 dana.</td></tr>`;

  const dolasciHtml =
    dolasci.length > 0
      ? dolasci
          .map(
            (r) => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${formatDate(r.datumOd)}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${r.jedinica.objekt.naziv}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${r.jedinica.naziv}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${r.gost?.ime || ""} ${r.gost?.prezime || ""}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;">Dolazak gosta</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="5" style="padding:8px;">Nema dolazaka u sljedećih 7 dana.</td></tr>`;

  const ccEmails = agencija.ccEmails
    ? agencija.ccEmails
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;

  const subject = "TEST raspored čišćenja - Malinska Stay";

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;">
      <h2>TEST raspored čišćenja</h2>

      <p>Poštovani,</p>

      <p>Ovo je testno slanje rasporeda čišćenja iz sustava Malinska Stay.</p>

      <h3>Odlasci / čišćenja</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#f2f2f2;">
            <th style="padding:8px;text-align:left;">Datum</th>
            <th style="padding:8px;text-align:left;">Objekt</th>
            <th style="padding:8px;text-align:left;">Jedinica</th>
            <th style="padding:8px;text-align:left;">Gost</th>
            <th style="padding:8px;text-align:left;">Napomena</th>
          </tr>
        </thead>
        <tbody>
          ${odlasciHtml}
        </tbody>
      </table>

      <h3 style="margin-top:24px;">Dolasci</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#f2f2f2;">
            <th style="padding:8px;text-align:left;">Datum</th>
            <th style="padding:8px;text-align:left;">Objekt</th>
            <th style="padding:8px;text-align:left;">Jedinica</th>
            <th style="padding:8px;text-align:left;">Gost</th>
            <th style="padding:8px;text-align:left;">Napomena</th>
          </tr>
        </thead>
        <tbody>
          ${dolasciHtml}
        </tbody>
      </table>

      <p style="margin-top:24px;">
        Lijep pozdrav,<br/>
        Malinska Stay
      </p>
    </div>
  `;

  const result = await resend.emails.send({
    from: "Malinska Stay <rezervacije@malinska-stay.hr>",
    to: agencija.email,
    cc: ccEmails,
    subject,
    html,
  });

  console.log("");
  console.log("✅ Test mail agenciji poslan");
  console.log("----------------------------------------");
  console.log("TO =", agencija.email);
  console.log("CC =", ccEmails || "-");
  console.log("SUBJECT =", subject);
  console.log("ODLASCI =", odlasci.length);
  console.log("DOLASCI =", dolasci.length);
  console.log("RESEND =", result);
  console.log("----------------------------------------");
  console.log("");
}

main()
  .catch((error) => {
    console.error("❌ Greška:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });