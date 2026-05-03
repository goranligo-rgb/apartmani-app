import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

    const filePath = path.join(
      process.cwd(),
      "public",
      racun.pdfUrl.replace("/", "")
    );

    const fileBuffer = fs.readFileSync(filePath);

    const email = racun.rezervacija.gost?.email;

    if (!email) {
      return NextResponse.json(
        { error: "Gost nema email." },
        { status: 400 }
      );
    }

    await resend.emails.send({
  from: process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>",
  replyTo: "rezervacije@malinska-stay.hr",
  to: email,
  subject: `Račun ${racun.brojRacuna}`,
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

    await prisma.emailLog.create({
      data: {
        rezervacijaId: racun.rezervacijaId,
        to: email,
        subject: `Račun ${racun.brojRacuna} ponovno poslan`,
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