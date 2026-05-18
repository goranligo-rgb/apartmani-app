import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

export async function POST(req: Request) {
  try {
    const { racunId } = await req.json();

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
      return NextResponse.json(
        { error: "Račun nije pronađen ili nema PDF." },
        { status: 404 }
      );
    }

    const email = racun.rezervacija.gost?.email;

    if (!email) {
      return NextResponse.json(
        { error: "Gost nema email." },
        { status: 400 }
      );
    }

    // PDF dohvaća se s Supabase Storage URL-a (ne s local file system-a).
    // Stari `fs.readFileSync(path.join(cwd, "public", pdfUrl))` pattern nije
    // radio na Vercel-u jer PDF-ovi nisu static asseti — generiraju se
    // dinamički i pohranjuju u cloud storage. Ovaj pattern prati referentnu
    // implementaciju iz potvrdi-link/route.ts.
    const pdfResponse = await fetch(racun.pdfUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json(
        { error: `PDF račun nije dostupan: ${pdfResponse.status}` },
        { status: 502 }
      );
    }
    const arrayBuffer = await pdfResponse.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const subject = `Račun ${racun.brojRacuna} ponovno poslan`;

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
    <p>Poštovani,</p>
    <p>U privitku vam ponovno šaljemo račun.</p>
    <p>Lijep pozdrav,<br/>Malinska Stay</p>
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
        result.error.message ||
        JSON.stringify(result.error).slice(0, 500);
      console.error("[/api/admin/racuni/posalji] Resend error:", result.error);
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
      return NextResponse.json(
        { error: `Resend greška: ${greskaText}` },
        { status: 502 }
      );
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Greška kod slanja računa." },
      { status: 500 }
    );
  }
}
