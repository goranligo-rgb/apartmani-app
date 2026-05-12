import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function martyBazenZaDan(postavke: any, datum: Date) {
  const day = datum.getDay();

  return [
    postavke.martyBazenNedjelja,
    postavke.martyBazenPonedjeljak,
    postavke.martyBazenUtorak,
    postavke.martyBazenSrijeda,
    postavke.martyBazenCetvrtak,
    postavke.martyBazenPetak,
    postavke.martyBazenSubota,
  ][day];
}

function guestName(gost: any) {
  return `${gost?.ime || ""} ${gost?.prezime || ""}`.trim() || "-";
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function findNextReservation(
  jedinicaId: string,
  currentReservationId: string,
  datumDo: Date
) {
  return prisma.rezervacija.findFirst({
    where: {
      id: {
        not: currentReservationId,
      },
      jedinicaId,
      status: {
        not: "OTKAZANO",
      },
      datumOd: {
        gte: datumDo,
      },
    },
    include: {
      gost: true,
    },
    orderBy: {
      datumOd: "asc",
    },
  });
}

async function findOrCreateZadatak(data: {
  jedinicaId: string;
  rezervacijaId?: string | null;
  datum: Date;
  tip:
    | "ZAVRSNO_CISCENJE"
    | "MEDJUCISCENJE"
    | "PROMJENA_POSTELJINE"
    | "MEDJUCISCENJE_I_POSTELJINA"
    | "DODATNO_CISCENJE";
  naslov: string;
  opis: string;
  prioritet?: boolean;
}) {
  const postoji = await prisma.zadatak.findFirst({
    where: {
      jedinicaId: data.jedinicaId,
      rezervacijaId: data.rezervacijaId || null,
      datum: data.datum,
      tip: data.tip,
    },
  });

  if (postoji) return postoji;

  return prisma.zadatak.create({
    data: {
      jedinicaId: data.jedinicaId,
      rezervacijaId: data.rezervacijaId || null,
      datum: data.datum,
      tip: data.tip,
      status: "CEKA",
      naslov: data.naslov,
      opis: data.opis,
      prioritet: data.prioritet || false,
    },
  });
}

export async function generirajINaPosalji() {
  const agencija = await prisma.ciscenjeAgencija.findFirst();
  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  if (!agencija?.email) {
    return {
      error: "Molimo prije slanja upišite email agencije za čišćenje.",
    };
  }

  if (!postavke) throw new Error("Nisu spremljene postavke čišćenja");

  const danas = startOfDay(new Date());
  const doDatuma = addDays(danas, postavke.brojDanaUnaprijed || 7);

  const rezervacijeZaOdlazak = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      datumDo: {
        gte: danas,
        lte: doDatuma,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumDo: "asc" }],
  });

  const stavkeApartmani = await Promise.all(
    rezervacijeZaOdlazak.map(async (r) => {
      const sljedecaRezervacija = await findNextReservation(
        r.jedinicaId,
        r.id,
        r.datumDo
      );

      const sljedeciUlazak = sljedecaRezervacija
        ? `${formatDate(sljedecaRezervacija.datumOd)}`
        : "Nema najavljenog ulaska";

      const opis =
        `Završno čišćenje nakon odlaska gosta. ` +
        `Broj gostiju: ${r.brojOsoba || 0}. ` +
        `Sljedeći ulazak: ${sljedeciUlazak}.`;

      const zadatak = await findOrCreateZadatak({
        jedinicaId: r.jedinicaId,
        rezervacijaId: r.id,
        datum: startOfDay(r.datumDo),
        tip: "ZAVRSNO_CISCENJE",
        naslov: `Završno čišćenje - ${r.jedinica.naziv}`,
        opis,
        prioritet: true,
      });

      return {
        datum: startOfDay(r.datumDo),
        tip: "ZAVRSNO_CISCENJE" as const,
        jedinicaId: r.jedinicaId,
        zadatakId: zadatak.id,
        nazivJedinice: r.jedinica.naziv,
        nazivObjekta: r.jedinica.objekt.naziv,
        brojGostiju: r.brojOsoba || 0,
        osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
        opis: "Završno čišćenje nakon odlaska gosta.",
        sljedeciUlazak,
        cijena: 0,
      };
    })
  );

  const duzeRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      automatskaPosteljina: true,
      brojNocenja: {
        gt: 7,
      },
      datumOd: {
        lt: doDatuma,
      },
      datumDo: {
        gt: danas,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const stavkeMedjuciscenje: any[] = [];

  for (const r of duzeRezervacije) {
    const pocetak = startOfDay(r.datumOd);
    const kraj = startOfDay(r.datumDo);

    const polaBoravka = Math.floor(Number(r.brojNocenja || 0) / 2);
    const datumMedjuciscenja = addDays(pocetak, polaBoravka);

    if (datumMedjuciscenja <= pocetak || datumMedjuciscenja >= kraj) {
      continue;
    }

    if (datumMedjuciscenja < danas || datumMedjuciscenja > doDatuma) {
      continue;
    }

    const opis =
      `Gost ostaje dulje od 7 noći. Potrebno je očistiti smještaj, ` +
      `promijeniti posteljinu i ostaviti nove ručnike. ` +
      `Broj gostiju: ${r.brojOsoba || 0}.`;

    const zadatak = await findOrCreateZadatak({
      jedinicaId: r.jedinicaId,
      rezervacijaId: r.id,
      datum: datumMedjuciscenja,
      tip: "MEDJUCISCENJE_I_POSTELJINA",
      naslov: `Međučisćenje i posteljina - ${r.jedinica.naziv}`,
      opis,
      prioritet: true,
    });

    stavkeMedjuciscenje.push({
      datum: new Date(datumMedjuciscenja),
      tip: "MEDJUCISCENJE_I_POSTELJINA" as const,
      jedinicaId: r.jedinicaId,
      zadatakId: zadatak.id,
      nazivJedinice: r.jedinica.naziv,
      nazivObjekta: r.jedinica.objekt.naziv,
      brojGostiju: r.brojOsoba || 0,
      osnovniKapacitet: r.jedinica.osnovniKapacitet || 0,
      opis:
        "Međučisćenje na sredini boravka: očistiti apartman/kuću, promijeniti posteljinu i ostaviti nove ručnike.",
      sljedeciUlazak: "Gost ostaje u smještaju",
      cijena: 0,
    });
  }

  const prvaJedinica = await prisma.jedinica.findFirst({
    where: {
      objekt: {
        naziv: {
          contains: "Marty",
        },
      },
    },
    include: {
      objekt: true,
    },
  });

  const stavkeBazen: any[] = [];

  if (prvaJedinica) {
    let d = danas;

    while (d <= doDatuma) {
      if (martyBazenZaDan(postavke, d)) {
        const opis = "Čišćenje bazena i okoliša.";

        const zadatak = await findOrCreateZadatak({
          jedinicaId: prvaJedinica.id,
          rezervacijaId: null,
          datum: startOfDay(d),
          tip: "DODATNO_CISCENJE",
          naslov: "Marty bazen / okoliš",
          opis,
          prioritet: false,
        });

        stavkeBazen.push({
          datum: new Date(d),
          tip: "DODATNO_CISCENJE" as const,
          jedinicaId: prvaJedinica.id,
          zadatakId: zadatak.id,
          nazivJedinice: "Marty bazen / okoliš",
          nazivObjekta: prvaJedinica.objekt.naziv,
          brojGostiju: 0,
          osnovniKapacitet: 0,
          opis,
          sljedeciUlazak: "-",
          cijena: 0,
        });
      }

      d = addDays(d, 1);
    }
  }

  const sveStavkeZaMail = [
    ...stavkeApartmani,
    ...stavkeMedjuciscenje,
    ...stavkeBazen,
  ].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  if (sveStavkeZaMail.length === 0) {
    return {
      success: true,
      message: "Nema stavki za slanje",
    };
  }

  const sveStavkeZaBazu = sveStavkeZaMail.map((s) => ({
    datum: s.datum,
    tip: s.tip,
    jedinicaId: s.jedinicaId,
    zadatakId: s.zadatakId || null,
    nazivJedinice: s.nazivJedinice,
    nazivObjekta: s.nazivObjekta,
    opis:
      s.brojGostiju && s.brojGostiju > 0
        ? `${s.opis} | Broj gostiju: ${s.brojGostiju} | Sljedeći ulazak: ${s.sljedeciUlazak}`
        : `${s.opis} | Sljedeći ulazak: ${s.sljedeciUlazak}`,
    cijena: s.cijena,
  }));

  const narudzba = await prisma.ciscenjeNarudzba.create({
    data: {
      agencijaId: agencija.id,
      datumOd: danas,
      datumDo: doDatuma,
      emailPrimatelja: agencija.email,
      ccEmailsSnapshot: agencija.ccEmails,
      subject: "Raspored čišćenja - Malinska Stay",
      tekstMaila: "Automatski generirani raspored čišćenja.",
      stavke: {
        create: sveStavkeZaBazu,
      },
    },
  });

  const ccList = agencija.ccEmails
    ? agencija.ccEmails
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  function dodatnaPosteljinaText(s: any) {
    const brojGostiju = Number(s.brojGostiju || 0);
    const osnovniKapacitet = Number(s.osnovniKapacitet || 0);
    const dodatnoOsoba = Math.max(0, brojGostiju - osnovniKapacitet);

    if (dodatnoOsoba <= 0) return "-";
    if (dodatnoOsoba === 1) return "1 dodatna posteljina + ručnici";
    if (dodatnoOsoba === 2) return "2 dodatne posteljine + ručnici";

    return `${dodatnoOsoba} dodatne posteljine + ručnici`;
  }

  const html = `
  <div style="font-family: Calibri, Segoe UI, Arial, sans-serif; color:#111; background:#f5f6f7; padding:24px;">
    <div style="background:white; border:1px solid #ddd; padding:20px;">
      <h2 style="margin:0; font-size:26px; font-weight:900; color:#111;">
        Plan čišćenja - Malinska Stay
      </h2>

      <p style="margin:8px 0 18px; color:#555; font-size:15px;">
        Period:
        <b>${formatDate(narudzba.datumOd)}</b>
        –
        <b>${formatDate(narudzba.datumDo)}</b>
      </p>

      <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width:100%; font-size:13px; background:white;">
        <tr style="background:#e9ecef;">
          <th align="left" style="border:1px solid #999;">Datum odlaska</th>
          <th align="left" style="border:1px solid #999;">Objekt</th>
          <th align="left" style="border:1px solid #999;">Jedinica</th>
          <th align="left" style="border:1px solid #999; background:#d1fae5;">Broj gostiju</th>
          <th align="left" style="border:1px solid #999;">Opis</th>
          <th align="left" style="border:1px solid #999; background:#d1fae5;">Sljedeći ulazak</th>
          <th align="left" style="border:1px solid #999; background:#fff3cd;">Napomena</th>
        </tr>

        ${sveStavkeZaMail
          .map((s) => {
            const smjenaIstiDan =
              s.sljedeciUlazak &&
              s.sljedeciUlazak !== "-" &&
              !String(s.sljedeciUlazak).includes("Nema") &&
              String(s.sljedeciUlazak).includes(formatDate(s.datum));

            const napomena = dodatnaPosteljinaText(s);

            return `
              <tr style="${smjenaIstiDan ? "background:#fff1f1;" : ""}">
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(
                  formatDate(s.datum)
                )}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(
                  s.nazivObjekta || ""
                )}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(
                  s.nazivJedinice
                )}</td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#f0fdf4;">
                  ${s.brojGostiju && s.brojGostiju > 0 ? s.brojGostiju : "-"}
                </td>
                <td style="border:1px solid #ccc; vertical-align:top;">
                  ${escapeHtml(s.opis || "")}
                  ${
                    smjenaIstiDan
                      ? `<div style="margin-top:6px; color:#b42318; font-weight:900; font-size:13px;">SMJENA ISTI DAN</div>`
                      : ""
                  }
                </td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#f0fdf4;">
                  ${escapeHtml(s.sljedeciUlazak || "-")}
                </td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#fffdf0;">
                  ${escapeHtml(napomena)}
                </td>
              </tr>
            `;
          })
          .join("")}
      </table>

      <p style="margin-top:20px; font-size:14px;">
        Lijep pozdrav,<br/>
        <b>Malinska Stay</b>
      </p>
    </div>
  </div>
`;

  await resend.emails.send({
    from: "Malinska Stay <rezervacije@malinska-stay.hr>",
    to: agencija.email,
    cc: ccList,
    subject: narudzba.subject || "Raspored čišćenja",
    html,
    replyTo: "goran@malinska-stay.hr",
  });

  await prisma.ciscenjeNarudzba.update({
    where: {
      id: narudzba.id,
    },
    data: {
      poslanoEmail: true,
      poslanoAt: new Date(),
    },
  });

  return {
    success: true,
    narudzbaId: narudzba.id,
  };
}