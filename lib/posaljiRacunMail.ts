import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { dohvatiPrijevode, odaberiJezikMaila } from "@/lib/mailovi";

// Zajednička logika slanja (već generiranog) računa gostu mailom — izlučena iz
// /api/admin/racuni/posalji route handlera.
//
// Razlog izlučivanja: inline gumb "Ponovno pošalji račun" u admin detalju zvao
// je rutu HTTP fetch-om iz server akcije, a server-side fetch ne nosi
// preglednikov admin cookie → ruta je vraćala 401 i rušila stranicu. Sada admin
// akcija zove ovu funkciju direktno (in-process), a ruta je tanak wrapper koji
// zadržava adminSessionOk guard za vanjske pozive.
//
// Funkcija NE baca — vraća rezultat objekt (isti uzorak kao potvrdiNaplatu),
// pa pozivatelj sam odlučuje kako prikazati grešku.

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

export type PosaljiRacunResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function posaljiRacunMail(
  racunId: string
): Promise<PosaljiRacunResult> {
  const racun = await prisma.racun.findUnique({
    where: { id: racunId },
    include: {
      rezervacija: {
        include: {
          gost: true,
          jedinica: {
            include: {
              objekt: true,
            },
          },
        },
      },
    },
  });

  if (!racun || !racun.pdfUrl) {
    return { ok: false, error: "Račun nije pronađen ili nema PDF.", status: 404 };
  }

  const email = racun.rezervacija.gost?.email;

  if (!email) {
    return { ok: false, error: "Gost nema email.", status: 400 };
  }

  // PDF dohvaća se s Supabase Storage URL-a (ne s local file system-a).
  // Stari `fs.readFileSync(path.join(cwd, "public", pdfUrl))` pattern nije
  // radio na Vercel-u jer PDF-ovi nisu static asseti — generiraju se
  // dinamički i pohranjuju u cloud storage. Ovaj pattern prati referentnu
  // implementaciju iz potvrdi-link/route.ts.
  const pdfResponse = await fetch(racun.pdfUrl);
  if (!pdfResponse.ok) {
    return {
      ok: false,
      error: `PDF račun nije dostupan: ${pdfResponse.status}`,
      status: 502,
    };
  }
  const arrayBuffer = await pdfResponse.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const jezik = odaberiJezikMaila(racun.rezervacija.gost?.jezik);
  const t = dohvatiPrijevode(jezik).racunPonovnoPoslan;

  const subject = t.subject(racun.brojRacuna);

  // Resend SDK ne baca na error, već vraća { data, error }. Provjera
  // `result.error` sprječava lažno-pozitivni EmailLog status "POSLANO"
  // kad Resend stvarno vrati grešku (npr. domain/credit/attachment).
  const result = await resend.emails.send({
    from: process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>",
    replyTo: "rezervacije@malinska-stay.hr",
    to: email,
    bcc: [BCC_EMAIL],
    subject,
    html: `
    <p>${t.pozdrav}</p>
    <p>${t.privitak}</p>
    <p>${t.zavrsetak}</p>
  `,
    attachments: [
      {
        filename: `${racun.brojRacuna}.pdf`,
        content: fileBuffer,
      },
    ],
  });

  if (result.error) {
    const greskaText =
      result.error.message || JSON.stringify(result.error).slice(0, 500);
    console.error("[posaljiRacunMail] Resend error:", result.error);
    await prisma.emailLog.create({
      data: {
        rezervacijaId: racun.rezervacijaId,
        to: email,
        subject,
        tip: "RACUN",
        status: "GRESKA",
        greska: greskaText,
      },
    });
    return { ok: false, error: `Resend greška: ${greskaText}`, status: 502 };
  }

  await prisma.emailLog.create({
    data: {
      rezervacijaId: racun.rezervacijaId,
      to: email,
      subject,
      tip: "RACUN",
      status: "POSLANO",
    },
  });

  return { ok: true };
}
