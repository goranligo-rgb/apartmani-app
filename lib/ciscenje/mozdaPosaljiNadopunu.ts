import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import {
  stavkaZaNovuRezervaciju,
  renderTablicaPlana,
  izracunajRasporedZaPeriod,
} from "@/lib/ciscenje/nadopunaRaspored";

// ── Nadopuna tjednog plana čišćenja ──
//
// Kad nova rezervacija "uleti" u prozor već poslanog tjednog raspoređa
// (PR1 weekly mail), agenciji za čišćenje treba mail koji javlja "evo još
// jedne smjene koju nismo imali kad smo poslali plan". Bez ovog: agencija
// dođe na prazan apartman ili propusti smjenu.
//
// Izgled maila (Faza B redizajn): GORE žuti "🆕 NOVO" banner + mala tablica
// samo s novom rezervacijom (isti stupci kao tjedni plan, BEZ imena gostiju),
// ISPOD cijeli ažurirani raspored za narednih `brojDanaUnaprijed` dana —
// identična tablica kao tjedni plan. Render i izračun dolaze iz READ-ONLY
// modula `nadopunaRaspored.ts` (vidi tamo); tjedni `generirajINaPosalji.ts`
// se NE dira. Nadopuna i dalje NEMA nuspojave na raspored (bez Zadatak/Trosak/
// dodatne narudžbe), šalje SAMO agenciji.
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

// Tip rezervacije koju NOVO red treba — preuzet iz potpisa
// `stavkaZaNovuRezervaciju` da ne dupliciramo strukturu (i da ostane u sinkronu
// s read-only modulom). findMany rezultat je strukturni superset → assignable.
type NadopunaRez = Parameters<typeof stavkaZaNovuRezervaciju>[0];

/**
 * Gradi HTML tijela nadopuna maila: žuti "🆕 NOVO" banner + mala NOVO tablica
 * (samo nove rezervacije, bez imena) + cijeli ažurirani raspored za narednih
 * `brojDanaUnaprijed` dana (identičan izgled kao tjedni plan).
 *
 * READ-ONLY: čita samo `postavke` i raspored kroz `nadopunaRaspored.ts`, NE radi
 * nikakve upise. Izdvojeno iz `mozdaPosaljiNadopunu` da preview/test rute mogu
 * renderirati TOČNO isti mail kao pravi tok (bez drifta).
 */
export async function gradiNadopunaHtml(params: {
  stvarnoNovi: NadopunaRez[];
  zadnjiWeekly: { datumOd: Date; datumDo: Date };
}): Promise<string> {
  const { stvarnoNovi, zadnjiWeekly } = params;

  // Postavke samo radi `brojDanaUnaprijed` (isti period kao tjedni plan).
  // Nadopuna ih NE mijenja (Kristinina napomena se NE dira).
  const postavke = await prisma.ciscenjeMailPostavke.findFirst();
  const brojDana = postavke?.brojDanaUnaprijed || 7;
  const danas = startOfDay(new Date());
  const doDatuma = addDays(danas, brojDana);

  // Gornji "NOVO" red(ovi) — samo nove rezervacije, isti format kao tjedni
  // (bez imena gostiju). Read-only, bez nuspojava.
  const novoStavke = await Promise.all(
    stvarnoNovi.map((r) => stavkaZaNovuRezervaciju(r))
  );

  // Donji cijeli raspored za narednih X dana — identičan izgled kao tjedni.
  // `postavke || {}` osigurava da Marty bazen / Eva stubište budu prazni ako
  // postavke fale (ne ruši render; `brojDana` fallback je već 7).
  const rasporedStavke = await izracunajRasporedZaPeriod(
    danas,
    doDatuma,
    postavke || {}
  );

  return `
  <div style="font-family: Calibri, Segoe UI, Arial, sans-serif; color:#111; background:#f5f6f7; padding:24px;">
    <div style="background:white; border:1px solid #ddd; padding:20px;">
      <div style="background:#fef3c7; border:2px solid #c79a57; padding:14px; margin-bottom:18px;">
        <h2 style="margin:0; font-size:22px; font-weight:900; color:#7a5a22;">
          🆕 NOVO — Nadopuna rasporeda čišćenja
        </h2>
        <p style="margin:8px 0 0; font-size:14px; color:#7a5a22;">
          Nakon zadnjeg tjednog plana ulet${stvarnoNovi.length === 1 ? "jela je" : "jelo je"}
          <b>${stvarnoNovi.length}</b>
          ${stvarnoNovi.length === 1 ? "nova rezervacija" : "novih rezervacija"}.
          Detalji su u tablici „NOVO" ispod, a cijeli ažurirani raspored je niže.
        </p>
      </div>

      <h3 style="margin:0 0 6px; font-size:16px; font-weight:900; color:#7a5a22;">
        🆕 NOVO
      </h3>
      ${renderTablicaPlana(novoStavke)}

      <h3 style="margin:24px 0 4px; font-size:16px; font-weight:900; color:#111;">
        Cijeli raspored čišćenja — sljedećih ${brojDana} dana
      </h3>
      <p style="margin:0 0 8px; color:#555; font-size:14px;">
        Period:
        <b>${formatDate(danas)}</b>
        –
        <b>${formatDate(doDatuma)}</b>
      </p>
      ${renderTablicaPlana(rasporedStavke)}

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

    // Tijelo maila gradi izdvojeni `gradiNadopunaHtml` (isti HTML koji vide i
    // preview/test rute). Read-only — nikakvih upisa unutar render-a.
    const html = await gradiNadopunaHtml({ stvarnoNovi, zadnjiWeekly });

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
