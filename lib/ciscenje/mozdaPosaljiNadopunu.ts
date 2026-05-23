import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

// ── Nadopuna tjednog plana čišćenja ──
//
// Kad nova rezervacija "uleti" u prozor već poslanog tjednog raspoređa
// (PR1 weekly mail), agenciji za čišćenje treba mail koji javlja "evo još
// jedne smjene koju nismo imali kad smo poslali plan". Bez ovog: agencija
// dođe na prazan apartman ili propusti smjenu.
//
// Helper je defenzivan po dizajnu — sve unutarnje greške hvata i vraća
// `{ skipped: 'error' }`. Pozivatelji (Stripe webhook flow, admin nova rez,
// Booking Excel) NE moraju imati try/catch i NE rušim glavni booking tok
// zbog problema s mail-om čišćenja.
//
// Pozivatelji (3 mjesta — vidi memory/ciscenje-mailovi.md PR2):
//   1. lib/zaprimiRezervaciju.ts (Stripe completed, samo unutar atomske brave)
//   2. app/admin/rezervacije/nova/page.tsx (admin ručno kreirana rezervacija)
//   3. app/api/admin/booking-import/commit/route.ts (samo STVARNO novokreirane
//      iz `tx.rezervacija.create`, NE idempotentni update-ovi postojećih)

const resend = new Resend(process.env.RESEND_API_KEY!);

export type NadopunaArgs = {
  rezervacijaIds: string[];
};

export type NadopunaRezultat =
  | { skipped: "no-ids" }
  | { skipped: "no-agency" }
  | { skipped: "no-weekly" }
  | { skipped: "no-eligible" }
  | { skipped: "all-already-sent" }
  | { skipped: "error" }
  | {
      sent: true;
      narudzbaId: string;
      rezervacijaIds: string[];
    };

function formatDate(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function guestName(gost: { ime?: string | null; prezime?: string | null } | null) {
  if (!gost) return "-";
  const ime = `${gost.ime ?? ""} ${gost.prezime ?? ""}`.trim();
  return ime || "-";
}

export async function mozdaPosaljiNadopunu(
  args: NadopunaArgs
): Promise<NadopunaRezultat> {
  try {
    // 0) Sanity — prazan array (pozivatelj prosljeđuje [] kad nije bilo
    //    novih rezervacija, npr. Excel uvoz koji je sve update-ao).
    const ulazniIds = args.rezervacijaIds.filter(Boolean);

    if (ulazniIds.length === 0) {
      return { skipped: "no-ids" };
    }

    // 1) Učitaj rezervacije — filter `automatskoCiscenje: true` poštuje
    //    odluku gosta da ne želi čišćenje (isti pattern kao u
    //    `generirajINaPosalji`). OTKAZANO se isto izbacuje.
    const rezervacije = await prisma.rezervacija.findMany({
      where: {
        id: { in: ulazniIds },
        status: { not: "OTKAZANO" },
        automatskoCiscenje: true,
      },
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
      orderBy: { datumDo: "asc" },
    });

    if (rezervacije.length === 0) {
      return { skipped: "no-eligible" };
    }

    // 2) Agencija — bez email-a nema kome poslati.
    const agencija = await prisma.ciscenjeAgencija.findFirst();

    if (!agencija?.email) {
      return { skipped: "no-agency" };
    }

    // 3) Zadnji weekly mail — nadopuna ima smisla samo unutar prozora već
    //    poslanog plana. Filter `napomena: null` razdvaja weekly od ranijih
    //    nadopuna (NADOPUNA-... napomene), isti uzorak kao PR1 cron
    //    idempotentnost.
    const zadnjiWeekly = await prisma.ciscenjeNarudzba.findFirst({
      where: {
        poslanoEmail: true,
        napomena: null,
      },
      orderBy: { poslanoAt: "desc" },
      select: {
        id: true,
        datumOd: true,
        datumDo: true,
      },
    });

    if (!zadnjiWeekly) {
      return { skipped: "no-weekly" };
    }

    // 4) Filtriraj kandidate koji se preklapaju s prozorom zadnjeg weekly-ja.
    //    Overlap rule: [r.datumOd, r.datumDo] ∩ [weekly.datumOd, weekly.datumDo] ≠ ∅
    //    — pokriva i ZAVRSNO_CISCENJE (datumDo unutar prozora) i
    //    MEDJUCISCENJE (datumOd unutar prozora).
    const uPrzoru = rezervacije.filter(
      (r) =>
        r.datumDo >= zadnjiWeekly.datumOd && r.datumOd <= zadnjiWeekly.datumDo
    );

    if (uPrzoru.length === 0) {
      return { skipped: "no-eligible" };
    }

    // 5) Spam zaštita — per-rezervacija provjera već poslanih nadopuna.
    //    Format `napomena`: `NADOPUNA-{id1},{id2},...` (CSV UUID-a). Koristi
    //    `contains` jer ID može biti bilo gdje u CSV-u, ne samo na početku.
    //    Sekvencijalna provjera (ne Promise.all) — listа je tipično ≤5 čak
    //    i pri Excel uvozu (prozor je 7 dana).
    const stvarnoNovi: typeof uPrzoru = [];

    for (const r of uPrzoru) {
      const vecPoslano = await prisma.ciscenjeNarudzba.findFirst({
        where: {
          napomena: {
            contains: `NADOPUNA-${r.id}`,
          },
        },
        select: { id: true },
      });

      if (!vecPoslano) {
        stvarnoNovi.push(r);
      }
    }

    if (stvarnoNovi.length === 0) {
      return { skipped: "all-already-sent" };
    }

    // 6) Pošalji mail + zapiši narudžbu.
    const napomenaCsv =
      "NADOPUNA-" + stvarnoNovi.map((r) => r.id).join(",NADOPUNA-");
    // ↑ Svaki ID je prefiksiran zasebnim "NADOPUNA-" tokenom, što omogućuje
    //   ispravan `contains: 'NADOPUNA-{id}'` lookup. Format primjera:
    //   "NADOPUNA-abc,NADOPUNA-def,NADOPUNA-ghi"

    const ccList = agencija.ccEmails
      ? agencija.ccEmails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

    const subject = `🆕 Nadopuna rasporeda čišćenja — Malinska Stay (${stvarnoNovi.length})`;

    const html = `
  <div style="font-family: Calibri, Segoe UI, Arial, sans-serif; color:#111; background:#f5f6f7; padding:24px;">
    <div style="background:white; border:1px solid #ddd; padding:20px;">
      <div style="background:#fef3c7; border:2px solid #c79a57; padding:14px; margin-bottom:18px;">
        <h2 style="margin:0; font-size:22px; font-weight:900; color:#7a5a22;">
          🆕 NOVO — Nadopuna rasporeda čišćenja
        </h2>
        <p style="margin:8px 0 0; font-size:14px; color:#7a5a22;">
          Nakon zadnjeg tjednog plana ulet${stvarnoNovi.length === 1 ? "jela je" : "jelo je"}
          <b>${stvarnoNovi.length}</b>
          ${stvarnoNovi.length === 1 ? "nova rezervacija" : "novih rezervacija"}
          u period
          <b>${formatDate(zadnjiWeekly.datumOd)}</b>
          –
          <b>${formatDate(zadnjiWeekly.datumDo)}</b>.
          Molimo nadopunite raspored.
        </p>
      </div>

      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:13px; background:white;">
        <tr style="background:#e9ecef;">
          <th align="left" style="border:1px solid #999;">Dolazak</th>
          <th align="left" style="border:1px solid #999;">Odlazak</th>
          <th align="left" style="border:1px solid #999;">Objekt</th>
          <th align="left" style="border:1px solid #999;">Jedinica</th>
          <th align="left" style="border:1px solid #999;">Gost</th>
          <th align="left" style="border:1px solid #999; background:#d1fae5;">Broj osoba</th>
          <th align="left" style="border:1px solid #999;">Noćenja</th>
        </tr>

        ${stvarnoNovi
          .map(
            (r) => `
              <tr>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(formatDate(r.datumOd))}</td>
                <td style="border:1px solid #ccc; vertical-align:top; font-weight:900;">${escapeHtml(formatDate(r.datumDo))}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(r.jedinica.objekt.naziv)}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(r.jedinica.naziv)}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${escapeHtml(guestName(r.gost))}</td>
                <td style="border:1px solid #999; vertical-align:top; font-weight:900; background:#f0fdf4;">${r.brojOsoba ?? "-"}</td>
                <td style="border:1px solid #ccc; vertical-align:top;">${r.brojNocenja ?? "-"}</td>
              </tr>
            `
          )
          .join("")}
      </table>

      <p style="margin-top:18px; font-size:13px; color:#555;">
        Tjedni plan koji se nadopunjuje poslan je
        <b>${zadnjiWeekly.datumOd.toLocaleString("hr-HR")}</b>
        (period ${formatDate(zadnjiWeekly.datumOd)} – ${formatDate(zadnjiWeekly.datumDo)}).
      </p>

      <p style="margin-top:18px; font-size:14px;">
        Lijep pozdrav,<br/>
        <b>Malinska Stay</b>
      </p>
    </div>
  </div>
`;

    // Najprije kreiraj narudžbu (s `napomena` markerom za spam-check), pa
    // pošalji mail. Ako mail propadne, narudžba ostaje zapisana s
    // poslanoEmail=false što olakšava istragu.
    const narudzba = await prisma.ciscenjeNarudzba.create({
      data: {
        agencijaId: agencija.id,
        datumOd: zadnjiWeekly.datumOd,
        datumDo: zadnjiWeekly.datumDo,
        emailPrimatelja: agencija.email,
        ccEmailsSnapshot: agencija.ccEmails,
        subject,
        tekstMaila: `Nadopuna rasporeda čišćenja s ${stvarnoNovi.length} nove(ih) rezervacija.`,
        napomena: napomenaCsv,
      },
    });

    await resend.emails.send({
      from: "Malinska Stay <rezervacije@malinska-stay.hr>",
      to: agencija.email,
      cc: ccList,
      subject,
      html,
      replyTo: "goran@malinska-stay.hr",
    });

    await prisma.ciscenjeNarudzba.update({
      where: { id: narudzba.id },
      data: {
        poslanoEmail: true,
        poslanoAt: new Date(),
      },
    });

    return {
      sent: true,
      narudzbaId: narudzba.id,
      rezervacijaIds: stvarnoNovi.map((r) => r.id),
    };
  } catch (err) {
    // Fire-and-forget semantika — glavni tok ne pada zbog mail problema.
    console.error("[mozdaPosaljiNadopunu]", err);
    return { skipped: "error" };
  }
}
